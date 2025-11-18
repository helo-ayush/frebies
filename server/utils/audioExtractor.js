function isAudioFile(file) {
  if (!file) return false;
  const mime = (file.mimeType || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  const name = (file.name || '').toLowerCase();
  return /\.(mp3|m4a|wav|flac|ogg|aac|opus)$/i.test(name);
}

function pickAudioFiles(files) {
  const audio = [];
  const filesToLoop = files || [];

  for (const file of filesToLoop) {
    
    if (isAudioFile(file)) {
      audio.push(file);
    }
  }
  return audio;
}

module.exports = { isAudioFile, pickAudioFiles };