import React from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, ChevronDown, ChevronUp, Wand2, Music, Play, Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  watermarkVolume: number;
  setWatermarkVolume: React.Dispatch<React.SetStateAction<number>>;
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
  // Audio settings
  audioChannels: 'mono' | 'stereo' | 'custom';
  setAudioChannels: React.Dispatch<React.SetStateAction<'mono' | 'stereo' | 'custom'>>;
  audioSampleRate: number;
  setAudioSampleRate: React.Dispatch<React.SetStateAction<number>>;
  audioBitRateMode: string;
  setAudioBitRateMode: React.Dispatch<React.SetStateAction<string>>;
  audioQuality: number;
  setAudioQuality: React.Dispatch<React.SetStateAction<number>>;
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
  watermarkVolume,
  setWatermarkVolume,
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
  // Audio settings
  audioChannels,
  setAudioChannels,
  audioSampleRate,
  setAudioSampleRate,
  audioBitRateMode,
  setAudioBitRateMode,
  audioQuality,
  setAudioQuality,
  toast
}) => {
  // Toggle settings visibility
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };
  
  // Apply the custom natural compression preset
  const applyNaturalCompressionPreset = () => {
    setCompressionThreshold(-20); // -20dB threshold as specified
    setCompressionRatio(4);       // 4:1 ratio as specified (in 3:1 to 4:1 range)
    setCompressionKnee(6);        // 6dB knee as specified
    setCompressionAttack(0.008);  // 8ms attack time (in 5-10ms range)
    setCompressionRelease(0.125); // 125ms release time (in 100-150ms range)
    
    toast({
      title: "Natural Compression Applied",
      description: "Applied natural-sounding compression preset that preserves dynamics",
    });
  };
  
  // Reset to the new default values
  const resetToDefaultValues = () => {
    setCompressionThreshold(-20);
    setCompressionRatio(4);
    setCompressionKnee(6);
    setCompressionAttack(0.008);
    setCompressionRelease(0.125);
    
    toast({
      title: "Default Settings Applied",
      description: "Reset compression settings to default values",
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
          
        </CardDescription>
      </CardHeader>
      
      <Collapsible open={showSettings} onOpenChange={setShowSettings}>
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            <Tabs defaultValue="watermark" value={settingsTab} onValueChange={setSettingsTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="watermark">Watermark</TabsTrigger>
                <TabsTrigger value="compression">Compression</TabsTrigger>
                <TabsTrigger value="audio">Audio</TabsTrigger>
                <TabsTrigger value="limits">File Limits</TabsTrigger>
              </TabsList>
              
              <TabsContent value="watermark" className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
                    <div className="text-sm">Interval</div>
                    <div className="grid gap-2">
                      <Slider
                        value={[watermarkInterval]}
                        min={5}
                        max={60}
                        step={1}
                        onValueChange={(value) => setWatermarkInterval(value[0])}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>5s</span>
                        <span className="font-medium">{watermarkInterval}s (Default: 5s)</span>
                        <span>60s</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
                    <div className="text-sm">Volume</div>
                    <div className="grid gap-2">
                      <Slider
                        value={[watermarkVolume]}
                        min={0}
                        max={1}
                        step={0.01}
                        onValueChange={(value) => setWatermarkVolume(value[0])}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0%</span>
                        <span className="font-medium">{watermarkVolume * 100}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>
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
                        onClick={resetToDefaultValues}
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
                        Threshold: -20dB, Ratio: 4:1, Knee: 6dB, Attack: 8ms, Release: 125ms
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* Audio Settings Tab */}
              <TabsContent value="audio" className="space-y-4 pt-4">
                <div className="grid grid-cols-[120px_1fr] gap-4 items-center">
                  <div className="text-sm">Channels</div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroup value={audioChannels} onValueChange={(value) => setAudioChannels(value as 'mono' | 'stereo' | 'custom')}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="mono" id="mono" />
                          <Label htmlFor="mono">Mono</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="stereo" id="stereo" />
                          <Label htmlFor="stereo">Stereo</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="custom" id="custom" />
                          <Label htmlFor="custom">Custom mapping</Label>
                        </div>
                      </RadioGroup>
                      {audioChannels === 'custom' && (
                        <Button variant="outline" size="sm">Configure</Button>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-sm">Sample Rate</div>
                  <Select value={audioSampleRate.toString()} onValueChange={(value) => setAudioSampleRate(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select sample rate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="44100">44100 Hz</SelectItem>
                      <SelectItem value="48000">48000 Hz</SelectItem>
                      <SelectItem value="96000">96000 Hz</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div className="text-sm">Bit Rate Mode</div>
                  <Select value={audioBitRateMode} onValueChange={setAudioBitRateMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bit rate mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Average">Average</SelectItem>
                      <SelectItem value="Constant">Constant</SelectItem>
                      <SelectItem value="Variable">Variable</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div className="text-sm">Quality</div>
                  <Select value={audioQuality.toString()} onValueChange={(value) => setAudioQuality(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="64">64 kbps</SelectItem>
                      <SelectItem value="96">96 kbps</SelectItem>
                      <SelectItem value="128">128 kbps</SelectItem>
                      <SelectItem value="192">192 kbps</SelectItem>
                      <SelectItem value="256">256 kbps</SelectItem>
                      <SelectItem value="320">320 kbps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>Tip:</strong> Stereo mode preserves the original stereo image but results in larger files. 
                    Mono mode reduces file size but combines all channels into one.
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-300 mt-2">
                    <strong>WhatsApp Compatibility:</strong> For best compatibility with WhatsApp, use 48000 Hz sample rate and 128 kbps quality.
                  </p>
                </div>
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
                        max={30}
                        step={1}
                        value={[maxFileSizeMB]}
                        onValueChange={(value) => setMaxFileSizeMB(value[0])}
                        disabled={isProcessing}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1 MB</span>
                        <span className="font-medium">{maxFileSizeMB} MB (Default: 10 MB)</span>
                        <span>30 MB</span>
                      </div>
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
                      <p className="text-sm text-amber-800 dark:text-amber-300 mt-2">
                        <strong>WhatsApp Limit:</strong> WhatsApp has a 16 MB file size limit for audio files.
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
              <span className="text-xs text-green-600 dark:text-green-400 ml-2">(Enabled by default)</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Process all files at once with the same settings. Recommended for multiple files.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
      
      <CardFooter className="flex flex-col space-y-4">
        <div className="w-full">
          <div className="flex justify-between items-center mb-2">
            <div>
              {/* Batch Processing Mode dipindahkan ke CardContent */}
            </div>
            <span className={`text-sm font-medium ${isProcessing ? 'text-blue-500 animate-pulse' : ''}`}>
              {isProcessing ? `Memproses: ${progress}%` : ''}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            
          </p>
          
          {isProcessing && (
            <div className="relative mb-4">
              <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 rounded-full transition-all duration-500 ease-in-out bg-[length:200%_100%] animate-gradient"
                  style={{ 
                    width: `${progress}%`,
                    backgroundPosition: `${progress % 200}% 0`
                  }}
                />
              </div>
              
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span className={progress >= 10 ? 'text-blue-500 font-medium' : ''}>Mengambil file</span>
                <span className={progress >= 40 ? 'text-blue-500 font-medium' : ''}>Menambahkan watermark</span>
                <span className={progress >= 70 ? 'text-blue-500 font-medium' : ''}>Kompresi</span>
                <span className={progress >= 100 ? 'text-green-500 font-medium' : ''}>Selesai</span>
              </div>
              <div className="flex justify-between mt-1 relative">
                <div className="w-full absolute h-0.5 bg-gray-200 dark:bg-gray-700 top-1"></div>
                <div className={`w-4 h-4 rounded-full relative z-10 flex items-center justify-center
                  ${progress >= 10 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  {progress >= 10 && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div className={`w-4 h-4 rounded-full relative z-10 flex items-center justify-center transition-colors duration-300
                  ${progress >= 40 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  {progress >= 40 && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div className={`w-4 h-4 rounded-full relative z-10 flex items-center justify-center transition-colors duration-300
                  ${progress >= 70 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  {progress >= 70 && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div className={`w-4 h-4 rounded-full relative z-10 flex items-center justify-center transition-colors duration-300
                  ${progress >= 100 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  {progress >= 100 && <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>}
                </div>
              </div>
            </div>
          )}
        
          <Button 
            className="w-full flex items-center justify-center gap-2" 
            size="lg"
            onClick={processFiles}
            disabled={isProcessing || files.length === 0}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                <span>
                  {useBatchMode 
                    ? "Process All Files" 
                    : "Process File"}
                </span>
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default ProcessingControls;
