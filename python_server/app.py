import os
import re
import json
import asyncio
import tempfile
import traceback
import subprocess
import gc
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, File, UploadFile, Form, Request, HTTPException, Response, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv
import httpx

# Load environment variables
load_dotenv()

# --- MODELS (Merged from models.py) ---
class DriveUrlRequest(BaseModel):
    url: str

class SaveFolderRequest(BaseModel):
    url: str
    userId: str
    folderName: Optional[str] = None

class RemoveFolderRequest(BaseModel):
    userId: str
    folderId: str # This corresponds to the MongoDB _id of the folder document

class GetFoldersRequest(BaseModel):
    userId: str

# --- UTILS (Merged from server_utils.py) ---
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

async def list_drive_folder_files(folder_id: str, page_token: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetches files from a Google Drive folder.
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
    """
    audio = []
    for file in files:
        if is_audio_file(file):
            audio.append(file)
    return audio

# Load environment variables
load_dotenv()

# --- CONFIGURATION ---
# Default to local if not set, but ideally should be set in env
MONGO_URI = os.getenv("MONGODB_URI") 
DB_NAME = "frebies"
TRANSCRIPTION_COLLECTION = "transcriptions"
FOLDERS_COLLECTION = "folders"

app = FastAPI(title="Mission Impossible Backend")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Adjust for production security if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MONGODB CONNECTION ---
# --- MONGODB CONNECTION ---
client = None
db_folders = None
db_transcriptions = None

@app.on_event("startup")
async def startup_db_client():
    global client, db_folders, db_transcriptions
    if not MONGO_URI:
        print("WARNING: MONGODB_URI not set in environment variables.")
        return
    client = AsyncIOMotorClient(MONGO_URI)
    
    # Node.js backend used default 'test' database for folders
    db_folders = client["test"] 
    
    # Python backend used 'frebies' database for transcriptions
    db_transcriptions = client["frebies"]
    
    print("MongoDB connected")
    
    # Ensure indexes
    try:
        await db_folders[FOLDERS_COLLECTION].create_index([("userId", 1), ("folderId", 1)], unique=True)
    except Exception as e:
        print(f"Index creation failed (might already exist): {e}")

    # Start worker
    asyncio.create_task(worker())

@app.on_event("shutdown")
async def shutdown_db_client():
    if client:
        client.close()

# --- TRANSCRIPTION ENGINE (from models/app.py) ---
from faster_whisper import WhisperModel

model_cache = {}
job_queue = asyncio.Queue()
processing_lock = asyncio.Lock()
active_streams = {}

def get_model(model_size: str = "base"):
    if model_size not in model_cache:
        print(f"Initializing model: {model_size}", flush=True)
        # Assuming running on CPU for Hugging Face Spaces free tier compatibility
        model_cache[model_size] = WhisperModel(
            model_size, 
            device="cpu", 
            compute_type="int8"
        )
        print(f"Model {model_size} initialized.", flush=True)
    return model_cache[model_size]

def format_srt_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    milliseconds = int((secs % 1) * 1000)
    secs = int(secs)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

def format_transcription(segments, words_per_line: int, include_timestamps: bool):
    formatted_lines = []
    
    # Auto mode: Use original segments (sentences/phrases)
    if words_per_line == 0:
        for i, segment in enumerate(segments):
            text = segment.text.strip()
            if not text: continue
            
            if include_timestamps:
                formatted_lines.append(str(i + 1))
                formatted_lines.append(f"{format_srt_timestamp(segment.start)} --> {format_srt_timestamp(segment.end)}")
                formatted_lines.append(text)
                formatted_lines.append("")
            else:
                formatted_lines.append(text)
        return "\n".join(formatted_lines)

    # Legacy mode: Forced word count splitting
    current_line_words = []
    current_line_start = None
    current_line_end = None
    sequence_number = 0
    
    for segment in segments:
        words = segment.text.strip().split()
        if not words: continue

        segment_start = segment.start
        segment_end = segment.end
        
        for i, word in enumerate(words):
            word_duration = (segment_end - segment_start) / len(words)
            word_start = segment_start + (i * word_duration)
            word_end = segment_start + ((i + 1) * word_duration)

            if current_line_start is None:
                current_line_start = word_start
            
            current_line_end = word_end
            current_line_words.append(word)
            
            if len(current_line_words) >= words_per_line:
                line_text = " ".join(current_line_words)
                if include_timestamps:
                    formatted_lines.append(str(sequence_number))
                    formatted_lines.append(f"{format_srt_timestamp(current_line_start)} --> {format_srt_timestamp(current_line_end)}")
                    formatted_lines.append(line_text)
                    formatted_lines.append("") 
                    sequence_number += 1
                else:
                    formatted_lines.append(line_text)
                
                current_line_words = []
                current_line_start = None
                current_line_end = None
    
    if current_line_words:
        line_text = " ".join(current_line_words)
        if include_timestamps and current_line_start is not None and current_line_end is not None:
            formatted_lines.append(str(sequence_number))
            formatted_lines.append(f"{format_srt_timestamp(current_line_start)} --> {format_srt_timestamp(current_line_end)}")
            formatted_lines.append(line_text)
            formatted_lines.append("")
        else:
            formatted_lines.append(line_text)
    
    return "\n".join(formatted_lines)

def convert_audio_to_wav(input_path: str) -> str:
    output_path = input_path + ".wav"
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", input_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output_path
        ], check=True, stderr=subprocess.DEVNULL)
        return output_path
    except subprocess.CalledProcessError:
        return input_path
    except FileNotFoundError:
        print("FFmpeg not found. Falling back to original file (might fail if not wav).")
        return input_path

async def publish_progress(job_id: str, progress: int, message: str, status: str = "processing"):
    if db_transcriptions is None: return
    update_data = {
        "progress": progress,
        "message": message,
        "status": status,
        "updatedAt": datetime.utcnow()
    }
    await db_transcriptions[TRANSCRIPTION_COLLECTION].update_one({"_id": ObjectId(job_id)}, {"$set": update_data})
    
    if job_id in active_streams:
        try:
            await active_streams[job_id].put({
                "type": "progress",
                "progress": progress,
                "message": message,
                "status": status
            })
        except Exception:
            pass

async def publish_result(job_id: str, result_data: dict):
    if db_transcriptions is None: return
    await db[TRANSCRIPTION_COLLECTION].update_one(
        {"_id": ObjectId(job_id)}, 
        {"$set": {
            "status": "completed", 
            "result": result_data, 
            "progress": 100, 
            "message": "Complete!",
            "completedAt": datetime.utcnow()
        }}
    )
    if job_id in active_streams:
        try:
            await active_streams[job_id].put({
                "type": "result",
                "data": result_data
            })
        except:
            pass

async def publish_error(job_id: str, error_msg: str):
    if db_transcriptions is None: return
    await db[TRANSCRIPTION_COLLECTION].update_one(
        {"_id": ObjectId(job_id)}, 
        {"$set": {
            "status": "failed", 
            "error": error_msg,
            "message": f"Error: {error_msg}"
        }}
    )
    if job_id in active_streams:
        try:
            await active_streams[job_id].put({
                "type": "error",
                "message": error_msg
            })
        except:
            pass

def process_transcription(file_path, options, progress_callback=None):
    model = get_model(options.get('model_size', 'base'))
    
    transcribe_opts = {
        "beam_size": options.get('beam_size', 5),
        "best_of": options.get('beam_size', 5),
        "word_timestamps": True,
        "condition_on_previous_text": False
    }
    if options.get('language') != "auto":
        transcribe_opts["language"] = options['language']

    segments_generator, info = model.transcribe(file_path, **transcribe_opts)
    
    segments_list = []
    total_duration = info.duration
    
    for segment in segments_generator:
        segments_list.append(segment)
        if progress_callback and total_duration and total_duration > 0:
            percent = int((segment.end / total_duration) * 80) + 10
            percent = min(90, max(10, percent))
            progress_callback(percent, f"Transcribing... ({int(segment.end)}/{int(total_duration)}s)")
            
    return segments_list, info

async def worker():
    print("Worker started. Waiting for jobs...", flush=True)
    while True:
        job_info = await job_queue.get()
        job_id = job_info['job_id']
        file_path = job_info['file_path']
        options = job_info['options']
        
        try:
            print(f"Worker picked up job {job_id}", flush=True)
            async with processing_lock:
                await publish_progress(job_id, 0, "Processing started...", "processing")
                
                await publish_progress(job_id, 5, "Converting audio...")
                converted_file = await asyncio.to_thread(convert_audio_to_wav, file_path)
                
                await publish_progress(job_id, 10, f"Loading {options.get('model_size')} model & Transcribing...")
                
                loop = asyncio.get_running_loop()
                def progress_cb(prog, msg):
                    asyncio.run_coroutine_threadsafe(publish_progress(job_id, prog, msg), loop)

                segments_list, info = await asyncio.to_thread(
                    process_transcription, 
                    converted_file, 
                    options,
                    progress_cb
                )
                
                await publish_progress(job_id, 90, "Formatting...")
                formatted_text = format_transcription(segments_list, options.get('words_per_line', 8), options.get('timestamps', True))
                
                result_data = {
                    "formatted_text": formatted_text,
                    "text": formatted_text, 
                    "language": info.language
                }
                
                await publish_result(job_id, result_data)
                
                if os.path.exists(converted_file) and converted_file != file_path:
                    os.unlink(converted_file)
                if os.path.exists(file_path):
                    os.unlink(file_path)
                    
        except Exception as e:
            traceback.print_exc()
            await publish_error(job_id, str(e))
        finally:
            job_queue.task_done()

# --- ROUTES: DRIVE & FOLDERS (Ported from Node.js) ---

@app.post("/data")
async def get_drive_audio_files(req: DriveUrlRequest):
    """
    Fetch audio files from a Google Drive folder URL.
    """
    if not req.url:
         raise HTTPException(status_code=400, detail="Missing url")

    # Extract ID
    m = re.search(r'/folders/([a-zA-Z0-9_-]+)', req.url)
    if not m:
        raise HTTPException(status_code=400, detail="Invalid Google Drive folder URL")
    folder_id = m.group(1)

    try:
        files = await list_all_files(folder_id)
        audio_files = pick_audio_files(files)
        return audio_files
    except Exception as e:
        print(f"Error fetching drive files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/saveData")
async def save_folder_data(req: SaveFolderRequest):
    """
    Upsert folder info and return audio files.
    """
    if db_folders is None:
        raise HTTPException(status_code=503, detail="Database not initialized")

    # Extract ID
    m = re.search(r'/folders/([a-zA-Z0-9_-]+)', req.url)
    if not m:
        raise HTTPException(status_code=400, detail="Invalid Google Drive folder URL")
    folder_id = m.group(1)

    try:
        files = await list_all_files(folder_id)
        audio_files = pick_audio_files(files)
        count = len(audio_files)

        # Upsert in MongoDB
        # Using find_one_and_update with upsert=True
        folder_doc = await db_folders[FOLDERS_COLLECTION].find_one_and_update(
            {"userId": req.userId, "folderId": folder_id},
            {"$set": {"folderName": req.folderName, "count": count}},
            upsert=True,
            return_document=True 
        )
        
        # Convert ObjectId to str for JSON
        folder_doc["_id"] = str(folder_doc["_id"])
        
        return {"ok": True, "files": audio_files, "folder": folder_doc}

    except Exception as e:
        print(f"Error saving folder: {e}")
        # Mimic original error message structure likely expected by frontend
        raise HTTPException(status_code=500, detail={"error": "Folder saving failed", "details": str(e)})

@app.post("/saveData/remove")
async def remove_folder(req: RemoveFolderRequest):
    if db_folders is None:
        raise HTTPException(status_code=503, detail="Database not initialized")
        
    try:
        result = await db_folders[FOLDERS_COLLECTION].delete_one({"_id": ObjectId(req.folderId)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Folder not found")
            
        return {"ok": True, "message": "Folder deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/getFolders")
async def get_user_folders(req: GetFoldersRequest):
    if db_folders is None:
        raise HTTPException(status_code=503, detail="Database not initialized")

    try:
        cursor = db_folders[FOLDERS_COLLECTION].find({"userId": req.userId})
        folders = []
        async for doc in cursor:
            # Ensure _id is a string
            doc["_id"] = str(doc["_id"])
            folders.append(doc)
            
        # The Node.js backend returned { ok: true, folders: [...] }
        # This matches the current python implementation, but let's be double sure about the data types inside doc.
        return {"ok": True, "folders": folders}
    except Exception as e:
        print(f"Error fetching folders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/audio/{file_id}")
async def proxy_audio(file_id: str):
    """
    Proxy audio stream from Google Drive.
    """
    google_drive_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    
    # We use httpx to stream the response back
    async def iterfile():
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", google_drive_url, follow_redirects=True) as r:
                if r.status_code != 200:
                    yield b"" # Or handle error appropriately
                    return
                
                async for chunk in r.aiter_bytes():
                    yield chunk

    # Need to make a head request first to get headers or just stream blind?
    # Simple proxy approach:
    # Note: For a true stream proxy in FastAPI, it's a bit tricky to duplicate headers exactly 
    # without making the request first.
    
    # Let's do a request to get headers then stream.
    client = httpx.AsyncClient()
    req = client.build_request("GET", google_drive_url)
    r = await client.send(req, stream=True, follow_redirects=True)
    
    if r.status_code != 200:
        await r.aclose()
        await client.aclose()
        raise HTTPException(status_code=r.status_code, detail="Failed to fetch from Drive")

    response = StreamingResponse(
        r.aiter_bytes(), 
        status_code=r.status_code,
        media_type=r.headers.get("content-type"),
    )
    # Forward content-length if present, useful for seeks
    if "content-length" in r.headers:
        response.headers["Content-Length"] = r.headers["content-length"]
    if "accept-ranges" in r.headers:
        response.headers["Accept-Ranges"] = r.headers["accept-ranges"]
        
    # Hook to close client after response
    async def cleanup():
        await r.aclose()
        await client.aclose()
        
    response.background = BackgroundTasks()
    response.background.add_task(cleanup)
    
    return response


# --- ROUTES: TRANSCRIPTION (from models/app.py) ---

@app.post("/transcribe")
async def create_transcription_job(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    model_size: str = Form("base"),
    language: str = Form("auto"),
    timestamps: bool = Form(True),
    words_per_line: int = Form(8),
    beam_size: int = Form(5)
):
    if db_folders is None:
        raise HTTPException(status_code=503, detail="Database not initialized")

    safe_filename = file.filename or "unknown_audio"
    file_suffix = Path(safe_filename).suffix or ".tmp"
    
    # Save temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as temp:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk: break
            temp.write(chunk)
        temp_file_path = temp.name

    job_doc = {
        "userId": user_id, 
        "fileName": safe_filename,
        "status": "queued",
        "progress": 0,
        "message": "Waiting in queue...",
        "createdAt": datetime.utcnow(),
        "modelSize": model_size,
        "language": language
    }
    result = await db_transcriptions[TRANSCRIPTION_COLLECTION].insert_one(job_doc)
    job_id = str(result.inserted_id)
    
    await job_queue.put({
        "job_id": job_id,
        "file_path": temp_file_path,
        "options": {
            "model_size": model_size,
            "language": language,
            "timestamps": timestamps,
            "words_per_line": words_per_line,
            "beam_size": beam_size
        }
    })
    
    return {"jobId": job_id, "status": "queued", "message": "Job submitted successfully"}

@app.get("/transcriptions/{user_id}")
async def get_user_transcriptions(user_id: str):
    if db_transcriptions is None: return []
    cursor = db_transcriptions[TRANSCRIPTION_COLLECTION].find({"userId": user_id}).sort("createdAt", -1).limit(20)
    jobs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        jobs.append(doc)
    return jobs

@app.get("/transcription/{job_id}")
async def get_transcription_details(job_id: str):
    if db_transcriptions is None: raise HTTPException(status_code=503)
    try:
        doc = await db_transcriptions[TRANSCRIPTION_COLLECTION].find_one({"_id": ObjectId(job_id)})
        if doc:
            doc["_id"] = str(doc["_id"])
            return doc
        raise HTTPException(status_code=404, detail="Not found")
    except:
        raise HTTPException(status_code=404, detail="Invalid ID")

@app.put("/transcription/{job_id}")
async def update_transcription(job_id: str, request: Request):
    if db_transcriptions is None: raise HTTPException(status_code=503)
    try:
        body = await request.json()
        new_text = body.get("text")
        
        if new_text is None:
             raise HTTPException(status_code=400, detail="Missing 'text' field")

        update_result = await db_transcriptions[TRANSCRIPTION_COLLECTION].update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {
                "result.formatted_text": new_text,
                "result.text": new_text, 
                "updatedAt": datetime.utcnow()
            }}
        )
        
        if update_result.matched_count == 0:
             raise HTTPException(status_code=404, detail="Job not found")
             
        return {"message": "Transcription updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/transcription/{job_id}")
async def delete_transcription(job_id: str):
    if db_transcriptions is None: raise HTTPException(status_code=503)
    try:
        result = await db_transcriptions[TRANSCRIPTION_COLLECTION].delete_one({"_id": ObjectId(job_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"message": "Transcription deleted successfully"}
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

@app.get("/stream/{job_id}")
async def stream_progress(job_id: str, request: Request):
    async def event_generator():
        if db_transcriptions is None:
            yield json.dumps({"type": "error", "message": "DB error"}) + "\n"
            return

        doc = await db_transcriptions[TRANSCRIPTION_COLLECTION].find_one({"_id": ObjectId(job_id)})
        if not doc:
            yield json.dumps({"type": "error", "message": "Job not found"}) + "\n"
            return

        if doc.get("status") == "completed":
            yield json.dumps({
                "type": "result", 
                "data": doc.get("result", {}),
                "progress": 100,
                "message": "Complete!"
            }) + "\n"
            return
        
        if doc.get("status") == "failed":
             yield json.dumps({"type": "error", "message": doc.get("error", "Unknown error")}) + "\n"
             return

        if job_id not in active_streams:
            active_streams[job_id] = asyncio.Queue()
        
        queue = active_streams[job_id]
        
        yield json.dumps({
            "type": "progress", 
            "progress": doc.get("progress", 0), 
            "message": doc.get("message", "Connecting...")
        }) + "\n"

        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield json.dumps(data) + "\n"
                    if data.get("type") in ["result", "error"]:
                        break
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            pass

    return StreamingResponse(event_generator(), media_type="text/event-stream") # SSE standard

# --- UPTIME ---
@app.get("/uptime")
def uptime():
    return {"ok": True}

from fastapi import BackgroundTasks
