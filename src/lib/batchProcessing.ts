
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
    threshold: compressionOptions?.threshold ?? -20, // -20dB threshold
    knee: compressionOptions?.knee ?? 6,            // 6dB knee
    ratio: compressionOptions?.ratio ?? 4,          // 4:1 ratio
    attack: compressionOptions?.attack ?? 0.008,    // 8ms attack
    release: compressionOptions?.release ?? 0.125   // 125ms release
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
      // Simple suffix for processed files
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
