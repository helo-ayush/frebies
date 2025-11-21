const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

async function listDriveFolderFiles(folderId, pageToken = null) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  // Fix: specify audioMediaMetadata with its sub-fields
  const fields = encodeURIComponent('nextPageToken, files(id,name,mimeType,size,webContentLink,webViewLink,createdTime)');
  const key = GOOGLE_API_KEY ? `&key=${GOOGLE_API_KEY}` : '';
  const page = pageToken ? `&pageToken=${pageToken}` : '';
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100${key}${page}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Drive API error: ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json;
}

async function listAllFiles(folderId) {
  let all = [];
  let pageToken = null;
  do {
    const res = await listDriveFolderFiles(folderId, pageToken);
    all = all.concat(res.files || []);
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  return all;
}

module.exports = listAllFiles;