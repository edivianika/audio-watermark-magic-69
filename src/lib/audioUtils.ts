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

// Add watermark to audio with compression
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number
): Promise<Blob> => {
  try {
    console.log("Starting audio watermarking process");
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
      
      // Apply compression settings
      const compressionRatio = 4; // Higher ratio means more compression
      const threshold = 0.3; // Lower threshold means more audio will be compressed
      const knee = 12; // Smooth transition around threshold
      const attack = 0.003; // Quick attack for transients
      const release = 0.25; // Longer release for smoother compression

      // Copy and process the input audio with watermark and compression
      for (let channel = 0; channel < inputBuffer.numberOfChannels; channel++) {
        const inputData = inputBuffer.getChannelData(channel);
        const outputData = outputBuffer.getChannelData(channel);
        outputData.set(inputData);
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
          
          for (let j = 0; j < watermarkBuffer.length; j++) {
            // Apply compression to the watermark
            let sample = watermarkData[j] * watermarkVolume;
            if (Math.abs(sample) > threshold) {
              const compressedValue = threshold + (Math.abs(sample) - threshold) / compressionRatio;
              sample = sample > 0 ? compressedValue : -compressedValue;
            }
            outputData[startFrame + j] += sample;
          }
        }
      }
      
      // Apply final compression to the entire output
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        
        for (let i = 0; i < outputData.length; i++) {
          const absValue = Math.abs(outputData[i]);
          if (absValue > threshold) {
            const compressedValue = threshold + (absValue - threshold) / compressionRatio;
            outputData[i] = outputData[i] > 0 ? compressedValue : -compressedValue;
          }
        }
      }
      
      // Normalize to prevent clipping
      let maxValue = 0;
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        for (let i = 0; i < outputData.length; i++) {
          maxValue = Math.max(maxValue, Math.abs(outputData[i]));
        }
      }
      
      if (maxValue > 1.0) {
        const scale = 0.95 / maxValue;
        console.log(`Normalizing audio with scale factor: ${scale}`);
        
        for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
          const outputData = outputBuffer.getChannelData(channel);
          for (let i = 0; i < outputData.length; i++) {
            outputData[i] *= scale;
          }
        }
      }
      
      const finalAudio = audioBufferToWav(outputBuffer);
      console.log("Audio watermarking and compression completed successfully");
      
      // Create compressed audio blob with reduced quality
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

// Helper function to convert AudioBuffer to WAV format
// Fixed: Changed to return Uint8Array instead of Promise<Uint8Array>
const audioBufferToWav = (buffer: AudioBuffer): Uint8Array => {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2;
  const result = new Uint8Array(44 + length);
  const view = new DataView(result.buffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2 * numOfChan, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = Math.floor(sample < 0 ? sample * 32768 : sample * 32767);
      view.setInt16(offset, intSample, true);
      offset += 2;
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
