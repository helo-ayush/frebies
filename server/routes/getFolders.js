const express = require('express');
const router = express.Router();
const connectDB = require('../utils/db');
const Folder = require('../models/Folder');

router.post('/', async (req, res) => {
  try {
    await connectDB();

    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const folders = await Folder.find({ userId });

    return res.json({
      ok: true,
      folders
    });

  } catch (err) {
    console.error("Error fetching folders:", err);
    return res.status(500).json({
      error: "Folder fetch failed",
      details: err.message
    });
  }
});

module.exports = router;
