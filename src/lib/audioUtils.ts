
/**
 * Main module for audio processing utilities
 */

import { audioBufferToCompressedFormat, loadAudioFile, reduceToMono } from "./audioProcessing";
import { fetchWatermarkAudio } from "./audioWatermark";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio with compression
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
    
    // Determine file size-based compression settings
    const fileSizeMB = inputFile.size / (1024 * 1024);
    console.log(`Original file size: ${fileSizeMB.toFixed(2)} MB`);
    
    // Maximum final size in MB - enforce 16MB limit
    const maxSizeInMB = 16;
    
    // Adaptive compression settings based on file size
    let quality: 'low' | 'medium' | 'high' = 'high';
    let convertToMono = false;
    
    if (fileSizeMB > 30) {
      quality = 'low';
      convertToMono = true;
    } else if (fileSizeMB > 20) {
      quality = 'medium';
      convertToMono = true;
    } else if (fileSizeMB > 10) {
      quality = 'medium';
    }
    
    console.log(`Compression settings: ${quality} quality, mono: ${convertToMono}, max size: ${maxSizeInMB}MB`);
    
    // Convert to mono if needed for size reduction
    const effectiveInputBuffer = convertToMono ? reduceToMono(inputBuffer) : inputBuffer;
    const inputDuration = effectiveInputBuffer.duration;
    const numChannels = effectiveInputBuffer.numberOfChannels;
    
    console.log(`Input duration: ${inputDuration}s, Channels: ${numChannels}`);
    
    // Create output buffer
    const outputBuffer = audioContext.createBuffer(
      numChannels,
      effectiveInputBuffer.length,
      effectiveInputBuffer.sampleRate
    );
    
    // First, copy the original audio to the output buffer
    for (let channel = 0; channel < numChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      outputData.set(effectiveInputBuffer.getChannelData(channel));
    }
    
    // Now add watermarks at intervals
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
      
      console.log(`Adding watermark at ${startTimeSeconds}s with volume ${watermarkVolume}`);
      
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const watermarkChannelIndex = Math.min(channel, watermarkBuffer.numberOfChannels - 1);
        const watermarkData = watermarkBuffer.getChannelData(watermarkChannelIndex);
        
        for (let j = 0; j < watermarkBuffer.length; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Mix original and watermark audio (50/50 mix)
          const originalSample = outputData[startFrame + j];
          const watermarkSample = watermarkData[j] * watermarkVolume;
          
          // Better mixing formula to preserve original audio quality while ensuring watermark is audible
          outputData[startFrame + j] = originalSample * 0.7 + watermarkSample * 0.3;
        }
      }
    }
    
    // Convert to compressed format with quality settings and size limitation
    const compressedData = audioBufferToCompressedFormat(outputBuffer, { 
      quality,
      maxSizeInMB
    });
    
    // Determine output MIME type
    const mimeType = "audio/wav";
    
    const finalSizeMB = compressedData.length / (1024 * 1024);
    const compressionRatio = inputFile.size / compressedData.length;
    console.log(`Audio watermarking completed with compression. Output size: ${finalSizeMB.toFixed(2)} MB`);
    console.log(`Compression ratio: ${compressionRatio.toFixed(2)}x`);
    
    // Final check to ensure we're within limits
    if (finalSizeMB > maxSizeInMB) {
      console.warn(`Warning: Final size (${finalSizeMB.toFixed(2)}MB) exceeds target (${maxSizeInMB}MB) despite compression efforts`);
    }
    
    return new Blob([compressedData], { 
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
): Promise<{name: string, url: string}[]> => {
  const results = [];
  const maxSizeInMB = 16; // Enforce 16MB limit
  
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
      console.log(`Final output size: ${finalSizeMB.toFixed(2)}MB (target: ${maxSizeInMB}MB)`);
      
      if (finalSizeMB > maxSizeInMB) {
        console.warn(`Warning: File ${file.name} compressed to ${finalSizeMB.toFixed(2)}MB, still above ${maxSizeInMB}MB limit`);
      }
      
      const originalName = file.name;
      const extension = 'wav'; // Use WAV for our compressed output
      const nameWithoutExt = originalName.slice(0, originalName.lastIndexOf('.'));
      const outputFilename = `${nameWithoutExt}_Watermarked.${extension}`;
      
      const url = URL.createObjectURL(outputBlob);
      
      results.push({
        name: outputFilename,
        url: url
      });
      
    } catch (error) {
      console.error(`Error processing file ${files[i].name}:`, error);
    }
  }
  
  progressCallback(files.length, files.length);
  
  return results;
};
