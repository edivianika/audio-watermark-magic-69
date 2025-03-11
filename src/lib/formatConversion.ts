
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
  const duration = buffer.duration;
  const maxSizeMB = options?.maxSizeMB || 16;
  const enforceLimit = options?.enforceFileSizeLimit !== false;
  
  // Calculate required bitrate based on maximum file size and duration
  // Formula: bitrate = (file size in bits) / duration in seconds
  // 1 MB = 8 * 1024 * 1024 bits
  const maxBitsTotal = maxSizeMB * 8 * 1024 * 1024;
  const requiredBitrate = enforceLimit ? Math.floor(maxBitsTotal / duration) : 128 * 1024;
  
  // Determine how many bits per sample we can use
  // For stereo audio, divide by 2 (channels)
  const bitsPerSamplePerChannel = Math.floor(requiredBitrate / (sampleRate * numChannels));
  
  // Convert to bytes (8 bits per byte), use lower value for more compression
  // Ensure minimum of 8 bits (1 byte) and maximum of 16 bits (2 bytes)
  let bitDepth = Math.min(16, Math.max(8, Math.floor(bitsPerSamplePerChannel / 8) * 8));
  
  console.log(`File size enforcement: ${enforceLimit ? 'enabled' : 'disabled'}`);
  console.log(`Target max size: ${maxSizeMB}MB, Duration: ${duration.toFixed(2)}s`);
  console.log(`Required bitrate: ${Math.round(requiredBitrate/1024)}kbps, Using bit depth: ${bitDepth}-bit`);
  
  // For very large files or long durations, we may need to reduce to mono and/or downsample
  let targetSampleRate = sampleRate;
  let targetChannels = numChannels;
  
  // If we're still over the limit with minimum bit depth, use mono instead of stereo
  if (enforceLimit && bitDepth === 8 && numChannels > 1 && (bitDepth * targetSampleRate * numChannels) > requiredBitrate) {
    targetChannels = 1;
    console.log('Converting to mono to reduce file size');
  }
  
  // If we're still over the limit, reduce the sample rate (quality will suffer)
  if (enforceLimit && bitDepth === 8 && targetChannels === 1 && (bitDepth * targetSampleRate) > requiredBitrate) {
    // Find a reasonable sample rate that meets our bitrate requirements
    // Common values: 44100, 22050, 11025, 8000
    const originalSampleRate = targetSampleRate;
    
    if (requiredBitrate < 8000 * 8) {
      targetSampleRate = 8000;
    } else if (requiredBitrate < 11025 * 8) {
      targetSampleRate = 11025;
    } else if (requiredBitrate < 22050 * 8) {
      targetSampleRate = 22050;
    } else if (sampleRate > 44100 && requiredBitrate < 44100 * 8) {
      targetSampleRate = 44100;
    }
    
    if (targetSampleRate !== originalSampleRate) {
      console.log(`Reducing sample rate from ${originalSampleRate}Hz to ${targetSampleRate}Hz to meet size limit`);
    }
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
  const estimatedSizeBytes = 44 + dataLength; // 44 bytes for WAV header
  const estimatedSizeMB = estimatedSizeBytes / (1024 * 1024);
  
  // Additional compression steps if we're still over the limit
  let finalBitDepth = bitDepth;
  let finalTargetSampleRate = targetSampleRate;
  let finalTargetChannels = targetChannels;
  let finalResampleRatio = resampleRatio;
  
  if (enforceLimit && estimatedSizeMB > maxSizeMB) {
    console.log(`Estimated size ${estimatedSizeMB.toFixed(2)}MB still exceeds limit, applying more aggressive compression...`);
    
    // Force to mono if not already
    if (finalTargetChannels > 1) {
      finalTargetChannels = 1;
      console.log('Forcing mono conversion to reduce file size');
    }
    
    // Force bit depth to minimum
    finalBitDepth = 8;
    console.log('Using minimum bit depth (8-bit) to reduce file size');
    
    // Reduce sample rate more aggressively if needed
    if (estimatedSizeMB > maxSizeMB * 1.5) {
      if (finalTargetSampleRate > 22050) {
        finalTargetSampleRate = 22050;
      } else if (finalTargetSampleRate > 11025) {
        finalTargetSampleRate = 11025;
      } else if (finalTargetSampleRate > 8000) {
        finalTargetSampleRate = 8000;
      }
      
      finalResampleRatio = finalTargetSampleRate / sampleRate;
      console.log(`Further reducing sample rate to ${finalTargetSampleRate}Hz to meet size limit`);
    }
    
    // Recalculate data length with more aggressive settings
    const finalTargetLength = Math.floor(buffer.length * finalResampleRatio);
    const finalDataLength = finalTargetLength * finalTargetChannels * (finalBitDepth / 8);
    const finalEstimatedSizeBytes = 44 + finalDataLength;
    const finalEstimatedSizeMB = finalEstimatedSizeBytes / (1024 * 1024);
    
    console.log(`After aggressive compression, estimated size: ${finalEstimatedSizeMB.toFixed(2)}MB`);
    
    // If still over limit, we'll need to truncate the audio
    if (enforceLimit && finalEstimatedSizeMB > maxSizeMB) {
      const maxSamples = Math.floor((maxSizeMB * 1024 * 1024 - 44) / (finalTargetChannels * (finalBitDepth / 8)));
      const originalDuration = buffer.duration;
      const truncatedDuration = (maxSamples / finalTargetSampleRate);
      const truncatedPercent = Math.round((1 - truncatedDuration / originalDuration) * 100);
      
      console.log(`WARNING: File will be truncated by approximately ${truncatedPercent}% to meet size limit`);
      console.log(`Original duration: ${originalDuration.toFixed(2)}s, Truncated to: ${truncatedDuration.toFixed(2)}s`);
    }
  } else {
    finalBitDepth = bitDepth;
    finalTargetSampleRate = targetSampleRate;
    finalTargetChannels = targetChannels;
    finalResampleRatio = resampleRatio;
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
    const maxDataLength = Math.floor(maxSizeMB * 1024 * 1024) - 44; // Subtract WAV header size
    actualDataLength = Math.min(finalDataLength, maxDataLength);
    
    if (actualDataLength < finalDataLength) {
      console.log(`Audio truncated to ${((actualDataLength / finalDataLength) * 100).toFixed(0)}% of original length to meet size limit`);
    }
  }
  
  // WAV header is 44 bytes
  const arrayBuffer = new ArrayBuffer(44 + actualDataLength);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
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
  for (let i = 0; i < numChannels; i++) {
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
      if (finalTargetChannels === 1 && numChannels > 1) {
        let sum = 0;
        for (let inputChannel = 0; inputChannel < numChannels; inputChannel++) {
          // Linear interpolation for resampling
          if (sourceIdx < channels[inputChannel].length - 1) {
            const sample1 = channels[inputChannel][sourceIdx];
            const sample2 = channels[inputChannel][sourceIdx + 1];
            sum += sample1 * (1 - alpha) + sample2 * alpha;
          } else if (sourceIdx < channels[inputChannel].length) {
            sum += channels[inputChannel][sourceIdx];
          }
        }
        sample = sum / numChannels;
      } else {
        // Keep original channel, potentially with resampling
        const inputChannel = Math.min(channel, numChannels - 1);
        
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
      
      if (finalBitDepth === 8) {
        // 8-bit WAV is unsigned
        sample = (sample * 0.5 + 0.5) * 255;
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
  
  // Calculate the final size in MB
  const finalSizeMB = arrayBuffer.byteLength / (1024 * 1024);
  console.log(`Final WAV size: ${finalSizeMB.toFixed(2)}MB (target: ${maxSizeMB}MB)`);
  
  // Sanity check - file should never be larger than the limit if enforcement was enabled
  if (enforceLimit && finalSizeMB > maxSizeMB) {
    console.error(`ERROR: File size enforcement failed! Final size: ${finalSizeMB.toFixed(2)}MB, Target: ${maxSizeMB}MB`);
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
