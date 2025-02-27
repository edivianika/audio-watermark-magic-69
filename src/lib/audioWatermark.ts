
/**
 * Watermark-specific functionality
 */

import { supabase } from "@/integrations/supabase/client";
import { fetchAudioFile } from "./audioFileConversion";
import { audioBufferToMp3 } from "./audioProcessing";

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
    
    // Generate MP3 data from the audio buffer (changed from WAV to MP3)
    const mp3Data = audioBufferToMp3(buffer);
    return new File([mp3Data], 'beep.mp3', { type: 'audio/mp3' });
  }
};
