
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
  watermarkInterval: number,
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
  }
): Promise<{name: string, url: string, size: string}[]> => {
  const results = [];
  
  // Set default max file size to 16MB if not specified and always enable by default
  const maxFileSizeMB = fileSizeOptions?.maxFileSizeMB || 16;
  console.log(`Target maximum file size: ${maxFileSizeMB}MB`);
  
  // Always enable compression by default unless explicitly disabled
  const useCompression = compressionOptions?.enabled !== false;
  const finalCompressionOptions = useCompression ? {
    enabled: true,
    threshold: compressionOptions?.threshold ?? -20, // Updated from -30 to -20
    knee: compressionOptions?.knee ?? 6,            // Updated from 10 to 6
    ratio: compressionOptions?.ratio ?? 4,          // Updated from 6 to 4
    attack: compressionOptions?.attack ?? 0.008,    // Updated from 0.003 to 0.008
    release: compressionOptions?.release ?? 0.125   // Updated from 0.25 to 0.125
  } : { enabled: false };
  
  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      console.log(`Batch processing file ${i + 1} of ${files.length}: ${file.name}`);
      console.log(`Target maximum file size: ${maxFileSizeMB}MB`);
      
      progressCallback(i, files.length);
      
      // Pass the file size limit to the watermark function
      const outputBlob = await addWatermark(
        file,
        watermarkVolume,
        watermarkInterval,
        finalCompressionOptions,
        { maxSizeInMB: maxFileSizeMB }
      );
      
      // Get the final size after processing
      const finalSizeMB = outputBlob.size / (1024 * 1024);
      console.log(`Final output size: ${finalSizeMB.toFixed(2)}MB`);
      
      // Verify the output size is within limit
      if (finalSizeMB > maxFileSizeMB) {
        console.warn(`Warning: Output file size (${finalSizeMB.toFixed(2)}MB) exceeds the target limit (${maxFileSizeMB}MB)`);
      }
      
      const originalName = file.name;
      const extension = originalName.split('.').pop();
      const nameWithoutExt = originalName.slice(0, originalName.lastIndexOf('.'));
      // Modified to use _trial_version instead of longer suffix
      const outputFilename = `${nameWithoutExt}_trial_version.${extension}`;
      
      const url = URL.createObjectURL(outputBlob);
      
      results.push({
        name: outputFilename,
        url: url,
        size: `${finalSizeMB.toFixed(2)} MB`
      });
      
    } catch (error) {
      console.error(`Error processing file ${files[i].name}:`, error);
    }
  }
  
  progressCallback(files.length, files.length);
  
  return results;
};
