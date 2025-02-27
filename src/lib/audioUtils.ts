
/**
 * Utility functions for audio processing
 */

import { supabase } from "@/integrations/supabase/client";

// Convert base64 to file with improved error handling
export const base64ToFile = async (base64String: string, filename: string) => {
  try {
    if (!base64String.includes('base64,')) {
      base64String = `data:audio/mpeg;base64,${base64String}`;
    }
    
    const parts = base64String.split('base64,');
    if (parts.length !== 2) {
      throw new Error('Invalid base64 format');
    }
    
    const mimeString = parts[0].split(':')[1]?.split(';')[0] || 'audio/mpeg';
    
    const byteString = window.atob(parts[1]);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }
    
    const blob = new Blob([arrayBuffer], { type: mimeString });
    return new File([blob], filename, { type: mimeString });
  } catch (error) {
    console.error('Error converting base64 to file:', error);
    throw new Error(`Failed to convert base64 to file: ${error.message}`);
  }
};

// Fetch watermark audio from Supabase storage or use a fallback
export const fetchWatermarkAudio = async (): Promise<File> => {
  try {
    console.log('Fetching watermark from Supabase storage');
    
    // Get the latest watermark file metadata from the database
    const { data: watermarkData, error: dbError } = await supabase
      .from('watermark_audio')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (dbError) {
      console.warn(`Database error: ${dbError.message}, will use fallback watermark`);
      return await fetchDefaultWatermark();
    }
    
    if (!watermarkData) {
      console.warn('No watermark file found in database, will use fallback watermark');
      return await fetchDefaultWatermark();
    }

    console.log('Watermark data found:', watermarkData);

    // Get signed URL for the file (works even if bucket is public)
    const { data: publicUrl } = supabase.storage
      .from('audio')
      .getPublicUrl(watermarkData.storage_path);
    
    if (!publicUrl || !publicUrl.publicUrl) {
      console.warn('Failed to get public URL for watermark, will use fallback');
      return await fetchDefaultWatermark();
    }

    // Fetch the file using the public URL
    const response = await fetch(publicUrl.publicUrl);
    
    if (!response.ok) {
      console.warn(`HTTP error fetching watermark: ${response.status}, will use fallback`);
      return await fetchDefaultWatermark();
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new File(
      [arrayBuffer], 
      watermarkData.filename, 
      { type: watermarkData.content_type || 'audio/mpeg' }
    );
  } catch (error) {
    console.error('Error fetching watermark from Supabase:', error);
    console.log('Using fallback watermark instead');
    return await fetchDefaultWatermark();
  }
};

// Fetch a default watermark from a public URL
const fetchDefaultWatermark = async (): Promise<File> => {
  try {
    console.log('Fetching default watermark from URL');
    const response = await fetch('https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3');
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return new File([arrayBuffer], 'watermark.mp3', { type: 'audio/mpeg' });
  } catch (error) {
    console.error('Error fetching default watermark:', error);
    
    // Create a simple beep sound as last resort fallback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, sampleRate * 0.5, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < channelData.length; i++) {
      // Generate a simple beep sound
      channelData[i] = Math.sin(i * 0.05) * 0.5;
    }
    
    // Fixed: Await the result from audioBufferToWav which now returns Uint8Array directly
    const wavData = audioBufferToWav(buffer);
    return new File([wavData], 'beep.wav', { type: 'audio/wav' });
  }
};

// Fetch external audio file and convert to File object
export const fetchAudioFile = async (url: string, filename: string): Promise<File> => {
  try {
    console.log(`Fetching audio from URL: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    return new File([blob], filename, { type: 'audio/mpeg' });
  } catch (error) {
    console.error('Error fetching audio file:', error);
    throw new Error(`Failed to fetch audio file: ${error.message}`);
  }
};

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

// Helper function to load an audio file into an AudioBuffer
const loadAudioFile = async (audioContext: AudioContext, file: File): Promise<AudioBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        resolve(audioBuffer);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Enhanced audioBufferToWav function with better quality options
const audioBufferToWav = (buffer: AudioBuffer, options: { bitDepth?: number } = {}): Uint8Array => {
  const numOfChan = buffer.numberOfChannels;
  const bitDepth = options.bitDepth || 16; // Default to 16-bit for better quality
  
  // Support for 12-bit encoding (stored as 16-bit with reduced precision)
  const effectiveBitDepth = [8, 12, 16, 24, 32].includes(bitDepth) ? bitDepth : 16;
  const bytesPerSample = Math.ceil(effectiveBitDepth / 8);
  
  const length = buffer.length * numOfChan * bytesPerSample;
  const result = new Uint8Array(44 + length);
  const view = new DataView(result.buffer);
  
  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * bytesPerSample * numOfChan, true);
  view.setUint16(32, numOfChan * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true); // Bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  
  // Write audio data with appropriate bit depth
  if (bitDepth === 8) {
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        // 8-bit unsigned PCM (0-255)
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        const intSample = Math.round((sample + 1) * 127.5);
        view.setUint8(offset, intSample);
        offset += 1;
      }
    }
  } else if (bitDepth === 12) {
    // 12-bit is stored in 16-bit format with reduced precision
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        // Scale to 12-bit range (-2048 to 2047) instead of 16-bit
        let intSample = Math.round(sample < 0 ? sample * 2048 : sample * 2047);
        // Shift to use 16-bit storage (4 bits of padding)
        intSample = intSample << 4;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  } else {
    // 16-bit or higher
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        
        if (bitDepth === 16) {
          // Standard 16-bit PCM
          const intSample = Math.round(sample < 0 ? sample * 32768 : sample * 32767);
          view.setInt16(offset, intSample, true);
          offset += 2;
        } else if (bitDepth === 24) {
          // 24-bit PCM
          const intSample = Math.round(sample < 0 ? sample * 8388608 : sample * 8388607);
          view.setUint8(offset, intSample & 0xFF);
          view.setUint8(offset + 1, (intSample >> 8) & 0xFF);
          view.setUint8(offset + 2, (intSample >> 16) & 0xFF);
          offset += 3;
        } else if (bitDepth === 32) {
          // 32-bit float (not PCM)
          view.setFloat32(offset, sample, true);
          offset += 4;
        }
      }
    }
  }

  return result;
};

// Helper function to write a string to a DataView
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Generate a unique filename
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  return `watermarked_${timestamp}_${randomString}.${extension}`;
};

