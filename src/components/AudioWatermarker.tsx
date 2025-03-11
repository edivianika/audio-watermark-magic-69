import React, { useState, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  AudioWaveform, AudioLines, Upload, ChevronDown, ChevronUp, 
  Settings, FileText, Check, Download, Play, Pause, Wand2, Music
} from "lucide-react";
import { addWatermark, generateUniqueFilename, processBatch } from "@/lib/audioUtils";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AudioWatermarker: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [watermarkVolume, setWatermarkVolume] = useState(0.9); // Set to 90% volume by default
  const [watermarkInterval, setWatermarkInterval] = useState(10); // 10 seconds default
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false); // Default hide settings
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [useBatchMode, setUseBatchMode] = useState(true); // Enable batch mode by default
  const [processedFiles, setProcessedFiles] = useState<{name: string, url: string, size: string, isPlaying: boolean}[]>([]);
  const audioRefs = useRef<{[key: string]: HTMLAudioElement}>({});
  
  // Compression settings - ENABLED by default with optimal values
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [compressionThreshold, setCompressionThreshold] = useState(-30);
  const [compressionRatio, setCompressionRatio] = useState(6);
  const [compressionKnee, setCompressionKnee] = useState(10);
  const [compressionAttack, setCompressionAttack] = useState(0.003);
  const [compressionRelease, setCompressionRelease] = useState(0.25);
  const [settingsTab, setSettingsTab] = useState("watermark");
  
  // File size limit settings - ENABLED by default with 16MB limit
  const [fileSizeLimitEnabled, setFileSizeLimitEnabled] = useState(true);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(16); // Default 16MB limit

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
    
    // Prepare compression options - always enabled by default
    const compressionOptions = {
      enabled: compressionEnabled,
      threshold: compressionThreshold,
      knee: compressionKnee,
      ratio: compressionRatio,
      attack: compressionAttack,
      release: compressionRelease
    };
    
    // Prepare file size options - always enforce 16MB limit by default
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
  
  // Play/pause audio
  const togglePlayPause = (url: string, index: number) => {
    const newProcessedFiles = [...processedFiles];
    
    // Create audio element if it doesn't exist
    if (!audioRefs.current[url]) {
      audioRefs.current[url] = new Audio(url);
      audioRefs.current[url].addEventListener('ended', () => {
        const updatedFiles = [...processedFiles];
        updatedFiles[index].isPlaying = false;
        setProcessedFiles(updatedFiles);
      });
    }
    
    // Toggle play/pause
    if (newProcessedFiles[index].isPlaying) {
      audioRefs.current[url].pause();
    } else {
      // Pause all other playing audio
      Object.values(audioRefs.current).forEach(audio => audio.pause());
      
      // Reset all isPlaying states
      newProcessedFiles.forEach((file, i) => {
        if (i !== index) newProcessedFiles[i].isPlaying = false;
      });
      
      // Play the selected audio
      audioRefs.current[url].play();
    }
    
    // Toggle the playing state
    newProcessedFiles[index].isPlaying = !newProcessedFiles[index].isPlaying;
    setProcessedFiles(newProcessedFiles);
  };
  
  // Download a processed file
  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  // Download all processed files
  const downloadAllFiles = () => {
    processedFiles.forEach(file => {
      downloadFile(file.url, file.name);
    });
    
    toast({
      title: "Download Started",
      description: `Downloading ${processedFiles.length} file(s)`,
    });
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
      
      // Check file size limits if enabled
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
      
      // Add file size information when selecting files
      const filesWithSize = filteredFiles.map(file => {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        console.log(`Original file size: ${sizeMB} MB`);
        return file;
      });
      
      setFiles(filesWithSize);
      setFileSize(null);
      setProcessedFiles([]);
      
      // Clean up any existing audio elements
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      audioRefs.current = {};
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
      
      // Check file size limits if enabled
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
      setFileSize(null); // Reset file size info
      // Clear processed files when new files are selected
      setProcessedFiles([]);
    }
  }, [toast, fileSizeLimitEnabled, maxFileSizeMB]);

  // Toggle settings visibility
  const toggleSettings = () => {
    setShowSettings(!showSettings);
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

  // Apply the custom natural compression preset
  const applyNaturalCompressionPreset = () => {
    setCompressionThreshold(-20); // Less aggressive threshold for natural sound
    setCompressionRatio(2);       // Lower ratio for subtle compression
    setCompressionKnee(6);        // Smoother transition
    setCompressionAttack(0.008);  // 8ms attack time (between 5-10ms as specified)
    setCompressionRelease(0.125); // 125ms release time (between 100-150ms as specified)
    
    toast({
      title: "Natural Compression Applied",
      description: "Applied natural-sounding compression preset that preserves dynamics",
    });
  };

  // Cleanup function for audio elements
  React.useEffect(() => {
    return () => {
      // Cleanup audio elements when component unmounts
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.src = "";
      });
    };
  }, []);

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

            {/* Browse Files Button */}
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

            {/* Selected Files */}
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
            
            {/* Processed Files */}
            {processedFiles.length > 0 && (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium">Processed Files ({processedFiles.length})</h3>
                  <Button
                    onClick={downloadAllFiles}
                    variant="outline"
                    size="sm"
                    className="gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Download All
                  </Button>
                </div>
                <div className="max-h-60 overflow-y-auto border rounded-md p-2">
                  {processedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex justify-between items-center py-2 px-3 odd:bg-muted/30 rounded-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => togglePlayPause(file.url, index)}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          {file.isPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <span className="truncate max-w-[200px] sm:max-w-xs">
                          {file.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{file.size}</span>
                        <Button
                          onClick={() => downloadFile(file.url, file.name)}
                          variant="ghost"
                          size="sm"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* File Size Information */}
            {fileSize && (
              <div className="mt-4 p-3 bg-muted/30 rounded-md flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{fileSize}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Controls - Now with Tabs for Settings */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <CardTitle>Processing Settings</CardTitle>
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
              Customize watermark and compression settings for your audio
            </CardDescription>
          </CardHeader>
          
          <Collapsible open={showSettings} onOpenChange={setShowSettings}>
            <CollapsibleContent>
              <CardContent className="space-y-6 pt-0">
                <Tabs defaultValue="watermark" value={settingsTab} onValueChange={setSettingsTab}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="watermark">Watermark</TabsTrigger>
                    <TabsTrigger value="compression">Compression</TabsTrigger>
                    <TabsTrigger value="limits">File Limits</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="watermark" className="space-y-4 pt-4">
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
                  </TabsContent>
                  
                  <TabsContent value="compression" className="space-y-4 pt-4">
                    <div className="flex items-center space-x-2 mb-4">
                      <Switch
                        id="compression-toggle"
                        checked={compressionEnabled}
                        onCheckedChange={setCompressionEnabled}
                        disabled={isProcessing}
                      />
                      <Label htmlFor="compression-toggle" className="font-medium">Enable Audio Compression</Label>
                    </div>
                    
                    {compressionEnabled && (
                      <div className="space-y-6 pt-2">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label htmlFor="compression-threshold">Threshold: {compressionThreshold} dB</Label>
                          </div>
                          <Slider
                            id="compression-threshold"
                            min={-60}
                            max={0}
                            step={1}
                            value={[compressionThreshold]}
                            onValueChange={(value) => setCompressionThreshold(value[0])}
                            disabled={isProcessing}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Level at which compression starts to be applied
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label htmlFor="compression-ratio">Ratio: {compressionRatio}:1</Label>
                          </div>
                          <Slider
                            id="compression-ratio"
                            min={1}
                            max={20}
                            step={0.5}
                            value={[compressionRatio]}
                            onValueChange={(value) => setCompressionRatio(value[0])}
                            disabled={isProcessing}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Amount of compression applied (higher = more compression)
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label htmlFor="compression-knee">Knee: {compressionKnee} dB</Label>
                          </div>
                          <Slider
                            id="compression-knee"
                            min={0}
                            max={40}
                            step={1}
                            value={[compressionKnee]}
                            onValueChange={(value) => setCompressionKnee(value[0])}
                            disabled={isProcessing}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Smoothness of the compression curve
                          </p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="compression-attack">Attack: {(compressionAttack * 1000).toFixed(0)} ms</Label>
                            <Slider
                              id="compression-attack"
                              min={0.001}
                              max={0.5}
                              step={0.001}
                              value={[compressionAttack]}
                              onValueChange={(value) => setCompressionAttack(value[0])}
                              disabled={isProcessing}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="compression-release">Release: {(compressionRelease * 1000).toFixed(0)} ms</Label>
                            <Slider
                              id="compression-release"
                              min={0.01}
                              max={1}
                              step={0.01}
                              value={[compressionRelease]}
                              onValueChange={(value) => setCompressionRelease(value[0])}
                              disabled={isProcessing}
                            />
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                          <Button 
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => {
                              setCompressionThreshold(-30);
                              setCompressionRatio(6);
                              setCompressionKnee(10);
                              setCompressionAttack(0.003);
                              setCompressionRelease(0.25);
                            }}
                            disabled={isProcessing}
                          >
                            <Wand2 className="h-4 w-4" />
                            Reset to Default Values
                          </Button>
                          
                          <Button 
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={applyNaturalCompressionPreset}
                            disabled={isProcessing}
                          >
                            <Music className="h-4 w-4" />
                            Natural Compression Preset
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1">
                            Threshold: -20dB, Ratio: 2:1, Knee: 6dB, Attack: 8ms, Release: 125ms
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  {/* File Limits Tab */}
                  <TabsContent value="limits" className="space-y-4 pt-4">
                    <div className="flex items-center space-x-2 mb-4">
                      <Switch
                        id="file-size-limit-toggle"
                        checked={fileSizeLimitEnabled}
                        onCheckedChange={setFileSizeLimitEnabled}
                        disabled={isProcessing}
                      />
                      <Label htmlFor="file-size-limit-toggle" className="font-medium">Enable File Size Limit</Label>
                    </div>
                    
                    {fileSizeLimitEnabled && (
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label htmlFor="max-file-size">Maximum File Size: {maxFileSizeMB} MB</Label>
                          </div>
                          <Slider
                            id="max-file-size"
                            min={1}
                            max={100}
                            step={1}
                            value={[maxFileSizeMB]}
                            onValueChange={(value) => setMaxFileSizeMB(value[0])}
                            disabled={isProcessing}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Output files will be compressed to stay under this limit
                          </p>
                        </div>
                        
                        <div className="flex justify-between text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                          <span>Current setting:</span>
                          <span>{fileSizeLimitEnabled ? `${maxFileSizeMB} MB limit` : "No limit"}</span>
                        </div>
                        
                        <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                          <p className="text-sm text-amber-800 dark:text-amber-300">
                            <strong>Note:</strong> Files will be automatically compressed (mono conversion, bitrate reduction) 
                            to stay under the specified limit while preserving audio quality.
                          </p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
                
                <Separator />
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="batch-mode"
                    checked={useBatchMode}
                    onCheckedChange={setUseBatchMode}
                    disabled={isProcessing}
                  />
                  <Label htmlFor="batch-mode" className="font-medium">Batch Processing Mode</Label>
                </div>
                <p className="text-xs text-muted-foreground -mt-4">
                  {useBatchMode 
                    ? "Process all files at once and provide download links"
                    : "Process files one by one with immediate download"
                  }
                </p>
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
                : useBatchMode
                  ? "Process All Files"
                  : `Add Watermark${compressionEnabled ? ' & Compress' : ''} + Download`}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default AudioWatermarker;
