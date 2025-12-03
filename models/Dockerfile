FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies for audio processing and PyAV building
RUN apt-get update && apt-get install -y \
    ffmpeg \
    pkg-config \
    build-essential \
    libavcodec-dev \
    libavformat-dev \
    libavutil-dev \
    libswscale-dev \
    libavdevice-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .

# Expose Hugging Face Spaces default port
EXPOSE 7860

# Set environment variables for optimal CPU performance
ENV OMP_NUM_THREADS=4
ENV MKL_NUM_THREADS=4

# Run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--timeout-keep-alive", "300"]
