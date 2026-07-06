import React, { useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { AudioLines, FileText } from "lucide-react";
import type { useToast } from "@/components/ui/use-toast";
import { AUDIO_FILE_ACCEPT, isLikelyAudioFile } from "@/lib/audioFileTypes";

type ToastFn = ReturnType<typeof useToast>["toast"];

interface FileUploaderProps {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  onFilesAccepted: (files: File[]) => void;
  queuedCount: number;
  fileSizeLimitEnabled: boolean;
  maxFileSizeMB: number;
  toast: ToastFn;
  fileSize?: string | null;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  files,
  setFiles,
  onFilesAccepted,
  queuedCount,
  fileSizeLimitEnabled,
  maxFileSizeMB,
  toast,
  fileSize = null
}) => {
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptFiles = useCallback((selectedFiles: FileList | File[]) => {
    const filesArray = Array.from(selectedFiles);
    if (filesArray.length > 0) {
      const audioFiles = filesArray.filter(isLikelyAudioFile);
      
      if (audioFiles.length < filesArray.length) {
        toast({
          title: "Invalid Files",
          description: "Some files were skipped because they aren't audio files",
          variant: "destructive",
        });
      }
      
      let filteredFiles = audioFiles;
      if (fileSizeLimitEnabled) {
        const oversizedFiles = audioFiles.filter(file => 
          (file.size / (1024 * 1024)) > maxFileSizeMB
        );
        
        if (oversizedFiles.length > 0) {
          toast({
            title: "Files Exceeding Size Limit",
            description: `${oversizedFiles.length} file(s) exceed the ${maxFileSizeMB}MB limit and were skipped`,
            variant: "destructive",
          });
          
          filteredFiles = audioFiles.filter(file => 
            (file.size / (1024 * 1024)) <= maxFileSizeMB
          );
        }
      }
      
      const filesWithSize = filteredFiles.map(file => {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        console.log(`Original file size: ${sizeMB} MB`);
        return file;
      });
      
      setFiles(prevFiles => [...prevFiles, ...filesWithSize]);
      onFilesAccepted(filesWithSize);
    }
  }, [fileSizeLimitEnabled, maxFileSizeMB, onFilesAccepted, setFiles, toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      acceptFiles(e.target.files);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropzoneRef.current) {
      dropzoneRef.current.classList.add("border-primary");
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropzoneRef.current) {
      dropzoneRef.current.classList.remove("border-primary");
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dropzoneRef.current) {
      dropzoneRef.current.classList.remove("border-primary");
    }
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      acceptFiles(e.dataTransfer.files);
    }
  }, [acceptFiles]);

  return (
    <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="p-0">
        <div
          ref={dropzoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
          className="rounded-md border border-dashed border-slate-300 bg-white/60 p-5 text-center transition-colors cursor-pointer hover:border-slate-500 sm:p-10 dark:border-gray-700 dark:bg-transparent dark:hover:border-gray-500"
        >
          <div className="flex flex-col items-center justify-center space-y-3">
            <AudioLines className="h-9 w-9 text-muted-foreground sm:h-12 sm:w-12" />
            <div>
              <p className="text-base font-medium sm:text-lg">
                Tap to choose audio
              </p>
              <p className="text-xs text-muted-foreground sm:text-sm">
                MP3, WAV, M4A, AAC, OGG, FLAC
              </p>
            </div>
            <Input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              multiple
              accept={AUDIO_FILE_ACCEPT}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-2 text-sm font-medium">Selected ({files.length})</h3>
            <div className="max-h-36 overflow-y-auto rounded-md border border-slate-300 bg-white/50 p-1 dark:border-gray-700 dark:bg-transparent">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-sm px-2 py-2 odd:bg-muted/30"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {queuedCount > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {queuedCount} file{queuedCount === 1 ? "" : "s"} queued
          </p>
        )}
        
        {fileSize && (
          <div className="mt-4 p-3 bg-muted/30 rounded-md flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{fileSize}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FileUploader;
