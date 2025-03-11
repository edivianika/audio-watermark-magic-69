
/**
 * Main module for audio processing utilities
 */

import { loadAudioFile, applyCompression, audioBufferToCompressedFormat } from "./audioCore";
import { fetchWatermarkAudio } from "./watermarkService";
import { audioBufferToRawFormat } from "./formatConversion";

// Re-export for compatibility
export * from "./formatConversion";
export * from "./watermarkService";
export * from "./audioCore";
export * from "./batchProcessing";

// Add watermark to audio with optional compression
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number,
  compressionOptions?: {
    enabled: boolean;
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  },
  maxSizeInMB: number = 16 // Default max size to 16MB
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process with database watermark file");
    console.log(`Watermark settings: Volume=${watermarkVolume}, Interval=${watermarkInterval}s`);
    console.log(`Max output size set to ${maxSizeInMB}MB`);
    
    if (compressionOptions?.enabled) {
      console.log("Compression enabled:", compressionOptions);
    }
    
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
    
    // Apply compression if enabled
    let finalBuffer = outputBuffer;
    if (compressionOptions?.enabled) {
      console.log("Applying audio compression...");
      finalBuffer = await applyCompression(outputBuffer, {
        threshold: compressionOptions.threshold,
        knee: compressionOptions.knee,
        ratio: compressionOptions.ratio,
        attack: compressionOptions.attack,
        release: compressionOptions.release
      });
      console.log("Compression applied successfully");
    }
    
    // Determine output MIME type based on input file
    const mimeType = inputFile.type || "audio/wav";
    
    // Calculate estimated output size
    const estimatedSizeInBytes = finalBuffer.length * finalBuffer.numberOfChannels * 2; // 2 bytes per sample for 16-bit audio
    const estimatedSizeMB = estimatedSizeInBytes / (1024 * 1024);
    
    console.log(`Estimated uncompressed output size: ${estimatedSizeMB.toFixed(2)}MB`);
    
    let outputData: Uint8Array;
    
    // If estimated size is larger than max size or the input was already large, use compression
    if (estimatedSizeMB > maxSizeInMB * 0.9 || fileSizeMB > maxSizeInMB * 0.8) {
      console.log(`Output likely to exceed ${maxSizeInMB}MB limit, applying additional compression...`);
      
      // Determine quality level based on how much we need to compress
      let quality: 'low' | 'medium' | 'high' = 'high';
      
      if (estimatedSizeMB > maxSizeInMB * 1.5 || fileSizeMB > maxSizeInMB * 1.2) {
        quality = 'low';
        console.log("Using low quality compression for large file");
      } else if (estimatedSizeMB > maxSizeInMB || fileSizeMB > maxSizeInMB) {
        quality = 'medium';
        console.log("Using medium quality compression");
      }
      
      // Use our custom compression function with size limit
      outputData = audioBufferToCompressedFormat(finalBuffer, {
        quality: quality,
        maxSizeInMB: maxSizeInMB
      });
    } else {
      // Use standard format without additional compression
      console.log("Using standard audio format without additional compression");
      outputData = audioBufferToRawFormat(finalBuffer);
    }
    
    // Final size check
    const finalSizeMB = outputData.byteLength / (1024 * 1024);
    console.log(`Final output size: ${finalSizeMB.toFixed(2)}MB`);
    
    console.log(`Audio processing completed. Using format: ${mimeType}`);
    
    return new Blob([outputData], { 
      type: mimeType
    });
  } catch (error) {
    console.error("Error processing audio:", error);
    throw error;
  }
};
