
import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Play, Pause } from "lucide-react";

interface ProcessedFilesListProps {
  processedFiles: {name: string, url: string, size: string, isPlaying: boolean}[];
  setProcessedFiles: React.Dispatch<React.SetStateAction<{
    name: string;
    url: string;
    size: string;
    isPlaying: boolean;
  }[]>>;
}

const ProcessedFilesList: React.FC<ProcessedFilesListProps> = ({ 
  processedFiles, 
  setProcessedFiles 
}) => {
  const audioRefs = useRef<{[key: string]: HTMLAudioElement}>({});
  
  // Download all processed files
  const downloadAllFiles = () => {
    processedFiles.forEach(file => {
      downloadFile(file.url, file.name);
    });
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
  
  if (processedFiles.length === 0) {
    return null;
  }
  
  return (
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
  );
};

export default ProcessedFilesList;
