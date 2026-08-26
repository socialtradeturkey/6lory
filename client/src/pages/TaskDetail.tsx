import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  KeyRound,
  ShieldAlert,
  TimerReset,
  MousePointerClick,
  PlaySquare,
} from "lucide-react";

function getEmbeddedTargetUrl(targetUrl: string | null | undefined, platform: string) {
  if (!targetUrl) return null;
  try {
    const url = new URL(targetUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (platform === "youtube" && url.hostname.includes("youtube.com") && url.pathname === "/watch") {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1` : null;
    }
    if (platform === "youtube" && url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed/${encodeURIComponent(url.pathname.slice(1))}?rel=0&modestbranding=1`;
    }
    return url.toString();
  } catch {
    return null;
  }
}

const VerificationSignals = {
  sessionValid: true,
  visibilityScore: 100,
  interactionCount: 1,
};

export default function TaskDetail() {
  const [, params] = useRoute("/tasks/:id");
  const taskId = Number(params?.id);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const taskQuery = trpc.tasks.detail.useQuery(
    { taskId },
    { enabled: isAuthenticated && Number.isInteger(taskId) && taskId > 0 },
  );
  const tasksQuery = trpc.tasks.list.useQuery(undefined, { enabled: isAuthenticated });
  const utils = trpc.useUtils();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [issuedSecretCode, setIssuedSecretCode] = useState<string | null>(null);
  const [secretCodeInput, setSecretCodeInput] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [interactionCount, setInteractionCount] = useState(0);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => document.visibilityState === "visible");
  const playerRef = useRef<any>(null);

  const start = trpc.tasks.start.useMutation({
    onSuccess: result => {
      setSessionId(result.session?.publicId ?? null);
      setSessionExpiresAt(
        result.session?.expiresAt ? new Date(result.session.expiresAt).getTime() : null,
      );
      setIssuedSecretCode(null);
      setSecretCodeInput("");
      setVerificationStatus(null);
      toast.success(
        result.reused
          ? "Mevcut görev oturumunuz açıldı."
          : "Görev oturumunuz güvenle başlatıldı.",
      );
    },
    onError: error => toast.error(error.message),
  });

  const task = taskQuery.data;
  const nextTask = useMemo(
    () => tasksQuery.data?.find(candidate => candidate.id !== taskId) ?? null,
    [taskId, tasksQuery.data],
  );
  const embeddedTargetUrl = getEmbeddedTargetUrl(task?.targetUrl, task?.platform ?? "");
  const activeSeconds = useMemo(() => {
    if (!task || remainingSeconds === null) return 0;
    return Math.max(0, task.sessionDurationSeconds - remainingSeconds);
  }, [remainingSeconds, task]);
  const signals = useMemo(
    () => ({ ...VerificationSignals, visibilityScore: embeddedTargetUrl ? 100 : 80, interactionCount: Math.max(1, interactionCount), activeSeconds }),
    [activeSeconds, embeddedTargetUrl, interactionCount],
  );

  const issueSecretCode = trpc.tasks.issueSecretCode.useMutation({
    onSuccess: result => {
      setIssuedSecretCode(result.code);
      toast.success("Tek kullanımlık doğrulama kodu oluşturuldu.");
    },
    onError: error => toast.error(error.message),
  });

  const verify = trpc.tasks.verify.useMutation({
    onSuccess: async result => {
      const status = result.verification?.status ?? "pending";
      setVerificationStatus(status);
      await utils.tasks.list.invalidate();
      if (status === "pass") {
        toast.success("Doğrulama tamamlandı; puan kaydı güvenle oluşturuldu.");
      } else {
        toast.success("Doğrulama sonucu kaydedildi. Bildirim merkezinden takip edebilirsiniz.");
      }
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const updateRemaining = () => {
      if (task?.platform === "youtube" && sessionId && (!isPlayerPlaying || !isPageVisible)) return;
      setRemainingSeconds(prev => {
        if (prev === null) return Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000));
        return Math.max(0, prev - 1);
      });
    };
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [sessionExpiresAt, isPlayerPlaying, isPageVisible, task?.platform, sessionId]);

  useEffect(() => {
    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      setIsPageVisible(visible);
      if (!visible) {
        setIsPlayerPlaying(false);
      } else if (playerRef.current?.getPlayerState) {
        setIsPlayerPlaying(playerRef.current.getPlayerState() === 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (task?.platform !== "youtube" || !sessionId || !embeddedTargetUrl) return;
    const videoId = embeddedTargetUrl.split("/embed/")[1]?.split("?")[0];
    if (!videoId) return;

    let player: any;
    const onPlayerStateChange = (event: any) => {
      if (event.data === 1) setIsPlayerPlaying(true); // PLAYING
      else setIsPlayerPlaying(false); // PAUSED, ENDED, etc.
    };

    const initPlayer = () => {
      player = new (window as any).YT.Player("youtube-player", {
        videoId,
        playerVars: { autoplay: 1, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (event: any) => {
            event.target.mute();
            event.target.playVideo();
          },
          onStateChange: onPlayerStateChange,
        },
      });
      playerRef.current = player;
    };

    if (!(window as any).YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    } else {
      initPlayer();
    }

    return () => {
      setIsPlayerPlaying(false);
      if (player?.destroy) player.destroy();
    };
  }, [task?.platform, sessionId, embeddedTargetUrl]);

  if (!isAuthenticated) {
    return (
      <AppShell title="Görev ayrıntısı" eyebrow="Güvenli oturum">
        <EmptyState
          icon={ClipboardCheck}
          title="Görevi başlatmak için giriş yapın"
          description="Görev oturumu kullanıcı hesabınıza, kota kurallarına ve sunucu saatine bağlı olarak oluşturulur."
          action={{ label: "Güvenli giriş yap", onClick: startLogin }}
        />
      </AppShell>
    );
  }

  if (authLoading || (taskQuery.isPending && taskQuery.fetchStatus !== "idle")) {
    return (
      <AppShell title="Görev ayrıntısı" eyebrow="Yükleniyor">
        <div className="h-80 animate-pulse rounded-3xl bg-muted" />
      </AppShell>
    );
  }

  if (taskQuery.error || !task) {
    return (
      <AppShell title="Görev bulunamadı" eyebrow="Görevler">
        <EmptyState
          icon={ShieldAlert}
          title="Görev şu anda açılamıyor"
          description={taskQuery.error?.message ?? "Görev kaldırılmış, süresi dolmuş veya bu oturumla erişilemiyor."}
          action={{
            label: "Görevlere dön",
            onClick: () => window.location.assign("/tasks"),
          }}
        />
      </AppShell>
    );
  }

  const supportsManualRequest =
    task.verificationMethod === "manual_review" ||
    task.verificationMethod === "platform_api_manual_fallback";
  const supportsSecretCode = task.verificationMethod === "secret_code";
  const formattedRemaining =
    remainingSeconds === null
      ? null
      : `${Math.floor(remainingSeconds / 60)
          .toString()
          .padStart(2, "0")}:${(remainingSeconds % 60)
          .toString()
          .padStart(2, "0")}`;
  const isSessionExpired = remainingSeconds === 0;
  const isReadyForSecretCode = activeSeconds >= task.estimatedDurationSeconds;

  return (
    <AppShell title="Görev ayrıntısı" eyebrow="Doğrulanmış akış">
      <Link
        href="/tasks"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-300"
      >
        <ArrowLeft className="size-4" /> Görevlere dön
      </Link>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-3xl border border-border/80 bg-card/75 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
                {task.platform}
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
                {task.title}
              </h2>
            </div>
            <span className="rounded-2xl bg-teal-500/10 px-3 py-2 text-sm font-bold text-teal-700 dark:text-teal-300">
              +{task.rewardPoints} puan
            </span>
          </div>
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            {task.description || "Görev talimatları ve doğrulama yöntemi başlamadan önce bu alanda görünür."}
          </p>
          <div className="mt-6 border-t border-border/70 pt-5">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground">
              Adımlar
            </p>
            <ol className="mt-3 space-y-3">
              {task.instructions.map((instruction, index) => (
                <li key={`${instruction}-${index}`} className="flex gap-3 text-sm leading-6">
                  <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span>{instruction}</span>
                </li>
              ))}
            </ol>
          </div>
          <section className="mt-6 rounded-3xl border border-teal-500/20 bg-teal-500/[0.04] p-4 sm:p-5" aria-label="Görev çalışma alanı" onPointerDown={() => setInteractionCount(value => value + 1)}>
            <div className="flex items-center gap-2">
              {task.platform === "youtube" ? <PlaySquare className="size-4 text-teal-700 dark:text-teal-300" /> : <MousePointerClick className="size-4 text-teal-700 dark:text-teal-300" />}
              <h3 className="font-display text-base font-bold">Görevi uygulama içinde tamamlayın</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {task.platform === "youtube" ? "Videoyu bu panel içinde izleyin; süre ve oturum etkinliği doğrulama isteğine bağlanır." : task.platform === "instagram" ? "Instagram görev alanını bu panel içinde inceleyin; doğrulanamayan sosyal eylemler otomatik başarı sayılmaz." : "Hedefi bu çalışma alanında inceleyin ve doğrulama adımlarını aynı oturumda tamamlayın."}
            </p>
            {embeddedTargetUrl ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm">
                {task.platform === "youtube" && sessionId ? (
                  <div id="youtube-player" className="aspect-video w-full" />
                ) : (
                  <iframe src={embeddedTargetUrl} title={`${task.title} görev çalışma alanı`} className="aspect-video w-full" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setInteractionCount(value => Math.max(1, value))} />
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm leading-6 text-muted-foreground">Bu görev için gömülebilir hedef bulunmuyor. Talimatları uygulayın; sistem doğrulanamayan bir sosyal işlemi başarı olarak işaretlemez.</div>
            )}
          </section>
        </article>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <TimerReset className="size-4 text-teal-700 dark:text-teal-300" />
              <h3 className="font-display text-base font-bold">Görev oturumu</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Oturumlar kullanıcıya bağlı, süreli ve tekrar oynatma korumalıdır.
            </p>
            <div className="mt-4 rounded-2xl bg-muted/65 p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" /> En fazla {Math.round(task.sessionDurationSeconds / 60)} dakika
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Beklenen süre: {task.estimatedDurationSeconds} saniye
              </p>
              {formattedRemaining && (
                <p
                  aria-live="polite"
                  className={`mt-3 font-display text-xl font-bold ${
                    isSessionExpired ? "text-destructive" : "text-teal-700 dark:text-teal-300"
                  }`}
                >
                  Kalan süre: {formattedRemaining}
                </p>
              )}
            </div>
            {!sessionId ? (
              <Button
                disabled={start.isPending}
                onClick={() =>
                  start.mutate({ taskId: task.id, idempotencyKey: crypto.randomUUID() })
                }
                className="mt-4 w-full rounded-xl"
              >
                Görevi başlat
              </Button>
            ) : (
              <div className="mt-4 rounded-2xl bg-teal-500/10 p-3 text-sm font-semibold text-teal-700 dark:text-teal-300">
                <CheckCircle2 className="mr-1.5 inline size-4" /> Oturum güvenle oluşturuldu.
              </div>
            )}
          </div>

          {sessionId && (
            <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="size-4 text-teal-700 dark:text-teal-300" />
                <h3 className="font-display text-base font-bold">Doğrulama</h3>
              </div>

              {supportsSecretCode ? (
                <div className="mt-3 space-y-3">
                  <p className="text-sm leading-6 text-muted-foreground">
                    Beklenen süre dolduktan sonra tek kullanımlık kodu isteyin. Kod yalnız bu oturum için geçerlidir ve yeniden kullanılamaz.
                  </p>
                  {!isReadyForSecretCode && !isSessionExpired && (
                    <p className="rounded-2xl bg-muted/65 p-3 text-xs leading-5 text-muted-foreground">
                      Kod isteme adımı, en az {task.estimatedDurationSeconds} saniyelik güvenli oturum etkinliğinden sonra açılır.
                    </p>
                  )}
                  <Button
                    disabled={
                      issueSecretCode.isPending || isSessionExpired || !isReadyForSecretCode
                    }
                    onClick={() =>
                      issueSecretCode.mutate({ sessionPublicId: sessionId, signals })
                    }
                    variant="outline"
                    className="w-full rounded-xl"
                  >
                    <KeyRound className="mr-2 size-4" />
                    {issuedSecretCode ? "Yeni kod iste" : "Tek kullanımlık kod iste"}
                  </Button>

                  {issuedSecretCode && (
                    <div className="rounded-2xl border border-teal-600/20 bg-teal-500/10 p-3">
                      <p className="text-xs font-semibold text-teal-900 dark:text-teal-100">
                        Oturum doğrulama kodu
                      </p>
                      <code className="mt-1 block select-all break-all font-mono text-sm font-bold text-teal-800 dark:text-teal-200">
                        {issuedSecretCode}
                      </code>
                    </div>
                  )}

                  <label className="block text-xs font-semibold text-muted-foreground" htmlFor="secret-code">
                    Tek kullanımlık kod
                  </label>
                  <Input
                    id="secret-code"
                    value={secretCodeInput}
                    onChange={event => setSecretCodeInput(event.target.value.toUpperCase())}
                    placeholder="Kodu girin"
                    autoComplete="one-time-code"
                    className="rounded-xl font-mono"
                  />
                  <Button
                    disabled={
                      verify.isPending ||
                      isSessionExpired ||
                      secretCodeInput.trim().length < 4
                    }
                    onClick={() =>
                      verify.mutate({
                        sessionPublicId: sessionId,
                        idempotencyKey: crypto.randomUUID(),
                        signals,
                        secretCode: secretCodeInput.trim(),
                      })
                    }
                    className="w-full rounded-xl"
                  >
                    Kodu doğrula
                  </Button>
                </div>
              ) : supportsManualRequest ? (
                <>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Bu görevde sonuç, yönetici incelemesiyle verilir. Talep göndermek puan kazandığınız anlamına gelmez.
                  </p>
                  <Button
                    disabled={verify.isPending || isSessionExpired}
                    onClick={() =>
                      verify.mutate({
                        sessionPublicId: sessionId,
                        idempotencyKey: crypto.randomUUID(),
                        signals,
                      })
                    }
                    variant="outline"
                    className="mt-4 w-full rounded-xl"
                  >
                    {isSessionExpired ? "Oturum süresi doldu" : "İnceleme talebi oluştur"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Bu doğrulama yöntemi için güvenilir adapter veya gerekli entegrasyon henüz kullanılamıyor.
                  </p>
                  <div className="mt-4 rounded-2xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    <ShieldAlert className="mr-1 inline size-3.5" /> Sistem bu durumda otomatik başarı veya puan üretmez.
                  </div>
                </>
              )}

              {verificationStatus && (
                <>
                  <p className="mt-3 rounded-2xl bg-muted/65 p-3 text-xs font-semibold text-muted-foreground">Son doğrulama sonucu: {verificationStatus === "pass" ? "başarılı" : verificationStatus}</p>
                  {verificationStatus === "pass" && nextTask && <Link href={`/tasks/${nextTask.id}`} className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Sıradaki görevi aç</Link>}
                </>
              )}
            </div>
          )}
        </aside>
      </section>
    </AppShell>
  );
}
