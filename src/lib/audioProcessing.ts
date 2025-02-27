
/**
 * Audio processing and conversion utilities
 */

// Helper function to load an audio file into an AudioBuffer
export const loadAudioFile = async (audioContext: AudioContext, file: File): Promise<AudioBuffer> => {
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
export const audioBufferToWav = (buffer: AudioBuffer, options: { bitDepth?: number } = {}): Uint8Array => {
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
export const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};
