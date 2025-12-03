from fastapi import FastAPI, File, UploadFile, Form, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import json
import os
import tempfile
from typing import Optional
import asyncio
from pathlib import Path
import subprocess
import gc

app = FastAPI(title="Whisper Transcription API")

# CORS configuration for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache to avoid reloading
model_cache = {}

def get_model(model_size: str = "base"):
    """Load and cache Whisper model"""
    if model_size not in model_cache:
        # Use CPU with int8 quantization for efficiency
        model_cache[model_size] = WhisperModel(
            model_size, 
            device="cpu", 
            compute_type="int8"
        )
    return model_cache[model_size]

def format_timestamp(seconds: float) -> str:
    """Convert seconds to [HH:MM:SS.mmm] format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    milliseconds = int((secs % 1) * 1000)
    secs = int(secs)
    return f"[{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}]"

def format_srt_timestamp(seconds: float) -> str:
    """Convert seconds to HH:MM:SS,mmm format (SRT subtitle format)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    milliseconds = int((secs % 1) * 1000)
    secs = int(secs)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

def format_transcription(segments, words_per_line: int, include_timestamps: bool):
    """Format transcription with timestamps and words per line in SRT format"""
    formatted_lines = []
    current_line_words = []
    current_line_start = None
    current_line_end = None
    sequence_number = 0
    
    for segment in segments:
        # Access word-level timestamps if available
        if hasattr(segment, 'words') and segment.words:
            # Use word-level timestamps
            for word in segment.words:
                word_text = word.word.strip()
                if not word_text:
                    continue
                    
                # Set the timestamp for the first word in the line
                if current_line_start is None:
                    current_line_start = word.start
                
                # Always update the end time to the current word's end
                current_line_end = word.end
                
                current_line_words.append(word_text)
                
                # Create new line when reaching words_per_line limit
                if len(current_line_words) >= words_per_line:
                    line_text = " ".join(current_line_words)
                    if include_timestamps:
                        # SRT format: sequence number, timestamp range, text, blank line
                        formatted_lines.append(str(sequence_number))
                        formatted_lines.append(f"{format_srt_timestamp(current_line_start)} --> {format_srt_timestamp(current_line_end)}")
                        formatted_lines.append(line_text)
                        formatted_lines.append("")  # Blank line
                        sequence_number += 1
                    else:
                        formatted_lines.append(line_text)
                    
                    current_line_words = []
                    current_line_start = None
                    current_line_end = None
        else:
            # Fallback to simple word splitting if word timestamps not available
            words = segment.text.strip().split()
            segment_start = segment.start
            segment_end = segment.end
            
            for i, word in enumerate(words):
                if current_line_start is None:
                    current_line_start = segment_start
                
                # Estimate end time for this word
                word_duration = (segment_end - segment_start) / len(words)
                current_line_end = segment_start + (i + 1) * word_duration
                
                current_line_words.append(word)
                
                # Create new line when reaching words_per_line limit
                if len(current_line_words) >= words_per_line:
                    line_text = " ".join(current_line_words)
                    if include_timestamps:
                        # SRT format: sequence number, timestamp range, text, blank line
                        formatted_lines.append(str(sequence_number))
                        formatted_lines.append(f"{format_srt_timestamp(current_line_start)} --> {format_srt_timestamp(current_line_end)}")
                        formatted_lines.append(line_text)
                        formatted_lines.append("")  # Blank line
                        sequence_number += 1
                    else:
                        formatted_lines.append(line_text)
                    
                    current_line_words = []
                    current_line_start = None
                    current_line_end = None
    
    # Add remaining words as final line
    if current_line_words:
        line_text = " ".join(current_line_words)
        if include_timestamps and current_line_start is not None and current_line_end is not None:
            formatted_lines.append(str(sequence_number))
            formatted_lines.append(f"{format_srt_timestamp(current_line_start)} --> {format_srt_timestamp(current_line_end)}")
            formatted_lines.append(line_text)
            formatted_lines.append("")  # Blank line
        else:
            formatted_lines.append(line_text)
    
    return "\n".join(formatted_lines)

def format_progress_time(seconds: float) -> str:
    """Convert seconds to HH:MM:SS format for progress messages"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


# Global lock to ensure only one transcription runs at a time (prevent OOM on free tier)
transcription_lock = asyncio.Lock()

def convert_audio_to_wav(input_path: str) -> str:
    """Convert audio to 16kHz mono WAV using FFmpeg for Whisper compatibility"""
    output_path = input_path + ".wav"
    try:
        # ffmpeg -i input -ar 16000 -ac 1 -c:a pcm_s16le output.wav
        subprocess.run([
            "ffmpeg", "-y",
            "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            output_path
        ], check=True, stderr=subprocess.DEVNULL)
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg conversion failed: {e}")
        return input_path  # Fallback to original if conversion fails

async def transcribe_stream(
    file: UploadFile,
    model_size: str,
    language: str,
    timestamps: bool,
    words_per_line: int,
    beam_size: int,
    request: Request
):
    """Stream transcription progress and results"""
    temp_file = None
    converted_file = None
    
    try:
        # Send initial progress
        yield json.dumps({
            "type": "progress",
            "progress": 0,
            "message": "Uploading file..."
        }) + "\n"
        await asyncio.sleep(0.1)  # Force flush
        
        # Save uploaded file to temporary location using chunked write to avoid blocking
        file_suffix = Path(file.filename).suffix if file.filename else ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as temp:
            temp_file = temp.name
            # Read and write in chunks
            while True:
                chunk = await file.read(50 * 1024 * 1024)  # 50MB chunks for faster upload
                if not chunk:
                    break
                temp.write(chunk)
                # Check for disconnection during upload
                if await request.is_disconnected():
                    print("Client disconnected during upload")
                    return
        
        yield json.dumps({
            "type": "progress",
            "progress": 0,
            "message": "Waiting in queue..."
        }) + "\n"
        await asyncio.sleep(0.1)
        
        # Acquire lock to ensure exclusive access to CPU/RAM
        async with transcription_lock:
            yield json.dumps({
                "type": "progress",
                "progress": 0,
                "message": "Processing audio..."
            }) + "\n"
            await asyncio.sleep(0.1)
            
            # Convert audio to standard format
            converted_file = await asyncio.to_thread(convert_audio_to_wav, temp_file)
            
            if await request.is_disconnected():
                print("Client disconnected during conversion")
                return

            yield json.dumps({
                "type": "progress",
                "progress": 0,
                "message": f"Loading {model_size} model..."
            }) + "\n"
            await asyncio.sleep(0.1)  # Force flush
            
            # Check disconnect before loading model
            if await request.is_disconnected():
                print("Client disconnected before model load")
                return

            # Load model
            model = get_model(model_size)
            
            yield json.dumps({
                "type": "progress",
                "progress": 0,
                "message": "Transcribing audio..."
            }) + "\n"
            await asyncio.sleep(0.1)  # Force flush
            
            # Transcribe with language detection if auto
            transcribe_options = {
                "beam_size": beam_size,
                "best_of": beam_size, # Usually best_of is similar to beam_size
                "word_timestamps": True,
                "vad_filter": False,  # Disabled VAD as it was filtering out valid speech
            }
            
            if language != "auto":
                transcribe_options["language"] = language
            
            # Run transcription in a way that allows checking for cancellation
            # faster-whisper's transcribe returns a generator, so it doesn't block immediately
            segments, info = model.transcribe(
                converted_file if converted_file else temp_file,
                **transcribe_options
            )
            
            # Process segments as they are generated
            segments_list = []
            total_duration = info.duration
            
            # Create an iterator from the generator
            segments_iter = iter(segments)
            
            while True:
                # Check if client disconnected before waiting for next segment
                if await request.is_disconnected():
                    print("Client disconnected during transcription")
                    return

                try:
                    # Run the blocking next() in a thread to prevent blocking the event loop
                    # Set a timeout (e.g., 300 seconds per segment) to detect stuck model
                    # Large model on CPU can be very slow, so we need a generous timeout
                    segment = await asyncio.wait_for(
                        asyncio.to_thread(next, segments_iter, None),
                        timeout=300.0
                    )
                    
                    if segment is None:
                        break  # End of transcription
                        
                    segments_list.append(segment)
                    
                    # Calculate progress based on time processed
                    if total_duration > 0:
                        current_time = segment.end
                        # Map 0-100% of duration to 0-100% of progress bar
                        progress = int((current_time / total_duration) * 100)
                        progress = min(100, progress)  # Cap at 100%
                        
                        yield json.dumps({
                            "type": "progress",
                            "progress": progress,
                            "message": f"Transcribed {format_progress_time(current_time)} of {format_progress_time(total_duration)}..."
                        }) + "\n"
                    
                    # Yield control to event loop
                    await asyncio.sleep(0.1)
                    
                except asyncio.TimeoutError:
                    print("Segment processing timed out (stuck), aborting to free resources")
                    yield json.dumps({
                        "type": "error",
                        "message": "Transcription stuck on a segment. Aborting to free resources."
                    }) + "\n"
                    break
                except Exception as e:
                    print(f"Error processing segment: {e}")
                    break
            
            yield json.dumps({
                "type": "progress",
                "progress": 100,
                "message": "Formatting transcription..."
            }) + "\n"
            await asyncio.sleep(0.1)  # Force flush
            
            # Format the transcription
            formatted_text = format_transcription(
                segments_list,
                words_per_line,
                timestamps
            )
            
            # Send final result
            yield json.dumps({
                "type": "result",
                "data": {
                    "formatted_text": formatted_text,
                    "text": formatted_text,
                    "language": info.language if hasattr(info, 'language') else language
                }
            }) + "\n"
        
    except Exception as e:
        print(f"Error during transcription: {e}")
        yield json.dumps({
            "type": "error",
            "message": str(e)
        }) + "\n"
    
    finally:
        # Cleanup temporary file
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except Exception as e:
                print(f"Error cleaning up temp file: {e}")
        
        # Cleanup converted file
        if converted_file and os.path.exists(converted_file) and converted_file != temp_file:
            try:
                os.unlink(converted_file)
            except Exception as e:
                print(f"Error cleaning up converted file: {e}")
        
        # Explicit garbage collection
        gc.collect()

@app.post("/transcribe")
async def transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    model_size: str = Form("base"),
    language: str = Form("auto"),
    timestamps: bool = Form(True),
    words_per_line: int = Form(8),
    beam_size: int = Form(5)
):
    return StreamingResponse(
        transcribe_stream(
            file, 
            model_size, 
            language, 
            timestamps, 
            words_per_line,
            beam_size,
            request
        ),
        media_type="application/x-ndjson"
    )

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "message": "Whisper Transcription API",
        "available_models": ["base", "small", "large"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
