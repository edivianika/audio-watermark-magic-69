import React, { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AudioWaveform, AudioLines, Upload, Download, Play, Pause, FileText } from "lucide-react";
import ProcessedFilesList from "./ProcessedFilesList";
import { useToast } from "@/components/ui/use-toast";

interface FileUploaderProps {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  isProcessing: boolean;
  clearFiles: () => void;
  fileSizeLimitEnabled: boolean;
  maxFileSizeMB: number;
  toast: any; // Type for toast
  fileSize?: string | null;
}

const FileUploader: React.FC<FileUploaderProps> = ({
  files,
  setFiles,
  isProcessing,
  clearFiles,
  fileSizeLimitEnabled,
  maxFileSizeMB,
  toast,
  fileSize = null
}) => {
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processedFiles, setProcessedFiles] = useState<{name: string, url: string, size: string, isPlaying: boolean}[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      const audioFiles = filesArray.filter(file => 
        file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav')
      );
      
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
      
      setFiles(filesWithSize);
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
      const filesArray = Array.from(e.dataTransfer.files);
      const audioFiles = filesArray.filter(file => 
        file.type.startsWith('audio/') || file.name.endsWith('.mp3') || file.name.endsWith('.wav')
      );
      
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
      
      setFiles(filteredFiles);
    }
  }, [toast, fileSizeLimitEnabled, maxFileSizeMB, setFiles]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AudioWaveform className="h-5 w-5" />
          <span>Upload Audio Files</span>
        </CardTitle>
        <CardDescription>
          Drag and drop audio files or click to browse
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          ref={dropzoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
          className="border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer hover:border-primary"
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            <AudioLines className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium">
                Drop your audio files here
              </p>
              <p className="text-sm text-muted-foreground">
                Supports MP3, WAV, and other audio formats
              </p>
            </div>
            <Input
              id="file-upload"
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isProcessing}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          <Button 
            onClick={handleBrowseClick}
            disabled={isProcessing}
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Browse Files
          </Button>
          
          {files.length > 0 && (
            <Button
              onClick={clearFiles}
              disabled={isProcessing}
              variant="outline"
              className="gap-2"
            >
              Clear Files
            </Button>
          )}
        </div>

        {files.length > 0 && (
          <div className="mt-6">
            <h3 className="font-medium mb-2">Selected Files ({files.length})</h3>
            <div className="max-h-40 overflow-y-auto border rounded-md p-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center py-2 px-3 odd:bg-muted/30 rounded-sm"
                >
                  <span className="truncate max-w-[200px] sm:max-w-xs">
                    {file.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <ProcessedFilesList processedFiles={processedFiles} setProcessedFiles={setProcessedFiles} />
        
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
