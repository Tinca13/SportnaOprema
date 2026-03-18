// src/routes/items.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

// GET /api/items
router.get("/", async (req, res) => {
  try {
    const { category_id } = req.query;

    let sql = `
      SELECT i.id, i.name,
             i.quantity_total, i.quantity_available,
             i.price_per_day,
             c.id AS category_id, c.name AS category_name
      FROM items i
      JOIN categories c ON c.id = i.category_id
    `;

    const params = [];

    if (category_id) {
      sql += " WHERE i.category_id = ?";
      params.push(category_id);
    }

    sql += " ORDER BY i.name";

    const [rows] = await pool.query(sql, params);

    res.json(rows);

  } catch (err) {
    console.error("ITEMS ERROR:", err); // 🔥 dodano
    res.status(500).json({ message: err.message || "DB error" });
  }
});

module.exports = router;