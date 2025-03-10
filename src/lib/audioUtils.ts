/**
 * Main module for audio processing utilities
 */

import { loadAudioFile } from "./audioProcessing";
import { fetchWatermarkAudio } from "./audioWatermark";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio without compression
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process with database watermark file");
    console.log(`Watermark settings: Volume=${watermarkVolume}, Interval=${watermarkInterval}s`);
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Load the input audio file
    const inputBuffer = await loadAudioFile(audioContext, inputFile);
    console.log("Input audio loaded successfully");
    
    // Fetch watermark audio from database
    console.log("Fetching watermark audio from database...");
    const watermarkFile = await fetchWatermarkAudio();
    console.log(`Watermark file fetched: ${watermarkFile.name}, size: ${watermarkFile.size} bytes`);
    
    // Load the watermark audio file
    const watermarkBuffer = await loadAudioFile(audioContext, watermarkFile);
    console.log("Watermark audio loaded successfully, duration:", watermarkBuffer.duration);
    
    const fileSizeMB = inputFile.size / (1024 * 1024);
    console.log(`Original file size: ${fileSizeMB.toFixed(2)} MB`);
    
    // No compression or conversion to mono - keep original format
    const numChannels = inputBuffer.numberOfChannels;
    const inputDuration = inputBuffer.duration;
    
    console.log(`Input duration: ${inputDuration}s, Channels: ${numChannels}`);
    
    // Create output buffer with same specs as input
    const outputBuffer = audioContext.createBuffer(
      numChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );
    
    // First, copy the original audio to the output buffer at 80% volume
    for (let channel = 0; channel < numChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      const inputData = inputBuffer.getChannelData(channel);
      for (let i = 0; i < outputData.length; i++) {
        outputData[i] = inputData[i] * 0.8; // 80% volume for original audio
      }
    }
    
    // Now add watermarks at intervals at 100% volume
    const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 15);
    const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
    
    console.log(`Adding ${numWatermarks} watermarks at ${watermarkFrequency}s intervals`);
    
    // Mix watermarks into the output buffer
    for (let i = 0; i < numWatermarks; i++) {
      const startTimeSeconds = i * watermarkFrequency;
      const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
      
      if (startFrame + watermarkBuffer.length > outputBuffer.length) {
        continue;
      }
      
      console.log(`Adding watermark at ${startTimeSeconds}s at full volume`);
      
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const watermarkChannelIndex = Math.min(channel, watermarkBuffer.numberOfChannels - 1);
        const watermarkData = watermarkBuffer.getChannelData(watermarkChannelIndex);
        
        for (let j = 0; j < watermarkBuffer.length; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Mix original (already at 80%) with watermark at 100%
          const originalSample = outputData[startFrame + j];
          const watermarkSample = watermarkData[j]; // Full volume watermark
          
          outputData[startFrame + j] = originalSample + watermarkSample;
        }
      }
    }
    
    // Convert AudioBuffer to raw audio data without compression
    const rawAudioData = audioBufferToRawFormat(outputBuffer);
    
    // Determine output MIME type based on input file
    const mimeType = inputFile.type || "audio/wav";
    
    console.log(`Audio watermarking completed without compression. Using format: ${mimeType}`);
    
    return new Blob([rawAudioData], { 
      type: mimeType
    });
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
};

// Generate a unique filename
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  return `watermarked_${timestamp}_${randomString}.${extension}`;
};

// Process multiple files with a watermark
export const processBatch = async (
  files: File[],
  watermarkVolume: number,
  watermarkInterval: number,
  progressCallback: (current: number, total: number) => void
): Promise<{name: string, url: string, size: string}[]> => {
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      console.log(`Batch processing file ${i + 1} of ${files.length}: ${file.name}`);
      
      progressCallback(i, files.length);
      
      const outputBlob = await addWatermark(
        file,
        watermarkVolume,
        watermarkInterval
      );
      
      // Get the final size after processing
      const finalSizeMB = outputBlob.size / (1024 * 1024);
      console.log(`Final output size: ${finalSizeMB.toFixed(2)}MB`);
      
      const originalName = file.name;
      const extension = originalName.split('.').pop();
      const nameWithoutExt = originalName.slice(0, originalName.lastIndexOf('.'));
      const outputFilename = `${nameWithoutExt}_Watermarked.${extension}`;
      
      const url = URL.createObjectURL(outputBlob);
      
      results.push({
        name: outputFilename,
        url: url,
        size: `${finalSizeMB.toFixed(2)} MB`
      });
      
    } catch (error) {
      console.error(`Error processing file ${files[i].name}:`, error);
    }
  }
  
  progressCallback(files.length, files.length);
  
  return results;
};

// Convert AudioBuffer to raw audio format without compression
const audioBufferToRawFormat = (buffer: AudioBuffer): Uint8Array => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16; // Use 16-bit for good quality
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = buffer.length * numChannels * bytesPerSample;
  
  // WAV header is 44 bytes
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  
  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1 size (16 for PCM)
  view.setUint16(20, 1, true); // audio format (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write the PCM samples
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  let offset = 44;
  let sample;
  
  // Interleave channels
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      // Convert float32 to the appropriate integer based on bit depth
      sample = Math.max(-1, Math.min(1, channels[channel][i]));
      
      // 16-bit WAV is signed
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  
  return new Uint8Array(arrayBuffer);
};

// Helper function to write a string to a DataView
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};
