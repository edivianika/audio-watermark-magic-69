
/**
 * Watermark-specific functionality
 */

import { supabase } from "@/integrations/supabase/client";
import { fetchAudioFile } from "./formatConversion";

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
export const fetchDefaultWatermark = async (): Promise<File> => {
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
    
    // Convert AudioBuffer to raw audio format
    const audioData = encodeWAVFromBuffer(buffer);
    return new File([audioData], 'beep.wav', { type: 'audio/wav' });
  }
};

// Helper function to encode a simple buffer to WAV for the fallback
const encodeWAVFromBuffer = (buffer: AudioBuffer): Uint8Array => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = buffer.length * numChannels * bytesPerSample;
  
  // WAV header is 44 bytes
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  
  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1 size (16 for PCM)
  view.setUint16(20, 1, true); // audio format (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write the PCM samples
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  
  let offset = 44;
  let sample;
  
  // Interleave channels
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      // Convert float32 to the appropriate integer based on bit depth
      sample = Math.max(-1, Math.min(1, channels[channel][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  
  return new Uint8Array(arrayBuffer);
};
