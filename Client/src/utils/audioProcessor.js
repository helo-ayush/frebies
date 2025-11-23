/**
 * Audio Processing Utility
 * Handles fetching, decoding, processing (normalization, silence trimming),
 * and mixing of audio tracks using the Web Audio API.
 */

// --- CONSTANTS ---
const SAMPLE_RATE = 44100; // Standard CD quality sample rate
const SILENCE_THRESHOLD = 0.01; // Amplitude threshold to consider as silence (-40dB approx)
const FADE_CURVE_EXPONENT = 2; // For exponential crossfades (smoother than linear)

/**
 * Main function to generate the final mix.
 * 
 * @param {Array} songs - List of song objects with { id, name, url, ... }
 * @param {Object} config - Configuration object { crossfadeDuration, normalize, targetDuration }
 * @param {Function} onProgress - Callback for progress updates (message, percent)
 * @returns {Promise<Object>} - { audioBlob, timecodes }
 */
export async function generateMix(songs, config, onProgress) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const processedBuffers = [];
    const timecodes = [];

    try {
        // 1. Process each song individually (Fetch -> Decode -> Trim -> Normalize)
        for (let i = 0; i < songs.length; i++) {
            const song = songs[i];
            onProgress(`Processing ${i + 1}/${songs.length} songs`, (i / songs.length) * 90);

            // A. Fetch Audio Data
            const response = await fetch(song.proxyUrl || song.url);
            const arrayBuffer = await response.arrayBuffer();

            // B. Decode Audio Data
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // C. Detect and Trim Silence
            const { buffer: trimmedBuffer, trimStart, trimEnd } = trimSilence(audioBuffer, SILENCE_THRESHOLD, audioContext);

            // D. Normalize (if enabled)
            let finalBuffer = trimmedBuffer;
            if (config.normalize) {
                finalBuffer = normalizeAudio(trimmedBuffer, audioContext);
            }

            processedBuffers.push({
                buffer: finalBuffer,
                name: song.name,
                originalDuration: audioBuffer.duration
            });
        }

        onProgress("Rendering final mix...", 60);

        // 2. Calculate total duration and offsets for the mix
        let totalDuration = 0;
        const trackInfos = []; // Store start times for timecodes

        // Calculate layout
        // Track 1 starts at 0.
        // Track 2 starts at (Track 1 Duration - Crossfade)
        // ...
        let currentStartTime = 0;

        for (let i = 0; i < processedBuffers.length; i++) {
            const track = processedBuffers[i];
            const duration = track.buffer.duration;

            trackInfos.push({
                ...track,
                startTime: currentStartTime
            });

            // Update total duration of the mix
            // If it's the last track, add its full remaining duration
            // Otherwise, add the duration minus the crossfade overlap
            if (i < processedBuffers.length - 1) {
                currentStartTime += (duration - config.crossfadeDuration);
            } else {
                currentStartTime += duration;
            }
        }
        totalDuration = currentStartTime;

        // 3. Create OfflineAudioContext to render the mix
        const offlineCtx = new OfflineAudioContext(2, totalDuration * SAMPLE_RATE, SAMPLE_RATE);

        // 4. Schedule all tracks
        trackInfos.forEach((track, index) => {
            const source = offlineCtx.createBufferSource();
            source.buffer = track.buffer;

            // Create a GainNode for envelopes (fades)
            const gainNode = offlineCtx.createGain();

            source.connect(gainNode);
            gainNode.connect(offlineCtx.destination);

            const startTime = track.startTime;
            const duration = track.buffer.duration;
            const endTime = startTime + duration;
            const overlap = config.crossfadeDuration;

            // --- APPLY FADES ---

            // Fade In (if not first track)
            if (index > 0) {
                gainNode.gain.setValueAtTime(0, startTime);
                gainNode.gain.linearRampToValueAtTime(1, startTime + overlap);
            } else {
                gainNode.gain.setValueAtTime(1, startTime);
            }

            // Fade Out (if not last track)
            if (index < trackInfos.length - 1) {
                gainNode.gain.setValueAtTime(1, endTime - overlap);
                gainNode.gain.linearRampToValueAtTime(0, endTime);
            }

            source.start(startTime);

            // Generate Timecode String
            // Format: HH:MM:SS Artist - Song
            const cleanName = track.name.replace(/\.[^/.]+$/, ""); // Remove extension
            const timeString = formatTimecode(startTime);
            timecodes.push(`${timeString} - ${cleanName}`);
        });

        onProgress("Encoding audio...", 90);

        // 5. Render the mix
        const renderedBuffer = await offlineCtx.startRendering();
        onProgress("Encoding audio...", 95);

        // 6. Convert to WAV Blob
        const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);

        onProgress("Finalizing...", 100);

        return {
            audioBlob: wavBlob,
            timecodes: timecodes.join('\n')
        };

    } catch (error) {
        console.error("Mix generation failed:", error);
        throw error;
    } finally {
        audioContext.close();
    }
}

/**
 * Trims silence from the beginning and end of an AudioBuffer.
 */
function trimSilence(buffer, threshold, context) {
    const channelData = buffer.getChannelData(0); // Check first channel for silence
    const length = channelData.length;

    let start = 0;
    let end = length - 1;

    // Find start
    while (start < length && Math.abs(channelData[start]) < threshold) {
        start++;
    }

    // Find end
    while (end > start && Math.abs(channelData[end]) < threshold) {
        end--;
    }

    // If the whole file is silence
    if (start >= end) {
        return { buffer, trimStart: 0, trimEnd: 0 };
    }

    const newLength = end - start + 1;
    const newBuffer = context.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);

    // Copy all channels
    for (let i = 0; i < buffer.numberOfChannels; i++) {
        const oldData = buffer.getChannelData(i);
        const newData = newBuffer.getChannelData(i);
        // Copy the slice
        for (let j = 0; j < newLength; j++) {
            newData[j] = oldData[start + j];
        }
    }

    return {
        buffer: newBuffer,
        trimStart: start / buffer.sampleRate,
        trimEnd: (length - end) / buffer.sampleRate
    };
}

/**
 * Normalizes the volume of an AudioBuffer to -1dB.
 */
function normalizeAudio(buffer, context) {
    const channels = buffer.numberOfChannels;
    let maxAmplitude = 0;

    // Find peak amplitude across all channels
    for (let i = 0; i < channels; i++) {
        const data = buffer.getChannelData(i);
        for (let j = 0; j < data.length; j++) {
            if (Math.abs(data[j]) > maxAmplitude) {
                maxAmplitude = Math.abs(data[j]);
            }
        }
    }

    if (maxAmplitude === 0) return buffer;

    // Calculate gain to reach -1dB (approx 0.89)
    // Or just normalize to 1.0 (0dB) for simplicity in a mix
    const targetPeak = 0.95;
    const gain = targetPeak / maxAmplitude;

    // Apply gain
    const newBuffer = context.createBuffer(channels, buffer.length, buffer.sampleRate);
    for (let i = 0; i < channels; i++) {
        const oldData = buffer.getChannelData(i);
        const newData = newBuffer.getChannelData(i);
        for (let j = 0; j < oldData.length; j++) {
            newData[j] = oldData[j] * gain;
        }
    }

    return newBuffer;
}

/**
 * Helper to format seconds into HH:MM:SS
 */
function formatTimecode(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Converts an AudioBuffer to a WAV Blob.
 * (Standard WAV header construction)
 */
function bufferToWave(abuffer, len) {
    const numOfChan = abuffer.numberOfChannels;
    const length = len * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this encoder)

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    // write interleaved data
    for (i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while (pos < len) {
        for (i = 0; i < numOfChan; i++) {
            // interleave channels
            sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
            view.setInt16(44 + offset, sample, true); // write 16-bit sample
            offset += 2;
        }
        pos++;
    }

    return new Blob([buffer], { type: "audio/wav" });

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}
