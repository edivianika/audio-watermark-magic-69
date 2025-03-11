
import { addWatermark } from "./audioUtils";

// Generate a unique filename for processed audio files
export const generateUniqueFilename = (originalName: string, compressionEnabled: boolean = false, noiseReductionEnabled: boolean = false): string => {
  const extension = originalName.split('.').pop();
  const nameWithoutExt = originalName.slice(0, -(extension?.length || 0) - 1);
  
  // Add suffixes based on processing applied
  const processingSuffixes = [];
  if (compressionEnabled) processingSuffixes.push('Compressed');
  if (noiseReductionEnabled) processingSuffixes.push('NR');
  
  const suffixText = processingSuffixes.length > 0 ? '_' + processingSuffixes.join('_') : '';
  
  return `${nameWithoutExt}_Processed${suffixText}.${extension}`;
};

// Process multiple files in a batch
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
  maxSizeInMB: number = 16,
  noiseReductionOptions?: {
    enabled: boolean;
    strength?: number;
    preservation?: number;
  }
): Promise<{name: string, url: string, size: string}[]> => {
  const results: {name: string, url: string, size: string}[] = [];
  
  for (let i = 0; i < files.length; i++) {
    // Update progress
    progressCallback(i, files.length);
    
    const file = files[i];
    console.log(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
    
    // Process the file with watermark and optional compression
    const outputBlob = await addWatermark(
      file, 
      watermarkVolume, 
      watermarkInterval, 
      compressionOptions,
      maxSizeInMB,
      noiseReductionOptions
    );
    
    // Calculate file sizes
    const originalSize = (file.size / 1024 / 1024).toFixed(2);
    const processedSize = (outputBlob.size / 1024 / 1024).toFixed(2);
    const ratio = (file.size / outputBlob.size).toFixed(2);
    const sizeInfo = `${processedSize}MB (${ratio}x)`;
    
    console.log(`File ${i + 1}: Original: ${originalSize}MB, Processed: ${sizeInfo}`);
    
    // Generate output filename
    const outputFilename = generateUniqueFilename(
      file.name, 
      compressionOptions?.enabled || false,
      noiseReductionOptions?.enabled || false
    );
    
    // Create object URL for the processed file
    const url = URL.createObjectURL(outputBlob);
    
    // Add to results
    results.push({
      name: outputFilename,
      url: url,
      size: sizeInfo
    });
  }
  
  // Final progress update
  progressCallback(files.length, files.length);
  
  return results;
};
