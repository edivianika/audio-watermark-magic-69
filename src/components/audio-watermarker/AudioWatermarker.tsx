import React, { useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { processBatch } from "@/lib/batchProcessing";
import { addWatermark } from "@/lib/audioUtils";

import FileUploader from "./FileUploader";
import ProcessingControls from "./ProcessingControls";
import ProcessedFilesList from "./ProcessedFilesList";

const AudioWatermarker: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [watermarkVolume, setWatermarkVolume] = useState<number>(0.5);
  const [watermarkInterval, setWatermarkInterval] = useState<number>(5);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState({ current: 0, total: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [useBatchMode, setUseBatchMode] = useState<boolean>(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [processedFiles, setProcessedFiles] = useState<{name: string, url: string, size: string, isPlaying: boolean}[]>([]);
  const processingRef = useRef(false);
  const queuedFilesRef = useRef<File[]>([]);

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

  const clearProcessedFiles = () => {
    processedFiles.forEach(file => {
      URL.revokeObjectURL(file.url);
    });
    setProcessedFiles([]);
  };

  const processFiles = async (filesToProcess: File[] = files) => {
    if (filesToProcess.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one audio file to process",
        variant: "destructive",
      });
      return;
    }

    if (processingRef.current) {
      queuedFilesRef.current = [...queuedFilesRef.current, ...filesToProcess];
      setQueuedCount(queuedFilesRef.current.length);
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    let currentBatch = filesToProcess;
    let shouldResetResults = useBatchMode;

    try {
      while (currentBatch.length > 0) {
        setProgress(0);
        setProcessingStatus({ current: 1, total: currentBatch.length });
        if (shouldResetResults) {
          setProcessedFiles([]);
          shouldResetResults = false;
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

        if (useBatchMode) {
          const results = await processBatch(
            currentBatch,
            watermarkVolume,
            watermarkInterval,
            (current, total) => {
              const currentProgress = Math.round(((current) / total) * 100);
              setProgress(currentProgress);
              setProcessingStatus({
                current: Math.min(current + 1, total),
                total
              });
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
          for (let i = 0; i < currentBatch.length; i++) {
            const file = currentBatch[i];
            const currentProgress = Math.round(((i) / currentBatch.length) * 100);
            setProgress(currentProgress);
            setProcessingStatus({ current: i + 1, total: currentBatch.length });

            console.log(`Processing file ${i + 1} of ${currentBatch.length}: ${file.name}`);
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
            description: `Successfully processed ${currentBatch.length} file(s)`,
          });
        }

        const completedBatch = currentBatch;
        setFiles(prevFiles => prevFiles.filter(file => !completedBatch.includes(file)));
        setProgress(100);

        currentBatch = queuedFilesRef.current;
        queuedFilesRef.current = [];
        setQueuedCount(0);
      }
    } catch (error) {
      console.error("Error processing files:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Processing Failed",
        description: `An error occurred: ${message}`,
        variant: "destructive",
      });
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      setProcessingStatus({ current: 0, total: 0 });
    }
  };

  const fileUploaderProps = {
    files,
    setFiles,
    onFilesAccepted: processFiles,
    queuedCount,
    fileSizeLimitEnabled,
    maxFileSizeMB,
    toast,
    fileSize
  };

  const processingControlsProps = {
    isProcessing,
    progress,
    processingStatus,
    watermarkInterval,
    setWatermarkInterval,
    watermarkVolume,
    setWatermarkVolume,
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
    <div className="mx-auto w-full max-w-4xl">
      <div className="space-y-3 sm:space-y-5">
        <FileUploader {...fileUploaderProps} />

        <ProcessedFilesList {...processedFilesListProps} />

        <ProcessingControls {...processingControlsProps} />
      </div>
    </div>
  );
};

export default AudioWatermarker;
