// src/routes/rentals.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * POST /api/rentals
 * Body:
 * {
 *   "user_id": 2,
 *   "date_from": "2026-02-25",
 *   "date_to": "2026-02-27",
 *   "note": "Nova test izposoja",
 *   "items": [
 *     {"item_id": 1, "quantity": 1},
 *     {"item_id": 2, "quantity": 1}
 *   ]
 * }
 */
router.post("/", async (req, res) => {
  const { user_id, date_from, date_to, note, items } = req.body;

  if (!user_id || !date_from || !date_to) {
    return res.status(400).json({ message: "user_id, date_from, date_to are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }
  for (const it of items) {
    if (!it.item_id || !it.quantity || it.quantity <= 0) {
      return res.status(400).json({ message: "each item must have item_id and quantity > 0" });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rentalResult] = await conn.query(
      `INSERT INTO rentals (user_id, date_from, date_to, status, note)
       VALUES (?, ?, ?, 'REQUESTED', ?)`,
      [user_id, date_from, date_to, note ?? null]
    );

    const rental_id = rentalResult.insertId;

    const itemIds = items.map((x) => x.item_id);
    const [dbItems] = await conn.query(
      `SELECT id, price_per_day FROM items WHERE id IN (${itemIds.map(() => "?").join(",")})`,
      itemIds
    );

    const priceById = new Map(dbItems.map((r) => [r.id, r.price_per_day]));

    for (const it of items) {
      if (!priceById.has(it.item_id)) {
        throw new Error(`Item not found: ${it.item_id}`);
      }

      await conn.query(
        `INSERT INTO rental_items (rental_id, item_id, quantity, price_per_day_snapshot)
         VALUES (?, ?, ?, ?)`,
        [rental_id, it.item_id, it.quantity, priceById.get(it.item_id)]
      );
    }

    await conn.commit();
    res.status(201).json({ rental_id, status: "REQUESTED" });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/rentals/my?user_id=2
 */
router.get("/my", async (req, res) => {
  const user_id = Number(req.query.user_id);
  if (!user_id) return res.status(400).json({ message: "user_id query param required" });

  const [rentals] = await pool.query(
    `SELECT id, user_id, date_from, date_to, status, note, created_at, updated_at
     FROM rentals
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [user_id]
  );

  if (rentals.length === 0) return res.json([]);

  const rentalIds = rentals.map((r) => r.id);

  const [rows] = await pool.query(
    `SELECT ri.rental_id, ri.item_id, ri.quantity, ri.price_per_day_snapshot,
            i.name, i.size
     FROM rental_items ri
     JOIN items i ON i.id = ri.item_id
     WHERE ri.rental_id IN (${rentalIds.map(() => "?").join(",")})
     ORDER BY ri.rental_id, i.name`,
    rentalIds
  );

  const itemsByRental = new Map();
  for (const row of rows) {
    if (!itemsByRental.has(row.rental_id)) itemsByRental.set(row.rental_id, []);
    itemsByRental.get(row.rental_id).push({
      item_id: row.item_id,
      name: row.name,
      size: row.size,
      quantity: row.quantity,
      price_per_day: row.price_per_day_snapshot,
    });
  }

  res.json(
    rentals.map((r) => ({
      ...r,
      items: itemsByRental.get(r.id) ?? [],
    }))
  );
});

/**
 * POST /api/rentals/:id/approve
 * Approve REQUESTED rental and reserve stock.
 */
router.post("/:id/approve", async (req, res) => {
  const rentalId = Number(req.params.id);
  if (!rentalId) return res.status(400).json({ message: "Invalid rental id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rentalRows] = await conn.query(
      `SELECT id, status FROM rentals WHERE id = ? FOR UPDATE`,
      [rentalId]
    );

    if (rentalRows.length === 0) throw new Error("Rental not found");
    if (rentalRows[0].status !== "REQUESTED") {
      throw new Error(`Rental must be REQUESTED to approve (current: ${rentalRows[0].status})`);
    }

    const [rentalItems] = await conn.query(
      `SELECT item_id, quantity FROM rental_items WHERE rental_id = ?`,
      [rentalId]
    );

    if (rentalItems.length === 0) throw new Error("Rental has no items");

    for (const ri of rentalItems) {
      const [itemRows] = await conn.query(
        `SELECT id, quantity_available FROM items WHERE id = ? FOR UPDATE`,
        [ri.item_id]
      );

      if (itemRows.length === 0) throw new Error(`Item not found: ${ri.item_id}`);

      const available = itemRows[0].quantity_available;
      if (available < ri.quantity) {
        throw new Error(
          `Not enough stock for item ${ri.item_id}. Available=${available}, needed=${ri.quantity}`
        );
      }

      await conn.query(
        `UPDATE items
         SET quantity_available = quantity_available - ?
         WHERE id = ?`,
        [ri.quantity, ri.item_id]
      );
    }

    await conn.query(
      `UPDATE rentals
       SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rentalId]
    );

    await conn.commit();
    res.json({ rental_id: rentalId, status: "APPROVED" });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;

/**
 * POST /api/rentals/:id/return
 * Return an APPROVED rental and release stock.
 */
router.post("/:id/return", async (req, res) => {
  const rentalId = Number(req.params.id);
  if (!rentalId) return res.status(400).json({ message: "Invalid rental id" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Lock rental row and check status
    const [rentalRows] = await conn.query(
      `SELECT id, status
       FROM rentals
       WHERE id = ?
       FOR UPDATE`,
      [rentalId]
    );

    if (rentalRows.length === 0) throw new Error("Rental not found");

    const status = rentalRows[0].status;
    if (status !== "APPROVED") {
      throw new Error(`Rental must be APPROVED to return (current: ${status})`);
    }

    // 2) Load rental items
    const [rentalItems] = await conn.query(
      `SELECT item_id, quantity
       FROM rental_items
       WHERE rental_id = ?`,
      [rentalId]
    );

    if (rentalItems.length === 0) throw new Error("Rental has no items");

    // 3) Increase stock (lock item rows)
    for (const ri of rentalItems) {
      await conn.query(
        `SELECT id
         FROM items
         WHERE id = ?
         FOR UPDATE`,
        [ri.item_id]
      );

      await conn.query(
        `UPDATE items
         SET quantity_available = quantity_available + ?
         WHERE id = ?`,
        [ri.quantity, ri.item_id]
      );
    }

    // 4) Update rental status
    await conn.query(
      `UPDATE rentals
       SET status = 'RETURNED', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rentalId]
    );

    await conn.commit();
    res.json({ rental_id: rentalId, status: "RETURNED" });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
});

