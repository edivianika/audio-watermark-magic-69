
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

// Enhanced audioBufferToWav function with more aggressive compression options
export const audioBufferToWav = (buffer: AudioBuffer, options: { bitDepth?: number, sampleRateReduction?: number } = {}): Uint8Array => {
  const numOfChan = buffer.numberOfChannels;
  const bitDepth = options.bitDepth || 16; // Default to 16-bit
  const sampleRateReduction = options.sampleRateReduction || 1; // Default to no reduction
  
  // Apply sample rate reduction if specified
  let effectiveBuffer = buffer;
  if (sampleRateReduction > 1) {
    // Create downsampled buffer
    const newSampleRate = Math.floor(buffer.sampleRate / sampleRateReduction);
    const newLength = Math.floor(buffer.length / sampleRateReduction);
    const downsampledBuffer = new AudioContext().createBuffer(
      numOfChan, 
      newLength, 
      newSampleRate
    );
    
    // Copy data with reduced sample rate using linear interpolation for better quality
    for (let channel = 0; channel < numOfChan; channel++) {
      const inputData = buffer.getChannelData(channel);
      const outputData = downsampledBuffer.getChannelData(channel);
      
      for (let i = 0; i < newLength; i++) {
        // Linear interpolation for smoother downsampling
        const exactPos = i * sampleRateReduction;
        const pos1 = Math.floor(exactPos);
        const pos2 = Math.min(pos1 + 1, buffer.length - 1);
        const fraction = exactPos - pos1;
        
        // Linear interpolate between the two closest samples
        outputData[i] = (1 - fraction) * inputData[pos1] + fraction * inputData[pos2];
      }
    }
    
    effectiveBuffer = downsampledBuffer;
  }
  
  // Apply dynamic compression to reduce peaks (which helps with size)
  for (let channel = 0; channel < numOfChan; channel++) {
    const data = effectiveBuffer.getChannelData(channel);
    const threshold = 0.3;
    const ratio = 4; // 4:1 compression ratio for aggressive peak reduction
    
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > threshold) {
        // Apply compression only to peaks
        const diff = abs - threshold;
        const compressed = threshold + diff / ratio;
        data[i] = data[i] > 0 ? compressed : -compressed;
      }
    }
  }
  
  // Support for multiple bit depths
  const effectiveBitDepth = [8, 12, 16].includes(bitDepth) ? bitDepth : 16;
  const bytesPerSample = Math.ceil(effectiveBitDepth / 8);
  
  const length = effectiveBuffer.length * numOfChan * bytesPerSample;
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
  view.setUint32(24, effectiveBuffer.sampleRate, true);
  view.setUint32(28, effectiveBuffer.sampleRate * bytesPerSample * numOfChan, true);
  view.setUint16(32, numOfChan * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true); // Bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  
  // Write audio data with appropriate bit depth and compression
  if (bitDepth === 8) {
    for (let i = 0; i < effectiveBuffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        // 8-bit unsigned PCM (0-255)
        const sample = Math.max(-1, Math.min(1, effectiveBuffer.getChannelData(channel)[i]));
        const intSample = Math.round((sample + 1) * 127.5);
        view.setUint8(offset, intSample);
        offset += 1;
      }
    }
  } else if (bitDepth === 12) {
    // 12-bit is stored in 16-bit format with reduced precision
    for (let i = 0; i < effectiveBuffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        const sample = Math.max(-1, Math.min(1, effectiveBuffer.getChannelData(channel)[i]));
        // Scale to 12-bit range (-2048 to 2047) instead of 16-bit
        let intSample = Math.round(sample < 0 ? sample * 2048 : sample * 2047);
        // Shift to use 16-bit storage (4 bits of padding)
        intSample = intSample << 4;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  } else {
    // 16-bit
    for (let i = 0; i < effectiveBuffer.length; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
        const sample = Math.max(-1, Math.min(1, effectiveBuffer.getChannelData(channel)[i]));
        // Standard 16-bit PCM
        const intSample = Math.round(sample < 0 ? sample * 32768 : sample * 32767);
        view.setInt16(offset, intSample, true);
        offset += 2;
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

// New function to create a lighter watermark
export const createLightWatermark = (message: string = "Trial Version", duration: number = 1): AudioBuffer => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const sampleRate = audioContext.sampleRate;
  const bufferLength = Math.ceil(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, bufferLength, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  // Basic speech synthesis parameters
  const baseFrequency = 240; // Hz (higher than regular beep for clearer voice)
  const letterDuration = duration / (message.length + 2); // time per letter plus padding
  
  // Create a very simple beep pattern that's recognizable but small
  for (let i = 0; i < bufferLength; i++) {
    const timeInSec = i / sampleRate;
    const letterIndex = Math.floor(timeInSec / letterDuration);
    
    if (letterIndex < message.length) {
      // Get character code for very basic "speech" impression
      const char = message[letterIndex];
      const charCode = char.charCodeAt(0);
      const freqVariation = (charCode % 20) - 10; // -10 to +10 Hz frequency shift
      
      // Calculate frequency for this "letter"
      const frequency = baseFrequency + freqVariation;
      
      // Generate sound wave with slight amplitude envelope (fade in/out per letter)
      const letterProgress = (timeInSec % letterDuration) / letterDuration;
      let amplitude = 0.5;
      
      // Simple envelope for smoother sound (fade in/out)
      if (letterProgress < 0.1) {
        amplitude *= letterProgress / 0.1; // fade in
      } else if (letterProgress > 0.9) {
        amplitude *= (1 - letterProgress) / 0.1; // fade out
      }
      
      // Generate wave
      channelData[i] = Math.sin(2 * Math.PI * frequency * timeInSec) * amplitude;
    } else {
      // Silence between repetitions
      channelData[i] = 0;
    }
  }
  
  return buffer;
};
