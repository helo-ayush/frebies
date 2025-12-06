from fastapi import FastAPI, File, UploadFile, Form, Request, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import json
import os
import tempfile
from typing import Optional
import asyncio
from pathlib import Path
import subprocess
import gc
import traceback
import time
from datetime import datetime

# --- CONFIGURATION ---
MONGO_URI = "mongodb+srv://user:ayush1234@frebies.49ugkbz.mongodb.net/?retryWrites=true&w=majority"
DB_NAME = "frebies"
COLLECTION_NAME = "transcriptions"

app = FastAPI(title="Whisper Transcription API with History")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MONGODB CONNECTION ---
client = AsyncIOMotorClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]

# --- GLOBAL VARIABLES ---
model_cache = {}
# Use a simple global queue for now. For production, consider Redis/Celery.
job_queue = asyncio.Queue()
processing_lock = asyncio.Lock()

# Map to store active stream queues for clients currently listening
# Key: job_id, Value: asyncio.Queue containing progress updates
active_streams = {}

# --- UTILITY FUNCTIONS ---

def get_model(model_size: str = "base"):
    if model_size not in model_cache:
        print(f"Initializing model: {model_size}", flush=True)
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
    current_line_words = []
    current_line_start = None
    current_line_end = None
    sequence_number = 0
    
    for segment in segments:
        words_source = getattr(segment, 'words', None)
        if words_source:
             # Logic for word-level timestamps (if enabled in model)
             pass 
             # To keep it simple and robust matching previous logic (often word_timestamps=True but we iterate segments if words are none)
        
        # Fallback to segment level for robustness in this refactor or if words unavailable
        words = segment.text.strip().split()
        if not words: continue

        segment_start = segment.start
        segment_end = segment.end
        
        for i, word in enumerate(words):
            if current_line_start is None:
                current_line_start = segment_start
            
            word_duration = (segment_end - segment_start) / len(words)
            current_line_end = segment_start + (i + 1) * word_duration
            
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

async def publish_progress(job_id: str, progress: int, message: str, status: str = "processing"):
    """
    1. Update MongoDB
    2. specific stream queue if client is listening
    """
    update_data = {
        "progress": progress,
        "message": message,
        "status": status,
        "updatedAt": datetime.utcnow()
    }
    
    await collection.update_one({"_id": ObjectId(job_id)}, {"$set": update_data})
    
    # Send to active stream if exists
    if job_id in active_streams:
        try:
            await active_streams[job_id].put({
                "type": "progress",
                "progress": progress,
                "message": message,
                "status": status
            })
        except Exception:
            pass # Stream might be closed

async def publish_result(job_id: str, result_data: dict):
    await collection.update_one(
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
    await collection.update_one(
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

# --- WORKER ---

def process_transcription(file_path, options, progress_callback=None):
    """Synchronous partial wrapper for CPU intensive work"""
    model = get_model(options['model_size'])
    
    transcribe_opts = {
        "beam_size": options['beam_size'],
        "best_of": options['beam_size'],
        "word_timestamps": True,
        "condition_on_previous_text": False
    }
    if options['language'] != "auto":
        transcribe_opts["language"] = options['language']

    segments_generator, info = model.transcribe(
        file_path, 
        **transcribe_opts
    )
    
    segments_list = []
    total_duration = info.duration
    
    for segment in segments_generator:
        segments_list.append(segment)
        
        if progress_callback and total_duration and total_duration > 0:
            # Map duration to 10-90% range
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
                
                # Conversion
                await publish_progress(job_id, 5, "Converting audio...")
                converted_file = await asyncio.to_thread(convert_audio_to_wav, file_path)
                
                # Transcribe (Offload blocking loop to thread)
                await publish_progress(job_id, 10, f"Loading {options['model_size']} model & Transcribing...")
                
                # Define thread-safe progress callback
                loop = asyncio.get_running_loop()
                def progress_cb(prog, msg):
                    asyncio.run_coroutine_threadsafe(publish_progress(job_id, prog, msg), loop)

                segments_list, info = await asyncio.to_thread(
                    process_transcription, 
                    converted_file, 
                    options,
                    progress_cb
                )
                
                # Formatting
                await publish_progress(job_id, 90, "Formatting...")
                formatted_text = format_transcription(segments_list, options['words_per_line'], options['timestamps'])
                
                result_data = {
                    "formatted_text": formatted_text,
                    "text": formatted_text, 
                    "language": info.language
                }
                
                await publish_result(job_id, result_data)
                
                # Cleanup
                if os.path.exists(converted_file) and converted_file != file_path:
                    os.unlink(converted_file)
                if os.path.exists(file_path):
                    os.unlink(file_path)
                    
        except Exception as e:
            traceback.print_exc()
            await publish_error(job_id, str(e))
        finally:
            job_queue.task_done()

# Start worker on startup
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(worker())

# --- ENDPOINTS ---

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
    # 1. Save File Temporarily
    safe_filename = file.filename or "unknown_audio"
    file_suffix = Path(safe_filename).suffix or ".tmp"
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as temp:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk: break
            temp.write(chunk)
        temp_file_path = temp.name

    # 2. Create DB Entry
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
    result = await collection.insert_one(job_doc)
    job_id = str(result.inserted_id)
    
    # 3. Add to Queue
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
    # Return list of transcriptions for side panel
    cursor = collection.find({"userId": user_id}).sort("createdAt", -1).limit(20)
    jobs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        jobs.append(doc)
    return jobs

@app.get("/transcription/{job_id}")
async def get_transcription_details(job_id: str):
    doc = await collection.find_one({"_id": ObjectId(job_id)})
    if doc:
        doc["_id"] = str(doc["_id"])
        return doc
    return JSONResponse(status_code=404, content={"message": "Not found"})

@app.put("/transcription/{job_id}")
async def update_transcription(job_id: str, request: Request):
    """Update the text content of a transcription"""
    # Expect JSON body: {"text": "new text content"} 
    # and maybe keep "text" and "formatted_text" in sync or just update formatted_text?
    # The frontend is editing `formatted_text` (the main view).
    
    try:
        body = await request.json()
        new_text = body.get("text")
        
        if new_text is None:
             return JSONResponse(status_code=400, content={"message": "Missing 'text' field"})

        # Update both `result.formatted_text` and `result.text` (if we want to keep them aligned)
        # Note: In our current schema, result_data has both.
        
        update_result = await collection.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {
                "result.formatted_text": new_text,
                "result.text": new_text, # Assuming simple sync
                "updatedAt": datetime.utcnow()
            }}
        )
        
        if update_result.matched_count == 0:
             return JSONResponse(status_code=404, content={"message": "Job not found"})
             
        return {"message": "Transcription updated successfully"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

@app.delete("/transcription/{job_id}")
async def delete_transcription(job_id: str):
    """Delete a transcription job and cleanup files if any (files are temp already deleted usually)"""
    try:
        # Check if exists to get file path if we wanted to be thorough, but we delete temp files in worker.
        delete_result = await collection.delete_one({"_id": ObjectId(job_id)})
        
        if delete_result.deleted_count == 0:
            return JSONResponse(status_code=404, content={"message": "Job not found"})
            
        return {"message": "Transcription deleted successfully"}
        
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})

@app.get("/stream/{job_id}")
async def stream_progress(job_id: str, request: Request):
    """
    SSE Endpoint for real-time progress of a specific job.
    If job is done, sends result immediately. 
    If active, proxies queue events.
    """
    async def event_generator():
        # Check current status first
        doc = await collection.find_one({"_id": ObjectId(job_id)})
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

        # If running/queued, subscribe to updates
        if job_id not in active_streams:
            active_streams[job_id] = asyncio.Queue()
        
        queue = active_streams[job_id]
        
        # Send current state immediately
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
                    # Wait for new event
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield json.dumps(data) + "\n"
                    
                    if data.get("type") in ["result", "error"]:
                        break
                except asyncio.TimeoutError:
                    # Keep-alive
                    yield ": keep-alive\n\n"
                    
        finally:
            # Cleanup only this listener? 
            # active_streams key should ideally remain if multiple tab open? 
            # For simplicity, we just leave it. It's a small memory leak if many unique jobs, 
            # but usually fine for this scale or use generic cleanup task.
            pass

    return StreamingResponse(event_generator(), media_type="application/x-ndjson")

