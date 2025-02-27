
import React, { useState, useRef, useCallback, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AudioWaveform, AudioLines, Upload } from "lucide-react";
import { loadFFmpeg, addWatermark, generateUniqueFilename } from "@/lib/audioUtils";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { Separator } from "@/components/ui/separator";

const AudioWatermarker: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [ffmpeg, setFFmpeg] = useState<FFmpeg | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [watermarkVolume, setWatermarkVolume] = useState(0.5);
  const [watermarkInterval, setWatermarkInterval] = useState(20);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize FFmpeg
  const initFFmpeg = useCallback(async () => {
    if (isInitializing || isInitialized) return;
    
    try {
      setIsInitializing(true);
      const ffmpegInstance = await loadFFmpeg();
      setFFmpeg(ffmpegInstance);
      setIsInitialized(true);
      toast({
        title: "Ready to use",
        description: "Audio watermarking engine initialized successfully",
      });
    } catch (error) {
      console.error("Error initializing FFmpeg:", error);
      toast({
        title: "Initialization Failed",
        description: "Could not initialize audio processing engine. Try refreshing the page.",
        variant: "destructive",
      });
    } finally {
      setIsInitializing(false);
    }
  }, [toast, isInitializing, isInitialized]);

  // Process files with watermark
  const processFiles = async () => {
    if (!ffmpeg || files.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one audio file to process",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const currentProgress = Math.round(((i) / files.length) * 100);
        setProgress(currentProgress);

        // Process file
        const outputBlob = await addWatermark(
          ffmpeg,
          file,
          watermarkVolume,
          watermarkInterval
        );

        // Create download link
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = generateUniqueFilename(file.name);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setProgress(100);
      toast({
        title: "Processing Complete",
        description: `Successfully processed ${files.length} file(s)`,
      });
    } catch (error) {
      console.error("Error processing files:", error);
      toast({
        title: "Processing Failed",
        description: "An error occurred while processing your files",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  // Handle file selection
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
      
      setFiles(audioFiles);
    }
  };

  // Trigger file input click
  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle drag and drop
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
      
      setFiles(audioFiles);
    }
  }, [toast]);

  // Initialize FFmpeg when component mounts
  useEffect(() => {
    // Try to initialize automatically when component mounts
    initFFmpeg().catch(error => {
      console.error("Auto-initialization failed:", error);
    });
  }, [initFFmpeg]);

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight mt-6 mb-2">Audio Watermark Magic</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Add watermarks to your audio files with precise control over volume and placement
          </p>
        </div>

        <Separator className="my-6" />

        {!isInitialized && !isInitializing && (
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center space-y-4">
                <p className="text-amber-800">FFmpeg not initialized. Click the button below to initialize:</p>
                <Button 
                  onClick={initFFmpeg}
                  disabled={isInitializing}
                  variant="default"
                >
                  {isInitializing ? "Initializing..." : "Initialize Audio Engine"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isInitializing && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3"></div>
                <p>Initializing audio processing engine...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Dropzone */}
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
              className="border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer hover:border-primary"
            >
              <div className="flex flex-col items-center justify-center space-y-4">
                <AudioLines className="h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">
                    {isInitializing
                      ? "Initializing audio engine..."
                      : "Drop your audio files here"}
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
                  disabled={!isInitialized || isProcessing}
                />
              </div>
            </div>

            {/* Browse Files Button */}
            <div className="mt-4 flex justify-center">
              <Button 
                onClick={handleBrowseClick}
                disabled={!isInitialized || isProcessing}
                variant="outline"
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Browse Files
              </Button>
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
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Watermark Settings</CardTitle>
            <CardDescription>
              Adjust the watermark volume and placement interval
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="watermark-volume">Watermark Volume: {watermarkVolume.toFixed(2)}</Label>
              </div>
              <Slider
                id="watermark-volume"
                min={0.1}
                max={1}
                step={0.05}
                value={[watermarkVolume]}
                onValueChange={(value) => setWatermarkVolume(value[0])}
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Adjust how loud the watermark will be in the final audio
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="watermark-interval">Interval: {watermarkInterval} seconds</Label>
              </div>
              <Slider
                id="watermark-interval"
                min={5}
                max={60}
                step={1}
                value={[watermarkInterval]}
                onValueChange={(value) => setWatermarkInterval(value[0])}
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set how often the watermark appears in the audio
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {isProcessing && (
              <div className="w-full space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}
            <Button 
              className="w-full"
              onClick={processFiles}
              disabled={!isInitialized || isProcessing || files.length === 0}
            >
              {isProcessing
                ? "Processing..."
                : "Add Watermark & Download"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AudioWatermarker;
