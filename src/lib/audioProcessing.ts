
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
  console.log("Starting MP3 conversion process");
  
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const kbps = options.kbps || 128;
  
  console.log(`Audio specs: ${channels} channels, ${sampleRate}Hz, targeting ${kbps}kbps`);
  
  // Create MP3 encoder
  const mp3encoder = new lamejs.Mp3Encoder(
    Math.min(2, channels), // lamejs only supports mono (1) or stereo (2)
    sampleRate,
    kbps
  );
  
  const mp3Data: Int8Array[] = [];
  
  // Process audio in chunks to avoid memory issues
  const blockSize = 1152; // MP3 frame size
  const blocks = Math.ceil(buffer.length / blockSize);
  
  console.log(`Processing ${blocks} blocks of audio data`);
  
  if (channels === 1) {
    // Mono processing
    const samples = new Int16Array(blockSize);
    const leftChannel = buffer.getChannelData(0);
    
    for (let i = 0; i < blocks; i++) {
      const offset = i * blockSize;
      const sampleCount = Math.min(blockSize, buffer.length - offset);
      
      // Clear the samples array
      samples.fill(0);
      
      // Convert float32 to int16
      for (let j = 0; j < sampleCount; j++) {
        const sample = Math.max(-1, Math.min(1, leftChannel[offset + j]));
        samples[j] = sample < 0 ? Math.floor(sample * 0x8000) : Math.floor(sample * 0x7FFF);
      }
      
      // Encode this block
      const mp3buf = mp3encoder.encodeBuffer(samples);
      if (mp3buf && mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
  } else {
    // Stereo processing
    const leftSamples = new Int16Array(blockSize);
    const rightSamples = new Int16Array(blockSize);
    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);
    
    for (let i = 0; i < blocks; i++) {
      const offset = i * blockSize;
      const sampleCount = Math.min(blockSize, buffer.length - offset);
      
      // Clear the samples arrays
      leftSamples.fill(0);
      rightSamples.fill(0);
      
      // Convert float32 to int16 for both channels
      for (let j = 0; j < sampleCount; j++) {
        const left = Math.max(-1, Math.min(1, leftChannel[offset + j]));
        const right = Math.max(-1, Math.min(1, rightChannel[offset + j]));
        
        leftSamples[j] = left < 0 ? Math.floor(left * 0x8000) : Math.floor(left * 0x7FFF);
        rightSamples[j] = right < 0 ? Math.floor(right * 0x8000) : Math.floor(right * 0x7FFF);
      }
      
      // Encode this block
      const mp3buf = mp3encoder.encodeBuffer(leftSamples, rightSamples);
      if (mp3buf && mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
  }
  
  // Get the last chunk of MP3 data
  const final = mp3encoder.flush();
  if (final && final.length > 0) {
    mp3Data.push(final);
  }
  
  // Calculate total length
  const totalLength = mp3Data.reduce((acc, chunk) => acc + chunk.length, 0);
  console.log(`MP3 conversion complete. Generated ${totalLength} bytes`);
  
  // Combine all chunks into a single Uint8Array
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
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
