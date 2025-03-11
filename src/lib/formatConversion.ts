/**
 * Audio format conversion utilities
 */

// Convert AudioBuffer to raw audio format with options for bitrate and file size limits
export const audioBufferToRawFormat = (
  buffer: AudioBuffer,
  options?: {
    format?: 'wav' | 'mp3' | 'ogg';
    bitrate?: number;
    enforceFileSizeLimit?: boolean;
    maxSizeMB?: number;
  }
): Uint8Array => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  const maxSizeMB = options?.maxSizeMB || 16;
  const enforceLimit = options?.enforceFileSizeLimit !== false;
  const format = options?.format || 'wav';
  
  console.log(`Audio format conversion to ${format} format`);
  
  // Calculate required bitrate based on maximum file size and duration
  // Formula: bitrate = (file size in bits) / duration in seconds
  // 1 MB = 8 * 1024 * 1024 bits
  const maxBitsTotal = maxSizeMB * 8 * 1024 * 1024;
  const requiredBitrate = enforceLimit ? Math.floor(maxBitsTotal / duration) : 128 * 1024;
  
  // For WhatsApp compatibility:
  // - Use 16-bit PCM for WAV
  // - Use standard sample rates (44.1kHz preferred)
  // - Keep stereo if possible
  let bitDepth = 16; // Always use 16-bit for WhatsApp compatibility
  
  console.log(`File size enforcement: ${enforceLimit ? 'enabled' : 'disabled'}`);
  console.log(`Target max size: ${maxSizeMB}MB, Duration: ${duration.toFixed(2)}s`);
  console.log(`Required bitrate: ${Math.round(requiredBitrate/1024)}kbps, Using bit depth: ${bitDepth}-bit`);
  
  // Convert to standard sample rate for better compatibility
  // WhatsApp supports 44.1kHz sample rate well
  let targetSampleRate = sampleRate;
  if (targetSampleRate !== 44100 && targetSampleRate !== 48000) {
    targetSampleRate = 44100; // Standard sample rate
    console.log(`Adjusting sample rate to 44.1kHz for better compatibility`);
  }
  
  // Determine channel count - prefer stereo if possible within size constraints
  let targetChannels = numChannels;
  
  // If we're over the limit, consider mono conversion
  if (enforceLimit && (bitDepth * targetSampleRate * numChannels) > requiredBitrate && numChannels > 1) {
    targetChannels = 1;
    console.log('Converting to mono to reduce file size');
  }
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = targetChannels * bytesPerSample;
  const byteRate = targetSampleRate * blockAlign;
  
  // Calculate actual data length based on our compressed parameters
  // We may need to resample if targetSampleRate != sampleRate
  const resampleRatio = targetSampleRate / sampleRate;
  const targetLength = Math.floor(buffer.length * resampleRatio);
  const dataLength = targetLength * targetChannels * bytesPerSample;
  
  // Pre-check output size
  const headerSize = format === 'wav' ? 44 : 0; // WAV header is 44 bytes
  const estimatedSizeBytes = headerSize + dataLength;
  const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024);
  
  // If we're still over the limit, we may need more aggressive compression
  let finalBitDepth = bitDepth;
  let finalTargetSampleRate = targetSampleRate;
  let finalTargetChannels = targetChannels;
  let finalResampleRatio = resampleRatio;
  
  if (enforceLimit && estimatedSizeMB > maxSizeMB && format === 'wav') {
    console.log(`Estimated size ${estimatedSizeMB.toFixed(2)}MB still exceeds limit, applying more aggressive compression...`);
    
    // Force to mono if not already
    if (finalTargetChannels > 1) {
      finalTargetChannels = 1;
      console.log('Forcing mono conversion to reduce file size');
    }
    
    // Reduce sample rate if needed (but keep within WhatsApp compatible ranges)
    if (estimatedSizeMB > maxSizeMB * 1.2) {
      if (finalTargetSampleRate > 44100) {
        finalTargetSampleRate = 44100; // Standard CD quality
      } else if (finalTargetSampleRate > 22050 && estimatedSizeMB > maxSizeMB * 1.5) {
        finalTargetSampleRate = 22050; // Still good quality
      }
      
      finalResampleRatio = finalTargetSampleRate / sampleRate;
      console.log(`Adjusting sample rate to ${finalTargetSampleRate}Hz to meet size limit`);
    }
  }
  
  // Recalculate parameters based on final settings
  const finalBytesPerSample = finalBitDepth / 8;
  const finalBlockAlign = finalTargetChannels * finalBytesPerSample;
  const finalByteRate = finalTargetSampleRate * finalBlockAlign;
  
  // Calculate final target length based on bit depth, channels and sample rate limits
  const finalTargetLength = Math.floor(buffer.length * finalResampleRatio);
  const finalDataLength = finalTargetLength * finalTargetChannels * finalBytesPerSample;
  
  // Ensure we don't exceed max size - truncate if necessary
  let actualDataLength = finalDataLength;
  if (enforceLimit) {
    const maxDataLength = Math.floor(maxSizeMB * 1024 * 1024) - headerSize;
    actualDataLength = Math.min(finalDataLength, maxDataLength);
    
    if (actualDataLength < finalDataLength) {
      console.log(`Audio truncated to ${((actualDataLength / finalDataLength) * 100).toFixed(0)}% of original length to meet size limit`);
    }
  }
  
  // Generate the appropriate format
  if (format === 'wav') {
    // WAV format generation
    // WAV header is 44 bytes
    const arrayBuffer = new ArrayBuffer(44 + actualDataLength);
    const view = new DataView(arrayBuffer);
    
    // Write WAV header - WhatsApp requires standard WAV format
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + actualDataLength, true);
    writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1 size (16 for PCM)
    view.setUint16(20, 1, true); // audio format (1 for PCM)
    view.setUint16(22, finalTargetChannels, true);
    view.setUint32(24, finalTargetSampleRate, true);
    view.setUint32(28, finalByteRate, true);
    view.setUint16(32, finalBlockAlign, true);
    view.setUint16(34, finalBitDepth, true);
    
    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, actualDataLength, true);
    
    // Extract channel data
    const channels = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    let offset = 44;
    let sample;
    
    // Calculate maximum samples we can include without exceeding the file size limit
    const maxSamples = Math.floor(actualDataLength / (finalTargetChannels * finalBytesPerSample));
    const samplesToProcess = Math.min(finalTargetLength, maxSamples);
    
    // Interleave and possibly resample channels
    for (let i = 0; i < samplesToProcess; i++) {
      // Source position for resampling (linear interpolation)
      const sourcePos = i / finalResampleRatio;
      const sourceIdx = Math.floor(sourcePos);
      const alpha = sourcePos - sourceIdx;
      
      // For each output channel
      for (let channel = 0; channel < finalTargetChannels; channel++) {
        // If converting to mono, average all input channels
        if (finalTargetChannels === 1 && buffer.numberOfChannels > 1) {
          let sum = 0;
          for (let inputChannel = 0; inputChannel < buffer.numberOfChannels; inputChannel++) {
            // Linear interpolation for resampling
            if (sourceIdx < channels[inputChannel].length - 1) {
              const sample1 = channels[inputChannel][sourceIdx];
              const sample2 = channels[inputChannel][sourceIdx + 1];
              sum += sample1 * (1 - alpha) + sample2 * alpha;
            } else if (sourceIdx < channels[inputChannel].length) {
              sum += channels[inputChannel][sourceIdx];
            }
          }
          sample = sum / buffer.numberOfChannels;
        } else {
          // Keep original channel, potentially with resampling
          const inputChannel = Math.min(channel, buffer.numberOfChannels - 1);
          
          // Linear interpolation for resampling
          if (sourceIdx < channels[inputChannel].length - 1) {
            const sample1 = channels[inputChannel][sourceIdx];
            const sample2 = channels[inputChannel][sourceIdx + 1];
            sample = sample1 * (1 - alpha) + sample2 * alpha;
          } else if (sourceIdx < channels[inputChannel].length) {
            sample = channels[inputChannel][sourceIdx];
          } else {
            sample = 0;
          }
        }
        
        // Clamp and convert to the appropriate integer format
        sample = Math.max(-1, Math.min(1, sample));
        
        // 16-bit WAV is signed
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }
    
    // Calculate the final size in MB
    const finalSizeMB = arrayBuffer.byteLength / (1024 * 1024);
    console.log(`Final WAV size: ${finalSizeMB.toFixed(2)}MB (target: ${maxSizeMB}MB)`);
    
    // Sanity check - file should never be larger than the limit if enforcement was enabled
    if (enforceLimit && finalSizeMB > maxSizeMB) {
      console.error(`ERROR: File size enforcement failed! Final size: ${finalSizeMB.toFixed(2)}MB, Target: ${maxSizeMB}MB`);
    }
    
    return new Uint8Array(arrayBuffer);
  } else {
    // For MP3 or OGG formats, we'll fall back to WAV format for now
    // In a real implementation, you'd use a proper encoder like lamejs for MP3
    // For now, we'll generate a 44.1kHz 16-bit WAV file which can be converted by the browser
    console.log(`Falling back to WAV format (16-bit, 44.1kHz) for WhatsApp compatibility`);
    
    // Create a new audio context with 44.1kHz sample rate
    const tempContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 44100
    });
    
    // Create a new buffer with the target parameters
    const tempBuffer = tempContext.createBuffer(
      Math.min(2, buffer.numberOfChannels), // Use stereo or mono
      Math.floor(buffer.duration * 44100),  // Calculate new length at 44.1kHz
      44100                                // Standard sample rate
    );
    
    // Copy and resample the data
    for (let channel = 0; channel < tempBuffer.numberOfChannels; channel++) {
      const inputChannel = Math.min(channel, buffer.numberOfChannels - 1);
      const inputData = buffer.getChannelData(inputChannel);
      const outputData = tempBuffer.getChannelData(channel);
      
      // Simple linear resampling
      for (let i = 0; i < outputData.length; i++) {
        const inputIdx = Math.floor(i * buffer.sampleRate / 44100);
        outputData[i] = inputData[Math.min(inputIdx, inputData.length - 1)];
      }
    }
    
    // Call ourselves recursively with the resampled buffer and WAV format
    return audioBufferToRawFormat(tempBuffer, {
      format: 'wav',
      enforceFileSizeLimit: enforceLimit,
      maxSizeMB: maxSizeMB
    });
  }
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
