const express = require('express');
const { Readable } = require('stream');
const router = express.Router();

router.get('/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        const googleDriveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        const response = await fetch(googleDriveUrl);

        if (!response.ok) {
            throw new Error(`Google Drive returned status: ${response.status}`);
        }

        res.set({
            'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
            'Content-Length': response.headers.get('content-length'),
            'Accept-Ranges': 'bytes',
        });
        Readable.fromWeb(response.body).pipe(res);

    }
    catch (err) {
        console.log("Audio Proxy Error", err.message);
        res.status(500).json({
            error: 'Failed to fetch audio',
            details: err.message
        })
    }
});


module.exports = router;