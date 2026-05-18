
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AudioLines, Upload, Check, WifiOff } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import {
  formatPostgrestError,
  formatStorageError,
  getViteSupabaseUrl,
  userFacingSupabaseNetworkHint,
} from "@/lib/supabaseEnv";

/** Safe for DB: strip controls, limit length (Postgres text is fine; keeps UI sane). */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 240);
}

/** Browsers often leave `File.type` empty; Storage + DB still need a sensible MIME. */
function resolveAudioContentType(file: File): string {
  const t = file.type?.trim();
  if (t) return t;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    wave: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    flac: "audio/flac",
    webm: "audio/webm",
  };
  return (ext && byExt[ext]) || "audio/mpeg";
}

function storageObjectPath(file: File): string {
  const timestamp = Date.now();
  const ext =
    file.name.includes(".") &&
    (file.name.split(".").pop()?.replace(/[^\w\d]/g, "").slice(0, 10) || "audio");
  const safeExt = ext || "bin";
  return `watermarks/watermark_${timestamp}.${safeExt}`;
}

const WatermarkManager: React.FC = () => {
  const { toast } = useToast();
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [currentWatermark, setCurrentWatermark] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [connectivityHint, setConnectivityHint] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentWatermark();
  }, []);

  const fetchCurrentWatermark = async () => {
    try {
      const { data, error } = await supabase
        .from("watermark_audio")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching watermark:", error);
        const hint = userFacingSupabaseNetworkHint(error.message);
        setConnectivityHint(hint);
        return;
      }

      setConnectivityHint(null);
      if (data) {
        setCurrentWatermark(data.filename);
      }
    } catch (error) {
      console.error("Error in fetchCurrentWatermark:", error);
      const msg = error instanceof Error ? error.message : String(error);
      setConnectivityHint(userFacingSupabaseNetworkHint(msg));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      const looksAudio =
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|m4a|aac|ogg|flac|webm|opus)$/i.test(file.name);
      if (!looksAudio) {
        toast({
          title: "Invalid File",
          description: "Please select an audio file (MP3, WAV, etc.)",
          variant: "destructive",
        });
        return;
      }
      
      setWatermarkFile(file);
    }
  };

  const uploadWatermark = async () => {
    if (!watermarkFile) {
      toast({
        title: "No File Selected",
        description: "Please select an audio file to use as watermark",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const filePath = storageObjectPath(watermarkFile);
      const contentType = resolveAudioContentType(watermarkFile);

      // Upload to Storage (unique path → no upsert / avoids extra UPDATE RLS edge cases)
      const { error: storageError } = await supabase.storage
        .from("audio")
        .upload(filePath, watermarkFile, {
          upsert: false,
          contentType,
        });

      if (storageError) {
        throw new Error(`Storage: ${formatStorageError(storageError)}`);
      }

      const safeName = sanitizeFilename(watermarkFile.name) || "watermark.mp3";

      // Save metadata to database
      const { error: dbError } = await supabase.from("watermark_audio").insert({
        filename: safeName,
        storage_path: filePath,
        content_type: contentType,
      });

      if (dbError) {
        // Avoid orphan objects in Storage so the user can retry cleanly
        await supabase.storage.from("audio").remove([filePath]);
        throw new Error(`Database: ${formatPostgrestError(dbError)}`);
      }

      toast({
        title: "Watermark Uploaded",
        description: "Your custom watermark has been uploaded successfully",
      });
      
      // Refresh the current watermark info
      fetchCurrentWatermark();
      
      // Clear the file input
      setWatermarkFile(null);
    } catch (error) {
      console.error("Error uploading watermark:", error);
      const raw =
        error instanceof Error ? error.message : "Upload failed unexpectedly.";
      const hint = userFacingSupabaseNetworkHint(raw);
      if (hint) setConnectivityHint(hint);
      toast({
        title: "Upload Failed",
        description: hint ?? raw,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AudioLines className="h-5 w-5" />
          <span>Watermark Management</span>
        </CardTitle>
        <CardDescription>
          Upload a custom audio watermark to use in your audio files
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connectivityHint && (
          <Alert variant="destructive">
            <WifiOff className="h-4 w-4" />
            <AlertTitle>Koneksi ke Supabase gagal</AlertTitle>
            <AlertDescription>{connectivityHint}</AlertDescription>
          </Alert>
        )}
        <p className="text-xs text-muted-foreground">
          Host API: <span className="font-mono break-all">{getViteSupabaseUrl()}</span>
        </p>
        {currentWatermark && (
          <div className="p-3 bg-muted rounded-md flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">Current watermark: {currentWatermark}</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="watermark-upload" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Upload New Watermark
          </label>
          <Input
            id="watermark-upload"
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            disabled={isUploading}
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground">
            Upload an audio file (MP3, WAV) to use as your watermark
          </p>
        </div>

        {watermarkFile && (
          <div className="p-3 bg-muted rounded-md flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AudioLines className="h-4 w-4" />
              <span className="text-sm">{watermarkFile.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {(watermarkFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          onClick={uploadWatermark}
          disabled={!watermarkFile || isUploading}
          className="w-full gap-2"
        >
          {isUploading ? (
            <>
              <span className="animate-spin">
                <Upload className="h-4 w-4" />
              </span>
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload Watermark
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default WatermarkManager;
