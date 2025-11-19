const express = require('express');
const router = express.Router();
const connectDB = require('../utils/db');
const Folder = require('../models/Folder');
const listDriveFolderFiles = require('../utils/folderExtracter');
const { isAudioFile, pickAudioFiles } = require('../utils/audioExtractor');

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

    try {
      // Get all files from Drive and filter audio files
      let files = await listDriveFolderFiles(folderId);
      let audioFiles = await pickAudioFiles(files);

      const count = Array.isArray(audioFiles) ? audioFiles.length : 0;

      // upsert the minimal fields (store the number of audio files)
      const doc = await Folder.findOneAndUpdate(
        { userId, folderId },
        { $set: { folderName, count } },
        { upsert: true, new: true }
      );

      // Return the audio files and saved folder document
      return res.status(200).json({ ok: true, files: audioFiles, folder: doc });
    } catch (err) {
      console.error('Error saving folder:', err);
      return res.status(500).json({ error: 'Either Folder Not Public or Do Not Exist', details: err.message });
    }

  } catch (err) {
    console.error('Error saving folder:', err);
    return res.status(500).json({ error: 'Folder saving to MongoDB failed', details: err.message });
  }
});

router.post('/remove', async (req, res) => {
  try {
    await connectDB();

    const { userId, folderId } = req.body;
    if (!folderId) return res.status(400).json({ error: 'Missing FolderId in body' });
    if (!userId) return res.status(401).json({ error: 'Missing userId (authenticate user first)' });

    // folderId here is actually the MongoDB _id from frontend
    const result = await Folder.deleteOne({
      _id: folderId
    })

    if (result.deletedCount === 0) {
      return res.status(404).json({ ok: false, error: 'Folder not found' });
    }

    return res.status(200).json({
      ok: true,
      message: 'Folder deleted successfully'
    });
  }
  catch (err) {
    console.log("Error Deleting Folder", err);
    return res.status(500).json({ ok: false, error: 'Failed to delete folder', details: err.message });
  }
})

module.exports = router;
