/**
 * Batch processing utilities
 */

import { addWatermark } from "./audioUtils";

// Generate a unique filename
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  return `watermarked_${timestamp}_${randomString}.${extension}`;
};

// Process multiple files with a watermark and optional compression
export const processBatch = async (
  files: File[],
  watermarkVolume: number,
  watermarkInterval: number = 10, // Default interval 10 detik
  progressCallback: (current: number, total: number) => void,
  compressionOptions?: {
    enabled: boolean;
    threshold?: number;
    knee?: number;
    ratio?: number;
    attack?: number;
    release?: number;
  },
  fileSizeOptions?: {
    enabled: boolean;
    maxFileSizeMB?: number;
  },
  audioOptions?: {
    channels: 'mono' | 'stereo' | 'custom';
    sampleRate: number;
    bitRateMode: string;
    quality: number;
  }
): Promise<{ name: string; url: string; size: string }[]> => {
  const results: { name: string; url: string; size: string }[] = [];
  
  // Set default max file size to 16MB if not specified and always enable by default
  // WhatsApp memiliki batas ukuran file 16MB
  const maxFileSizeMB = Math.min(fileSizeOptions?.maxFileSizeMB || 16, 16);
  console.log(`Target maximum file size: ${maxFileSizeMB}MB (WhatsApp limit: 16MB)`);
  
  // Always enable compression by default unless explicitly disabled
  const useCompression = compressionOptions?.enabled === true;
  const finalCompressionOptions = useCompression ? {
    enabled: true,
    threshold: compressionOptions?.threshold ?? -20, // -20dB threshold
    knee: compressionOptions?.knee ?? 6,            // 6dB knee
    ratio: compressionOptions?.ratio ?? 4,          // 4:1 ratio
    attack: compressionOptions?.attack ?? 0.008,    // 8ms attack
    release: compressionOptions?.release ?? 0.125   // 125ms release
  } : { enabled: false };
  
  // Gunakan pengaturan audio standar untuk kompatibilitas maksimal
  const standardAudioOptions = {
    channels: audioOptions?.channels || 'stereo',
    sampleRate: audioOptions?.sampleRate || 44100, // Gunakan 44.1kHz sebagai standar
    bitRateMode: audioOptions?.bitRateMode || 'cbr', // Gunakan CBR untuk kompatibilitas maksimal
    quality: audioOptions?.quality || 128 // Gunakan 128kbps sebagai standar
  };
  
  console.log(`Using standard audio settings for batch processing: ${standardAudioOptions.channels}, ${standardAudioOptions.sampleRate}Hz, ${standardAudioOptions.quality}kbps`);
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    progressCallback(i, files.length);
    
    try {
      console.log(`Processing batch file ${i + 1} of ${files.length}: ${file.name}`);
      const originalSize = (file.size / 1024 / 1024).toFixed(2);
      
      const outputBlob = await addWatermark(
        file,
        watermarkVolume,
        watermarkInterval,
        compressionOptions,
        { maxSizeInMB: fileSizeOptions?.enabled ? fileSizeOptions.maxFileSizeMB : undefined },
        standardAudioOptions // Gunakan pengaturan audio standar
      );
      
      // Get the final size after processing
      const finalSizeMB = outputBlob.size / (1024 * 1024);
      console.log(`Final output size: ${finalSizeMB.toFixed(2)}MB`);
      
      // Verify the output size is within limit
      if (finalSizeMB > 16) {
        console.warn(`Warning: Output file size (${finalSizeMB.toFixed(2)}MB) exceeds WhatsApp limit of 16MB`);
      } else {
        console.log(`File size (${finalSizeMB.toFixed(2)}MB) is within WhatsApp limit of 16MB`);
      }
      
      const originalName = file.name;
      // Selalu gunakan ekstensi MP3 untuk kompatibilitas WhatsApp
      const nameWithoutExt = originalName.split('.')[0];
      const outputFilename = `${nameWithoutExt}_trial_version.mp3`;
      
      // Buat URL dengan MIME type yang benar untuk WhatsApp
      // Pastikan menggunakan MIME type yang tepat untuk MP3 (audio/mpeg)
      // PENTING: Jangan membuat Blob baru karena dapat merusak header MP3
      const url = URL.createObjectURL(outputBlob);
      
      // Verifikasi bahwa file yang dihasilkan valid
      if (outputBlob.size > 0) {
        // Buat array buffer dari blob untuk memeriksa header
        const arrayBuffer = await outputBlob.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        
        if (data.length > 10) {
          // Periksa header ID3 atau frame sync
          const hasID3 = data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33; // "ID3"
          const hasFrameSync = data[0] === 0xFF && (data[1] & 0xE0) === 0xE0; // Frame sync
          
          if (hasID3) {
            // Verifikasi versi ID3
            const id3Version = data[3];
            const id3Revision = data[4];
            console.log(`File batch ${i+1} berhasil dibuat dengan header ID3v2.${id3Version}.${id3Revision}, ukuran ${outputBlob.size} bytes`);
            
            // Verifikasi ukuran header ID3 (synchsafe integer)
            const id3Size = ((data[6] & 0x7F) << 21) | 
                            ((data[7] & 0x7F) << 14) | 
                            ((data[8] & 0x7F) << 7) | 
                            (data[9] & 0x7F);
            console.log(`ID3 header size: ${id3Size} bytes`);
            
            // Periksa apakah ada frame sync setelah header ID3
            const id3HeaderSize = 10 + id3Size;
            if (data.length > id3HeaderSize + 2) {
              const hasFrameSyncAfterID3 = data[id3HeaderSize] === 0xFF && (data[id3HeaderSize + 1] & 0xE0) === 0xE0;
              if (hasFrameSyncAfterID3) {
                console.log(`File batch ${i+1}: Frame sync terdeteksi setelah header ID3, struktur MP3 valid`);
              } else {
                console.warn(`File batch ${i+1}: Frame sync tidak terdeteksi setelah header ID3, mungkin ada masalah dengan struktur MP3`);
              }
            }
          } else if (hasFrameSync) {
            console.log(`File batch ${i+1} berhasil dibuat dengan frame sync di awal, ukuran ${outputBlob.size} bytes`);
            
            // Verifikasi struktur frame MPEG
            const mpegVersion = (data[1] & 0x18) >> 3;
            const layer = (data[1] & 0x06) >> 1;
            const bitrate = (data[2] & 0xF0) >> 4;
            const sampleRate = (data[2] & 0x0C) >> 2;
            
            console.log(`MPEG version: ${mpegVersion}, Layer: ${layer}, Bitrate index: ${bitrate}, Sample rate index: ${sampleRate}`);
          } else {
            console.warn(`File batch ${i+1}: Header MP3 tidak terdeteksi, mencari frame sync...`);
            
            // Cari frame sync di beberapa byte awal
            let foundFrameSync = false;
            let frameSyncPosition = -1;
            
            for (let j = 0; j < Math.min(data.length - 4, 1000); j++) {
              if (data[j] === 0xFF && (data[j + 1] & 0xE0) === 0xE0) {
                foundFrameSync = true;
                frameSyncPosition = j;
                break;
              }
            }
            
            if (foundFrameSync) {
              console.log(`File batch ${i+1}: Frame sync ditemukan pada offset ${frameSyncPosition}, file mungkin masih bisa diputar`);
            } else {
              console.warn(`File batch ${i+1}: Tidak ditemukan header MP3 yang valid, file mungkin tidak kompatibel`);
            }
          }
        } else {
          console.warn(`File batch ${i+1}: Data terlalu pendek untuk menjadi MP3 yang valid`);
        }
      } else {
        console.error(`File batch ${i+1} yang dihasilkan kosong atau tidak valid`);
      }
      
      results.push({
        name: outputFilename,
        url: url,
        size: `${finalSizeMB.toFixed(2)} MB${finalSizeMB > 16 ? ' (exceeds WhatsApp limit)' : ''}`
      });
      
    } catch (error) {
      console.error(`Error processing file ${file.name}:`, error);
    }
  }
  
  progressCallback(files.length, files.length);
  return results;
};
