import React, { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { processBatch } from "@/lib/audioUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import FileUploader from "./FileUploader";
import ProcessingControls from "./ProcessingControls";
import ProcessedFilesList from "./ProcessedFilesList";

const AudioWatermarker: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [watermarkVolume, setWatermarkVolume] = useState(0.9);
  const [watermarkInterval, setWatermarkInterval] = useState(10);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [useBatchMode, setUseBatchMode] = useState(true);
  const [processedFiles, setProcessedFiles] = useState<{name: string, url: string, size: string, isPlaying: boolean}[]>([]);
  
  // Compression settings
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [compressionThreshold, setCompressionThreshold] = useState(-30);
  const [compressionRatio, setCompressionRatio] = useState(6);
  const [compressionKnee, setCompressionKnee] = useState(10);
  const [compressionAttack, setCompressionAttack] = useState(0.003);
  const [compressionRelease, setCompressionRelease] = useState(0.25);
  const [settingsTab, setSettingsTab] = useState("watermark");
  
  // File size limit settings
  const [fileSizeLimitEnabled, setFileSizeLimitEnabled] = useState(true);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(16);

  // Process files with watermark
  const processFiles = async () => {
    if (files.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one audio file to process",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setProcessedFiles([]);
    
    // Prepare compression options
    const compressionOptions = {
      enabled: compressionEnabled,
      threshold: compressionThreshold,
      knee: compressionKnee,
      ratio: compressionRatio,
      attack: compressionAttack,
      release: compressionRelease
    };
    
    // Prepare file size options
    const fileSizeOptions = {
      enabled: fileSizeLimitEnabled,
      maxFileSizeMB: maxFileSizeMB
    };

    try {
      if (useBatchMode) {
        // Process all files in batch
        const results = await processBatch(
          files,
          watermarkVolume,
          watermarkInterval,
          (current, total) => {
            const currentProgress = Math.round(((current) / total) * 100);
            setProgress(currentProgress);
          },
          compressionOptions,
          fileSizeOptions
        );
        
        // Store processed files for download with size information
        const filesWithSize = results.map(file => {
          return {
            ...file,
            isPlaying: false
          };
        });
        
        setProcessedFiles(filesWithSize);
        
        toast({
          title: "Batch Processing Complete",
          description: `Successfully processed ${results.length} file(s) with watermark${compressionEnabled ? ' and compression' : ''}`,
        });
      } else {
        // Process files one by one with immediate download
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const currentProgress = Math.round(((i) / files.length) * 100);
          setProgress(currentProgress);

          console.log(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
          const originalSize = (file.size / 1024 / 1024).toFixed(2);
          
          // Process file with our watermarking method and size limits
          const outputBlob = await addWatermark(
            file,
            watermarkVolume,
            watermarkInterval,
            compressionOptions,
            { maxSizeInMB: maxFileSizeMB }
          );

          const compressedSize = (outputBlob.size / 1024 / 1024).toFixed(2);
          const compressionRatio = (file.size / outputBlob.size).toFixed(2);
          console.log(`Compression: ${originalSize}MB → ${compressedSize}MB (${compressionRatio}x)`);
          
          // Update file size info for display
          setFileSize(`Original: ${originalSize}MB, Processed: ${compressedSize}MB, Ratio: ${compressionRatio}x`);

          // Generate the trial filename
          const originalName = file.name;
          const extension = originalName.split('.').pop();
          const nameWithoutExt = originalName.slice(0, -(extension?.length || 0) - 1);
          const trialFilename = `${nameWithoutExt}_Processed${compressionEnabled ? '_Compressed' : ''}.${extension}`;

          // Create download link
          const url = URL.createObjectURL(outputBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = trialFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        
        toast({
          title: "Processing Complete",
          description: `Successfully processed ${files.length} file(s)`,
        });
      }

      setProgress(100);
    } catch (error) {
      console.error("Error processing files:", error);
      toast({
        title: "Processing Failed",
        description: `An error occurred: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Clear all files
  const clearFiles = () => {
    setFiles([]);
    setProcessedFiles([]);
    setFileSize(null);
    
    // Clean up any object URLs to prevent memory leaks
    processedFiles.forEach(file => {
      URL.revokeObjectURL(file.url);
    });
  };
  
  // Settings for components
  const fileUploaderProps = {
    files,
    setFiles,
    isProcessing,
    clearFiles,
    fileSizeLimitEnabled,
    maxFileSizeMB,
    toast
  };
  
  const processingControlsProps = {
    isProcessing,
    progress,
    processFiles,
    files,
    useBatchMode,
    compressionEnabled,
    showSettings,
    setShowSettings,
    watermarkInterval,
    setWatermarkInterval,
    compressionEnabled,
    setCompressionEnabled,
    compressionThreshold,
    setCompressionThreshold,
    compressionRatio, 
    setCompressionRatio,
    compressionKnee,
    setCompressionKnee,
    compressionAttack,
    setCompressionAttack,
    compressionRelease,
    setCompressionRelease,
    fileSizeLimitEnabled,
    setFileSizeLimitEnabled,
    maxFileSizeMB,
    setMaxFileSizeMB,
    useBatchMode,
    setUseBatchMode,
    settingsTab,
    setSettingsTab,
    toast
  };
  
  const processedFilesListProps = {
    processedFiles,
    setProcessedFiles
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight mt-6 mb-2">Audio Watermark Magic</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Add watermarks to your audio files with precise control over placement and compression
          </p>
        </div>

        <Separator className="my-6" />

        <FileUploader {...fileUploaderProps} />
        
        <ProcessingControls {...processingControlsProps} />
      </div>
    </div>
  );
};

export default AudioWatermarker;
