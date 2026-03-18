// src/routes/categories.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

// GET /api/categories
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name FROM categories ORDER BY name"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;