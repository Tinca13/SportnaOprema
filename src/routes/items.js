// src/routes/items.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

console.log("NALAGAM NOV ITEMS.JS");
console.log("KLICEM /api/items");

/**
 * TEST endpoint:
 * http://localhost:3000/api/items/test
 */
router.get("/test", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS test");

    res.json({
      message: "Items route dela, DB povezava dela.",
      result: rows,
    });
  } catch (err) {
    console.error("ITEMS TEST ERROR:", err);

    res.status(500).json({
      message: "DB test error",
      error: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
    });
  }
});

/**
 * GET all items:
 * http://localhost:3000/api/items
 *
 * Optional filter:
 * http://localhost:3000/api/items?category_id=1
 */
router.get("/", async (req, res) => {
  try {
    const { category_id } = req.query;

    let sql = `
      SELECT 
        i.id,
        i.name,
        i.category_id,
        i.price_per_day,
        i.quantity_total,
        i.quantity_available,
        c.name AS category_name
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id
    `;

    const params = [];

    if (category_id) {
      sql += " WHERE i.category_id = ?";
      params.push(category_id);
    }

    sql += " ORDER BY i.name ASC";

    const [rows] = await pool.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error("ITEMS ERROR:", err);

    res.status(500).json({
      message: "DB error",
      error: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
    });
  }
});

/**
 * GET one item by ID:
 * http://localhost:3000/api/items/1
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        i.id,
        i.name,
        i.category_id,
        i.price_per_day,
        i.quantity_total,
        i.quantity_available,
        c.name AS category_name
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id
      WHERE i.id = ?
      LIMIT 1
    `;

    const [rows] = await pool.query(sql, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Item not found",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("ITEM BY ID ERROR:", err);

    res.status(500).json({
      message: "DB error",
      error: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
    });
  }
});

module.exports = router;