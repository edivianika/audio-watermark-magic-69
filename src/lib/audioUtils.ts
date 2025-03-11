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
  maxSizeInMB: number = 16, // Default max size to 16MB
  noiseReductionOptions?: {
    enabled: boolean;
    strength?: number;
    preservation?: number;
  }
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process with database watermark file");
    console.log(`Watermark settings: Volume=${watermarkVolume}, Interval=${watermarkInterval}s`);
    console.log(`Max output size set to ${maxSizeInMB}MB`);
    
    if (compressionOptions?.enabled) {
      console.log("Compression enabled:", compressionOptions);
    }
    
    if (noiseReductionOptions?.enabled) {
      console.log("Noise reduction enabled:", noiseReductionOptions);
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
    
    // First, copy the original audio to the output buffer at 90% volume (increased from 80%)
    for (let channel = 0; channel < numChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      const inputData = inputBuffer.getChannelData(channel);
      for (let i = 0; i < outputData.length; i++) {
        outputData[i] = inputData[i] * 0.9; // 90% volume for original audio (increased from 80%)
      }
    }
    
    // Now add watermarks at intervals at reduced volume with gentle noise reduction
    const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 15);
    const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
    
    console.log(`Adding ${numWatermarks} watermarks at ${watermarkFrequency}s intervals`);
    
    // Apply configurable noise reduction to watermark buffer
    const watermarkBufferNR = noiseReductionOptions?.enabled 
      ? applyConfigurableNoiseReduction(
          watermarkBuffer, 
          noiseReductionOptions.strength || 1.8, 
          noiseReductionOptions.preservation || 0.3
        )
      : applyGentleNoiseReduction(watermarkBuffer);
    
    // Mix watermarks into the output buffer
    for (let i = 0; i < numWatermarks; i++) {
      const startTimeSeconds = i * watermarkFrequency;
      const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
      
      if (startFrame + watermarkBufferNR.length > outputBuffer.length) {
        continue;
      }
      
      // Increased volume for watermark to improve clarity
      const watermarkVolumeFactor = 0.75; // Increased from 0.7
      console.log(`Adding watermark at ${startTimeSeconds}s at ${watermarkVolumeFactor * 100}% volume`);
      
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const watermarkChannelIndex = Math.min(channel, watermarkBufferNR.numberOfChannels - 1);
        const watermarkData = watermarkBufferNR.getChannelData(watermarkChannelIndex);
        
        for (let j = 0; j < watermarkBufferNR.length; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Gradually increase watermark at start and fade at end (fade in/out)
          let volumeMultiplier = watermarkVolumeFactor;
          const fadeLength = Math.min(4000, watermarkBufferNR.length / 10); // 4000 samples or 10% of watermark
          
          if (j < fadeLength) {
            // Fade in
            volumeMultiplier = watermarkVolumeFactor * (j / fadeLength);
          } else if (j > watermarkBufferNR.length - fadeLength) {
            // Fade out
            volumeMultiplier = watermarkVolumeFactor * ((watermarkBufferNR.length - j) / fadeLength);
          }
          
          // Mix original (already at 90%) with watermark at scaled volume
          const originalSample = outputData[startFrame + j];
          const watermarkSample = watermarkData[j] * volumeMultiplier;
          
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
        quality = 'medium'; // Changed from 'low' to 'medium' to maintain better quality
        console.log("Using medium quality compression for large file");
      } else if (estimatedSizeMB > maxSizeInMB || fileSizeMB > maxSizeInMB) {
        quality = 'high'; // Changed from 'medium' to 'high'
        console.log("Using high quality compression");
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

// New configurable noise reduction function
function applyConfigurableNoiseReduction(
  audioBuffer: AudioBuffer, 
  strength: number = 1.8, // Default to moderate reduction
  preservationFactor: number = 0.3 // Default preserve at least 30% of original
): AudioBuffer {
  const context = new (window.AudioContext || (window as any).webkitAudioContext)();
  const newBuffer = context.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  
  console.log(`Applying configurable noise reduction with strength ${strength}, preservation ${preservationFactor * 100}%`);
  
  // For each channel
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel);
    const outputData = newBuffer.getChannelData(channel);
    
    // Step 1: Analyze noise floor
    const samples = inputData.length;
    let sum = 0;
    let sumOfSquares = 0;
    
    for (let i = 0; i < samples; i++) {
      const sample = Math.abs(inputData[i]);
      sum += sample;
      sumOfSquares += sample * sample;
    }
    
    const mean = sum / samples;
    const variance = (sumOfSquares / samples) - (mean * mean);
    const stdDeviation = Math.sqrt(variance);
    
    // Step 2: Calculate noise threshold with configurable strength
    // Lower strength means less aggressive noise reduction
    const noiseThreshold = mean + (stdDeviation * strength);
    
    // Step 3: Apply configurable soft thresholding
    for (let i = 0; i < samples; i++) {
      // Apply soft thresholding to reduce noise with configurable curve
      const absSample = Math.abs(inputData[i]);
      
      if (absSample < noiseThreshold) {
        // Use configurable noise reduction curve
        const reductionFactor = Math.pow(absSample / noiseThreshold, strength);
        
        // Ensure we preserve at least the minimum percentage of original audio
        outputData[i] = inputData[i] * (preservationFactor + ((1 - preservationFactor) * reductionFactor));
      } else {
        // Keep full volume for samples above threshold
        outputData[i] = inputData[i];
      }
    }
    
    // Step 4: Apply very light smoothing to reduce artifacts if strength is high
    if (strength > 2.0) {
      const smoothingWindowSize = 2;
      const tempBuffer = new Float32Array(outputData);
      
      for (let i = smoothingWindowSize; i < samples - smoothingWindowSize; i++) {
        let sum = tempBuffer[i]; // Start with the center sample at full weight
        let count = 1;
        
        // Add adjacent samples with lower weight
        for (let j = 1; j <= smoothingWindowSize; j++) {
          const weight = 0.5 / j; // Decrease weight for samples further away
          sum += tempBuffer[i - j] * weight;
          sum += tempBuffer[i + j] * weight;
          count += weight * 2;
        }
        
        // Average with weighted samples
        outputData[i] = sum / count;
      }
    }
  }
  
  return newBuffer;
}

// Existing gentle noise reduction function for backward compatibility
function applyGentleNoiseReduction(audioBuffer: AudioBuffer): AudioBuffer {
  const context = new (window.AudioContext || (window as any).webkitAudioContext)();
  const newBuffer = context.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  
  // For each channel
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel);
    const outputData = newBuffer.getChannelData(channel);
    
    // Step 1: Analyze noise floor - be more gentle with analysis
    const samples = inputData.length;
    let sum = 0;
    let sumOfSquares = 0;
    
    for (let i = 0; i < samples; i++) {
      const sample = Math.abs(inputData[i]);
      sum += sample;
      sumOfSquares += sample * sample;
    }
    
    const mean = sum / samples;
    const variance = (sumOfSquares / samples) - (mean * mean);
    const stdDeviation = Math.sqrt(variance);
    
    // Step 2: Calculate noise threshold - use a more gentle threshold
    // Instead of 2.5x standard deviation, use 1.8x for less aggressive noise reduction
    const noiseThreshold = mean + (stdDeviation * 1.8);
    
    // Step 3: Apply more gentle soft thresholding
    for (let i = 0; i < samples; i++) {
      // Apply soft thresholding to reduce noise with more gentle curve
      const absSample = Math.abs(inputData[i]);
      
      if (absSample < noiseThreshold) {
        // More gentle noise reduction curve (1.8 power instead of 1.5)
        // This preserves more of the original audio
        const reductionFactor = Math.pow(absSample / noiseThreshold, 1.8);
        outputData[i] = inputData[i] * (0.3 + (0.7 * reductionFactor)); // Keep at least 30% of original
      } else {
        // Keep full volume for samples above threshold
        outputData[i] = inputData[i];
      }
    }
    
    // Step 4: Apply very light smoothing to reduce artifacts
    // Use a smaller smoothing window (2 instead of 3)
    const smoothingWindowSize = 2;
    const tempBuffer = new Float32Array(outputData);
    
    for (let i = smoothingWindowSize; i < samples - smoothingWindowSize; i++) {
      let sum = tempBuffer[i]; // Start with the center sample at full weight
      let count = 1;
      
      // Add adjacent samples with lower weight
      for (let j = 1; j <= smoothingWindowSize; j++) {
        const weight = 0.5 / j; // Decrease weight for samples further away
        sum += tempBuffer[i - j] * weight;
        sum += tempBuffer[i + j] * weight;
        count += weight * 2;
      }
      
      // Average with weighted samples
      outputData[i] = sum / count;
    }
  }
  
  return newBuffer;
}

// Kept for compatibility
function applyNoiseReduction(audioBuffer: AudioBuffer): AudioBuffer {
  // This function is kept for compatibility but now calls the more gentle version
  return applyGentleNoiseReduction(audioBuffer);
}
