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
  ShieldCheck,
  TimerReset,
  MousePointerClick,
  PlaySquare,
  Youtube,
  ThumbsUp,
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

type YoutubeEvidence = {
  subscribed: boolean;
  liked: boolean;
  proofToken: string;
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
  const [secretCodeExpiresAt, setSecretCodeExpiresAt] = useState<number | null>(null);
  const [secretCodeInput, setSecretCodeInput] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [youtubeEvidence, setYoutubeEvidence] = useState<YoutubeEvidence | null>(null);
  const [youtubeActionState, setYoutubeActionState] = useState({ subscribed: false, liked: false });
  const [interactionCount, setInteractionCount] = useState(0);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [playerUnavailable, setPlayerUnavailable] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => document.visibilityState === "visible");
  const [seekPenaltySeconds, setSeekPenaltySeconds] = useState(0);
  const playerRef = useRef<any>(null);
  const lastPlayerTimeRef = useRef<number | null>(null);
  const secretAutoRequestedRef = useRef(false);

  const start = trpc.tasks.start.useMutation({
    onSuccess: result => {
      setSessionId(result.session?.publicId ?? null);
      setSessionExpiresAt(
        result.session?.expiresAt ? new Date(result.session.expiresAt).getTime() : null,
      );
      setIssuedSecretCode(null);
      setSecretCodeExpiresAt(null);
      setSecretCodeInput("");
      setSeekPenaltySeconds(0);
      setPlayerUnavailable(false);
      lastPlayerTimeRef.current = null;
      secretAutoRequestedRef.current = false;
      setVerificationStatus(null);
      setYoutubeEvidence(null);
      setYoutubeActionState({ subscribed: false, liked: false });
      toast.success(
        result.reused
          ? "Mevcut görev oturumunuz açıldı."
          : "Görev oturumunuz güvenle başlatıldı.",
      );
    },
    onError: error => toast.error(error.message),
  });

  const youtubeSubscribe = trpc.youtube.subscribe.useMutation({
    onSuccess: result => {
      setYoutubeActionState(state => ({ ...state, subscribed: true }));
      toast.success(result.alreadySubscribed ? "YouTube kanalına zaten abonesiniz." : "YouTube kanal aboneliği tamamlandı.");
    },
    onError: error => {
      if (/oturum.*(geçerli|süresi|bulunamadı)/i.test(error.message)) {
        setSessionId(null);
        setSessionExpiresAt(null);
        setRemainingSeconds(null);
        setIssuedSecretCode(null);
        setSecretCodeExpiresAt(null);
        setSecretCodeInput("");
        secretAutoRequestedRef.current = false;
      }
      toast.error(error.message);
    },
  });

  const youtubeLike = trpc.youtube.like.useMutation({
    onSuccess: result => {
      setYoutubeActionState(state => ({ ...state, liked: true }));
      toast.success(result.alreadyLiked ? "Video zaten beğenilmiş." : "YouTube video beğenisi tamamlandı.");
    },
    onError: error => {
      if (/oturum.*(geçerli|süresi|bulunamadı)/i.test(error.message)) {
        setSessionId(null);
        setSessionExpiresAt(null);
        setRemainingSeconds(null);
        setIssuedSecretCode(null);
        setSecretCodeExpiresAt(null);
        setSecretCodeInput("");
        secretAutoRequestedRef.current = false;
      }
      toast.error(error.message);
    },
  });

  const task = taskQuery.data;
  const nextTask = useMemo(
    () => tasksQuery.data?.find(candidate => candidate.id !== taskId) ?? null,
    [taskId, tasksQuery.data],
  );
  const embeddedTargetUrl = getEmbeddedTargetUrl(task?.targetUrl, task?.platform ?? "");
  const youtubeVideoId = embeddedTargetUrl?.match(/\/embed\/([^?]+)/)?.[1] ?? null;
  const activeSeconds = useMemo(() => {
    if (!task || remainingSeconds === null) return 0;
    return Math.max(0, task.sessionDurationSeconds - remainingSeconds);
  }, [remainingSeconds, task]);
  const effectiveActiveSeconds = Math.max(0, activeSeconds - seekPenaltySeconds);
  const signals = useMemo(
    () => ({ ...VerificationSignals, visibilityScore: embeddedTargetUrl ? 100 : 80, interactionCount: Math.max(1, interactionCount), activeSeconds: effectiveActiveSeconds }),
    [effectiveActiveSeconds, embeddedTargetUrl, interactionCount],
  );
  const secretTriggerSeconds = useMemo(() => {
    if (!sessionId || !task) return Infinity;
    const required = task.requiredWatchSeconds ?? task.estimatedDurationSeconds;
    const minimum = Math.max(required, task.secretCodeRandomMinSeconds ?? required);
    const maximum = Math.max(minimum, task.secretCodeRandomMaxSeconds ?? minimum);
    return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
  }, [sessionId, task?.id, task?.requiredWatchSeconds, task?.estimatedDurationSeconds, task?.secretCodeRandomMinSeconds, task?.secretCodeRandomMaxSeconds]);

  const issueSecretCode = trpc.tasks.issueSecretCode.useMutation({
    onSuccess: result => {
      setIssuedSecretCode(result.code);
      setSecretCodeExpiresAt(result.expiresAt ? new Date(result.expiresAt).getTime() : null);
      toast.success("Tek kullanımlık doğrulama kodu video üzerinde gösterildi.");
    },
    onError: error => {
      secretAutoRequestedRef.current = false;
      toast.error(error.message);
    },
  });

  useEffect(() => {
    const requiredWatchSeconds = task?.requiredWatchSeconds ?? task?.estimatedDurationSeconds ?? Infinity;
    if (
      task?.platform !== "youtube" ||
      task.verificationMethod !== "secret_code" ||
      !sessionId ||
      !isPlayerPlaying ||
      !isPageVisible ||
      signals.activeSeconds < secretTriggerSeconds ||
      secretAutoRequestedRef.current ||
      issuedSecretCode
    ) return;
    secretAutoRequestedRef.current = true;
    issueSecretCode.mutate({ sessionPublicId: sessionId, signals });
  }, [activeSeconds, isPageVisible, isPlayerPlaying, issuedSecretCode, issueSecretCode, sessionId, signals, task]);

  const youtubeVerify = trpc.youtube.verify.useMutation({
    onSuccess: result => {
      setYoutubeEvidence(result);
      if (result.subscribed && result.liked) toast.success("YouTube abonelik ve beğeni doğrulandı.");
      else toast.warning(`Eksik koşullar: ${!result.subscribed ? "kanal aboneliği" : ""}${!result.subscribed && !result.liked ? " ve " : ""}${!result.liked ? "video beğenisi" : ""}.`);
    },
    onError: error => toast.error(error.message),
  });

  const verify = trpc.tasks.verify.useMutation({
    onSuccess: async result => {
      const status = result.verification?.status ?? "pending";
      setVerificationStatus(status);
      await utils.tasks.list.invalidate();
      if (status === "manual_review") {
        toast.success("Görev tamamlandı. Yönetici onayı bekleniyor; onaydan sonra puanınız cüzdanınıza eklenecek.");
      } else if (status === "pass") {
        toast.success("Doğrulama tamamlandı; puanınız cüzdanınıza eklendi.");
      } else {
        toast.success("Doğrulama sonucu kaydedildi. Bildirim merkezinden takip edebilirsiniz.");
      }
    },
    onError: error => {
      if (/oturum.*(geçerli|süresi|bulunamadı)/i.test(error.message)) {
        setSessionId(null);
        setSessionExpiresAt(null);
        setRemainingSeconds(null);
        setIssuedSecretCode(null);
        setSecretCodeExpiresAt(null);
        setSecretCodeInput("");
        secretAutoRequestedRef.current = false;
      }
      toast.error(error.message);
    },
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
    if (!sessionId || remainingSeconds !== 0 || verificationStatus) return;
    setSessionId(null);
    setSessionExpiresAt(null);
    setRemainingSeconds(null);
    setIssuedSecretCode(null);
    setSecretCodeExpiresAt(null);
    setSecretCodeInput("");
    setIsPlayerPlaying(false);
    secretAutoRequestedRef.current = false;
    toast.warning("Görev oturumunun süresi doldu. Görevi yeniden başlatabilirsiniz.");
  }, [remainingSeconds, sessionId, verificationStatus]);

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
    let playerReady = false;
    const playerTimeout = window.setTimeout(() => {
      if (!playerReady) setPlayerUnavailable(true);
    }, 10_000);
    const onPlayerStateChange = (event: any) => {
      if (event.data === 1) setIsPlayerPlaying(true); // PLAYING
      else setIsPlayerPlaying(false); // PAUSED, ENDED, etc.
      if (event.data !== 1) lastPlayerTimeRef.current = null;
    };

    const initPlayer = () => {
      player = new (window as any).YT.Player("youtube-player", {
        videoId,
        playerVars: { autoplay: 1, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: (event: any) => {
            playerReady = true;
            setPlayerUnavailable(false);
            event.target.mute();
            event.target.playVideo();
          },
          onError: () => setPlayerUnavailable(true),
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
      window.clearTimeout(playerTimeout);
      setIsPlayerPlaying(false);
      secretAutoRequestedRef.current = false;
      if (player?.destroy) player.destroy();
    }
  }, [task?.platform, sessionId, embeddedTargetUrl]);

  useEffect(() => {
    if (!isPlayerPlaying || task?.platform !== "youtube") return;
    const checkPlayerPosition = () => {
      const current = playerRef.current?.getCurrentTime?.();
      if (typeof current !== "number") return;
      const previous = lastPlayerTimeRef.current;
      if (previous !== null && current - previous > 2.5) {
        const skipped = Math.ceil(current - previous - 1);
        setSeekPenaltySeconds(value => value + Math.max(1, skipped));
        toast.warning("İleri sarma tespit edildi; atlanan süre izleme kanıtından düşüldü.");
      }
      lastPlayerTimeRef.current = current;
    };
    const timer = window.setInterval(checkPlayerPosition, 1000);
    return () => window.clearInterval(timer);
  }, [isPlayerPlaying, task?.platform]);

  useEffect(() => {
    if (!secretCodeExpiresAt) return;
    const timeout = window.setTimeout(() => {
      setIssuedSecretCode(null);
      setSecretCodeExpiresAt(null);
      secretAutoRequestedRef.current = false;
    }, Math.max(0, secretCodeExpiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [secretCodeExpiresAt]);

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
  const isReadyForSecretCode = effectiveActiveSeconds >= (task.requiredWatchSeconds ?? task.estimatedDurationSeconds);
  const youtubeActionReady = !supportsSecretCode || Boolean(issuedSecretCode);
  const youtubeRequirementsMet = task.platform !== "youtube" || (!task.requiresYoutubeSubscription && !task.requiresYoutubeLike) || Boolean(youtubeEvidence && (!task.requiresYoutubeSubscription || youtubeEvidence.subscribed) && (!task.requiresYoutubeLike || youtubeEvidence.liked));

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
              <>
              <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm">
                {task.platform === "youtube" && sessionId ? (
                  <div className="relative aspect-video w-full">
                    <div id="youtube-player" className="h-full w-full" />
                    {issuedSecretCode && !playerUnavailable && (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-950/30 p-4">
                        <div className="rounded-2xl border border-white/35 bg-slate-950/90 px-5 py-3 text-center text-white shadow-2xl backdrop-blur-sm">
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">Görev doğrulama kodu</p>
                          <p className="mt-1 font-mono text-2xl font-black tracking-[0.28em] sm:text-3xl sm:tracking-[0.35em]">{issuedSecretCode}</p>
                          <p className="mt-1 text-[11px] text-white/75">Kodu aşağıdaki alana girin</p>
                        </div>
                      </div>
                    )}
                    {playerUnavailable && (
                      <div className="absolute inset-0 grid place-items-center bg-slate-950/90 p-5 text-center text-white">
                        <div className="max-w-sm">
                          <p className="text-sm font-bold">YouTube player yüklenemedi</p>
                          <p className="mt-2 text-xs leading-5 text-white/75">YouTube, bu tarayıcı oturumunda gömülü oynatmayı engelledi. Dış sayfada izleme, 6lory sayaç kanıtı yerine geçmez ve görevi tamamlamaz.</p>
                          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-900 transition hover:bg-white/90">Player’ı yeniden dene</button>
                          {task.targetUrl && <a href={task.targetUrl} target="_blank" rel="noreferrer" className="mt-3 block text-xs font-semibold text-teal-300 underline underline-offset-4">YouTube sayfasını yalnızca kontrol için aç</a>}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <iframe src={embeddedTargetUrl} title={`${task.title} görev çalışma alanı`} className="aspect-video w-full" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onLoad={() => setInteractionCount(value => Math.max(1, value))} />
                )}
              </div>
              {task.platform === "youtube" && sessionId && (task.requiresYoutubeSubscription || task.requiresYoutubeLike) && (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-sm font-semibold">YouTube görev adımları</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {supportsSecretCode && !issuedSecretCode
                      ? "Önce videoyu gerçek oynatma ile izleyin ve Secret Code’u girin. Ardından zorunlu YouTube işlemlerini bu panelden başlatın."
                      : "İşlemler bağlı YouTube hesabınızla resmi API üzerinden başlatılır; görev gönderilmeden önce sunucu kanıtı alınır."}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {task.requiresYoutubeSubscription ? (
                      <Button
                        type="button"
                        disabled={!youtubeActionReady || !task.youtubeChannelId || youtubeSubscribe.isPending || youtubeActionState.subscribed}
                        onClick={() => sessionId && youtubeSubscribe.mutate({ sessionPublicId: sessionId })}
                        className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
                      >
                        <Youtube className="size-4" /> {youtubeActionState.subscribed ? "Abonelik tamamlandı" : youtubeSubscribe.isPending ? "Abonelik işleniyor..." : "Abone ol"}
                      </Button>
                    ) : <span className="rounded-xl bg-muted/70 px-3 py-2 text-center text-xs text-muted-foreground">Abonelik gerekmiyor</span>}
                    {task.requiresYoutubeLike ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!youtubeActionReady || !youtubeVideoId || youtubeLike.isPending || youtubeActionState.liked}
                        onClick={() => sessionId && youtubeLike.mutate({ sessionPublicId: sessionId })}
                        className="rounded-xl border-red-500/40 text-xs text-red-700 transition hover:bg-red-500/10 dark:text-red-300"
                      >
                        <ThumbsUp className="size-4" /> {youtubeActionState.liked ? "Beğeni tamamlandı" : youtubeLike.isPending ? "Beğeni işleniyor..." : "Videoyu beğen"}
                      </Button>
                    ) : <span className="rounded-xl bg-muted/70 px-3 py-2 text-center text-xs text-muted-foreground">Beğeni gerekmiyor</span>}
                  </div>
                  <Button
                    variant="outline"
                    disabled={youtubeVerify.isPending || youtubeSubscribe.isPending || youtubeLike.isPending || !youtubeActionReady || !youtubeVideoId || !task.youtubeChannelId}
                    onClick={() => {
                      if (youtubeVideoId && task.youtubeChannelId) youtubeVerify.mutate({ videoId: youtubeVideoId, channelId: task.youtubeChannelId });
                    }}
                    className="mt-3 w-full rounded-xl text-xs"
                  >
                    <ShieldCheck className="mr-2 size-4" /> {youtubeVerify.isPending ? "YouTube kontrol ediliyor..." : "YouTube koşullarını kontrol et"}
                  </Button>
                  {youtubeEvidence && (
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2" aria-live="polite">
                      {task.requiresYoutubeSubscription && <span className={`rounded-xl px-3 py-2 font-semibold ${youtubeEvidence.subscribed ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{youtubeEvidence.subscribed ? "✓ Kanal aboneliği doğrulandı" : "! Kanal aboneliği eksik"}</span>}
                      {task.requiresYoutubeLike && <span className={`rounded-xl px-3 py-2 font-semibold ${youtubeEvidence.liked ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>{youtubeEvidence.liked ? "✓ Video beğenisi doğrulandı" : "! Video beğenisi eksik"}</span>}
                    </div>
                  )}
                </div>
              )}
              </>
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
                    Minimum izleme süresi dolunca tek kullanımlık kod video üzerinde otomatik görünür. Kodu aşağıdaki alana girin; kod yalnız bu oturum için geçerlidir ve yeniden kullanılamaz.
                  </p>
                  <div className="rounded-2xl bg-muted/65 p-3 text-xs leading-5 text-muted-foreground" aria-live="polite">
                    <span className="font-semibold text-foreground">İzleme durumu:</span>{" "}
                    {isPlayerPlaying ? "Video oynuyor." : "Video duraklatıldı; sayaç ilerlemiyor."}
                    {seekPenaltySeconds > 0 && ` İleri sarma nedeniyle ${seekPenaltySeconds} saniye düşüldü.`}
                  </div>
                  {!isReadyForSecretCode && !isSessionExpired && (
                    <p className="rounded-2xl bg-muted/65 p-3 text-xs leading-5 text-muted-foreground">
                      Kod, en az {task.requiredWatchSeconds ?? task.estimatedDurationSeconds} saniyelik gerçek izleme sonrasında, görev ayarındaki rastgele aralık içinde otomatik gösterilir.
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
                    {issuedSecretCode ? "Kodu yeniden göster" : "Kodu göster"}
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
                    inputMode="numeric"
                    maxLength={6}
                    aria-label="Tek kullanımlık Secret Code"
                    className="h-12 rounded-xl text-center font-mono text-lg tracking-[0.28em]"
                  />
                  <Button
                    disabled={
                      verify.isPending ||
                      verificationStatus === "manual_review" ||
                      verificationStatus === "pass" ||
                      isSessionExpired ||
                      secretCodeInput.trim().length < 4
                    }
                    onClick={() =>
                      verify.mutate({
                        sessionPublicId: sessionId,
                        idempotencyKey: crypto.randomUUID(),
                        signals,
                        secretCode: secretCodeInput.trim(),
                        youtubeProof: youtubeRequirementsMet ? youtubeEvidence?.proofToken : undefined,
                      })
                    }
                    className="w-full rounded-xl"
                  >
                    {verificationStatus === "manual_review" ? "Tamamlandı — onay bekleniyor" : "Kodu gönder"}
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
                        youtubeProof: youtubeRequirementsMet ? youtubeEvidence?.proofToken : undefined,
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
                  <p className="mt-3 rounded-2xl bg-muted/65 p-3 text-xs font-semibold text-muted-foreground">
                    Son doğrulama sonucu: {verificationStatus === "pass" ? "onaylandı ve puan cüzdana eklendi" : verificationStatus === "manual_review" ? "görev tamamlandı — yönetici onayı bekleniyor" : verificationStatus}
                  </p>
                  {verificationStatus === "manual_review" && <p className="rounded-2xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">Puanınız admin onayından sonra cüzdanınıza yansıyacaktır.</p>}
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
