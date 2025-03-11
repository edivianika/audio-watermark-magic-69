
/**
 * Audio format conversion utilities
 */

// Convert AudioBuffer to raw audio format with options for bitrate and file size limits
export const audioBufferToRawFormat = (
  buffer: AudioBuffer,
  options?: {
    bitrate?: number;
    enforceFileSizeLimit?: boolean;
    maxSizeMB?: number;
  }
): Uint8Array => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = options?.bitrate ? Math.min(16, Math.floor(options.bitrate / 8)) : 16; // Adjust bit depth based on target bitrate
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = buffer.length * numChannels * bytesPerSample;
  
  // WAV header is 44 bytes
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
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
      
      // 16-bit WAV is signed
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  
  return new Uint8Array(arrayBuffer);
};

// Helper function to write a string to a DataView
export const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

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
