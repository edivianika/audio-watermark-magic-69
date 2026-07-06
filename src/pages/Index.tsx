
import AudioWatermarker from "@/components/audio-watermarker";
import WatermarkManager from "@/components/WatermarkManager";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Moon, Sun } from "lucide-react";
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
    <div className="mx-auto min-h-screen w-full max-w-4xl px-3 py-3 sm:px-6 sm:py-6">
      <Tabs defaultValue="watermarker" className="space-y-3 sm:space-y-6">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <TabsList className="grid h-10 w-full grid-cols-2 rounded-md bg-muted/60 p-1">
            <TabsTrigger value="watermarker" className="h-8 text-xs sm:text-sm">
              Compress
            </TabsTrigger>
            <TabsTrigger value="manage" className="h-8 text-xs sm:text-sm">
              Watermark
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
      </Tabs>
    </div>
  );
};

export default Index;
