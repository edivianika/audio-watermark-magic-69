import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Pause, Play } from "lucide-react";
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
  idPrefix?: string;
}

const ProcessedFilesList: React.FC<ProcessedFilesListProps> = ({
  processedFiles,
  setProcessedFiles,
  clearProcessedFiles,
  idPrefix = "audio"
}) => {
  const processedFilesRef = useRef(processedFiles);

  React.useEffect(() => {
    processedFilesRef.current = processedFiles;
  }, [processedFiles]);

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
          const audio = document.getElementById(`${idPrefix}-${i}`) as HTMLAudioElement;
          if (audio) audio.pause();
        }
      });

      // Toggle the selected audio
      newFiles[index].isPlaying = !newFiles[index].isPlaying;
      const audio = document.getElementById(`${idPrefix}-${index}`) as HTMLAudioElement;
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
      processedFilesRef.current.forEach((_, index) => {
        const audio = document.getElementById(`${idPrefix}-${index}`) as HTMLAudioElement;
        if (audio) {
          audio.pause();
          audio.src = "";
        }
      });
    };
  }, [idPrefix]);

  if (processedFiles.length === 0) {
    return null;
  }

  const displayFiles = processedFiles
    .map((file, originalIndex) => ({ file, originalIndex }))
    .reverse()
    .filter(({ file }, index, files) => {
      const key = `${file.url}::${file.name}`;
      return files.findIndex(({ file: candidate }) => `${candidate.url}::${candidate.name}` === key) === index;
    });

  // Download only the same unique files shown in the visible list.
  const downloadAllFiles = () => {
    displayFiles.forEach(({ file }) => {
      downloadFile(file.url, file.name);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold sm:text-lg">Processed</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadAllFiles}
            title="Download All Files"
            className="h-8 px-2 text-xs sm:px-3 sm:text-sm"
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            All
          </Button>
          <Button variant="outline" size="sm" onClick={clearProcessedFiles} className="h-8 px-2 text-xs sm:px-3 sm:text-sm">
            Clear
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {displayFiles.map(({ file, originalIndex }) => {
          return (
            <Card key={`${file.url}-${originalIndex}`} className="border-slate-300 p-3 shadow-none dark:border-border">
              <div className="flex items-center justify-between gap-2">
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
                    className="h-8 w-8"
                  >
                    {file.isPlaying ?
                      <Pause className="h-4 w-4" /> :
                      <Play className="h-4 w-4" />
                    }
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => downloadFile(file.url, file.name)}
                    title="Download"
                    className="h-8 w-8"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <audio
                id={`${idPrefix}-${originalIndex}`}
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
