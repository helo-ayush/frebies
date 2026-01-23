import os
import re
import httpx
import urllib.parse
from typing import List, Dict, Any, Optional

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

async def list_drive_folder_files(folder_id: str, page_token: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetches files from a Google Drive folder.
    Equivalent to listDriveFolderFiles in folderExtracter.js
    """
    q = urllib.parse.quote(f"'{folder_id}' in parents and trashed=false")
    fields = urllib.parse.quote('nextPageToken, files(id,name,mimeType,size,webContentLink,webViewLink,createdTime)')
    key = f"&key={GOOGLE_API_KEY}" if GOOGLE_API_KEY else ""
    page = f"&pageToken={page_token}" if page_token else ""
    
    url = f"https://www.googleapis.com/drive/v3/files?q={q}&fields={fields}&pageSize=100{key}{page}"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        if response.status_code != 200:
            raise Exception(f"Drive API error: {response.status_code} {response.text}")
        return response.json()

async def list_all_files(folder_id: str) -> List[Dict[str, Any]]:
    """
    Recursively fetches all files from a folder (handling pagination).
    Equivalent to listAllFiles in folderExtracter.js
    """
    all_files = []
    page_token = None
    
    while True:
        res = await list_drive_folder_files(folder_id, page_token)
        files = res.get('files', [])
        all_files.extend(files)
        page_token = res.get('nextPageToken')
        if not page_token:
            break
            
    return all_files

def is_audio_file(file: Dict[str, Any]) -> bool:
    """
    Checks if a file is an audio file based on mimeType or extension.
    Equivalent to isAudioFile in audioExtractor.js
    """
    if not file:
        return False
        
    mime = (file.get('mimeType') or '').lower()
    if mime.startswith('audio/'):
        return True
        
    name = (file.get('name') or '').lower()
    return bool(re.search(r'\.(mp3|m4a|wav|flac|ogg|aac|opus)$', name, re.IGNORECASE))

def pick_audio_files(files: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filters a list of files to return only audio files.
    Equivalent to pickAudioFiles in audioExtractor.js
    """
    audio = []
    for file in files:
        if is_audio_file(file):
            audio.append(file)
    return audio
