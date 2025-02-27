
/**
 * Main module for audio processing utilities
 */

import { audioBufferToWav, loadAudioFile, reduceToMono } from "./audioProcessing";
import { fetchWatermarkAudio } from "./audioWatermark";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio with improved clarity
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
      // Very large files: moderate compression
      bitDepth = 16;
      sampleRateReduction = 2;
      convertToMono = false;
    } else if (fileSizeMB > 10) {
      // Large files: light compression
      bitDepth = 16;
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
    
    // First, copy the original audio to the output buffer with downsampling if needed
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
    
    // Ensure watermark is prepared properly before mixing
    const preparedWatermarkBuffer = prepareWatermarkBuffer(watermarkBuffer, watermarkVolume, audioContext);
    
    // Add watermarks at intervals, preserving both the original audio and watermark clarity
    for (let i = 0; i < numWatermarks; i++) {
      const startTimeSeconds = i * watermarkFrequency;
      const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
      
      if (startFrame + preparedWatermarkBuffer.length > outputBuffer.length) {
        continue; // Skip if watermark doesn't fit
      }
      
      console.log(`Adding watermark at ${startTimeSeconds}s with volume ${watermarkVolume}`);
      
      // Calculate number of samples to mix
      const watermarkLengthSamples = Math.min(
        preparedWatermarkBuffer.length,
        outputBuffer.length - startFrame
      );
      
      // Mix watermark using ducking technique for all channels
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        
        // Use watermark channel or first channel if watermark has fewer channels
        const watermarkChannelIndex = Math.min(channel, preparedWatermarkBuffer.numberOfChannels - 1);
        const watermarkData = preparedWatermarkBuffer.getChannelData(watermarkChannelIndex);
        
        // Mix using ducking technique for clarity
        for (let j = 0; j < watermarkLengthSamples; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Get original audio sample
          const originalSample = outputData[startFrame + j];
          
          // Get watermark sample
          const watermarkSample = watermarkData[j];
          
          // Calculate ducking factor - when watermark is loud, reduce original audio
          const watermarkAbs = Math.abs(watermarkSample);
          
          // Only apply significant ducking when watermark is actually present (not silence)
          if (watermarkAbs > 0.05) {
            // Reduce original by 65-85% depending on watermark volume
            const duckingFactor = 0.35 - (watermarkAbs * 0.2);
            // Mix: scaled original + watermark
            outputData[startFrame + j] = (originalSample * duckingFactor) + watermarkSample;
          } else {
            // For silence or very quiet parts of watermark, don't duck the original much
            outputData[startFrame + j] = (originalSample * 0.85) + watermarkSample;
          }
        }
      }
    }
    
    // Apply overall limiter to prevent clipping
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

// Prepare watermark buffer for maximum clarity
const prepareWatermarkBuffer = (
  watermarkBuffer: AudioBuffer,
  watermarkVolume: number,
  audioContext: AudioContext
): AudioBuffer => {
  // Create a new buffer for the prepared watermark
  const preparedBuffer = audioContext.createBuffer(
    watermarkBuffer.numberOfChannels,
    watermarkBuffer.length,
    watermarkBuffer.sampleRate
  );
  
  // Find maximum amplitude for normalization
  let maxAmplitude = 0;
  for (let channel = 0; channel < watermarkBuffer.numberOfChannels; channel++) {
    const watermarkData = watermarkBuffer.getChannelData(channel);
    for (let i = 0; i < watermarkData.length; i++) {
      maxAmplitude = Math.max(maxAmplitude, Math.abs(watermarkData[i]));
    }
  }
  
  // Apply normalization and prepare the watermark buffer
  const normalizationFactor = maxAmplitude > 0 ? 0.9 / maxAmplitude : 1;
  
  for (let channel = 0; channel < watermarkBuffer.numberOfChannels; channel++) {
    const watermarkData = watermarkBuffer.getChannelData(channel);
    const preparedData = preparedBuffer.getChannelData(channel);
    
    for (let i = 0; i < watermarkData.length; i++) {
      // Apply normalization and user-defined volume
      let sample = watermarkData[i] * normalizationFactor * watermarkVolume;
      
      // Enhance speech frequencies for better clarity (mild EQ boost)
      // This simulates a high-pass filter to remove muddy low frequencies
      // and a presence boost for better clarity
      if (i > 0 && i < watermarkData.length - 1) {
        // Apply a very mild high-pass effect by reducing low-frequency energy
        const prevSample = watermarkData[i-1] * normalizationFactor * watermarkVolume;
        sample = sample * 0.95 + (sample - prevSample) * 0.3;
      }
      
      // Apply gentle compression to increase perceived loudness
      if (Math.abs(sample) > 0.4) {
        // Soft knee compression
        const excess = Math.abs(sample) - 0.4;
        const compression = excess * 0.3; // Only compress 30% of the excess
        sample = sample > 0 ? sample - compression : sample + compression;
      }
      
      // Store the enhanced sample
      preparedData[i] = sample;
    }
  }
  
  return preparedBuffer;
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
