
import React, { useState, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AudioWaveform, AudioLines, Upload, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { addWatermark, generateUniqueFilename } from "@/lib/audioUtils";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const AudioWatermarker: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [watermarkVolume, setWatermarkVolume] = useState(0.75); // 75% volume
  const [watermarkInterval, setWatermarkInterval] = useState(10); // Updated to 10 seconds default
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false); // Default hide settings
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const currentProgress = Math.round(((i) / files.length) * 100);
        setProgress(currentProgress);

        console.log(`Processing file ${i + 1} of ${files.length}: ${file.name}`);
        
        // Process file with our watermarking method
        const outputBlob = await addWatermark(
          file,
          watermarkVolume,
          watermarkInterval
        );

        // Generate the trial filename
        const originalName = file.name;
        const extension = originalName.split('.').pop();
        const nameWithoutExt = originalName.slice(0, -(extension?.length || 0) - 1);
        const trialFilename = `${nameWithoutExt}_Trial.${extension}`;

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

      setProgress(100);
      toast({
        title: "Processing Complete",
        description: `Successfully processed ${files.length} file(s) with watermark`,
      });
    } catch (error) {
      console.error("Error processing files:", error);
      toast({
        title: "Processing Failed",
        description: `An error occurred: ${error.message}`,
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

  // Toggle settings visibility
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

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

            {/* Browse Files Button */}
            <div className="mt-4 flex justify-center">
              <Button 
                onClick={handleBrowseClick}
                disabled={isProcessing}
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

        {/* Controls - Now with Collapsible */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle>Watermark Settings</CardTitle>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={toggleSettings} 
                className="h-8 gap-1"
              >
                <Settings className="h-4 w-4" />
                {showSettings ? 
                  <span className="flex items-center">Hide Settings <ChevronUp className="ml-1 h-4 w-4" /></span> : 
                  <span className="flex items-center">Show Settings <ChevronDown className="ml-1 h-4 w-4" /></span>
                }
              </Button>
            </div>
            <CardDescription>
              Customize how the watermark appears in your audio
            </CardDescription>
          </CardHeader>
          
          <Collapsible open={showSettings} onOpenChange={setShowSettings}>
            <CollapsibleContent>
              <CardContent className="space-y-6 pt-0">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="watermark-volume">Watermark Volume: {(watermarkVolume * 100).toFixed(0)}%</Label>
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
            </CollapsibleContent>
          </Collapsible>
          
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
              disabled={isProcessing || files.length === 0}
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
