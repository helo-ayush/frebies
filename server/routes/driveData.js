const express = require('express');
const router = express.Router();
const listDriveFolderFiles = require('../utils/folderExtracter');



router.post('/', async (req, res) => {
  try {
    const { url, userId } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url in body' });

    // Extract the folder Id from the link
    const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!m) return res.status(400).json({ error: 'Invalid Google Drive folder URL' });
    const folderId = m[1];

    // pageToken
    let pageToken = null;
    const data = await listDriveFolderFiles(folderId, pageToken);
    return res.json(data);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;
