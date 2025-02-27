
/**
 * Utility functions for audio processing
 */
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { watermarkBase64 } from "./watermarkBase64";

// Load FFmpeg
export const loadFFmpeg = async () => {
  const ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  
  return ffmpeg;
};

// Convert base64 to file
export const base64ToFile = async (base64String: string, filename: string) => {
  const res = await fetch(base64String);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
};

// Add watermark to audio
export const addWatermark = async (
  ffmpeg: FFmpeg,
  inputFile: File,
  watermarkVolume: number,
  watermarkInterval: number
): Promise<Blob> => {
  try {
    // Write input file to memory
    await ffmpeg.writeFile("input.mp3", await fetchFile(inputFile));
    
    // Write watermark file to memory
    const watermarkFile = await base64ToFile(watermarkBase64, "watermark.mp3");
    await ffmpeg.writeFile("watermark.mp3", await fetchFile(watermarkFile));
    
    // Create filter complex command
    // This creates a loop of the main audio with the watermark inserted at specified intervals
    const filterComplex = `
      [0:a]asplit=2[a][b];
      [1:a]volume=${watermarkVolume}[watermark];
      [a]atrim=0:${watermarkInterval}[a1];
      [a1][watermark]acrossfade=d=0.5:c1=exp:c2=exp[watermarked];
      [watermarked][b]concat=n=2:v=0:a=1[out]
    `.replace(/\n\s+/g, '');
    
    // Execute the FFmpeg command
    await ffmpeg.exec([
      '-i', 'input.mp3',
      '-i', 'watermark.mp3',
      '-filter_complex', filterComplex,
      '-map', '[out]',
      'output.mp3'
    ]);
    
    // Read the output file
    const data = await ffmpeg.readFile('output.mp3');
    
    // Convert to blob and return
    return new Blob([data], { type: 'audio/mpeg' });
  } catch (error) {
    console.error("Error adding watermark:", error);
    throw error;
  }
};

// Generate a unique filename
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  return `watermarked_${timestamp}_${randomString}.${extension}`;
};
