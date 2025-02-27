
/**
 * Main module for audio processing utilities
 */

import { audioBufferToWav, loadAudioFile, reduceToMono } from "./audioProcessing";
import { fetchWatermarkAudio } from "./audioWatermark";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio with improved volume for better clarity
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
    
    // Compression settings based on file size
    let bitDepth = 16;
    let sampleRateReduction = 1;
    let convertToMono = false;
    
    // Progressive compression for larger files
    if (fileSizeMB > 20) {
      // Very large files: aggressive compression
      bitDepth = 8;
      sampleRateReduction = 4;
      convertToMono = true;
    } else if (fileSizeMB > 10) {
      // Large files: strong compression
      bitDepth = 8;
      sampleRateReduction = 3;
      convertToMono = true;
    } else if (fileSizeMB > 5) {
      // Medium files: moderate compression
      bitDepth = 12;
      sampleRateReduction = 2;
      convertToMono = true;
    } else if (fileSizeMB > 2) {
      // Smaller files: light compression
      bitDepth = 12;
      sampleRateReduction = 1.5;
      convertToMono = false;
    }
    
    console.log(`Compression settings: ${bitDepth}-bit, ${sampleRateReduction}x sample rate reduction, mono: ${convertToMono}`);
    
    // Convert to mono if needed for size reduction
    const effectiveInputBuffer = convertToMono ? reduceToMono(inputBuffer) : inputBuffer;
    const inputDuration = effectiveInputBuffer.duration;
    const numChannels = effectiveInputBuffer.numberOfChannels;
    
    console.log(`Input duration: ${inputDuration}s, Channels: ${numChannels}`);
    
    // Create output buffer at potentially reduced sample rate
    const outputSampleRate = Math.floor(effectiveInputBuffer.sampleRate / sampleRateReduction);
    const outputLength = Math.floor(effectiveInputBuffer.length / sampleRateReduction);
    
    const outputBuffer = audioContext.createBuffer(
      numChannels,
      outputLength,
      outputSampleRate
    );
    
    // Process the audio with improved sample rate reduction
    for (let channel = 0; channel < numChannels; channel++) {
      const inputData = effectiveInputBuffer.getChannelData(channel);
      const outputData = outputBuffer.getChannelData(channel);
      
      // Downsample with improved linear interpolation
      for (let i = 0; i < outputLength; i++) {
        const exactSrcIdx = i * sampleRateReduction;
        const srcIdx1 = Math.floor(exactSrcIdx);
        const srcIdx2 = Math.min(srcIdx1 + 1, effectiveInputBuffer.length - 1);
        const fraction = exactSrcIdx - srcIdx1;
        
        // Linear interpolation for smoother downsampling
        outputData[i] = (1 - fraction) * inputData[srcIdx1] + fraction * inputData[srcIdx2];
      }
    }
    
    // Now add watermarks at intervals with 100% watermark volume for maximum audibility
    const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 15); // Maximum of 15 watermarks
    const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
    
    console.log(`Adding ${numWatermarks} watermarks at ${watermarkFrequency}s intervals`);
    
    // Set watermark volume to 100% (1.0) for maximum audibility
    // Ignore the user volume setting and always use maximum volume
    const effectiveWatermarkVolume = 1.0; // Fixed at 100% for maximum audibility
    
    for (let i = 0; i < numWatermarks; i++) {
      const startTimeSeconds = i * watermarkFrequency;
      const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
      
      if (startFrame + watermarkBuffer.length > outputBuffer.length) {
        continue;
      }
      
      console.log(`Adding watermark at ${startTimeSeconds}s with volume ${effectiveWatermarkVolume}`);
      
      // Add watermark with direct mixing for maximum audibility
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        // Use as many channels as available from the watermark, or repeat the first one
        const watermarkData = channel < watermarkBuffer.numberOfChannels 
          ? watermarkBuffer.getChannelData(channel) 
          : watermarkBuffer.getChannelData(0);
        
        // Use direct replacement for clearest watermark (100% watermark, 0% original)
        for (let j = 0; j < watermarkBuffer.length; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Apply watermark at 100% volume, completely replacing the original audio
          // for the duration of the watermark
          outputData[startFrame + j] = watermarkData[j] * effectiveWatermarkVolume;
        }
      }
    }
    
    // Convert to WAV with compression settings
    const finalAudio = audioBufferToWav(outputBuffer, {
      bitDepth,
      sampleRateReduction: 1 // Already applied above
    });
    
    console.log(`Audio watermarking completed with compression. Output size: ${finalAudio.length / 1024} KB`);
    
    return new Blob([finalAudio], { 
      type: "audio/wav"
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
      // Process current file
      const file = files[i];
      console.log(`Batch processing file ${i + 1} of ${files.length}: ${file.name}`);
      
      // Update progress
      progressCallback(i, files.length);
      
      // Process file with our watermarking method
      const outputBlob = await addWatermark(
        file,
        watermarkVolume,
        watermarkInterval
      );
      
      // Generate the filename
      const originalName = file.name;
      const extension = originalName.split('.').pop();
      const nameWithoutExt = originalName.slice(0, -(extension?.length || 0) - 1);
      const outputFilename = `${nameWithoutExt}_Watermarked.${extension}`;
      
      // Create download URL
      const url = URL.createObjectURL(outputBlob);
      
      // Add to results
      results.push({
        name: outputFilename,
        url: url
      });
      
    } catch (error) {
      console.error(`Error processing file ${files[i].name}:`, error);
      // Continue with next file on error
    }
  }
  
  // Final progress update
  progressCallback(files.length, files.length);
  
  return results;
};
