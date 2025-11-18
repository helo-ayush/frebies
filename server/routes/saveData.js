const express = require('express');
const router = express.Router();
const connectDB = require('../utils/db');
const Folder = require('../models/Folder');

router.post('/', async (req, res) => {
  try {
    // ensure DB connection
    await connectDB();

    const { url, userId, folderName } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url in body' });
    if (!userId) return res.status(401).json({ error: 'Missing userId (authenticate user first)' });

    // extract folderId
    const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!m) return res.status(400).json({ error: 'Invalid Google Drive folder URL' });
    const folderId = m[1];

    // upsert the minimal fields
    const doc = await Folder.findOneAndUpdate(
      { userId, folderId },
      { $set: { folderName } },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      ok: true
    });

  } catch (err) {
    console.error('Error saving folder:', err);
    return res.status(500).json({ error: 'Folder saving to MongoDB failed', details: err.message });
  }
});

module.exports = router;
