
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
    
    // Now add watermarks at intervals with improved clarity
    const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 15); // Maximum of 15 watermarks
    const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
    
    console.log(`Adding ${numWatermarks} watermarks at ${watermarkFrequency}s intervals`);
    
    // Use a fixed and consistent volume level for the watermark
    const effectiveWatermarkVolume = watermarkVolume;
    
    // First, normalize the watermark audio to ensure consistent volume
    const normalizedWatermarkBuffer = audioContext.createBuffer(
      watermarkBuffer.numberOfChannels,
      watermarkBuffer.length,
      watermarkBuffer.sampleRate
    );
    
    // Find maximum amplitude in watermark for normalization
    let maxWatermarkAmplitude = 0;
    for (let channel = 0; channel < watermarkBuffer.numberOfChannels; channel++) {
      const watermarkData = watermarkBuffer.getChannelData(channel);
      for (let i = 0; i < watermarkData.length; i++) {
        maxWatermarkAmplitude = Math.max(maxWatermarkAmplitude, Math.abs(watermarkData[i]));
      }
    }
    
    // Normalize watermark to ensure consistent volume, but preserve the original without fade effects
    const normalizationFactor = maxWatermarkAmplitude > 0 ? 0.8 / maxWatermarkAmplitude : 1;
    for (let channel = 0; channel < watermarkBuffer.numberOfChannels; channel++) {
      const watermarkData = watermarkBuffer.getChannelData(channel);
      const normalizedData = normalizedWatermarkBuffer.getChannelData(channel);
      for (let i = 0; i < watermarkData.length; i++) {
        normalizedData[i] = watermarkData[i] * normalizationFactor;
      }
    }
    
    // Add the watermark at regular intervals, mixing it properly with the original audio
    for (let i = 0; i < numWatermarks; i++) {
      const startTimeSeconds = i * watermarkFrequency;
      const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
      
      if (startFrame + normalizedWatermarkBuffer.length > outputBuffer.length) {
        continue; // Skip if watermark doesn't fit
      }
      
      console.log(`Adding watermark at ${startTimeSeconds}s with volume ${effectiveWatermarkVolume}`);
      
      // Calculate number of samples to blend
      const watermarkLengthSamples = Math.min(
        normalizedWatermarkBuffer.length,
        outputBuffer.length - startFrame
      );
      
      // Add watermark using proper blending for all channels
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        
        // Use watermark channel or first channel if watermark has fewer channels
        const watermarkChannelIndex = Math.min(channel, normalizedWatermarkBuffer.numberOfChannels - 1);
        const watermarkData = normalizedWatermarkBuffer.getChannelData(watermarkChannelIndex);
        
        // Blend the watermark with the original audio without fade-in/fade-out
        for (let j = 0; j < watermarkLengthSamples; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Original sample from the input audio
          const originalSample = outputData[startFrame + j];
          
          // Watermark sample at full volume without fading
          const watermarkSample = watermarkData[j] * effectiveWatermarkVolume;
          
          // Mix: 50% original + 50% watermark for clear watermark presence
          outputData[startFrame + j] = originalSample * 0.5 + watermarkSample * 0.5;
        }
      }
    }
    
    // Apply overall volume normalization to prevent any clipping
    for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
      const data = outputBuffer.getChannelData(channel);
      
      // Find maximum amplitude
      let maxAmplitude = 0;
      for (let i = 0; i < data.length; i++) {
        maxAmplitude = Math.max(maxAmplitude, Math.abs(data[i]));
      }
      
      // Apply gentle limiting only if needed
      if (maxAmplitude > 0.95) {
        const limitFactor = 0.95 / maxAmplitude;
        for (let i = 0; i < data.length; i++) {
          data[i] *= limitFactor;
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
