import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const capturePrompt = (event: Event) => { event.preventDefault(); setDeferredPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () => window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);
  if (!deferredPrompt) return null;
  return <Button variant="outline" size="sm" onClick={async () => { await deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); }} className="hidden rounded-xl text-xs sm:inline-flex"><Download className="mr-1.5 size-3.5" /> Uygulamayı yükle</Button>;
}
