import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Bell, CheckCheck } from "lucide-react";

export default function Notifications() {
  const { isAuthenticated } = useAuth();
  const query = trpc.notifications.list.useQuery(undefined, { enabled: isAuthenticated });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => query.refetch() });
  return <AppShell title="Bildirimler" eyebrow="Güncel kalın">{!isAuthenticated ? <EmptyState icon={Bell} title="Bildirim merkezi hesabınıza bağlı" description="Görevler, doğrulama durumu, puanlar ve ödül talepleri hakkında bildirim almak için giriş yapın." action={{ label: "Giriş yap", onClick: startLogin }} /> : query.isLoading ? <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div> : !query.data?.length ? <EmptyState icon={Bell} title="Şu an bildirim yok" description="Yeni görevler ve işlem durumları burada zaman sırasıyla görünür." /> : <div className="space-y-3">{query.data.map(notification => <article key={notification.id} className={`rounded-2xl border p-4 shadow-sm ${notification.status === "unread" ? "border-teal-500/25 bg-teal-500/[0.05]" : "border-border/80 bg-card/70"}`}><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white dark:bg-teal-300 dark:text-slate-950"><Bell className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-sm font-bold">{notification.title}</h2><time className="text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleDateString("tr-TR")}</time></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.body}</p></div>{notification.status === "unread" && <Button variant="ghost" size="icon" className="shrink-0 rounded-xl" onClick={() => markRead.mutate({ notificationId: notification.id })} aria-label="Okundu işaretle"><CheckCheck className="size-4" /></Button>}</div></article>)}</div>}</AppShell>;
}
