// src/routes/rentals.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * POST /api/rentals
 * Ustvari novo zahtevo za izposojo
 */
router.post("/", async (req, res) => {
  const { user_id, date_from, date_to, note, items } = req.body;

  // Log za preverjanje v terminalu
  console.log("Prejeto na backendu:", { user_id, date_from, date_to, items });

  // 1. Validacija vhodnih podatkov
  if (!user_id || !date_from || !date_to) {
    return res.status(400).json({ message: "user_id, date_from, date_to are required" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items must be a non-empty array" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 2. Vstavi glavno izposojo
    const [rentalResult] = await conn.query(
      `INSERT INTO rentals (user_id, date_from, date_to, status, note)
       VALUES (?, ?, ?, 'REQUESTED', ?)`,
      [user_id, date_from, date_to, note ?? null]
    );

    const rental_id = rentalResult.insertId;

    // 3. Pridobi trenutne cene artiklov
    const itemIds = items.map((x) => x.item_id);
    const [dbItems] = await conn.query(
      `SELECT id, price_per_day FROM items WHERE id IN (${itemIds.map(() => "?").join(",")})`,
      itemIds
    );

    const priceById = new Map(dbItems.map((r) => [r.id, r.price_per_day]));

    // 4. Vstavi posamezne artikle v rental_items
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
    console.error("RENTAL POST ERROR:", err);
    res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * GET /api/rentals/my?user_id=X
 * Seznam izposoj za določenega uporabnika
 */
router.get("/my", async (req, res) => {
  const user_id = Number(req.query.user_id);
  const role = req.query.role; // Prejmemo role iz query-ja

  if (!user_id) return res.status(400).json({ message: "user_id required" });

  try {
    let sql = `SELECT id, user_id, date_from, date_to, status, note, created_at FROM rentals`;
    let params = [];

    // Če NI admin, pokaži samo njegove. Če JE admin, ne dodajaj WHERE filtra.
    if (role !== 'admin') {
      sql += ` WHERE user_id = ?`;
      params.push(user_id);
    }
    
    sql += ` ORDER BY created_at DESC`;

    const [rentals] = await pool.query(sql, params);
    if (rentals.length === 0) return res.json([]);

    const rentalIds = rentals.map((r) => r.id);
    const [rows] = await pool.query(
      `SELECT ri.rental_id, ri.item_id, ri.quantity, i.name
       FROM rental_items ri
       JOIN items i ON i.id = ri.item_id
       WHERE ri.rental_id IN (${rentalIds.map(() => "?").join(",")})`,
      rentalIds
    );

    const itemsByRental = new Map();
    rows.forEach(row => {
      if (!itemsByRental.has(row.rental_id)) itemsByRental.set(row.rental_id, []);
      itemsByRental.get(row.rental_id).push(row);
    });

    res.json(rentals.map(r => ({
      ...r,
      items: itemsByRental.get(r.id) || []
    })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * GET /api/rentals/admin
 * Admin vidi vse izposoje
 */
router.get("/my", async (req, res) => {
  const user_id = Number(req.query.user_id);
  const role = req.query.role; // Prejmemo vlogo iz frontenda

  try {
    let sql = `SELECT id, user_id, date_from, date_to, status, note, created_at FROM rentals`;
    let params = [];

    // Če uporabnik NI admin, mu pokažemo samo njegove izposoje
    if (role !== 'admin') {
      sql += ` WHERE user_id = ?`;
      params.push(user_id);
    }
    
    sql += ` ORDER BY created_at DESC`;

    const [rentals] = await pool.query(sql, params);
    
    if (rentals.length === 0) return res.json([]);

    // Pridobivanje artiklov za te izposoje
    const rentalIds = rentals.map((r) => r.id);
    const [rows] = await pool.query(
      `SELECT ri.rental_id, ri.item_id, ri.quantity, i.name
       FROM rental_items ri
       JOIN items i ON i.id = ri.item_id
       WHERE ri.rental_id IN (${rentalIds.map(() => "?").join(",")})`,
      rentalIds
    );

    const itemsByRental = new Map();
    rows.forEach(row => {
      if (!itemsByRental.has(row.rental_id)) itemsByRental.set(row.rental_id, []);
      itemsByRental.get(row.rental_id).push(row);
    });

    res.json(rentals.map(r => ({
      ...r,
      items: itemsByRental.get(r.id) || []
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Napaka na strežniku" });
  }
  document.querySelector("#rentalsSection h3").innerText = 
  currentUser.role === 'admin' ? "Vse izposoje (Admin)" : "Moje izposoje";
});
/**
 * POST /api/rentals/:id/approve
 * Admin potrdi izposojo in zmanjša zalogo
 */
router.post("/:id/approve", async (req, res) => {
  const rentalId = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rental] = await conn.query("SELECT status FROM rentals WHERE id = ? FOR UPDATE", [rentalId]);
    if (rental.length === 0) throw new Error("Rental not found");
    if (rental[0].status !== 'REQUESTED') throw new Error("Already processed");

    const [items] = await conn.query("SELECT item_id, quantity FROM rental_items WHERE rental_id = ?", [rentalId]);

    for (const it of items) {
      await conn.query(
        "UPDATE items SET quantity_available = quantity_available - ? WHERE id = ?",
        [it.quantity, it.item_id]
      );
    }

    await conn.query("UPDATE rentals SET status = 'APPROVED' WHERE id = ?", [rentalId]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/rentals/:id/return
 * Vračilo opreme (poveča zalogo)
 */
router.post("/:id/return", async (req, res) => {
  const rentalId = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rental] = await conn.query("SELECT status FROM rentals WHERE id = ? FOR UPDATE", [rentalId]);
    if (rental.length === 0) throw new Error("Izposoja ne obstaja.");
    const [items] = await conn.query("SELECT item_id, quantity FROM rental_items WHERE rental_id = ?", [rentalId]); 

    for (const it of items) {
      await conn.query(
        "UPDATE items SET quantity_available = quantity_available + ? WHERE id = ?",
        [it.quantity, it.item_id]
      );
    }

    await conn.query("UPDATE rentals SET status = 'RETURNED' WHERE id = ?", [rentalId]);
    await conn.commit();
    res.json({message: "Oprema vrnjena."});
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;