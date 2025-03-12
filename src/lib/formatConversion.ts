/**
 * Audio format conversion utilities
 */

// Tambahkan deklarasi tipe untuk window.lamejs
declare global {
  interface Window {
    lamejs: any;
  }
}

// Convert AudioBuffer to raw audio format with options for bitrate and file size limits
export function audioBufferToRawFormat(
  buffer: AudioBuffer,
  options: {
    format: 'wav' | 'mp3' | 'ogg';
    bitrate?: number;
    enforceFileSizeLimit?: boolean;
    maxSizeMB?: number;
    audioOptions?: {
      channels?: 'mono' | 'stereo' | 'custom';
      sampleRate?: number;
      bitRateMode?: string;
      quality?: number;
    };
  }
): Uint8Array {
  const { format, bitrate = 128, enforceFileSizeLimit = false, maxSizeMB = 16, audioOptions } = options;
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;
  
  // Hitung ukuran file yang diharapkan (dalam MB)
  const estimatedSizeMB = (buffer.length * buffer.numberOfChannels * 2) / (1024 * 1024);
  console.log(`Estimated audio size: ${estimatedSizeMB.toFixed(2)}MB`);
  
  // Periksa apakah perlu membatasi ukuran file
  const enforceLimit = enforceFileSizeLimit !== false;
  
  // Menggunakan MP3 sebagai format default untuk kompatibilitas WhatsApp
  const formatDefault = options?.format || 'mp3';
  
  console.log(`Audio format conversion to ${formatDefault} format for WhatsApp compatibility`);
  
  // Calculate required bitrate based on maximum file size and duration
  // Formula: bitrate = (file size in bits) / duration in seconds
  // 1 MB = 8 * 1024 * 1024 bits
  const maxBitsTotal = maxSizeMB * 8 * 1024 * 1024;
  // Menggunakan bitrate yang lebih rendah untuk MP3 (128kbps adalah standar yang baik untuk WhatsApp)
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
    console.log(`Adjusting sample rate to 44.1kHz for better WhatsApp compatibility`);
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
  } else if (format === 'mp3') {
    // Gunakan parameter tetap untuk MP3 untuk memastikan kompatibilitas maksimal
    const mp3SampleRate = 44100;
    
    // Selalu gunakan stereo (2 channel) untuk MP3
    const mp3Channels: number = 2;
    
    // Tingkatkan bitrate untuk kualitas yang lebih baik (192kbps)
    const mp3Bitrate = 192;
    
    console.log(`Using high quality MP3 encoding parameters: ${mp3Channels} channels, ${mp3SampleRate}Hz, ${mp3Bitrate}kbps`);
    
    // Resample buffer jika perlu
    let processedBuffer = buffer;
    
    // Jika sample rate berbeda, lakukan resampling
    if (buffer.sampleRate !== mp3SampleRate) {
      console.log(`Resampling audio from ${buffer.sampleRate}Hz to ${mp3SampleRate}Hz for MP3 compatibility`);
      processedBuffer = resampleAudioBuffer(buffer, mp3SampleRate);
    }
    
    // Jika jumlah channel berbeda, konversi ke stereo
    if (buffer.numberOfChannels !== mp3Channels) {
      console.log(`Converting audio from ${buffer.numberOfChannels} channels to ${mp3Channels} channels for MP3 compatibility`);
      
      // Buat buffer baru dengan jumlah channel yang benar
      const stereoBuffer = new AudioBuffer({
        length: processedBuffer.length,
        numberOfChannels: mp3Channels,
        sampleRate: mp3SampleRate
      });
      
      if (buffer.numberOfChannels === 1 && mp3Channels === 2) {
        // Konversi mono ke stereo (duplikasi channel)
        const monoData = processedBuffer.getChannelData(0);
        stereoBuffer.copyToChannel(monoData, 0);
        stereoBuffer.copyToChannel(monoData, 1);
      } else if (buffer.numberOfChannels === 2 && mp3Channels === 1) {
        // Konversi stereo ke mono (rata-rata kedua channel)
        const left = processedBuffer.getChannelData(0);
        const right = processedBuffer.getChannelData(1);
        const mono = new Float32Array(processedBuffer.length);
        
        for (let i = 0; i < processedBuffer.length; i++) {
          mono[i] = (left[i] + right[i]) / 2;
        }
        
        stereoBuffer.copyToChannel(mono, 0);
      }
      
      processedBuffer = stereoBuffer;
    }
    
    // Konversi AudioBuffer ke MP3 menggunakan lamejs
    // Pastikan lamejs tersedia
    let Mp3Encoder;
    
    try {
      // Coba gunakan window.lamejs
      if (typeof window !== 'undefined' && window.lamejs && window.lamejs.Mp3Encoder) {
        Mp3Encoder = window.lamejs.Mp3Encoder;
        console.log("Menggunakan lamejs dari window global");
      } else {
        console.warn("lamejs tidak tersedia, menggunakan format WAV sebagai fallback");
        
        // Fallback ke WAV jika MP3 tidak tersedia
        return audioBufferToRawFormat(buffer, {
          ...options,
          format: 'wav'
        });
      }
    } catch (error) {
      console.error("Error saat mengakses lamejs:", error);
      
      // Fallback ke WAV jika MP3 tidak tersedia
      console.warn("Fallback ke format WAV karena lamejs tidak tersedia");
      return audioBufferToRawFormat(buffer, {
        ...options,
        format: 'wav'
      });
    }
    
    const mp3encoder = new Mp3Encoder(mp3Channels, mp3SampleRate, mp3Bitrate);
    
    // Ekstrak data dari AudioBuffer
    const channels: Float32Array[] = [];
    for (let i = 0; i < processedBuffer.numberOfChannels; i++) {
      channels.push(processedBuffer.getChannelData(i));
    }
    
    // Konversi Float32Array ke Int16Array untuk lamejs
    const sampleBlockSize = 1152;
    const mp3Data: Int8Array[] = [];
    const samplesLeft = new Int16Array(sampleBlockSize);
    const samplesRight = new Int16Array(sampleBlockSize);
    
    for (let i = 0; i < channels[0].length; i += sampleBlockSize) {
      for (let j = 0; j < sampleBlockSize; j++) {
        if (i + j < channels[0].length) {
          samplesLeft[j] = channels[0][i + j] * 32767;
          samplesRight[j] = channels.length > 1 ? channels[1][i + j] * 32767 : samplesLeft[j];
        } else {
          samplesLeft[j] = 0;
          samplesRight[j] = 0;
        }
      }
      
      let mp3buf;
      if (mp3Channels === 2) {
        mp3buf = mp3encoder.encodeBuffer(samplesLeft, samplesRight);
      } else {
        mp3buf = mp3encoder.encodeBuffer(samplesLeft);
      }
      
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    
    // Gabungkan semua chunk MP3
    let totalLength = 0;
    for (let i = 0; i < mp3Data.length; i++) {
      totalLength += mp3Data[i].length;
    }
    
    const mp3Output = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < mp3Data.length; i++) {
      mp3Output.set(mp3Data[i], offset);
      offset += mp3Data[i].length;
    }
    
    // Verifikasi header MP3
    if (mp3Output.length > 10) {
      const hasID3 = mp3Output[0] === 0x49 && mp3Output[1] === 0x44 && mp3Output[2] === 0x33; // "ID3"
      const hasFrameSync = mp3Output[0] === 0xFF && (mp3Output[1] & 0xE0) === 0xE0; // Frame sync
      
      if (hasID3) {
        console.log('MP3 header terdeteksi: ID3 tag ditemukan');
        
        // Verifikasi versi ID3 dan ukuran
        const id3Version = mp3Output[3];
        const id3Revision = mp3Output[4];
        console.log(`ID3v2.${id3Version}.${id3Revision} header terdeteksi`);
        
        // Verifikasi ukuran header ID3 (synchsafe integer)
        const id3Size = ((mp3Output[6] & 0x7F) << 21) | 
                        ((mp3Output[7] & 0x7F) << 14) | 
                        ((mp3Output[8] & 0x7F) << 7) | 
                        (mp3Output[9] & 0x7F);
        console.log(`ID3 header size: ${id3Size} bytes`);
        
        // Periksa apakah ada frame sync setelah header ID3
        const id3HeaderSize = 10 + id3Size;
        if (mp3Output.length > id3HeaderSize + 2) {
          const hasFrameSyncAfterID3 = mp3Output[id3HeaderSize] === 0xFF && (mp3Output[id3HeaderSize + 1] & 0xE0) === 0xE0;
          if (hasFrameSyncAfterID3) {
            console.log('Frame sync terdeteksi setelah header ID3, struktur MP3 valid');
          } else {
            console.warn('Frame sync tidak terdeteksi setelah header ID3, mungkin ada masalah dengan struktur MP3');
            
            // Cari frame sync setelah header ID3
            let foundFrameSync = false;
            for (let i = id3HeaderSize; i < Math.min(mp3Output.length - 1, id3HeaderSize + 100); i++) {
              if (mp3Output[i] === 0xFF && (mp3Output[i + 1] & 0xE0) === 0xE0) {
                console.log(`Frame sync ditemukan pada offset ${i} (${i - id3HeaderSize} bytes setelah header ID3)`);
                foundFrameSync = true;
                break;
              }
            }
            
            if (!foundFrameSync) {
              console.error("Tidak ditemukan frame sync setelah header ID3, file mungkin rusak");
            }
          }
        }
      } else if (hasFrameSync) {
        console.log('MP3 header terdeteksi: Frame sync ditemukan di awal (tanpa ID3)');
        
        // Verifikasi struktur frame MPEG
        const mpegVersion = (mp3Output[1] & 0x18) >> 3;
        const layer = (mp3Output[1] & 0x06) >> 1;
        const bitrate = (mp3Output[2] & 0xF0) >> 4;
        const sampleRate = (mp3Output[2] & 0x0C) >> 2;
        
        console.log(`MPEG version: ${mpegVersion}, Layer: ${layer}, Bitrate index: ${bitrate}, Sample rate index: ${sampleRate}`);
      } else {
        console.warn('MP3 header tidak terdeteksi, mencari frame sync...');
        
        // Cari frame sync di beberapa byte awal
        let foundFrameSync = false;
        let frameSyncPosition = -1;
        
        for (let i = 0; i < Math.min(mp3Output.length - 4, 100); i++) {
          if (mp3Output[i] === 0xFF && (mp3Output[i + 1] & 0xE0) === 0xE0) {
            foundFrameSync = true;
            frameSyncPosition = i;
            break;
          }
        }
        
        if (foundFrameSync) {
          console.log(`Frame sync ditemukan pada offset ${frameSyncPosition}, file mungkin masih bisa diputar`);
        } else {
          console.error("Tidak ditemukan frame sync MP3, file mungkin rusak");
        }
      }
    } else {
      console.error("File MP3 yang dihasilkan terlalu kecil, mungkin rusak");
    }
    
    return mp3Output;
  } else {
    // Untuk format OGG atau lainnya, kita akan fallback ke MP3 atau WAV
    console.log(`Format ${formatDefault} tidak didukung langsung, menggunakan MP3 untuk kompatibilitas WhatsApp`);
    
    // Rekursif panggil diri sendiri dengan format MP3
    return audioBufferToRawFormat(buffer, {
      ...options,
      format: 'mp3'
    });
  }
}

// Helper function to write a string to a DataView
export const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

// Fungsi untuk memastikan file MP3 memiliki header yang valid
export const ensureValidMp3Header = (data: Uint8Array): Uint8Array => {
  // Periksa apakah data sudah memiliki header MP3 yang valid
  if (data.length < 10) {
    console.warn('Data MP3 terlalu pendek, mungkin rusak');
    return data; // Return data asli jika terlalu pendek untuk diproses
  }

  // Periksa header ID3 atau frame sync dengan lebih teliti
  const hasID3 = data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33; // "ID3"
  
  // Periksa frame sync dengan lebih teliti (11 bit pertama harus 1)
  // Format frame sync: 11 bit pertama = 1, bit ke-12 = 0 (untuk MPEG version)
  const hasFrameSync = (data[0] === 0xFF && (data[1] & 0xE0) === 0xE0);
  
  // Periksa juga kemungkinan frame sync di beberapa byte awal
  // Kadang-kadang header ID3 tidak ada, tapi frame sync mungkin tidak tepat di awal
  let hasFrameSyncNearby = false;
  let frameSyncPosition = -1;
  for (let i = 0; i < Math.min(data.length - 1, 100); i++) {
    if (data[i] === 0xFF && (data[i + 1] & 0xE0) === 0xE0) {
      hasFrameSyncNearby = true;
      frameSyncPosition = i;
      break;
    }
  }
  
  if (hasID3) {
    console.log('MP3 header ID3 terdeteksi, tidak perlu modifikasi');
    return data;
  } else if (hasFrameSync) {
    console.log('MP3 frame sync terdeteksi di awal, tidak perlu modifikasi');
    return data;
  } else if (hasFrameSyncNearby) {
    console.log(`MP3 frame sync terdeteksi pada posisi ${frameSyncPosition}, tidak perlu modifikasi`);
    return data;
  }
  
  console.log('Header MP3 tidak terdeteksi, menambahkan header ID3v2.3 lengkap');
  
  // Buat header ID3v2.3 yang lebih lengkap dengan frame yang diperlukan
  // ID3v2.3 header: 10 bytes + frames
  
  // Tambahkan frame-frame yang diperlukan untuk kompatibilitas maksimal
  // 1. TIT2 (Judul)
  const titleText = "Audio Watermark";
  // 2. TPE1 (Artis)
  const artistText = "Indo Musika";
  // 3. TALB (Album)
  const albumText = "Audio Watermark";
  // 4. TYER (Tahun)
  const yearText = new Date().getFullYear().toString();
  // 5. TCON (Genre)
  const genreText = "Other";
  
  // Hitung ukuran frame untuk setiap frame
  // Format frame: 10 byte header + 1 byte encoding + text
  const titleFrameSize = 10 + 1 + titleText.length;
  const artistFrameSize = 10 + 1 + artistText.length;
  const albumFrameSize = 10 + 1 + albumText.length;
  const yearFrameSize = 10 + 1 + yearText.length;
  const genreFrameSize = 10 + 1 + genreText.length;
  
  // Total ukuran semua frame
  const totalFramesSize = titleFrameSize + artistFrameSize + albumFrameSize + yearFrameSize + genreFrameSize;
  
  // Total header size: 10 (ID3 header) + totalFramesSize
  const totalHeaderSize = 10 + totalFramesSize;
  
  // Buat buffer baru dengan header
  const result = new Uint8Array(totalHeaderSize + data.length);
  
  // "ID3" signature
  result[0] = 0x49; // 'I'
  result[1] = 0x44; // 'D'
  result[2] = 0x33; // '3'
  
  // Version 2.3.0
  result[3] = 3;
  result[4] = 0;
  
  // Flags (no flags set)
  result[5] = 0;
  
  // Size (synchsafe integer - setiap byte hanya menggunakan 7 bit)
  // Ukuran tidak termasuk header 10 byte
  const tagSize = totalFramesSize;
  result[6] = (tagSize >> 21) & 0x7F;
  result[7] = (tagSize >> 14) & 0x7F;
  result[8] = (tagSize >> 7) & 0x7F;
  result[9] = tagSize & 0x7F;
  
  let offset = 10; // Mulai setelah header ID3
  
  // Fungsi helper untuk menambahkan frame
  const addFrame = (frameId: string, text: string) => {
    // Frame ID (4 karakter)
    for (let i = 0; i < 4; i++) {
      result[offset + i] = frameId.charCodeAt(i);
    }
    
    // Frame size (non-synchsafe, 4 bytes)
    const frameContentSize = text.length + 1; // +1 untuk encoding byte
    result[offset + 4] = 0x00;
    result[offset + 5] = 0x00;
    result[offset + 6] = 0x00;
    result[offset + 7] = frameContentSize;
    
    // Frame flags (2 bytes, 0)
    result[offset + 8] = 0x00;
    result[offset + 9] = 0x00;
    
    // Text encoding (UTF-8)
    result[offset + 10] = 0x03;
    
    // Text content
    for (let i = 0; i < text.length; i++) {
      result[offset + 11 + i] = text.charCodeAt(i);
    }
    
    // Update offset
    offset += 11 + text.length;
  };
  
  // Tambahkan semua frame
  addFrame("TIT2", titleText);
  addFrame("TPE1", artistText);
  addFrame("TALB", albumText);
  addFrame("TYER", yearText);
  addFrame("TCON", genreText);
  
  // Salin data asli setelah header
  result.set(data, totalHeaderSize);
  
  console.log(`Header MP3 ID3v2.3 lengkap berhasil ditambahkan (${totalHeaderSize} bytes)`);
  return result;
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

// Fungsi untuk melakukan resampling audio buffer dengan kualitas yang lebih baik
function resampleAudioBuffer(sourceBuffer: AudioBuffer, targetSampleRate: number): AudioBuffer {
  const numChannels = sourceBuffer.numberOfChannels;
  const sourceSampleRate = sourceBuffer.sampleRate;
  const sourceLength = sourceBuffer.length;
  const targetLength = Math.round(sourceLength * targetSampleRate / sourceSampleRate);
  
  console.log(`Resampling audio from ${sourceSampleRate}Hz to ${targetSampleRate}Hz with high quality algorithm`);
  
  // Buat buffer baru dengan sample rate target
  const targetBuffer = new AudioBuffer({
    length: targetLength,
    numberOfChannels: numChannels,
    sampleRate: targetSampleRate
  });
  
  // Resample setiap channel dengan algoritma yang lebih baik
  for (let channel = 0; channel < numChannels; channel++) {
    const sourceData = sourceBuffer.getChannelData(channel);
    const targetData = targetBuffer.getChannelData(channel);
    
    // Gunakan cubic interpolation untuk kualitas yang lebih baik
    for (let i = 0; i < targetLength; i++) {
      const sourcePosition = i * sourceSampleRate / targetSampleRate;
      const sourceIndex = Math.floor(sourcePosition);
      const alpha = sourcePosition - sourceIndex;
      
      // Cubic interpolation membutuhkan 4 titik
      const y0 = sourceData[Math.max(0, sourceIndex - 1)] || 0;
      const y1 = sourceData[sourceIndex] || 0;
      const y2 = sourceData[Math.min(sourceLength - 1, sourceIndex + 1)] || 0;
      const y3 = sourceData[Math.min(sourceLength - 1, sourceIndex + 2)] || 0;
      
      // Cubic interpolation formula
      const c0 = y1;
      const c1 = 0.5 * (y2 - y0);
      const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
      const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
      
      // Compute interpolated value
      targetData[i] = ((c3 * alpha + c2) * alpha + c1) * alpha + c0;
      
      // Clamp to [-1, 1] untuk menghindari clipping
      targetData[i] = Math.max(-1, Math.min(1, targetData[i]));
    }
  }
  
  console.log(`Resampling completed: ${sourceLength} samples -> ${targetLength} samples`);
  return targetBuffer;
}
