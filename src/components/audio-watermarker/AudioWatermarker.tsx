import React, { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { processBatch } from "@/lib/batchProcessing";
import { addWatermark } from "@/lib/audioUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import FileUploader from "./FileUploader";
import ProcessingControls from "./ProcessingControls";
import ProcessedFilesList from "./ProcessedFilesList";

const AudioWatermarker: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [watermarkVolume, setWatermarkVolume] = useState<number>(0.3);
  const [watermarkInterval, setWatermarkInterval] = useState<number>(7);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [useBatchMode, setUseBatchMode] = useState<boolean>(true);
  const [processedFiles, setProcessedFiles] = useState<{name: string, url: string, size: string, isPlaying: boolean}[]>([]);
  
  const [compressionEnabled, setCompressionEnabled] = useState<boolean>(false);
  const [compressionThreshold, setCompressionThreshold] = useState<number>(-24);
  const [compressionKnee, setCompressionKnee] = useState<number>(30);
  const [compressionRatio, setCompressionRatio] = useState<number>(12);
  const [compressionAttack, setCompressionAttack] = useState<number>(0.003);
  const [compressionRelease, setCompressionRelease] = useState<number>(0.25);
  const [settingsTab, setSettingsTab] = useState("watermark");
  
  const [fileSizeLimitEnabled, setFileSizeLimitEnabled] = useState<boolean>(true);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState<number>(10);

  // Pengaturan audio untuk WhatsApp
  const [audioChannels, setAudioChannels] = useState<'mono' | 'stereo' | 'custom'>('stereo');
  const [audioSampleRate, setAudioSampleRate] = useState<number>(48000);
  const [audioBitRateMode, setAudioBitRateMode] = useState<string>('Average');
  const [audioQuality, setAudioQuality] = useState<number>(128);

  useEffect(() => {
    const savedFiles = localStorage.getItem('processedFiles');
    if (savedFiles) {
      try {
        setProcessedFiles(JSON.parse(savedFiles));
      } catch (e) {
        console.error('Error parsing saved files:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (processedFiles.length > 0) {
      localStorage.setItem('processedFiles', JSON.stringify(processedFiles));
    }
  }, [processedFiles]);

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
    
    if (useBatchMode) {
      setProcessedFiles([]);
    }
    
    const compressionOptions = {
      enabled: compressionEnabled,
      threshold: compressionThreshold,
      knee: compressionKnee,
      ratio: compressionRatio,
      attack: compressionAttack,
      release: compressionRelease
    };
    
    const fileSizeOptions = {
      enabled: fileSizeLimitEnabled,
      maxFileSizeMB: maxFileSizeMB
    };
    
    // Pengaturan audio untuk WhatsApp
    const audioOptions = {
      channels: audioChannels,
      sampleRate: audioSampleRate,
      bitRateMode: audioBitRateMode,
      quality: audioQuality
    };
    
    console.log("Menggunakan pengaturan audio:", audioOptions);

    try {
      if (useBatchMode) {
        const results = await processBatch(
          files,
          watermarkVolume,
          watermarkInterval,
          (current, total) => {
            const currentProgress = Math.round(((current) / total) * 100);
            setProgress(currentProgress);
          },
          compressionOptions,
          fileSizeOptions,
          audioOptions
        );
        
        const filesWithSize = results.map(file => {
          return {
            ...file,
            isPlaying: false
          };
        });
        
        setProcessedFiles(prev => [...prev, ...filesWithSize]);
        
        toast({
          title: "Batch Processing Complete",
          description: `Successfully processed ${results.length} file(s) with watermark${compressionEnabled ? ' and compression' : ''}`,
        });
      } else {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const currentProgress = Math.round(((i) / files.length) * 100);
          setProgress(currentProgress);

          console.log(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
          const originalSize = (file.size / 1024 / 1024).toFixed(2);
          
          const outputBlob = await addWatermark(
            file,
            watermarkVolume,
            watermarkInterval,
            compressionOptions,
            { maxSizeInMB: maxFileSizeMB },
            audioOptions
          );

          const compressedSize = (outputBlob.size / 1024 / 1024).toFixed(2);
          const compressionRatio = (file.size / outputBlob.size).toFixed(2);
          console.log(`Compression: ${originalSize}MB → ${compressedSize}MB (${compressionRatio}x)`);
          
          setFileSize(`Original: ${originalSize}MB, Processed: ${compressedSize}MB, Ratio: ${compressionRatio}x`);

          const originalName = file.name;
          const nameWithoutExt = originalName.split('.')[0];
          const outputFilename = `${nameWithoutExt}_trial_version.mp3`;

          // Gunakan MIME type yang benar untuk WhatsApp
          // WhatsApp lebih menyukai audio/mpeg daripada audio/mp3
          const url = URL.createObjectURL(outputBlob);
          
          const fileSizeMB = outputBlob.size / (1024 * 1024);
          if (fileSizeMB > 16) {
            console.warn(`Warning: File size ${fileSizeMB.toFixed(2)}MB exceeds WhatsApp limit of 16MB`);
            toast({
              title: "File Size Warning",
              description: `File size (${fileSizeMB.toFixed(2)}MB) exceeds WhatsApp limit of 16MB and may not be supported.`,
              variant: "destructive",
            });
          }
          
          setProcessedFiles(prev => [...prev, {
            name: outputFilename,
            url: url,
            size: `${compressedSize} MB${fileSizeMB > 16 ? ' (exceeds WhatsApp limit)' : ''}`,
            isPlaying: false
          }]);
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

  const clearFiles = () => {
    setFiles([]);
    setFileSize(null);
  };
  
  const clearProcessedFiles = () => {
    processedFiles.forEach(file => {
      URL.revokeObjectURL(file.url);
    });
    setProcessedFiles([]);
    localStorage.removeItem('processedFiles');
  };
  
  const fileUploaderProps = {
    files,
    setFiles,
    isProcessing,
    clearFiles,
    fileSizeLimitEnabled,
    maxFileSizeMB,
    toast,
    fileSize
  };
  
  const processingControlsProps = {
    isProcessing,
    progress,
    processFiles,
    files,
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
    showSettings,
    setShowSettings,
    audioChannels,
    setAudioChannels,
    audioSampleRate,
    setAudioSampleRate,
    audioBitRateMode,
    setAudioBitRateMode,
    audioQuality,
    setAudioQuality,
    toast
  };
  
  const processedFilesListProps = {
    processedFiles,
    setProcessedFiles,
    clearProcessedFiles
  };

  return (
    <div className="container mx-auto py-2 max-w-4xl">
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-2 mb-2">IndoMusika Compressor</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Add watermarks to your audio files with precise control over placement and compression
          </p>
        </div>

        <Separator className="my-4" />

        <FileUploader {...fileUploaderProps} />
        
        <ProcessedFilesList {...processedFilesListProps} />
        
        <ProcessingControls {...processingControlsProps} />
      </div>
    </div>
  );
};

export default AudioWatermarker;
