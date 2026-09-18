import React, { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import FileUploader from "@/components/audio-watermarker/FileUploader";
import ProcessedFilesList from "@/components/audio-watermarker/ProcessedFilesList";
import { splitStereoAudio } from "@/lib/vocalSeparation";

type SplitOutput = {
  name: string;
  url: string;
  size: string;
  isPlaying: boolean;
};

const VocalSplitter: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [outputs, setOutputs] = useState<SplitOutput[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState({ current: 0, total: 0 });
  const [fileSize, setFileSize] = useState<string | null>(null);
  const processingRef = useRef(false);

  const processFiles = async (filesToProcess: File[]) => {
    if (processingRef.current || filesToProcess.length === 0) return;

    processingRef.current = true;
    setIsProcessing(true);
    outputs.forEach((output) => URL.revokeObjectURL(output.url));
    setOutputs([]);
    setProgress(0);
    setFileSize(null);
    setProcessingStatus({ current: 0, total: filesToProcess.length });

    try {
      for (let index = 0; index < filesToProcess.length; index += 1) {
        const file = filesToProcess[index];
        setProcessingStatus({ current: index + 1, total: filesToProcess.length });
        setProgress(Math.round((index / filesToProcess.length) * 100));

        const result = await splitStereoAudio(file);
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const vocalOutput = {
          name: `${baseName}_vocal.${result.format}`,
          url: URL.createObjectURL(result.vocal),
          size: formatSize(result.vocal.size),
          isPlaying: false,
        };
        const instrumentalOutput = {
          name: `${baseName}_instrumental.${result.format}`,
          url: URL.createObjectURL(result.instrumental),
          size: formatSize(result.instrumental.size),
          isPlaying: false,
        };

        setOutputs((current) => [...current, vocalOutput, instrumentalOutput]);
        setFileSize(`AI Demucs · ${result.format.toUpperCase()} ${result.bitrate ? `${result.bitrate} kbps` : ""} · Model: ${result.model}`);
        setProgress(Math.round(((index + 1) / filesToProcess.length) * 100));
      }

      setFiles([]);
      toast({
        title: "Split selesai",
        description: `Berhasil membuat ${filesToProcess.length * 2} file stem: vocal dan instrumental.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "File tidak dapat diproses.";
      toast({
        title: "Split gagal",
        description: message,
        variant: "destructive",
      });
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      setProcessingStatus({ current: 0, total: 0 });
    }
  };

  const clearOutputs = () => {
    outputs.forEach((output) => URL.revokeObjectURL(output.url));
    setOutputs([]);
    setFileSize(null);
  };

  const uploaderProps = {
    files,
    setFiles,
    onFilesAccepted: processFiles,
    queuedCount: 0,
    fileSizeLimitEnabled: true,
    maxFileSizeMB: 50,
    toast,
    fileSize,
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 sm:space-y-5">
      <FileUploader {...uploaderProps} />

      {isProcessing && (
        <div className="rounded-md border border-slate-300 bg-white/50 px-3 py-2 dark:border-gray-700 dark:bg-muted/20">
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
              <span className="truncate">Memisahkan audio {processingStatus.current} dari {processingStatus.total}</span>
            </span>
            <span className="shrink-0 font-semibold text-blue-600 dark:text-blue-400">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {outputs.length > 0 && (
        <ProcessedFilesList
          processedFiles={outputs}
          setProcessedFiles={setOutputs}
          clearProcessedFiles={clearOutputs}
          idPrefix="split-audio"
        />
      )}
    </div>
  );
};

const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

export default VocalSplitter;
