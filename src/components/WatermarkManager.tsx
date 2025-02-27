
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AudioLines, Upload, AlertCircle, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

const WatermarkManager: React.FC = () => {
  const { toast } = useToast();
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [currentWatermark, setCurrentWatermark] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchCurrentWatermark();
  }, []);

  const fetchCurrentWatermark = async () => {
    try {
      const { data, error } = await supabase
        .from('watermark_audio')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error("Error fetching watermark:", error);
        return;
      }

      if (data) {
        setCurrentWatermark(data.filename);
      }
    } catch (error) {
      console.error("Error in fetchCurrentWatermark:", error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      if (!file.type.startsWith('audio/')) {
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
      // Generate a unique file path
      const timestamp = Date.now();
      const extension = watermarkFile.name.split('.').pop();
      const filePath = `watermark_${timestamp}.${extension}`;

      // Upload to Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('audio')
        .upload(filePath, watermarkFile, {
          upsert: true,
          contentType: watermarkFile.type
        });

      if (storageError) {
        throw new Error(`Storage error: ${JSON.stringify(storageError)}`);
      }

      // Save metadata to database
      const { error: dbError } = await supabase
        .from('watermark_audio')
        .insert({
          filename: watermarkFile.name,
          storage_path: filePath,
          content_type: watermarkFile.type
        });

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
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
      toast({
        title: "Upload Failed",
        description: error.message,
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
