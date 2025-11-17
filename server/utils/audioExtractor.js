function isAudioFile(file) {
  if (!file) return false;
  const mime = (file.mimeType || '').toLowerCase();
  if (mime.startsWith('audio/')) return true;
  const name = (file.name || '').toLowerCase();
  return /\.(mp3|m4a|wav|flac|ogg|aac|opus)$/i.test(name);
}

function pickAudioFiles(files) {
  // 1. Create an empty array to hold the results
  const audio = [];

  // 2. Add the same safety check
  const filesToLoop = files || [];

  // 3. Loop through each item in the array
  for (const file of filesToLoop) {
    
    // 4. Run the test on the current item
    if (isAudioFile(file)) {
      
      // 5. If it passes, add it to the results array
      audio.push(file);
    }
  }

  // 6. Return the new array
  return audio;
}

module.exports = { isAudioFile, pickAudioFiles };