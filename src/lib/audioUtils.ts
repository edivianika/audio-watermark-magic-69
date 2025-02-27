
/**
 * Main module for audio processing utilities
 */

import { fetchWatermarkAudio } from "./audioWatermark"; 
import { audioBufferToWav, loadAudioFile, reduceToMono, createLightWatermark } from "./audioProcessing";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio with lightweight approach for smaller file size
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process with lightweight compression");
    console.log(`Watermark settings: Volume=${watermarkVolume}, Interval=${watermarkInterval}s`);
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Load the input audio file
    const inputBuffer = await loadAudioFile(audioContext, inputFile);
    console.log("Input audio loaded successfully");
    
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
      // CHANGE: Use locally generated watermark instead of fetching
      // This is much lighter and produces smaller output files
      const useEmbeddedWatermark = true;
      let watermarkBuffer;
      
      if (useEmbeddedWatermark) {
        // Create a super lightweight watermark with synthetic "Trial Version" sound
        watermarkBuffer = createLightWatermark("Trial Version", 1.0);
        console.log("Using lightweight generated watermark");
      } else {
        // Fall back to traditional watermark if needed
        const watermarkFile = await fetchWatermarkAudio();
        watermarkBuffer = await loadAudioFile(audioContext, watermarkFile);
        console.log("Using fetched watermark audio");
      }
      
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
      
      // Process the audio with improved sample rate reduction for better compression
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
          
          // Slight dynamic range compression for better final compression
          if (Math.abs(outputData[i]) > 0.6) {
            outputData[i] = outputData[i] > 0 
              ? 0.6 + (outputData[i] - 0.6) * 0.5
              : -0.6 - (Math.abs(outputData[i]) - 0.6) * 0.5;
          }
        }
      }
      
      // Add watermarks at intervals, but use a much more subtle approach
      const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 15); // Maximum of 15 watermarks
      const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
      console.log(`Adding ${numWatermarks} watermarks at ${watermarkFrequency}s intervals`);
      
      for (let i = 0; i < numWatermarks; i++) {
        const startTimeSeconds = i * watermarkFrequency;
        const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
        
        if (startFrame + watermarkBuffer.length > outputBuffer.length) {
          continue;
        }
        
        console.log(`Adding watermark at ${startTimeSeconds}s`);
        
        // Add watermark with improved mixing for better integration and compression
        for (let channel = 0; channel < Math.min(outputBuffer.numberOfChannels, watermarkBuffer.numberOfChannels); channel++) {
          const outputData = outputBuffer.getChannelData(channel);
          const watermarkData = watermarkBuffer.getChannelData(0); // Always use first channel from watermark
          
          // Mix watermark with longer fade-in/out for better quality in compressed files
          const fadeLength = Math.min(2000, Math.floor(watermarkBuffer.length / 3));
          
          for (let j = 0; j < watermarkBuffer.length; j++) {
            if (startFrame + j >= outputData.length) break;
            
            // Calculate fade factor (0 to 1) with longer fades
            let fadeFactor = 1;
            if (j < fadeLength) {
              fadeFactor = j / fadeLength; // Fade in
            } else if (j > watermarkBuffer.length - fadeLength) {
              fadeFactor = (watermarkBuffer.length - j) / fadeLength; // Fade out
            }
            
            // Apply volume and fade with better mixing ratio for improved compression
            const watermarkAmp = watermarkData[j] * watermarkVolume * fadeFactor * 0.5;
            
            // Use a more subtle mixing approach (80% original + 20% watermark)
            // This preserves more of the original audio while still having audible watermark
            outputData[startFrame + j] = outputData[startFrame + j] * 0.8 + watermarkAmp * 0.2;
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
