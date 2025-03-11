
import React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, ChevronDown, ChevronUp, Wand2, Music } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProcessingControlsProps {
  isProcessing: boolean;
  progress: number;
  processFiles: () => Promise<void>;
  files: File[];
  useBatchMode: boolean;
  compressionEnabled: boolean;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  watermarkInterval: number;
  setWatermarkInterval: React.Dispatch<React.SetStateAction<number>>;
  setCompressionEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  compressionThreshold: number;
  setCompressionThreshold: React.Dispatch<React.SetStateAction<number>>;
  compressionRatio: number;
  setCompressionRatio: React.Dispatch<React.SetStateAction<number>>;
  compressionKnee: number;
  setCompressionKnee: React.Dispatch<React.SetStateAction<number>>;
  compressionAttack: number;
  setCompressionAttack: React.Dispatch<React.SetStateAction<number>>;
  compressionRelease: number;
  setCompressionRelease: React.Dispatch<React.SetStateAction<number>>;
  fileSizeLimitEnabled: boolean;
  setFileSizeLimitEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  maxFileSizeMB: number;
  setMaxFileSizeMB: React.Dispatch<React.SetStateAction<number>>;
  setUseBatchMode: React.Dispatch<React.SetStateAction<boolean>>;
  settingsTab: string;
  setSettingsTab: React.Dispatch<React.SetStateAction<string>>;
  toast: any; // Type for toast
}

const ProcessingControls: React.FC<ProcessingControlsProps> = ({
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
  setUseBatchMode,
  settingsTab,
  setSettingsTab,
  toast
}) => {
  // Toggle settings visibility
  const toggleSettings = () => {
    setShowSettings(!showSettings);
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
  
  return (
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
  );
};

export default ProcessingControls;
