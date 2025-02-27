
/**
 * Audio processing and conversion utilities
 */
import lamejs from 'lamejs';

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

// Convert AudioBuffer to MP3 using lamejs
export const audioBufferToMp3 = (buffer: AudioBuffer, options: { 
  kbps?: number
} = {}): Uint8Array => {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const kbps = options.kbps || 128;
  
  // Create MP3 encoder - using proper method to create encoder
  // In lamejs, Mp3Encoder takes (numChannels, sampleRate, bitRate)
  const mp3encoder = new lamejs.Mp3Encoder(
    channels === 2 ? 2 : 1, // Stereo (2) or Mono (1)
    sampleRate,
    kbps
  );
  
  const mp3Data: Int8Array[] = [];
  
  // Convert to samples
  const leftChannel = buffer.getChannelData(0);
  const rightChannel = channels > 1 ? buffer.getChannelData(1) : null;
  const samples = new Int16Array(buffer.length * (rightChannel ? 2 : 1));
  
  // Convert float32 to int16
  for (let i = 0; i < buffer.length; i++) {
    // Left channel
    const leftSample = Math.max(-1, Math.min(1, leftChannel[i]));
    samples[i * (rightChannel ? 2 : 1)] = leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF;
    
    // Right channel (if stereo)
    if (rightChannel) {
      const rightSample = Math.max(-1, Math.min(1, rightChannel[i]));
      samples[i * 2 + 1] = rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF;
    }
  }
  
  // Encode to MP3 in chunks
  const blockSize = 1152; // This is a standard MP3 block size
  let leftChunk, rightChunk, mp3buf;
  
  for (let i = 0; i < buffer.length; i += blockSize) {
    if (channels === 1) {
      // Mono
      leftChunk = samples.subarray(i, i + blockSize);
      mp3buf = mp3encoder.encodeBuffer(leftChunk);
    } else {
      // Stereo - separate channels for lamejs
      leftChunk = new Int16Array(blockSize);
      rightChunk = new Int16Array(blockSize);
      
      // Extract left and right channel data
      for (let j = 0; j < blockSize && (i + j) < buffer.length; j++) {
        leftChunk[j] = samples[(i + j) * 2];
        rightChunk[j] = samples[(i + j) * 2 + 1];
      }
      
      mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    }
    
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }
  
  // Get the last chunk of MP3 data
  const final = mp3encoder.flush();
  if (final.length > 0) {
    mp3Data.push(final);
  }
  
  // Calculate total length and create final buffer
  const totalLength = mp3Data.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  // Combine all chunks
  for (const chunk of mp3Data) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
};

// Helper function to write a string to a DataView
export const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Function to reduce audio channels to mono if needed
export const reduceToMono = (buffer: AudioBuffer): AudioBuffer => {
  if (buffer.numberOfChannels === 1) {
    return buffer; // Already mono
  }
  
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const monoBuffer = audioContext.createBuffer(1, buffer.length, buffer.sampleRate);
  const monoData = monoBuffer.getChannelData(0);
  
  // Mix all channels down to mono
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      sum += buffer.getChannelData(channel)[i];
    }
    monoData[i] = sum / buffer.numberOfChannels;
  }
  
  return monoBuffer;
};
