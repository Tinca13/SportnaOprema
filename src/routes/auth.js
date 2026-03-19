// src/routes/auth.js
const express = require("express");
const router = express.Router();
const db = require("../db");

router.post("/login", async (req, res) => { 
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "E-pošta in geslo sta obvezna" });
  }

  try {
   
    const query = "SELECT id, name, email, role FROM users WHERE email = ? AND password = ?";
    const [results] = await db.query(query, [email, password]);

    if (results.length > 0) {
      res.json({ user: results[0] });
    } else {
      res.status(401).json({ error: "Napačen e-naslov ali geslo" });
    }
  } catch (err) {
    console.error("LOGIN SQL NAPAKA:", err);
    res.status(500).json({ error: "Napaka v bazi", details: err.message });
  }
});

module.exports = router;