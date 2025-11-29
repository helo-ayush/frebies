import os
import shutil
import textwrap
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

# --- Configuration ---
# Default configuration
DEFAULT_MODEL_SIZE = "base"
DEVICE = "cpu"
COMPUTE_TYPE = "int8"

app = FastAPI()

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global Model State ---
# We keep track of the currently loaded model to avoid reloading if not necessary
current_model = None
current_model_size = None

def get_model(model_size: str):
    global current_model, current_model_size
    
    if current_model is None or current_model_size != model_size:
        print(f"Loading Whisper {model_size} model...")
        try:
            current_model = WhisperModel(model_size, device=DEVICE, compute_type=COMPUTE_TYPE)
            current_model_size = model_size
            print(f"Model {model_size} loaded successfully!")
        except Exception as e:
            print(f"Error loading model {model_size}: {e}")
            # Fallback to base if requested model fails (e.g. download error)
            if model_size != "base":
                print("Falling back to base model...")
                return get_model("base")
            raise e
            
    return current_model

def format_text(text: str, words_per_line: int, max_chars: int):
    """
    Format text based on words per line and max characters constraints.
    This is a simple implementation.
    """
    words = text.split()
    lines = []
    current_line = []
    
    for word in words:
        current_line.append(word)
        # Check constraints
        line_str = " ".join(current_line)
        if len(current_line) >= words_per_line or len(line_str) >= max_chars:
            lines.append(line_str)
            current_line = []
            
    if current_line:
        lines.append(" ".join(current_line))
        
    return "\n".join(lines)

@app.get("/")
def home():
    return {"status": "running", "current_model": current_model_size}

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    model_size: str = Form("base"),
    language: str = Form("auto"),
    timestamps: bool = Form(True),
    diarization: bool = Form(False),
    words_per_line: int = Form(8),
    max_chars: int = Form(42)
):
    temp_filename = f"temp_{file.filename}"
    
    try:
        # 1. Save uploaded file temporarily
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # 2. Get the requested model
        # Map frontend model names if necessary, but 'base', 'small', 'large' work for faster-whisper
        # Note: 'large' usually maps to 'large-v3' in newer versions or we can be specific
        target_model = model_size
        if target_model == "large":
            target_model = "large-v3"
            
        model = get_model(target_model)
        
        # 3. Run Transcription
        # Handle 'auto' language
        lang_arg = None if language == "auto" else language
        
        segments, info = model.transcribe(
            temp_filename, 
            beam_size=5, 
            language=lang_arg,
            task="transcribe"
        )
        
        # 4. Process Segments
        results = []
        full_text_parts = []
        
        for segment in segments:
            # Format segment text if needed, or just keep raw
            # For the final full text, we might want to apply the formatting rules
            segment_data = {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip()
            }
            
            # Handle Diarization (Speaker ID)
            # faster-whisper does not natively support diarization.
            # To get real speaker labels, we would need to integrate pyannote.audio.
            # For now, if diarization is requested, we return a placeholder or 
            # you can implement a simple heuristic here.
            if diarization:
                segment_data["speaker"] = "Speaker A" # Placeholder for now
                
            results.append(segment_data)
            full_text_parts.append(segment.text.strip())
            
        full_text = " ".join(full_text_parts)
        
        # 5. Apply Formatting (Words per Line / Max Chars)
        # This creates a formatted version of the full text
        formatted_text = format_text(full_text, words_per_line, max_chars)
        
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "text": full_text, # Raw full text
            "formatted_text": formatted_text, # Formatted text based on settings
            "segments": results if timestamps or diarization else None, # Return segments if timestamps or diarization requested
            "model_used": current_model_size
        }

    except Exception as e:
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # 6. Cleanup
        if os.path.exists(temp_filename):
            os.remove(temp_filename)