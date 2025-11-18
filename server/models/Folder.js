const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    folderId: { type: String, required: true },
    folderName: { type: String, required: true }
})

// unique per-user per-folder (avoid duplicates)
FolderSchema.index({ userId: 1, folderId: 1 }, { unique: true });

module.exports = mongoose.model('Folder', FolderSchema);