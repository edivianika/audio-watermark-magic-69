
import AudioWatermarker from "@/components/AudioWatermarker";
import WatermarkManager from "@/components/WatermarkManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudioLines, Settings } from "lucide-react";

const Index = () => {
  return (
    <div className="container mx-auto py-4 px-4 md:py-8 max-w-4xl">
      <Tabs defaultValue="watermarker" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:w-auto">
          <TabsTrigger value="watermarker" className="gap-2">
            <AudioLines className="h-4 w-4 hidden sm:inline" />
            <span>Audio Watermarker</span>
          </TabsTrigger>
          <TabsTrigger value="manage" className="gap-2">
            <Settings className="h-4 w-4 hidden sm:inline" />
            <span>Manage Watermarks</span>
          </TabsTrigger>
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
