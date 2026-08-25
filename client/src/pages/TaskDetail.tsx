import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

const VerificationSignals = {
  sessionValid: true,
  visibilityScore: 100,
  interactionCount: 1,
};

export default function TaskDetail() {
  const [, params] = useRoute("/tasks/:id");
  const taskId = Number(params?.id);
  const { isAuthenticated } = useAuth();
  const taskQuery = trpc.tasks.detail.useQuery(
    { taskId },
    { enabled: isAuthenticated && Number.isInteger(taskId) && taskId > 0 },
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [issuedSecretCode, setIssuedSecretCode] = useState<string | null>(null);
  const [secretCodeInput, setSecretCodeInput] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);

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
  const activeSeconds = useMemo(() => {
    if (!task || remainingSeconds === null) return 0;
    return Math.max(0, task.sessionDurationSeconds - remainingSeconds);
  }, [remainingSeconds, task]);
  const signals = useMemo(
    () => ({ ...VerificationSignals, activeSeconds }),
    [activeSeconds],
  );

  const issueSecretCode = trpc.tasks.issueSecretCode.useMutation({
    onSuccess: result => {
      setIssuedSecretCode(result.code);
      toast.success("Tek kullanımlık doğrulama kodu oluşturuldu.");
    },
    onError: error => toast.error(error.message),
  });

  const verify = trpc.tasks.verify.useMutation({
    onSuccess: result => {
      const status = result.verification?.status ?? "pending";
      setVerificationStatus(status);
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
    const updateRemaining = () =>
      setRemainingSeconds(
        Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000)),
      );
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [sessionExpiresAt]);

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

  if (taskQuery.isLoading) {
    return (
      <AppShell title="Görev ayrıntısı" eyebrow="Yükleniyor">
        <div className="h-80 animate-pulse rounded-3xl bg-muted" />
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell title="Görev bulunamadı" eyebrow="Görevler">
        <EmptyState
          icon={ShieldAlert}
          title="Bu görev kullanılamıyor"
          description="Görev kaldırılmış, süresi dolmuş veya erişim kapsamınız dışında olabilir."
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
                <p className="mt-3 rounded-2xl bg-muted/65 p-3 text-xs font-semibold text-muted-foreground">
                  Son doğrulama sonucu: {verificationStatus === "pass" ? "başarılı" : verificationStatus}
                </p>
              )}
            </div>
          )}
        </aside>
      </section>
    </AppShell>
  );
}
