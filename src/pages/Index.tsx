
import AudioWatermarker from "@/components/audio-watermarker";
import WatermarkManager from "@/components/WatermarkManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEffect } from "react";

const Index = () => {
  // Set dark mode as default
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="container mx-auto py-4 px-2 max-w-4xl">
      <Tabs defaultValue="watermarker" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="watermarker">IndoMusika Compressor</TabsTrigger>
          <TabsTrigger value="manage">Manage Watermarks</TabsTrigger>
        </TabsList>
        <TabsContent value="watermarker">
          <AudioWatermarker />
        </TabsContent>
        <TabsContent value="manage">
          <WatermarkManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
