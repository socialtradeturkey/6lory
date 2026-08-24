import { BellRing, CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";

function decodeBase64Url(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export default function PushPreference() {
  const [message, setMessage] = useState<string | null>(null);
  const status = trpc.notifications.pushStatus.useQuery();
  const saveSubscription = trpc.notifications.savePushSubscription.useMutation({ onSuccess: () => setMessage("Bu cihaz için Web Push bildirimi etkinleştirildi.") });

  const enable = async () => {
    setMessage(null);
    if (!status.data?.configured) return setMessage("Web Push, geçerli VAPID anahtarları sağlanana kadar güvenli biçimde devre dışı.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setMessage("Bu tarayıcı Web Push özelliğini desteklemiyor.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setMessage("Bildirim izni verilmedi. Tarayıcı ayarlarından daha sonra değiştirebilirsiniz.");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(status.data.publicKey) });
      const data = subscription.toJSON();
      if (!data.keys?.p256dh || !data.keys.auth) throw new Error("PUSH_KEYS_UNAVAILABLE");
      await saveSubscription.mutateAsync({ endpoint: subscription.endpoint, keys: { p256dh: data.keys.p256dh, auth: data.keys.auth }, userAgent: navigator.userAgent });
    } catch {
      setMessage("Web Push aboneliği oluşturulamadı. Tarayıcı izinlerini ve HTTPS bağlantısını kontrol edin.");
    }
  };

  const configured = status.data?.configured ?? false;
  return <section className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-bold">Web Push bildirimleri</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Yeni görev, doğrulama sonucu, puan ve ödül gelişmeleri için bu cihazı isteğe bağlı olarak bağlayın.</p></div><span className={`grid size-10 place-items-center rounded-2xl ${configured ? "bg-teal-500/10 text-teal-700 dark:text-teal-300" : "bg-muted text-muted-foreground"}`}><BellRing className="size-5" /></span></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/65 p-3"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CircleAlert className="size-3.5" /> {configured ? "Tarayıcı izninizle etkinleştirilebilir." : "Sunucu VAPID yapılandırması geçerli olmadığı için bildirim gönderilmez."}</p><Button size="sm" variant={configured ? "default" : "outline"} disabled={!configured || saveSubscription.isPending} onClick={() => void enable()} className="rounded-xl">{saveSubscription.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}{configured ? "Bu cihazı etkinleştir" : "Yapılandırma bekliyor"}</Button></div>{message && <p className="mt-3 text-xs leading-5 text-muted-foreground" role="status">{message}</p>}{saveSubscription.error && <p className="mt-3 text-xs text-destructive">{saveSubscription.error.message}</p>}</section>;
}
