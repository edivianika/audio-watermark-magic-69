
/**
 * Utility functions for audio processing
 */
import { watermarkBase64 } from "./watermarkBase64";

// Convert base64 to file
export const base64ToFile = async (base64String: string, filename: string) => {
  const res = await fetch(base64String);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
};

// Add watermark to audio
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number
): Promise<Blob> => {
  try {
    console.log("Starting simple audio watermarking process");
    
    // Create audio elements
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Load the input audio file
    const inputBuffer = await loadAudioFile(audioContext, inputFile);
    
    // Load the watermark audio file
    const watermarkFile = await base64ToFile(watermarkBase64, "watermark.mp3");
    const watermarkBuffer = await loadAudioFile(audioContext, watermarkFile);
    
    // Calculate timing for watermarks
    const inputDuration = inputBuffer.duration;
    const watermarkDuration = watermarkBuffer.duration;
    
    // Create an output buffer with the same duration as the input
    const outputBuffer = audioContext.createBuffer(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );
    
    // First, copy the input audio to the output buffer
    for (let channel = 0; channel < inputBuffer.numberOfChannels; channel++) {
      const inputData = inputBuffer.getChannelData(channel);
      const outputData = outputBuffer.getChannelData(channel);
      outputData.set(inputData);
    }
    
    // Calculate how many watermarks we'll add
    const numWatermarks = Math.floor(inputDuration / watermarkInterval);
    
    // Add watermarks at intervals
    for (let i = 0; i < numWatermarks; i++) {
      const startFrame = Math.floor(i * watermarkInterval * outputBuffer.sampleRate);
      
      // Make sure we don't go past the end of the file
      if (startFrame + watermarkBuffer.length > outputBuffer.length) {
        continue;
      }
      
      // Add the watermark (mix it with the original audio)
      for (let channel = 0; channel < Math.min(outputBuffer.numberOfChannels, watermarkBuffer.numberOfChannels); channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const watermarkData = watermarkBuffer.getChannelData(channel);
        
        for (let j = 0; j < watermarkBuffer.length; j++) {
          // Mix watermark audio with original audio
          // Apply volume adjustment to watermark
          outputData[startFrame + j] = outputData[startFrame + j] + (watermarkData[j] * watermarkVolume);
        }
      }
    }
    
    // Normalize to prevent clipping
    for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      
      // Find the maximum absolute value
      let max = 0;
      for (let i = 0; i < outputData.length; i++) {
        max = Math.max(max, Math.abs(outputData[i]));
      }
      
      // If we would clip, scale everything down
      if (max > 1.0) {
        const scale = 0.95 / max; // Leave a little headroom
        for (let i = 0; i < outputData.length; i++) {
          outputData[i] *= scale;
        }
      }
    }
    
    // Convert the processed buffer back to a Blob
    const finalAudio = await audioBufferToWav(outputBuffer);
    console.log("Audio watermarking completed successfully");
    
    return new Blob([finalAudio], { type: "audio/wav" });
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
};

// Helper function to load an audio file into an AudioBuffer
const loadAudioFile = async (audioContext: AudioContext, file: File): Promise<AudioBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        resolve(audioBuffer);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Helper function to convert AudioBuffer to WAV format
const audioBufferToWav = (buffer: AudioBuffer): Promise<Uint8Array> => {
  return new Promise((resolve) => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2;
    const result = new Uint8Array(44 + length);
    const view = new DataView(result.buffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, 36 + length, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numOfChan, true);
    // sample rate
    view.setUint32(24, buffer.sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, buffer.sampleRate * 2 * numOfChan, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numOfChan * 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, length, true);

    // Write the PCM samples
    const DATA_START_OFFSET = 44;
    let offset = DATA_START_OFFSET;
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        // Interleave channels data
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        // Convert to 16-bit signed integer
        const intSample = Math.floor(sample < 0 ? sample * 32768 : sample * 32767);
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    resolve(result);
  });
};

// Helper function to write a string to a DataView
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Generate a unique filename
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  return `watermarked_${timestamp}_${randomString}.${extension}`;
};
