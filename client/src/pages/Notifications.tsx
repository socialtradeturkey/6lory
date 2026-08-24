import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Bell, CheckCheck, Trash2 } from "lucide-react";

export default function Notifications() {
  const { isAuthenticated } = useAuth();
  const query = trpc.notifications.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const utils = trpc.useUtils();
  const refresh = () => {
    void query.refetch();
    void utils.dashboard.summary.invalidate();
  };
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: refresh,
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: refresh,
  });
  const clearRead = trpc.notifications.clearRead.useMutation({
    onSuccess: refresh,
  });
  const notifications = query.data ?? [];
  const unreadCount = notifications.filter(
    notification => notification.status === "unread"
  ).length;
  const readCount = notifications.length - unreadCount;
  const busy =
    markRead.isPending || markAllRead.isPending || clearRead.isPending;

  if (!isAuthenticated)
    return (
      <AppShell title="Bildirimler" eyebrow="Hesabınıza özel">
        <EmptyState
          icon={Bell}
          title="Bildirim merkezi hesabınıza bağlı"
          description="Görevler, doğrulama durumu, puanlar ve ödül talepleri hakkında uygulama içi bildirim almak için giriş yapın."
          action={{ label: "Giriş yap", onClick: startLogin }}
        />
      </AppShell>
    );

  return (
    <AppShell title="Bildirimler" eyebrow="Hesabınıza özel">
      <section className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">
              Uygulama içi bildirim merkezi
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Görev, doğrulama, puan ve ödül gelişmeleri hesabınıza kalıcı
              olarak kaydedilir.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={!unreadCount || busy}
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="mr-1.5 size-4" /> Tümünü okundu say
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={!readCount || busy}
              onClick={() => clearRead.mutate()}
            >
              <Trash2 className="mr-1.5 size-4" /> Okunanları temizle
            </Button>
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold text-teal-700 dark:text-teal-300">
          {unreadCount
            ? `${unreadCount} okunmamış bildiriminiz var.`
            : "Tüm bildirimler okundu."}
        </p>
      </section>
      {query.isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : !notifications.length ? (
        <div className="mt-4">
          <EmptyState
            icon={Bell}
            title="Şu an bildirim yok"
            description="Yeni görevler ve işlem durumları burada zaman sırasıyla görünür."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {notifications.map(notification => (
            <article
              key={notification.id}
              className={`rounded-2xl border p-4 shadow-sm ${notification.status === "unread" ? "border-teal-500/25 bg-teal-500/[0.05]" : "border-border/80 bg-card/70"}`}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white dark:bg-teal-300 dark:text-slate-950">
                  <Bell className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-sm font-bold">{notification.title}</h2>
                    <time className="text-xs text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleDateString(
                        "tr-TR"
                      )}
                    </time>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {notification.body}
                  </p>
                </div>
                {notification.status === "unread" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 rounded-xl"
                    disabled={busy}
                    onClick={() =>
                      markRead.mutate({ notificationId: notification.id })
                    }
                    aria-label="Okundu işaretle"
                  >
                    <CheckCheck className="size-4" />
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {(markRead.error || markAllRead.error || clearRead.error) && (
        <p className="mt-4 text-sm text-destructive">
          Bildirim durumu güncellenemedi. Lütfen tekrar deneyin.
        </p>
      )}
    </AppShell>
  );
}
