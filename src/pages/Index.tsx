
import AudioWatermarker from "@/components/audio-watermarker";
import WatermarkManager from "@/components/WatermarkManager";
import VocalSplitter from "@/components/vocal-splitter/VocalSplitter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mic2, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const Index = () => {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const storedTheme = localStorage.getItem("theme");
    return storedTheme === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(currentTheme => currentTheme === "dark" ? "light" : "dark");
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl px-2.5 py-2.5 sm:px-6 sm:py-6">
      <Tabs defaultValue="watermarker" className="space-y-3 sm:space-y-6">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
          <TabsList className="grid h-10 min-w-0 w-full grid-cols-3 overflow-hidden rounded-md bg-muted/60 p-1">
            <TabsTrigger value="watermarker" aria-label="Compress" className="h-8 min-w-0 overflow-hidden px-1 text-[11px] tracking-tight sm:px-3 sm:text-sm">
              Compress
            </TabsTrigger>
            <TabsTrigger value="manage" aria-label="Watermark" className="h-8 min-w-0 overflow-hidden px-1 text-[11px] tracking-tight sm:px-3 sm:text-sm">
              <span className="sm:hidden">Mark</span>
              <span className="hidden sm:inline">Watermark</span>
            </TabsTrigger>
            <TabsTrigger value="split" aria-label="Split Vocal" className="h-8 min-w-0 gap-0.5 overflow-hidden px-1 text-[11px] tracking-tight sm:gap-1 sm:px-3 sm:text-sm">
              <Mic2 className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
              <span className="sm:hidden">Split</span>
              <span className="hidden sm:inline">Split Vocal</span>
            </TabsTrigger>
          </TabsList>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="h-10 w-10 rounded-md bg-muted/60"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
        <TabsContent value="watermarker">
          <AudioWatermarker />
        </TabsContent>
        <TabsContent value="manage">
          <WatermarkManager />
        </TabsContent>
        <TabsContent value="split">
          <VocalSplitter />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Index;
