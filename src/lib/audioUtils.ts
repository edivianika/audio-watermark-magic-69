
/**
 * Main module for audio processing utilities
 */

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
    
    // Now add "Trial Version" watermarks at intervals
    // This simplified approach creates a synthetic voice watermark
    
    // Create a new "Trial Version" watermark directly in the system
    const watermarkText = "Trial Version";
    const watermarkBuffer = createLightWatermark(watermarkText, 1.5);
    const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 15); // Maximum of 15 watermarks
    const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
    
    console.log(`Adding ${numWatermarks} "Trial Version" watermarks at ${watermarkFrequency}s intervals`);
    
    // Add watermarks at regular intervals with higher volume for better audibility
    // We're now applying the watermark more directly and with higher volume
    const effectiveWatermarkVolume = Math.min(watermarkVolume * 1.5, 1.0); // Boost volume but cap at 1.0
    
    for (let i = 0; i < numWatermarks; i++) {
      const startTimeSeconds = i * watermarkFrequency;
      const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
      
      if (startFrame + watermarkBuffer.length > outputBuffer.length) {
        continue;
      }
      
      console.log(`Adding "Trial Version" watermark at ${startTimeSeconds}s`);
      
      // Add watermark with direct mixing for better audibility
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const watermarkData = watermarkBuffer.getChannelData(0); // Always use first channel from watermark
        
        // Use a more prominent mixing approach for better audibility
        for (let j = 0; j < watermarkBuffer.length; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Apply watermark with higher relative volume compared to original
          // Mix 60% original + 40% watermark for better audibility
          const watermarkAmp = watermarkData[j] * effectiveWatermarkVolume;
          outputData[startFrame + j] = outputData[startFrame + j] * 0.6 + watermarkAmp * 0.4;
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
