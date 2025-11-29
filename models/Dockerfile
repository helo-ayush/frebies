# Use Python 3.9 slim image
FROM python:3.9-slim

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
# We install ffmpeg because Whisper needs it to process audio files
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt

# --- THE CRITICAL OPTIMIZATION ---
# We create a specific cache directory and set permissions
# Then we run a python script to DOWNLOAD the model during the build.
# This ensures the 3GB model is saved inside the image, not downloaded at runtime.
RUN mkdir -p /app/cache && chmod 777 /app/cache
ENV XDG_CACHE_HOME=/app/cache

RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('large-v3', device='cpu', compute_type='int8'); WhisperModel('base', device='cpu', compute_type='int8'); WhisperModel('small', device='cpu', compute_type='int8')"

# Copy the rest of the application
COPY . .

# Create a non-root user (Security best practice & often required by HF)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
	PATH=/home/user/.local/bin:$PATH

# Expose port 7860 (Hugging Face default)
EXPOSE 7860

# Start the server
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]