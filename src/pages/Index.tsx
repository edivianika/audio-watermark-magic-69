
import AudioWatermarker from "@/components/audio-watermarker";
import WatermarkManager from "@/components/WatermarkManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Tabs defaultValue="watermarker" className="space-y-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="watermarker">Audio Watermarker</TabsTrigger>
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
