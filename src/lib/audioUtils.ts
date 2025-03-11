
/**
 * Main module for audio processing utilities
 */

import { loadAudioFile, applyCompression } from "./audioCore";
import { fetchWatermarkAudio } from "./watermarkService";
import { audioBufferToRawFormat } from "./formatConversion";

// Re-export for compatibility
export * from "./formatConversion";
export * from "./watermarkService";
export * from "./audioCore";
export * from "./batchProcessing";

// Add watermark to audio with optional compression and file size limits
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
  fileSizeOptions?: {
    maxSizeInMB?: number;
  }
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process with database watermark file");
    console.log(`Watermark settings: Volume=${watermarkVolume}, Interval=${watermarkInterval}s`);
    
    // Always enable compression by default if not explicitly set
    const useCompression = compressionOptions?.enabled !== false;
    const compressionSettings = useCompression ? {
      threshold: compressionOptions?.threshold ?? -20, // Updated threshold
      knee: compressionOptions?.knee ?? 6,           // Updated knee
      ratio: compressionOptions?.ratio ?? 4,          // Updated ratio
      attack: compressionOptions?.attack ?? 0.008,    // Updated attack (8ms)
      release: compressionOptions?.release ?? 0.125   // Updated release (125ms)
    } : undefined;
    
    if (useCompression) {
      console.log("Compression enabled:", compressionSettings);
    }
    
    const maxSizeInMB = fileSizeOptions?.maxSizeInMB || 16; // Default to 16MB limit
    console.log(`Target maximum file size: ${maxSizeInMB}MB`);
    
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
    
    // Determine if we need to convert to mono to save space
    const shouldConvertToMono = fileSizeMB > maxSizeInMB * 0.8;
    const numChannels = shouldConvertToMono ? 1 : inputBuffer.numberOfChannels;
    const inputDuration = inputBuffer.duration;
    
    console.log(`Input duration: ${inputDuration}s, Channels: ${numChannels}`);
    if (shouldConvertToMono) {
      console.log("Converting to mono to reduce file size");
    }
    
    // Create output buffer (with mono conversion if needed)
    const outputBuffer = audioContext.createBuffer(
      numChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );
    
    // First, copy the original audio to the output buffer at 80% volume
    for (let channel = 0; channel < numChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      if (shouldConvertToMono) {
        // If converting to mono, average all input channels
        const numInputChannels = inputBuffer.numberOfChannels;
        for (let i = 0; i < outputData.length; i++) {
          let sum = 0;
          for (let inputChannel = 0; inputChannel < numInputChannels; inputChannel++) {
            sum += inputBuffer.getChannelData(inputChannel)[i];
          }
          outputData[i] = (sum / numInputChannels) * 0.8; // 80% volume
        }
      } else {
        // Otherwise copy channel directly
        const inputData = inputBuffer.getChannelData(channel);
        for (let i = 0; i < outputData.length; i++) {
          outputData[i] = inputData[i] * 0.8; // 80% volume for original audio
        }
      }
    }
    
    // Now add watermarks at intervals at appropriate volume
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
      
      console.log(`Adding watermark at ${startTimeSeconds}s at appropriate volume`);
      
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const watermarkChannelIndex = Math.min(channel, watermarkBuffer.numberOfChannels - 1);
        const watermarkData = watermarkBuffer.getChannelData(watermarkChannelIndex);
        
        for (let j = 0; j < watermarkBuffer.length; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Mix original (already at 80%) with watermark at appropriate volume
          const originalSample = outputData[startFrame + j];
          const watermarkSample = watermarkData[j] * watermarkVolume; // Control watermark volume
          
          outputData[startFrame + j] = originalSample + watermarkSample;
        }
      }
    }
    
    // Apply compression by default to control file size
    console.log("Applying audio compression...");
    const finalBuffer = await applyCompression(outputBuffer, compressionSettings);
    console.log("Compression applied successfully");
    
    // Calculate target bitrate based on file size limit
    // Add a safety factor (0.8) to account for container overhead
    const targetBitrate = (maxSizeInMB * 8 * 1024 * 0.8) / inputDuration;
    console.log(`Using target bitrate of ${Math.round(targetBitrate)}kbps to stay within ${maxSizeInMB}MB limit`);
    
    // Determine output format based on input type
    // WhatsApp supports MP3, OGG, and standard WAV (PCM) formats
    let outputFormat = "mp3";
    let mimeType = "audio/mpeg";
    
    if (inputFile.type) {
      if (inputFile.type.includes("ogg")) {
        outputFormat = "ogg";
        mimeType = "audio/ogg";
      } else if (inputFile.type.includes("wav")) {
        outputFormat = "wav";
        mimeType = "audio/wav";
      }
    }
    
    console.log(`Using output format: ${outputFormat}, MIME type: ${mimeType}`);
    
    // Convert AudioBuffer to raw audio data format with enforced file size limit
    // For WhatsApp compatibility, ensure 16-bit PCM for WAV, or standard MP3 format
    const rawAudioData = audioBufferToRawFormat(finalBuffer, {
      format: outputFormat,
      bitrate: targetBitrate,
      enforceFileSizeLimit: true,
      maxSizeMB: maxSizeInMB
    });
    
    const outputBlob = new Blob([rawAudioData], { type: mimeType });
    const finalSizeMB = outputBlob.size / (1024 * 1024);
    
    console.log(`Audio processing completed. Final size: ${finalSizeMB.toFixed(2)}MB (target: ${maxSizeInMB}MB)`);
    
    if (finalSizeMB > maxSizeInMB) {
      console.warn(`Warning: Final size ${finalSizeMB.toFixed(2)}MB still exceeds target ${maxSizeInMB}MB`);
    }
    
    return outputBlob;
  } catch (error) {
    console.error("Error processing audio:", error);
    throw error;
  }
};
