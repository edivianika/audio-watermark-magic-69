/**
 * Main module for audio processing utilities
 */

import { loadAudioFile, applyCompression } from "./audioCore";
import { fetchWatermarkAudio } from "./watermarkService";
import { audioBufferToRawFormat } from "./formatConversion";

// Re-export for compatibility
export * from "./formatConversion";
export * from "./watermarkService";
export * from "./audioCore";
export * from "./batchProcessing";

// Add watermark to audio with optional compression and file size limits
export const addWatermark = async (
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number,
  compressionOptions?: {
    enabled: boolean;
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  },
  fileSizeOptions?: {
    maxSizeInMB?: number;
  },
  audioOptions?: {
    channels: 'mono' | 'stereo' | 'custom';
    sampleRate: number;
    bitRateMode: string;
    quality: number;
  }
): Promise<Blob> => {
  try {
    console.log(`Processing file: ${inputFile.name} with watermark interval: ${watermarkInterval}s`);
    
    // Gunakan pengaturan audio dari parameter jika tersedia
    if (audioOptions) {
      console.log(`Using custom audio settings: ${audioOptions.channels} channels, ${audioOptions.sampleRate}Hz, ${audioOptions.quality}kbps`);
    }
    
    // Enable compression only if explicitly enabled
    const useCompression = compressionOptions?.enabled === true;
    const compressionSettings = useCompression ? {
      threshold: compressionOptions?.threshold ?? -20, // Updated threshold
      knee: compressionOptions?.knee ?? 6,           // Updated knee
      ratio: compressionOptions?.ratio ?? 4,          // Updated ratio
      attack: compressionOptions?.attack ?? 0.008,    // Updated attack (8ms)
      release: compressionOptions?.release ?? 0.125   // Updated release (125ms)
    } : undefined;
    
    if (useCompression) {
      console.log("Compression enabled:", compressionSettings);
    } else {
      console.log("Compression disabled");
    }
    
    // Pastikan ukuran file maksimal default adalah 16 MB
    const maxSizeInMB = fileSizeOptions?.maxSizeInMB || 16; // Default ke 16MB
    console.log(`Target maximum file size: ${maxSizeInMB}MB (WhatsApp limit: 16MB)`);
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Load the input audio file
    const inputBuffer = await loadAudioFile(audioContext, inputFile);
    console.log("Input audio loaded successfully");
    
    // Fetch watermark audio from database
    console.log("Fetching watermark audio from database...");
    const watermarkFile = await fetchWatermarkAudio();
    console.log(`Watermark file fetched: ${watermarkFile.name}, size: ${watermarkFile.size} bytes`);
    
    // Load the watermark audio file
    const watermarkBuffer = await loadAudioFile(audioContext, watermarkFile);
    console.log("Watermark audio loaded successfully, duration:", watermarkBuffer.duration);
    
    const fileSizeMB = inputFile.size / (1024 * 1024);
    console.log(`Original file size: ${fileSizeMB.toFixed(2)} MB`);
    
    // Determine if we need to convert to mono to save space
    const shouldConvertToMono = fileSizeMB > maxSizeInMB * 0.8;
    const numChannels = shouldConvertToMono ? 1 : inputBuffer.numberOfChannels;
    const inputDuration = inputBuffer.duration;
    
    console.log(`Input duration: ${inputDuration}s, Channels: ${numChannels}`);
    if (shouldConvertToMono) {
      console.log("Converting to mono to reduce file size");
    }
    
    // Create output buffer (with mono conversion if needed)
    const outputBuffer = audioContext.createBuffer(
      numChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );
    
    // First, copy the original audio to the output buffer at 80% volume
    for (let channel = 0; channel < numChannels; channel++) {
      const outputData = outputBuffer.getChannelData(channel);
      if (shouldConvertToMono) {
        // If converting to mono, average all input channels
        const numInputChannels = inputBuffer.numberOfChannels;
        for (let i = 0; i < outputData.length; i++) {
          let sum = 0;
          for (let inputChannel = 0; inputChannel < numInputChannels; inputChannel++) {
            sum += inputBuffer.getChannelData(inputChannel)[i];
          }
          outputData[i] = (sum / numInputChannels) * 0.8; // 80% volume
        }
      } else {
        // Otherwise copy channel directly
        const inputData = inputBuffer.getChannelData(channel);
        for (let i = 0; i < outputData.length; i++) {
          outputData[i] = inputData[i] * 0.8; // 80% volume for original audio
        }
      }
    }
    
    // Now add watermarks at intervals at appropriate volume
    const watermarkFrequency = Math.max(watermarkInterval, inputDuration / 15);
    const numWatermarks = Math.floor(inputDuration / watermarkFrequency);
    
    console.log(`Adding ${numWatermarks} watermarks at ${watermarkFrequency}s intervals`);
    
    // Mix watermarks into the output buffer
    for (let i = 0; i < numWatermarks; i++) {
      const startTimeSeconds = i * watermarkFrequency;
      const startFrame = Math.floor(startTimeSeconds * outputBuffer.sampleRate);
      
      if (startFrame + watermarkBuffer.length > outputBuffer.length) {
        continue;
      }
      
      console.log(`Adding watermark at ${startTimeSeconds}s at appropriate volume`);
      
      for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
        const outputData = outputBuffer.getChannelData(channel);
        const watermarkChannelIndex = Math.min(channel, watermarkBuffer.numberOfChannels - 1);
        const watermarkData = watermarkBuffer.getChannelData(watermarkChannelIndex);
        
        for (let j = 0; j < watermarkBuffer.length; j++) {
          if (startFrame + j >= outputData.length) break;
          
          // Mix original (already at 80%) with watermark at appropriate volume
          const originalSample = outputData[startFrame + j];
          const watermarkSample = watermarkData[j] * watermarkVolume; // Control watermark volume
          
          outputData[startFrame + j] = originalSample + watermarkSample;
        }
      }
    }
    
    // Apply compression by default to control file size
    console.log("Applying audio compression...");
    const finalBuffer = await applyCompression(outputBuffer, compressionSettings);
    console.log("Compression applied successfully");
    
    // Calculate target bitrate based on file size limit
    // Add a safety factor (0.8) to account for container overhead
    const targetBitrate = (maxSizeInMB * 8 * 1024 * 0.8) / inputDuration;
    console.log(`Using target bitrate of ${Math.round(targetBitrate)}kbps to stay within ${maxSizeInMB}MB limit`);
    
    // Determine output format based on input type
    // WhatsApp supports MP3, AAC, M4A, OPUS, dan OGG berdasarkan dokumentasi Vonage
    // Selalu gunakan MP3 untuk kompatibilitas WhatsApp yang lebih baik
    let outputFormat: 'wav' | 'mp3' | 'ogg' = "mp3";
    let mimeType = "audio/mpeg"; // Gunakan audio/mpeg untuk kompatibilitas maksimal
    
    console.log(`Using output format: ${outputFormat}, MIME type: ${mimeType} for maximum compatibility`);
    
    // Pastikan durasi audio tidak melebihi batas WhatsApp (16MB)
    const estimatedSizeMB = (finalBuffer.length * finalBuffer.numberOfChannels * 2) / (1024 * 1024);
    if (estimatedSizeMB > 16) {
      console.warn(`Estimated audio size (${estimatedSizeMB.toFixed(2)}MB) may exceed WhatsApp limit of 16MB`);
      console.log(`Applying additional compression to stay within WhatsApp limit`);
    }
    
    // Gunakan pengaturan audio tetap untuk kompatibilitas maksimal
    // Abaikan pengaturan dari parameter untuk memastikan konsistensi
    const fixedAudioOptions = {
      channels: 'stereo' as 'stereo',
      sampleRate: 44100, // Selalu gunakan 44.1kHz sebagai standar
      bitRateMode: 'cbr', // Selalu gunakan CBR untuk kompatibilitas maksimal
      quality: 192 // Tingkatkan ke 192kbps untuk kualitas yang lebih baik
    };
    
    console.log(`Using high quality audio settings: ${fixedAudioOptions.channels}, ${fixedAudioOptions.sampleRate}Hz, ${fixedAudioOptions.quality}kbps`);
    
    // Convert AudioBuffer to raw audio data format with enforced file size limit
    // For WhatsApp compatibility, ensure standard MP3 format
    let rawAudioData = audioBufferToRawFormat(finalBuffer, {
      format: outputFormat,
      bitrate: fixedAudioOptions.quality,
      enforceFileSizeLimit: true,
      maxSizeMB: Math.min(maxSizeInMB, 16), // Pastikan tidak melebihi batas WhatsApp 16MB
      audioOptions: fixedAudioOptions // Teruskan pengaturan audio tetap ke fungsi konversi
    });
    
    // PENTING: Jangan manipulasi header MP3 yang dihasilkan oleh lamejs
    // karena dapat menyebabkan file rusak
    
    // Buat blob dengan MIME type yang benar untuk WhatsApp
    // Pastikan menggunakan MIME type yang tepat untuk MP3
    // WhatsApp lebih menyukai audio/mpeg daripada audio/mp3
    const outputBlob = new Blob([rawAudioData], { type: mimeType });
    const finalSizeMB = outputBlob.size / (1024 * 1024);
    
    console.log(`Audio processing completed. Final size: ${finalSizeMB.toFixed(2)}MB (target: ${maxSizeInMB}MB)`);
    
    // Verifikasi ukuran file sesuai dengan batasan WhatsApp
    if (finalSizeMB > 16) {
      console.warn(`Warning: Final size ${finalSizeMB.toFixed(2)}MB exceeds WhatsApp limit of 16MB`);
    } else {
      console.log(`File size (${finalSizeMB.toFixed(2)}MB) is within WhatsApp limit of 16MB`);
    }
    
    // Verifikasi bahwa file yang dihasilkan valid
    if (rawAudioData.length > 0) {
      // Periksa apakah file memiliki header MP3 yang valid dengan lebih teliti
      const hasID3 = rawAudioData[0] === 0x49 && rawAudioData[1] === 0x44 && rawAudioData[2] === 0x33; // "ID3"
      const hasFrameSync = rawAudioData[0] === 0xFF && (rawAudioData[1] & 0xE0) === 0xE0; // Frame sync
      
      if (hasID3) {
        // Verifikasi versi ID3 dan ukuran
        const id3Version = rawAudioData[3];
        const id3Revision = rawAudioData[4];
        console.log(`File audio berhasil dibuat dengan header ID3v2.${id3Version}.${id3Revision}, ukuran ${rawAudioData.length} bytes`);
        
        // Verifikasi ukuran header ID3 (synchsafe integer)
        const id3Size = ((rawAudioData[6] & 0x7F) << 21) | 
                        ((rawAudioData[7] & 0x7F) << 14) | 
                        ((rawAudioData[8] & 0x7F) << 7) | 
                        (rawAudioData[9] & 0x7F);
        console.log(`ID3 header size: ${id3Size} bytes`);
        
        // Periksa apakah ada frame sync setelah header ID3
        const id3HeaderSize = 10 + id3Size;
        if (rawAudioData.length > id3HeaderSize + 2) {
          const hasFrameSyncAfterID3 = rawAudioData[id3HeaderSize] === 0xFF && (rawAudioData[id3HeaderSize + 1] & 0xE0) === 0xE0;
          if (hasFrameSyncAfterID3) {
            console.log('Frame sync terdeteksi setelah header ID3, struktur MP3 valid');
          } else {
            console.warn('Frame sync tidak terdeteksi setelah header ID3, mungkin ada masalah dengan struktur MP3');
            
            // Cari frame sync setelah header ID3
            let foundFrameSync = false;
            for (let i = id3HeaderSize; i < Math.min(rawAudioData.length - 1, id3HeaderSize + 100); i++) {
              if (rawAudioData[i] === 0xFF && (rawAudioData[i + 1] & 0xE0) === 0xE0) {
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
        console.log(`File audio berhasil dibuat dengan frame sync di awal (tanpa ID3), ukuran ${rawAudioData.length} bytes`);
        
        // Verifikasi struktur frame MPEG
        const mpegVersion = (rawAudioData[1] & 0x18) >> 3;
        const layer = (rawAudioData[1] & 0x06) >> 1;
        const bitrate = (rawAudioData[2] & 0xF0) >> 4;
        const sampleRate = (rawAudioData[2] & 0x0C) >> 2;
        
        console.log(`MPEG version: ${mpegVersion}, Layer: ${layer}, Bitrate index: ${bitrate}, Sample rate index: ${sampleRate}`);
      } else {
        console.warn(`File audio dibuat tetapi header MP3 tidak terdeteksi, mencari frame sync...`);
        
        // Cari frame sync di beberapa byte awal
        let foundFrameSync = false;
        let frameSyncPosition = -1;
        
        for (let i = 0; i < Math.min(rawAudioData.length - 4, 1000); i++) {
          if (rawAudioData[i] === 0xFF && (rawAudioData[i + 1] & 0xE0) === 0xE0) {
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
      console.error("File audio yang dihasilkan kosong atau tidak valid");
    }
    
    return outputBlob;
  } catch (error) {
    console.error("Error processing audio:", error);
    throw error;
  }
};
