
/**
 * Main module for audio processing utilities
 */

import { fetchWatermarkAudio } from "./audioWatermark"; 
import { audioBufferToWav, loadAudioFile } from "./audioProcessing";

// Re-export for compatibility
export * from "./audioFileConversion";
export * from "./audioWatermark";
export * from "./audioProcessing";

// Add watermark to audio with improved compression for better quality
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process with improved quality");
    console.log(`Watermark settings: Volume=${watermarkVolume}, Interval=${watermarkInterval}s`);
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Load the input audio file
    const inputBuffer = await loadAudioFile(audioContext, inputFile);
    console.log("Input audio loaded successfully, loading watermark...");
    
    try {
      const watermarkFile = await fetchWatermarkAudio();
      console.log("Watermark fetched successfully");
      
      const watermarkBuffer = await loadAudioFile(audioContext, watermarkFile);
      console.log("Watermark audio loaded successfully");
      
      const inputDuration = inputBuffer.duration;
      const watermarkDuration = watermarkBuffer.duration;
      
      console.log(`Input duration: ${inputDuration}s, Watermark duration: ${watermarkDuration}s`);
      
      const outputBuffer = audioContext.createBuffer(
        inputBuffer.numberOfChannels,
        inputBuffer.length,
        inputBuffer.sampleRate
      );
      
      // IMPROVED: More balanced compression settings for better audio clarity
      const compressionRatio = 3.5; // Reduced from 8 for less aggressive compression
      const threshold = 0.35; // Increased from 0.25 for better sound quality
      const highFreqDampingFactor = 0.2; // Reduced from 0.4 to preserve more high frequencies

      // Copy and process the input audio without excessive filtering
      for (let channel = 0; channel < inputBuffer.numberOfChannels; channel++) {
        const inputData = inputBuffer.getChannelData(channel);
        const outputData = outputBuffer.getChannelData(channel);
        
        // Use a more gentle processing approach for better audio quality
        for (let i = 0; i < inputData.length; i++) {
          // Mostly copy the original audio with minimal high-freq damping
          if (i > 0) {
            // Gentler high-frequency treatment
            outputData[i] = inputData[i] * (1 - highFreqDampingFactor * 0.5) + 
                           (inputData[i] - inputData[i-1]) * highFreqDampingFactor * 0.5;
          } else {
            outputData[i] = inputData[i];
          }
          
          // Light compression only on extreme peaks
          if (Math.abs(outputData[i]) > threshold) {
            const difference = Math.abs(outputData[i]) - threshold;
            const compressedDifference = difference / compressionRatio;
            outputData[i] = outputData[i] > 0 
              ? threshold + compressedDifference 
              : -threshold - compressedDifference;
          }
        }
      }
      
      // Add watermarks
      const numWatermarks = Math.floor(inputDuration / watermarkInterval);
      console.log(`Adding ${numWatermarks} watermarks at ${watermarkInterval}s intervals`);
      
      for (let i = 0; i < numWatermarks; i++) {
        const startFrame = Math.floor(i * watermarkInterval * outputBuffer.sampleRate);
        
        if (startFrame + watermarkBuffer.length > outputBuffer.length) {
          continue;
        }
        
        console.log(`Adding watermark at ${i * watermarkInterval}s`);
        
        for (let channel = 0; channel < Math.min(outputBuffer.numberOfChannels, watermarkBuffer.numberOfChannels); channel++) {
          const outputData = outputBuffer.getChannelData(channel);
          const watermarkData = watermarkBuffer.getChannelData(channel);
          
          // Add watermark with smooth fade in/out to prevent pops and clicks
          const fadeLength = Math.min(4000, watermarkBuffer.length / 10); // Fade duration in samples
          
          for (let j = 0; j < watermarkBuffer.length; j++) {
            // Calculate fade factor (0 to 1)
            let fadeFactor = 1;
            if (j < fadeLength) {
              fadeFactor = j / fadeLength; // Fade in
            } else if (j > watermarkBuffer.length - fadeLength) {
              fadeFactor = (watermarkBuffer.length - j) / fadeLength; // Fade out
            }
            
            // Apply volume and fade to watermark
            let sample = watermarkData[j] * watermarkVolume * fadeFactor;
            
            // Apply gentle compression to the watermark if needed
            if (Math.abs(sample) > threshold) {
              const difference = Math.abs(sample) - threshold;
              const compressedDifference = difference / compressionRatio;
              sample = sample > 0 ? threshold + compressedDifference : -threshold - compressedDifference;
            }
            
            // Mix watermark more gently
            outputData[startFrame + j] = outputData[startFrame + j] * 0.85 + sample * 0.15;
          }
        }
      }
      
      // IMPROVED: Use a more balanced approach for reducing file size
      // Apply moderate downsampling only if the file is large
      let finalBuffer = outputBuffer;
      if (inputBuffer.length > 1000000) { // Only for longer files
        const downsampleFactor = 1.2; // Reduced from 1.5 for better quality
        const downsampledLength = Math.floor(outputBuffer.length / downsampleFactor);
        const downsampledBuffer = audioContext.createBuffer(
          outputBuffer.numberOfChannels,
          downsampledLength,
          Math.floor(outputBuffer.sampleRate / downsampleFactor)
        );
        
        // Use better interpolation for smoother downsampling
        for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
          const outputData = outputBuffer.getChannelData(channel);
          const downsampledData = downsampledBuffer.getChannelData(channel);
          
          for (let i = 0; i < downsampledLength; i++) {
            const exactIndex = i * downsampleFactor;
            const indexFloor = Math.floor(exactIndex);
            const indexCeil = Math.min(indexFloor + 1, outputData.length - 1);
            const fraction = exactIndex - indexFloor;
            
            // Linear interpolation for smoother audio
            downsampledData[i] = outputData[indexFloor] * (1 - fraction) + outputData[indexCeil] * fraction;
          }
        }
        
        finalBuffer = downsampledBuffer;
      }
      
      // Normalize audio levels to prevent clipping but preserve dynamics
      let maxValue = 0;
      for (let channel = 0; channel < finalBuffer.numberOfChannels; channel++) {
        const outputData = finalBuffer.getChannelData(channel);
        for (let i = 0; i < outputData.length; i++) {
          maxValue = Math.max(maxValue, Math.abs(outputData[i]));
        }
      }
      
      if (maxValue > 0.95) {
        const scale = 0.95 / maxValue;
        console.log(`Normalizing audio with scale factor: ${scale}`);
        
        for (let channel = 0; channel < finalBuffer.numberOfChannels; channel++) {
          const outputData = finalBuffer.getChannelData(channel);
          for (let i = 0; i < outputData.length; i++) {
            outputData[i] *= scale;
          }
        }
      }
      
      // Choose output format based on file size needs
      const outputOptions = { bitDepth: 16 }; // Default to 16-bit for better quality
      
      // Use 12-bit encoding for very large files to save space
      if (inputFile.size > 10 * 1024 * 1024) { // For files larger than 10MB
        outputOptions.bitDepth = 12;
      }
      
      const finalAudio = audioBufferToWav(finalBuffer, outputOptions);
      console.log("Audio watermarking completed with optimized quality");
      
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
