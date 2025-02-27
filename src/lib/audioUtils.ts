
/**
 * Main module for audio processing utilities
 */

import { fetchWatermarkAudio } from "./audioWatermark"; 
import { audioBufferToWav, loadAudioFile, reduceToMono } from "./audioProcessing";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio with aggressive compression for smaller file size
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process with improved compression");
    console.log(`Watermark settings: Volume=${watermarkVolume}, Interval=${watermarkInterval}s`);
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Load the input audio file
    const inputBuffer = await loadAudioFile(audioContext, inputFile);
    console.log("Input audio loaded successfully, loading watermark...");
    
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
    
    try {
      const watermarkFile = await fetchWatermarkAudio();
      console.log("Watermark fetched successfully");
      
      const watermarkBuffer = await loadAudioFile(audioContext, watermarkFile);
      console.log("Watermark audio loaded successfully");
      
      // Convert to mono if needed for size reduction
      const effectiveInputBuffer = convertToMono ? reduceToMono(inputBuffer) : inputBuffer;
      
      const inputDuration = effectiveInputBuffer.duration;
      const watermarkDuration = watermarkBuffer.duration;
      const numChannels = effectiveInputBuffer.numberOfChannels;
      
      console.log(`Input duration: ${inputDuration}s, Watermark duration: ${watermarkDuration}s, Channels: ${numChannels}`);
      
      // Create output buffer at potentially reduced sample rate
      const outputSampleRate = Math.floor(effectiveInputBuffer.sampleRate / sampleRateReduction);
      const outputLength = Math.floor(effectiveInputBuffer.length / sampleRateReduction);
      
      const outputBuffer = audioContext.createBuffer(
        numChannels,
        outputLength,
        outputSampleRate
      );
      
      // Process the audio with aggressive smoothing for better compression
      for (let channel = 0; channel < numChannels; channel++) {
        const inputData = effectiveInputBuffer.getChannelData(channel);
        const outputData = outputBuffer.getChannelData(channel);
        
        // Downsample and apply smoothing for better compression
        for (let i = 0; i < outputLength; i++) {
          const srcIdx = Math.min(Math.floor(i * sampleRateReduction), effectiveInputBuffer.length - 1);
          
          // Simple smoothing (average of nearby samples)
          let sum = 0;
          let count = 0;
          
          for (let j = -2; j <= 2; j++) {
            const idx = srcIdx + j;
            if (idx >= 0 && idx < inputData.length) {
              sum += inputData[idx];
              count++;
            }
          }
          
          outputData[i] = sum / count;
          
          // Apply dynamic range compression
          if (Math.abs(outputData[i]) > 0.4) {
            outputData[i] = outputData[i] > 0 
              ? 0.4 + (outputData[i] - 0.4) * 0.6
              : -0.4 - (Math.abs(outputData[i]) - 0.4) * 0.6;
          }
        }
      }
      
      // Add watermarks at reduced density for smaller files
      const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 10); // Maximum of 10 watermarks total
      const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
      console.log(`Adding ${numWatermarks} watermarks at ${watermarkFrequency}s intervals`);
      
      for (let i = 0; i < numWatermarks; i++) {
        const startTimeSeconds = i * watermarkFrequency;
        const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
        
        if (startFrame + watermarkBuffer.length / sampleRateReduction > outputBuffer.length) {
          continue;
        }
        
        console.log(`Adding watermark at ${startTimeSeconds}s`);
        
        // Scale watermark to fit the output sample rate
        for (let channel = 0; channel < Math.min(outputBuffer.numberOfChannels, watermarkBuffer.numberOfChannels); channel++) {
          const outputData = outputBuffer.getChannelData(channel);
          const watermarkData = watermarkBuffer.getChannelData(channel);
          
          // Add watermark with sample rate adjustment
          const watermarkScaleFactor = watermarkBuffer.sampleRate / outputBuffer.sampleRate;
          const scaledWatermarkLength = Math.floor(watermarkBuffer.length / watermarkScaleFactor);
          const fadeLength = Math.min(500, scaledWatermarkLength / 10);
          
          for (let j = 0; j < scaledWatermarkLength; j++) {
            if (startFrame + j >= outputData.length) break;
            
            // Get watermark sample with proper scaling
            const watermarkIndex = Math.floor(j * watermarkScaleFactor);
            if (watermarkIndex >= watermarkData.length) break;
            
            // Calculate fade factor (0 to 1)
            let fadeFactor = 1;
            if (j < fadeLength) {
              fadeFactor = j / fadeLength; // Fade in
            } else if (j > scaledWatermarkLength - fadeLength) {
              fadeFactor = (scaledWatermarkLength - j) / fadeLength; // Fade out
            }
            
            // Apply volume, fade and reduce watermark amplitude for better compression
            const watermarkAmp = watermarkData[watermarkIndex] * watermarkVolume * fadeFactor * 0.7;
            
            // Mix watermark (70% original + 30% watermark)
            outputData[startFrame + j] = outputData[startFrame + j] * 0.7 + watermarkAmp * 0.3;
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
    } catch (watermarkError) {
      console.error("Error processing watermark:", watermarkError);
      throw new Error(`Failed to process watermark: ${watermarkError.message}`);
    }
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
