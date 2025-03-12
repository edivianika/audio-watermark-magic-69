import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Play, Pause, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ProcessedFilesListProps {
  processedFiles: {name: string, url: string, size: string, isPlaying: boolean}[];
  setProcessedFiles: React.Dispatch<React.SetStateAction<{
    name: string;
    url: string;
    size: string;
    isPlaying: boolean;
  }[]>>;
  clearProcessedFiles?: () => void;
}

const ProcessedFilesList: React.FC<ProcessedFilesListProps> = ({ 
  processedFiles, 
  setProcessedFiles,
  clearProcessedFiles
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
  const togglePlay = (index: number) => {
    setProcessedFiles(prev => {
      const newFiles = [...prev];
      // Pause any currently playing audio
      newFiles.forEach((file, i) => {
        if (i !== index && file.isPlaying) {
          file.isPlaying = false;
          const audio = document.getElementById(`audio-${i}`) as HTMLAudioElement;
          if (audio) audio.pause();
        }
      });
      
      // Toggle the selected audio
      newFiles[index].isPlaying = !newFiles[index].isPlaying;
      const audio = document.getElementById(`audio-${index}`) as HTMLAudioElement;
      if (audio) {
        if (newFiles[index].isPlaying) {
          audio.play().catch(error => {
            console.error("Error playing audio:", error);
            // Jika gagal memutar, reset status isPlaying
            newFiles[index].isPlaying = false;
          });
        } else {
          audio.pause();
        }
      }
      return newFiles;
    });
  };
  
  // Cleanup function for audio elements
  React.useEffect(() => {
    return () => {
      // Cleanup audio elements when component unmounts
      processedFiles.forEach((_, index) => {
        const audio = document.getElementById(`audio-${index}`) as HTMLAudioElement;
        if (audio) {
          audio.pause();
          audio.src = "";
        }
      });
    };
  }, []);
  
  if (processedFiles.length === 0) {
    return null;
  }
  
  // Buat salinan array dan balik urutannya agar yang terbaru di atas
  const reversedFiles = [...processedFiles].reverse();
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Processed Files</h3>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={downloadAllFiles}
            title="Download All Files"
          >
            <svg className="mr-1" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download All
          </Button>
          <Button variant="outline" size="sm" onClick={clearProcessedFiles}>
            Clear All
          </Button>
        </div>
      </div>
      
      <div className="space-y-2">
        {reversedFiles.map((file, index) => {
          // Hitung indeks asli untuk referensi audio
          const originalIndex = processedFiles.length - 1 - index;
          
          return (
            <Card key={index} className="p-3">
              <div className="flex justify-between items-center">
                <div className="flex-1 min-w-0 mr-2">
                  <h4 className="font-medium text-sm truncate" title={file.name}>
                    {file.name}
                  </h4>
                  <p className="text-xs text-muted-foreground">{file.size}</p>
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => togglePlay(originalIndex)}
                    title={file.isPlaying ? "Pause" : "Play"}
                  >
                    {file.isPlaying ? 
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg> : 
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    }
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => downloadFile(file.url, file.name)}
                    title="Download"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  </Button>
                </div>
              </div>
              <audio 
                id={`audio-${originalIndex}`} 
                src={file.url} 
                onEnded={() => {
                  setProcessedFiles(prev => {
                    const newFiles = [...prev];
                    newFiles[originalIndex].isPlaying = false;
                    return newFiles;
                  });
                }}
                hidden
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ProcessedFilesList;
