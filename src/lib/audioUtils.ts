
/**
 * Main module for audio processing utilities
 */

import { audioBufferToMp3, loadAudioFile, reduceToMono } from "./audioProcessing";
import { fetchWatermarkAudio } from "./audioWatermark";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio with MP3 compression
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
    
    // Adaptive MP3 compression settings based on file size
    let kbps = 192; // Default high quality
    let convertToMono = false;
    
    if (fileSizeMB > 30) {
      kbps = 96;
      convertToMono = true;
    } else if (fileSizeMB > 20) {
      kbps = 128;
      convertToMono = true;
    } else if (fileSizeMB > 10) {
      kbps = 160;
    }
    
    console.log(`Compression settings: ${kbps}kbps MP3, mono: ${convertToMono}`);
    
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
          outputData[startFrame + j] = (originalSample + watermarkSample) * 0.5;
        }
      }
    }
    
    // Convert to MP3 with compression settings
    const mp3Data = audioBufferToMp3(outputBuffer, { kbps });
    
    const compressionRatio = inputFile.size / mp3Data.length;
    console.log(`Audio watermarking completed with compression. Output size: ${mp3Data.length / 1024} KB`);
    console.log(`Compression ratio: ${compressionRatio.toFixed(2)}x`);
    
    return new Blob([mp3Data], { 
      type: "audio/mp3"
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
      
      const originalName = file.name;
      const extension = 'mp3'; // Always use MP3 extension for compressed output
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
