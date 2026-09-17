import React, { useRef, useState } from "react";
import { Info, Loader2, Mic2, Music2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import FileUploader from "@/components/audio-watermarker/FileUploader";
import ProcessedFilesList from "@/components/audio-watermarker/ProcessedFilesList";
import { splitStereoAudio } from "@/lib/vocalSeparation";

type SplitOutput = {
  name: string;
  url: string;
  size: string;
  isPlaying: boolean;
};

const VocalSplitter: React.FC = () => {
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [outputs, setOutputs] = useState<SplitOutput[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState({ current: 0, total: 0 });
  const [fileSize, setFileSize] = useState<string | null>(null);
  const processingRef = useRef(false);

  const processFiles = async (filesToProcess: File[]) => {
    if (processingRef.current || filesToProcess.length === 0) return;

    processingRef.current = true;
    setIsProcessing(true);
    outputs.forEach((output) => URL.revokeObjectURL(output.url));
    setOutputs([]);
    setProgress(0);
    setFileSize(null);
    setProcessingStatus({ current: 0, total: filesToProcess.length });

    try {
      for (let index = 0; index < filesToProcess.length; index += 1) {
        const file = filesToProcess[index];
        setProcessingStatus({ current: index + 1, total: filesToProcess.length });
        setProgress(Math.round((index / filesToProcess.length) * 100));

        const result = await splitStereoAudio(file);
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const vocalOutput = {
          name: `${baseName}_vocal.wav`,
          url: URL.createObjectURL(result.vocal),
          size: formatSize(result.vocal.size),
          isPlaying: false,
        };
        const instrumentalOutput = {
          name: `${baseName}_instrumental.wav`,
          url: URL.createObjectURL(result.instrumental),
          size: formatSize(result.instrumental.size),
          isPlaying: false,
        };

        setOutputs((current) => [...current, vocalOutput, instrumentalOutput]);
        setFileSize(`Durasi: ${Math.round(result.duration)} detik · WAV 16-bit · Stereo center/side`);
        setProgress(Math.round(((index + 1) / filesToProcess.length) * 100));
      }

      setFiles([]);
      toast({
        title: "Split selesai",
        description: `Berhasil membuat ${filesToProcess.length * 2} file stem: vocal dan instrumental.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "File tidak dapat diproses.";
      toast({
        title: "Split gagal",
        description: message,
        variant: "destructive",
      });
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      setProcessingStatus({ current: 0, total: 0 });
    }
  };

  const clearOutputs = () => {
    outputs.forEach((output) => URL.revokeObjectURL(output.url));
    setOutputs([]);
    setFileSize(null);
  };

  const uploaderProps = {
    files,
    setFiles,
    onFilesAccepted: processFiles,
    queuedCount: 0,
    fileSizeLimitEnabled: true,
    maxFileSizeMB: 50,
    toast,
    fileSize,
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <Card className="overflow-hidden border-border/70 bg-card/70 shadow-sm">
        <CardContent className="p-0">
          <div className="relative overflow-hidden border-b border-border/70 bg-gradient-to-br from-violet-500/10 via-background to-cyan-500/10 px-5 py-6 sm:px-8 sm:py-8">
            <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-violet-400/15 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300">Stem Lab</p>
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Pisahkan vocal & instrumental</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Buat dua stem WAV dari track stereo langsung di browser. Tidak ada file yang diunggah ke server.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-border/70 p-5 sm:grid-cols-2 sm:p-8">
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Mic2 className="h-4 w-4 text-violet-500" /> Vocal</div>
              <p className="text-xs leading-5 text-muted-foreground">Mengambil sinyal tengah (L + R), tempat vokal utama biasanya berada.</p>
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Music2 className="h-4 w-4 text-cyan-600" /> Instrumental</div>
              <p className="text-xs leading-5 text-muted-foreground">Mengambil sinyal sisi stereo (L − R) untuk mengurangi vokal tengah.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <FileUploader {...uploaderProps} />

      {isProcessing && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin text-violet-500" /> Memisahkan audio {processingStatus.current} dari {processingStatus.total}</span>
            <span className="font-semibold text-violet-600 dark:text-violet-300">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-violet-500/10">
            <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {outputs.length > 0 && (
        <ProcessedFilesList
          processedFiles={outputs}
          setProcessedFiles={setOutputs}
          clearProcessedFiles={clearOutputs}
          idPrefix="split-audio"
        />
      )}

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p><span className="font-medium text-foreground">Catatan:</span> hasil paling bersih didapat dari stereo mix dengan vokal di posisi tengah. Ini adalah ekstraksi center/side lokal, bukan pemisahan AI, jadi instrumen yang juga berada di tengah dapat ikut terdengar pada stem vocal.</p>
      </div>
    </div>
  );
};

const formatSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

export default VocalSplitter;
