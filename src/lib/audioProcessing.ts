
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

// Convert AudioBuffer to WAV format with quality reduction and size control
export const audioBufferToCompressedFormat = (buffer: AudioBuffer, options: { 
  quality?: 'low' | 'medium' | 'high',
  maxSizeInMB?: number
} = {}): Uint8Array => {
  console.log("Starting audio compression process");
  
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const quality = options.quality || 'medium';
  const maxSizeInMB = options.maxSizeInMB || 16; // Default max size to 16MB
  
  console.log(`Audio specs: ${channels} channels, ${sampleRate}Hz, quality setting: ${quality}, max size: ${maxSizeInMB}MB`);
  
  // Start with initial compression settings
  let bitDepth = 16;
  let targetSampleRate = sampleRate;
  let monoDownmix = false;
  
  // Apply quality settings
  if (quality === 'low') {
    bitDepth = 8;
    targetSampleRate = Math.min(22050, sampleRate);
    monoDownmix = true;
  } else if (quality === 'medium') {
    bitDepth = 16;
    targetSampleRate = Math.min(32000, sampleRate);
    monoDownmix = channels > 1;
  } else {
    // high quality
    bitDepth = 16;
    targetSampleRate = Math.min(44100, sampleRate);
    monoDownmix = false;
  }
  
  // Process buffer with initial settings
  let processedBuffer = buffer;
  
  // Convert to mono if needed
  if (monoDownmix && channels > 1) {
    processedBuffer = reduceToMono(buffer);
  }
  
  // Resample if needed
  if (targetSampleRate !== sampleRate) {
    processedBuffer = resampleAudioBuffer(processedBuffer, targetSampleRate);
  }
  
  // Try initial compression with specified settings
  let compressedData = encodeWAV(processedBuffer, bitDepth);
  let currentSizeMB = compressedData.length / (1024 * 1024);
  
  console.log(`Initial compression result: ${currentSizeMB.toFixed(2)}MB with ${bitDepth}-bit, ${targetSampleRate}Hz, mono: ${monoDownmix}`);
  
  // Progressive compression if still over size limit
  let compressionAttempt = 1;
  const maxAttempts = 5;
  
  while (currentSizeMB > maxSizeInMB && compressionAttempt < maxAttempts) {
    console.log(`Compression attempt ${compressionAttempt}: File still too large (${currentSizeMB.toFixed(2)}MB), adjusting parameters...`);
    
    // Progressively stronger compression settings
    if (compressionAttempt === 1) {
      // First attempt: reduce to mono if not already
      if (processedBuffer.numberOfChannels > 1) {
        processedBuffer = reduceToMono(processedBuffer);
        console.log("Reducing to mono");
      } else {
        // If already mono, reduce bit depth
        bitDepth = Math.max(8, bitDepth - 8);
        console.log(`Reducing bit depth to ${bitDepth}`);
      }
    } else if (compressionAttempt === 2) {
      // Second attempt: reduce sample rate
      targetSampleRate = Math.max(16000, Math.floor(targetSampleRate * 0.75));
      processedBuffer = resampleAudioBuffer(processedBuffer, targetSampleRate);
      console.log(`Reducing sample rate to ${targetSampleRate}Hz`);
    } else if (compressionAttempt === 3) {
      // Third attempt: set bit depth to minimum
      bitDepth = 8;
      console.log("Setting bit depth to minimum (8-bit)");
    } else {
      // More aggressive sample rate reduction for the last attempts
      targetSampleRate = Math.max(8000, Math.floor(targetSampleRate * 0.5));
      processedBuffer = resampleAudioBuffer(processedBuffer, targetSampleRate);
      console.log(`Aggressively reducing sample rate to ${targetSampleRate}Hz`);
    }
    
    // Try new compression settings
    compressedData = encodeWAV(processedBuffer, bitDepth);
    currentSizeMB = compressedData.length / (1024 * 1024);
    
    console.log(`After adjustment: ${currentSizeMB.toFixed(2)}MB with ${bitDepth}-bit, ${targetSampleRate}Hz, mono: ${processedBuffer.numberOfChannels === 1}`);
    
    compressionAttempt++;
  }
  
  // Final fallback if still over size limit: truncate the audio
  if (currentSizeMB > maxSizeInMB) {
    console.log(`Still exceeding ${maxSizeInMB}MB limit after all compression attempts. Will truncate audio.`);
    
    // Estimate the reduction ratio needed
    const reductionRatio = maxSizeInMB / currentSizeMB * 0.95; // 5% safety margin
    const newLength = Math.floor(processedBuffer.length * reductionRatio);
    
    console.log(`Truncating audio to ${reductionRatio.toFixed(2) * 100}% of current length`);
    
    // Create a truncated buffer
    const truncatedBuffer = new AudioContext().createBuffer(
      processedBuffer.numberOfChannels,
      newLength,
      processedBuffer.sampleRate
    );
    
    // Copy data to the truncated buffer
    for (let channel = 0; channel < processedBuffer.numberOfChannels; channel++) {
      const channelData = truncatedBuffer.getChannelData(channel);
      channelData.set(processedBuffer.getChannelData(channel).slice(0, newLength));
    }
    
    // Final compression
    compressedData = encodeWAV(truncatedBuffer, bitDepth);
    currentSizeMB = compressedData.length / (1024 * 1024);
    console.log(`Final output size after truncation: ${currentSizeMB.toFixed(2)}MB`);
  }
  
  // Final output
  console.log(`Final compression settings: ${bitDepth}-bit, ${targetSampleRate}Hz, ${processedBuffer.numberOfChannels} channel(s)`);
  console.log(`Compressed file size: ${currentSizeMB.toFixed(2)}MB`);
  
  return compressedData;
};

// Improved MP3 compression using lamejs
export const audioBufferToMp3 = (buffer: AudioBuffer, options: {
  bitRate?: number,
  quality?: 'low' | 'medium' | 'high',
  maxSizeInMB?: number
} = {}): Uint8Array => {
  console.log("Converting audio buffer to MP3 format");
  
  try {
    // Import lamejs as an ES module
    const lamejs = require('lamejs');
    
    // Determine MP3 settings based on quality
    let quality = options.quality || 'medium';
    let bitRate = options.bitRate;
    const maxSizeInMB = options.maxSizeInMB || 16; // Default max size to 16MB
    
    if (!bitRate) {
      // Set bitRate based on quality if not explicitly provided
      if (quality === 'low') {
        bitRate = 64;
      } else if (quality === 'medium') {
        bitRate = 128;
      } else {
        bitRate = 192; // high quality
      }
    }
    
    console.log(`MP3 compression settings: ${bitRate}kbps, max size: ${maxSizeInMB}MB`);
    
    // Prepare the audio data
    let numChannels = buffer.numberOfChannels;
    let sampleRate = buffer.sampleRate;
    let processedBuffer = buffer;
    
    // Initial size estimation (rough approximation: duration * bitrate / 8)
    const durationSeconds = buffer.length / buffer.sampleRate;
    const estimatedSizeMB = (durationSeconds * bitRate * 1000) / (8 * 1024 * 1024);
    
    console.log(`Estimated MP3 size at ${bitRate}kbps: ~${estimatedSizeMB.toFixed(2)}MB`);
    
    // Pre-process to reduce size if estimation is too large
    if (estimatedSizeMB > maxSizeInMB * 0.9) { // 10% margin
      console.log("Estimated size exceeds target, applying pre-processing steps");
      
      // Progressive adjustments
      if (numChannels > 1) {
        // Step 1: Convert to mono
        processedBuffer = reduceToMono(buffer);
        numChannels = 1;
        console.log("Pre-processing: Converting to mono");
      }
      
      // Step 2: Reduce sample rate if needed
      if (estimatedSizeMB > maxSizeInMB * 0.7) {
        const targetSampleRate = sampleRate > 44100 ? 44100 :
                                sampleRate > 32000 ? 32000 :
                                sampleRate > 22050 ? 22050 : 16000;
        
        if (targetSampleRate < sampleRate) {
          processedBuffer = resampleAudioBuffer(processedBuffer, targetSampleRate);
          sampleRate = targetSampleRate;
          console.log(`Pre-processing: Reducing sample rate to ${targetSampleRate}Hz`);
        }
      }
      
      // Step 3: Reduce bitrate as a last resort
      if (estimatedSizeMB > maxSizeInMB * 0.5) {
        bitRate = Math.min(bitRate, 96); // Cap at 96kbps
        console.log(`Pre-processing: Reducing bitrate to ${bitRate}kbps`);
      }
      
      // If still likely to be too large, reduce further
      if (estimatedSizeMB > maxSizeInMB) {
        bitRate = Math.min(bitRate, 64); // Last resort: 64kbps
        console.log(`Pre-processing: Further reducing bitrate to ${bitRate}kbps`);
      }
    }
    
    // MP3 encoder works with stereo or mono
    const mp3encoder = new lamejs.Mp3Encoder(
      numChannels > 1 ? 2 : 1,  // Stereo or Mono
      sampleRate,
      bitRate
    );
    
    const bufferSize = 1152; // This is a recommended buffer size for MP3 encoding
    const mp3Data = [];
    
    // Extract and prepare channel data
    let leftChannel, rightChannel;
    
    if (numChannels > 0) leftChannel = processedBuffer.getChannelData(0);
    if (numChannels > 1) rightChannel = processedBuffer.getChannelData(1);
    
    // Process the audio data in chunks
    for (let i = 0; i < processedBuffer.length; i += bufferSize) {
      // Create sample arrays for each chunk
      const leftChunk = new Int16Array(Math.min(bufferSize, processedBuffer.length - i));
      const rightChunk = numChannels > 1 ? new Int16Array(Math.min(bufferSize, processedBuffer.length - i)) : null;
      
      // Convert float32 to int16
      for (let j = 0; j < leftChunk.length; j++) {
        if (i + j < processedBuffer.length) {
          // Convert from [-1.0, 1.0] to [-32768, 32767]
          const leftSample = Math.max(-1, Math.min(1, leftChannel[i + j]));
          leftChunk[j] = leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF;
          
          if (rightChunk && numChannels > 1) {
            const rightSample = Math.max(-1, Math.min(1, rightChannel[i + j]));
            rightChunk[j] = rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF;
          }
        }
      }
      
      // Encode the chunk
      let mp3buf;
      if (numChannels > 1) {
        mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
      } else {
        mp3buf = mp3encoder.encodeBuffer(leftChunk);
      }
      
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    // Finalize the MP3
    const finalizeBuf = mp3encoder.flush();
    if (finalizeBuf.length > 0) {
      mp3Data.push(finalizeBuf);
    }
    
    // Calculate the total size and create the final buffer
    const totalSize = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
    const result = new Uint8Array(totalSize);
    
    let offset = 0;
    for (const buf of mp3Data) {
      result.set(buf, offset);
      offset += buf.length;
    }
    
    const finalSizeMB = result.length / (1024 * 1024);
    console.log(`MP3 compression successful, output size: ${finalSizeMB.toFixed(2)}MB`);
    
    // Final size check - if still too large, fall back to WAV with aggressive compression
    if (finalSizeMB > maxSizeInMB) {
      console.log(`MP3 output still exceeds ${maxSizeInMB}MB limit, falling back to WAV compression`);
      return audioBufferToCompressedFormat(buffer, { 
        quality: 'low', 
        maxSizeInMB: maxSizeInMB 
      });
    }
    
    return result;
    
  } catch (error) {
    console.error("Error during MP3 compression:", error);
    console.log("Falling back to WAV compression");
    
    // If MP3 compression fails, fall back to WAV compression
    const fallbackQuality = options.quality || 'medium';
    return audioBufferToCompressedFormat(buffer, { 
      quality: fallbackQuality,
      maxSizeInMB: options.maxSizeInMB || 16
    });
  }
};

// Resample an AudioBuffer to a different sample rate
const resampleAudioBuffer = (buffer: AudioBuffer, targetSampleRate: number): AudioBuffer => {
  if (buffer.sampleRate === targetSampleRate) {
    return buffer;
  }
  
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: targetSampleRate
  });
  
  const numChannels = buffer.numberOfChannels;
  const lengthRatio = targetSampleRate / buffer.sampleRate;
  const newLength = Math.round(buffer.length * lengthRatio);
  const newBuffer = ctx.createBuffer(numChannels, newLength, targetSampleRate);
  
  // Simple resampling by linear interpolation
  for (let channel = 0; channel < numChannels; channel++) {
    const oldData = buffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);
    
    for (let i = 0; i < newLength; i++) {
      const oldIndex = i / lengthRatio;
      const oldIndexFloor = Math.floor(oldIndex);
      const oldIndexCeil = Math.min(oldIndexFloor + 1, buffer.length - 1);
      const ratio = oldIndex - oldIndexFloor;
      
      // Linear interpolation
      newData[i] = oldData[oldIndexFloor] * (1 - ratio) + oldData[oldIndexCeil] * ratio;
    }
  }
  
  return newBuffer;
};

// Encode AudioBuffer to WAV format with specified bit depth
export const encodeWAV = (buffer: AudioBuffer, bitDepth: number = 16): Uint8Array => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
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
      
      if (bitDepth === 8) {
        // 8-bit WAV is unsigned
        sample = (sample + 1) / 2; // Convert -1..1 to 0..1
        sample = sample * 255; // Convert 0..1 to 0..255
        view.setUint8(offset, sample);
        offset += 1;
      } else {
        // 16-bit WAV is signed
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
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
