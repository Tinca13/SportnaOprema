// src/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const healthRouter = require("./routes/health");
const categoriesRouter = require("./routes/categories");
const itemsRouter = require("./routes/items");
const rentalsRouter = require("./routes/rentals");
const authRouter = require("./routes/auth");

// API prefix (clean)
const API_PREFIX = "/api";

app.use(`${API_PREFIX}`, authRouter);
app.use(`${API_PREFIX}/health`, healthRouter);
app.use(`${API_PREFIX}/categories`, categoriesRouter);
app.use(`${API_PREFIX}/items`, itemsRouter);
app.use(`${API_PREFIX}/rentals`, rentalsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error", error: err.message });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});