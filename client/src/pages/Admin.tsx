import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Boxes,
  ClipboardCheck,
  FileClock,
  Gift,
  Layers3,
  Plus,
  ScrollText,
  ShieldAlert,
  Target,
  UsersRound,
} from "lucide-react";

type AdminTab =
  | "overview"
  | "analytics"
  | "tasks"
  | "rewards"
  | "verification"
  | "risk"
  | "comments"
  | "audit";
const tabs: {
  id: AdminTab;
  label: string;
  icon: typeof Layers3;
  requiredPermission: string;
}[] = [
  {
    id: "overview",
    label: "Genel bakış",
    icon: Layers3,
    requiredPermission: "operations.read",
  },
  {
    id: "analytics",
    label: "Analitik",
    icon: UsersRound,
    requiredPermission: "operations.read",
  },
  {
    id: "tasks",
    label: "Görevler",
    icon: Target,
    requiredPermission: "tasks.read",
  },
  {
    id: "rewards",
    label: "Ödüller",
    icon: Gift,
    requiredPermission: "rewards.read",
  },
  {
    id: "verification",
    label: "Doğrulama",
    icon: ClipboardCheck,
    requiredPermission: "verification.decide",
  },
  {
    id: "risk",
    label: "Risk merkezi",
    icon: ShieldAlert,
    requiredPermission: "risk.read",
  },
  {
    id: "comments",
    label: "Yorum havuzları",
    icon: Boxes,
    requiredPermission: "comment_pools.read",
  },
  {
    id: "audit",
    label: "Audit log",
    icon: ScrollText,
    requiredPermission: "audit.read",
  },
];

function Metric({
  icon: Icon,
  label,
  value,
  tone = "teal",
}: {
  icon: typeof Layers3;
  label: string;
  value: number;
  tone?: "teal" | "amber" | "violet";
}) {
  const tones = {
    teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  };
  return (
    <div className="rounded-2xl border border-border/80 bg-card/75 p-4 shadow-sm">
      <span
        className={`grid size-9 place-items-center rounded-xl ${tones[tone]}`}
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-4 text-xs font-semibold text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>("overview");
  const { isAuthenticated } = useAuth();
  const access = trpc.admin.access.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const permissions = access.data?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);
  const overview = trpc.admin.overview.useQuery(undefined, {
    enabled: can("operations.read"),
  });
  const analytics = trpc.admin.analytics.useQuery(
    { days: 7 },
    { enabled: can("operations.read") }
  );
  const campaigns = trpc.admin.listCampaigns.useQuery(undefined, {
    enabled: can("tasks.write"),
  });
  const taskList = trpc.admin.listTasks.useQuery(undefined, {
    enabled: can("tasks.read"),
  });
  const rewards = trpc.admin.listRewards.useQuery(undefined, {
    enabled: can("rewards.read"),
  });
  const rewardRequests = trpc.admin.rewardRequests.useQuery(undefined, {
    enabled: can("redemptions.read"),
  });
  const reviews = trpc.admin.verificationQueue.useQuery(undefined, {
    enabled: can("verification.decide"),
  });
  const pools = trpc.admin.listCommentPools.useQuery(undefined, {
    enabled: can("comment_pools.read"),
  });
  const [activePoolId, setActivePoolId] = useState<number | null>(null);
  const poolComments = trpc.admin.listComments.useQuery(
    { poolId: activePoolId ?? 0 },
    { enabled: can("comment_pools.read") && Boolean(activePoolId) }
  );
  const audit = trpc.admin.auditLog.useQuery(undefined, {
    enabled: can("audit.read"),
  });
  const risk = trpc.admin.riskCenter.useQuery(undefined, {
    enabled: can("risk.read"),
  });
  const invalidateOperations = () => {
    overview.refetch();
    analytics.refetch();
    campaigns.refetch();
    taskList.refetch();
    rewards.refetch();
    rewardRequests.refetch();
    reviews.refetch();
    pools.refetch();
    poolComments.refetch();
    audit.refetch();
    risk.refetch();
  };
  const createTask = trpc.admin.createTask.useMutation({
    onSuccess: invalidateOperations,
  });
  const createCampaign = trpc.admin.createCampaign.useMutation({
    onSuccess: invalidateOperations,
  });
  const setCampaignStatus = trpc.admin.setCampaignStatus.useMutation({
    onSuccess: invalidateOperations,
  });
  const createReward = trpc.admin.createReward.useMutation({
    onSuccess: invalidateOperations,
  });
  const processRedemption = trpc.admin.processRewardRedemption.useMutation({
    onSuccess: invalidateOperations,
  });
  const updateRiskStatus = trpc.admin.updateRiskStatus.useMutation({
    onSuccess: invalidateOperations,
  });
  const createPool = trpc.admin.createCommentPool.useMutation({
    onSuccess: data => {
      setActivePoolId(data.id);
      invalidateOperations();
    },
  });
  const addComment = trpc.admin.addComment.useMutation({
    onSuccess: invalidateOperations,
  });
  const decideReview = trpc.admin.decideReview.useMutation({
    onSuccess: invalidateOperations,
  });
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [points, setPoints] = useState("100");
  const [quota, setQuota] = useState("100");
  const [campaignId, setCampaignId] = useState("");
  const [platform, setPlatform] = useState("web");
  const [actionType, setActionType] = useState("VISIT");
  const [targetUrl, setTargetUrl] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("manual_review");
  const [fallbackMethod, setFallbackMethod] = useState("manual_review");
  const [perUserLimit, setPerUserLimit] = useState("1");
  const [estimatedDuration, setEstimatedDuration] = useState("30");
  const [sessionDuration, setSessionDuration] = useState("900");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [minimumTrustScore, setMinimumTrustScore] = useState("50");
  const [maxDailyTasks, setMaxDailyTasks] = useState("5");
  const [requiresVerifiedSocial, setRequiresVerifiedSocial] = useState(false);
  const [instructionsText, setInstructionsText] = useState(
    "Görevi açın\nTalimatları izleyin\nDoğrulama isteği gönderin"
  );
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignBudget, setCampaignBudget] = useState("");
  const [campaignStartsAt, setCampaignStartsAt] = useState("");
  const [campaignEndsAt, setCampaignEndsAt] = useState("");
  const [rewardName, setRewardName] = useState("");
  const [rewardPoints, setRewardPoints] = useState("1000");
  const [rewardStock, setRewardStock] = useState("10");
  const [poolName, setPoolName] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentWeight, setCommentWeight] = useState("1");
  const [redemptionNotes, setRedemptionNotes] = useState<Record<number, string>>({});
  const [riskUserId, setRiskUserId] = useState("");
  const [riskStatus, setRiskStatus] = useState("watch");
  const [riskReason, setRiskReason] = useState("");
  const visibleTabs = tabs.filter(item => can(item.requiredPermission));
  useEffect(() => {
    if (
      !access.isLoading &&
      visibleTabs.length &&
      !visibleTabs.some(item => item.id === tab)
    )
      setTab(visibleTabs[0].id);
  }, [access.isLoading, tab, visibleTabs]);
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl">
        <section className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              Kampanya, görev, doğrulama ve ödül operasyonlarını güvenli iş
              kurallarıyla yönetin.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Kritik kararlar audit log’a kaydedilir; puanlar yalnızca
              doğrulanmış sonuçlardan sonra oluşur.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleTabs.map(item => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  variant={tab === item.id ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl"
                >
                  <Icon className="mr-1.5 size-3.5" />
                  {item.label}
                </Button>
              );
            })}
          </div>
        </section>
        {tab === "overview" && (
          <section>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric
                icon={Layers3}
                label="Kampanyalar"
                value={overview.data?.totalCampaigns ?? 0}
              />
              <Metric
                icon={Target}
                label="Aktif görevler"
                value={overview.data?.activeTasks ?? 0}
              />
              <Metric
                icon={ClipboardCheck}
                label="Bekleyen inceleme"
                value={overview.data?.pendingReviews ?? 0}
                tone="amber"
              />
              <Metric
                icon={Gift}
                label="Ödül talepleri"
                value={overview.data?.pendingRedemptions ?? 0}
              />
              <Metric
                icon={ShieldAlert}
                label="Riskteki hesaplar"
                value={overview.data?.riskUsers ?? 0}
                tone="violet"
              />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
                <h2 className="font-display text-lg font-bold">
                  Operasyon ilkesi
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Kullanıcının beyanı doğrulama değildir. Oturum, sinyaller,
                  adapter sonucu ve risk durumu değerlendirilmeden puan kaydı
                  oluşturulmaz.
                </p>
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-teal-500/10 p-3 text-sm font-semibold text-teal-700 dark:text-teal-300">
                  <BadgeCheck className="size-4" /> Doğrulama → idempotency →
                  ledger zinciri etkin
                </div>
              </div>
              <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">
                      Operasyon çalışma alanı
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Sayaçlar yalnızca durum özetidir. Aşağıdaki alanlardan işlemleri uygulama içinde başlatın.
                    </p>
                  </div>
                  <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-700 dark:text-teal-300">
                    Dahili işlemler etkin
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {can("tasks.write") && (
                    <button
                      onClick={() => setTab("tasks")}
                      className="rounded-2xl border border-border/80 p-4 text-left hover:bg-muted"
                    >
                      <Target className="size-4 text-teal-700 dark:text-teal-300" />
                      <p className="mt-3 text-sm font-bold">Görev yayınla</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Kota, uygunluk ve doğrulama ayarlarını yapılandırın.
                      </p>
                    </button>
                  )}
                  {can("verification.decide") && (
                    <button
                      onClick={() => setTab("verification")}
                      className="rounded-2xl border border-border/80 p-4 text-left hover:bg-muted"
                    >
                      <ClipboardCheck className="size-4 text-teal-700 dark:text-teal-300" />
                      <p className="mt-3 text-sm font-bold">
                        İncelemeleri ele al
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Manuel kararlar sunucu tarafında ledger akışını
                        tetikler.
                      </p>
                    </button>
                  )}
                  {can("campaigns.write") && (
                    <button
                      onClick={() => setTab("tasks")}
                      className="rounded-2xl border border-border/80 p-4 text-left hover:bg-muted"
                    >
                      <Layers3 className="size-4 text-teal-700 dark:text-teal-300" />
                      <p className="mt-3 text-sm font-bold">Kampanya oluştur</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Bütçe ve yayın zamanlamasını tanımlayın.
                      </p>
                    </button>
                  )}
                  {can("rewards.write") && (
                    <button
                      onClick={() => setTab("rewards")}
                      className="rounded-2xl border border-border/80 p-4 text-left hover:bg-muted"
                    >
                      <Gift className="size-4 text-teal-700 dark:text-teal-300" />
                      <p className="mt-3 text-sm font-bold">Ödül ve teslimat</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Katalog yayınlayın, talepleri işlem sırasına alın.
                      </p>
                    </button>
                  )}
                  {can("risk.read") && (
                    <button
                      onClick={() => setTab("risk")}
                      className="rounded-2xl border border-border/80 p-4 text-left hover:bg-muted"
                    >
                      <ShieldAlert className="size-4 text-violet-700 dark:text-violet-300" />
                      <p className="mt-3 text-sm font-bold">Risk aksiyonu</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Gerekçeli hesap durumu kararlarını kayda alın.
                      </p>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
        {tab === "analytics" && (
          <section>
            <div className="mb-5 rounded-3xl border border-teal-500/25 bg-teal-500/[0.05] p-5">
              <h2 className="font-display text-xl font-bold">
                Operasyon analitiği
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Son 7 gündeki uygulama içi bildirim etkileşimi, görev ilerlemesi
                ve doğrulama sonuçları toplulaştırılmış olarak gösterilir.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                icon={Bell}
                label="Oluşturulan bildirim"
                value={analytics.data?.notifications.created ?? 0}
              />
              <Metric
                icon={Bell}
                label="Okunma oranı"
                value={analytics.data?.notifications.readRatePercent ?? 0}
              />
              <Metric
                icon={Target}
                label="Başlatılan oturum"
                value={analytics.data?.engagement.sessionsStarted ?? 0}
                tone="violet"
              />
              <Metric
                icon={ClipboardCheck}
                label="Tamamlanma oranı"
                value={analytics.data?.engagement.completionRatePercent ?? 0}
                tone="amber"
              />
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
                <h3 className="font-display text-lg font-bold">
                  Bildirim etkileşimi
                </h3>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-2xl bg-muted/60 p-3">
                    <p className="text-xl font-bold">
                      {analytics.data?.notifications.unread ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Okunmamış
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-3">
                    <p className="text-xl font-bold">
                      {analytics.data?.notifications.read ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Okundu</p>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-3">
                    <p className="text-xl font-bold">
                      {analytics.data?.notifications.readRatePercent ?? 0}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Etkileşim
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {(analytics.data?.notifications.topTypes ?? []).map(item => (
                    <div
                      key={item.type}
                      className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm"
                    >
                      <span>{item.type}</span>
                      <span className="font-bold">{item.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
                <h3 className="font-display text-lg font-bold">
                  Görev ve doğrulama
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-muted/60 p-3">
                    <p className="text-xl font-bold">
                      {analytics.data?.engagement.sessionsVerified ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Doğrulanmış oturum
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-3">
                    <p className="text-xl font-bold">
                      {analytics.data?.engagement.redemptionsRequested ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ödül talebi
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-3">
                    <p className="text-xl font-bold">
                      {analytics.data?.engagement.verifications.passed ?? 0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Başarılı doğrulama
                    </p>
                  </div>
                  <div className="rounded-2xl bg-muted/60 p-3">
                    <p className="text-xl font-bold">
                      {analytics.data?.engagement.verifications.manualReview ??
                        0}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Manuel inceleme
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        {tab === "tasks" && (
          <section
            className={`grid gap-5 ${can("tasks.write") ? "xl:grid-cols-[0.95fr_1.05fr]" : "max-w-4xl"}`}
          >
            {can("campaigns.write") && (
              <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Kampanya çalışma alanı</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Kampanyayı önce oluşturun; ardından görev formundan kampanyaya bağlayın. Durum değişiklikleri audit kaydına yazılır.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                    {campaigns.data?.length ?? 0} kampanya
                  </span>
                </div>
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    createCampaign.mutate({
                      name: campaignName,
                      description: campaignDescription || undefined,
                      pointBudget: campaignBudget ? Number(campaignBudget) : undefined,
                      startsAt: campaignStartsAt ? new Date(campaignStartsAt) : undefined,
                      endsAt: campaignEndsAt ? new Date(campaignEndsAt) : undefined,
                    });
                  }}
                  className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"
                >
                  <label className="text-xs font-bold xl:col-span-2">
                    Kampanya adı
                    <Input value={campaignName} onChange={event => setCampaignName(event.target.value)} className="mt-1.5" placeholder="Örn. Sonbahar video kampanyası" />
                  </label>
                  <label className="text-xs font-bold">
                    Puan bütçesi
                    <Input value={campaignBudget} onChange={event => setCampaignBudget(event.target.value)} className="mt-1.5" inputMode="numeric" placeholder="İsteğe bağlı" />
                  </label>
                  <label className="text-xs font-bold">
                    Başlangıç
                    <Input type="datetime-local" value={campaignStartsAt} onChange={event => setCampaignStartsAt(event.target.value)} className="mt-1.5" />
                  </label>
                  <label className="text-xs font-bold">
                    Bitiş
                    <Input type="datetime-local" value={campaignEndsAt} onChange={event => setCampaignEndsAt(event.target.value)} className="mt-1.5" />
                  </label>
                  <label className="text-xs font-bold md:col-span-2 xl:col-span-4">
                    Açıklama
                    <Input value={campaignDescription} onChange={event => setCampaignDescription(event.target.value)} className="mt-1.5" placeholder="Kapsam, hedef ve içerik notları" />
                  </label>
                  <Button disabled={createCampaign.isPending || campaignName.trim().length < 3} className="self-end rounded-xl">
                    Kampanya oluştur
                  </Button>
                </form>
                {createCampaign.error && <p className="mt-3 text-xs text-destructive">{createCampaign.error.message}</p>}
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {campaigns.data?.map(campaign => (
                    <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 p-4">
                      <div>
                        <p className="text-sm font-bold">{campaign.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {campaign.pointBudget ? `${new Intl.NumberFormat("tr-TR").format(campaign.pointBudget)} puan bütçesi` : "Bütçe tanımlanmadı"} · {campaign.status}
                        </p>
                      </div>
                      <select
                        value={campaign.status}
                        disabled={setCampaignStatus.isPending}
                        onChange={event => setCampaignStatus.mutate({ campaignId: campaign.id, status: event.target.value as "draft" | "scheduled" | "active" | "paused" | "archived" })}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="draft">Taslak</option>
                        <option value="scheduled">Planlandı</option>
                        <option value="active">Aktif</option>
                        <option value="paused">Duraklatıldı</option>
                        <option value="archived">Arşivlendi</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <form
              onSubmit={event => {
                event.preventDefault();
                createTask.mutate({
                  campaignId: campaignId ? Number(campaignId) : undefined,
                  title: taskName,
                  description: taskDescription || undefined,
                  platform: platform as
                    | "web"
                    | "instagram"
                    | "youtube"
                    | "tiktok"
                    | "custom",
                  actionType,
                  targetUrl: targetUrl || undefined,
                  rewardPoints: Number(points),
                  totalQuota: Number(quota),
                  perUserLimit: Number(perUserLimit),
                  verificationMethod: verificationMethod as
                    | "web_signals"
                    | "secret_code"
                    | "manual_review"
                    | "platform_api"
                    | "platform_api_manual_fallback",
                  fallbackMethod: fallbackMethod as
                    | "none"
                    | "manual_review"
                    | "unavailable",
                  estimatedDurationSeconds: Number(estimatedDuration),
                  sessionDurationSeconds: Number(sessionDuration),
                  instructions: instructionsText
                    .split("\n")
                    .map(item => item.trim())
                    .filter(Boolean),
                  eligibilityRules: {
                    minimumTrustScore: Number(minimumTrustScore),
                    maxDailyTasks: Number(maxDailyTasks),
                    requiresVerifiedSocial,
                  },
                  startsAt: startsAt ? new Date(startsAt) : undefined,
                  endsAt: endsAt ? new Date(endsAt) : undefined,
                });
              }}
              className={`${can("tasks.write") ? "" : "hidden"} rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm`}
            >
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                  <Plus className="size-4" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold">Yeni görev</h2>
                  <p className="text-xs text-muted-foreground">
                    Kota ve uygunluk kuralları sunucuda uygulanır.
                  </p>
                </div>
              </div>
              <label className="mt-5 block text-xs font-bold">
                Görev başlığı
                <Input
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                  className="mt-1.5"
                  placeholder="Örn. Kampanya sayfasını incele"
                />
              </label>
              <label className="mt-4 block text-xs font-bold">
                Açıklama
                <Textarea
                  value={taskDescription}
                  onChange={e => setTaskDescription(e.target.value)}
                  className="mt-1.5 min-h-24"
                  placeholder="Kullanıcıya gösterilecek net adımlar"
                />
              </label>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Kampanya
                  <select
                    value={campaignId}
                    onChange={event => setCampaignId(event.target.value)}
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Bağımsız görev</option>
                    {campaigns.data?.map(campaign => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold">
                  Platform
                  <select
                    value={platform}
                    onChange={event => setPlatform(event.target.value)}
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="web">Web</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                    <option value="tiktok">TikTok</option>
                    <option value="custom">Özel</option>
                  </select>
                </label>
                <label className="text-xs font-bold">
                  Eylem tipi
                  <Input
                    value={actionType}
                    onChange={event => setActionType(event.target.value)}
                    className="mt-1.5"
                    placeholder="Örn. VISIT"
                  />
                </label>
                <label className="text-xs font-bold">
                  Hedef URL{" "}
                  <span className="font-normal text-muted-foreground">
                    (isteğe bağlı)
                  </span>
                  <Input
                    type="url"
                    value={targetUrl}
                    onChange={event => setTargetUrl(event.target.value)}
                    className="mt-1.5"
                    placeholder="https://..."
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Doğrulama yöntemi
                  <select
                    value={verificationMethod}
                    onChange={event =>
                      setVerificationMethod(event.target.value)
                    }
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="manual_review">Manuel inceleme</option>
                    <option value="secret_code">Secret Code</option>
                    <option value="web_signals">Web sinyalleri</option>
                    <option value="platform_api">Platform API</option>
                    <option value="platform_api_manual_fallback">
                      Platform API + manuel fallback
                    </option>
                  </select>
                </label>
                <label className="text-xs font-bold">
                  Fallback
                  <select
                    value={fallbackMethod}
                    onChange={event => setFallbackMethod(event.target.value)}
                    className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="manual_review">Manuel inceleme</option>
                    <option value="unavailable">UNAVAILABLE</option>
                    <option value="none">Yok</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-bold">
                  Ödül puanı
                  <Input
                    value={points}
                    onChange={e => setPoints(e.target.value)}
                    inputMode="numeric"
                    className="mt-1.5"
                  />
                </label>
                <label className="text-xs font-bold">
                  Toplam kota
                  <Input
                    value={quota}
                    onChange={e => setQuota(e.target.value)}
                    inputMode="numeric"
                    className="mt-1.5"
                  />
                </label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-bold">
                  Kullanıcı limiti
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={perUserLimit}
                    onChange={event => setPerUserLimit(event.target.value)}
                    className="mt-1.5"
                  />
                </label>
                <label className="text-xs font-bold">
                  Tahmini süre (sn)
                  <Input
                    type="number"
                    min="5"
                    value={estimatedDuration}
                    onChange={event => setEstimatedDuration(event.target.value)}
                    className="mt-1.5"
                  />
                </label>
                <label className="text-xs font-bold">
                  Oturum süresi (sn)
                  <Input
                    type="number"
                    min="60"
                    value={sessionDuration}
                    onChange={event => setSessionDuration(event.target.value)}
                    className="mt-1.5"
                  />
                </label>
                <label className="text-xs font-bold">
                  Günlük görev limiti
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={maxDailyTasks}
                    onChange={event => setMaxDailyTasks(event.target.value)}
                    className="mt-1.5"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">
                  Başlangıç{" "}
                  <span className="font-normal text-muted-foreground">
                    (isteğe bağlı)
                  </span>
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={event => setStartsAt(event.target.value)}
                    className="mt-1.5"
                  />
                </label>
                <label className="text-xs font-bold">
                  Bitiş{" "}
                  <span className="font-normal text-muted-foreground">
                    (isteğe bağlı)
                  </span>
                  <Input
                    type="datetime-local"
                    value={endsAt}
                    onChange={event => setEndsAt(event.target.value)}
                    className="mt-1.5"
                  />
                </label>
              </div>
              <div className="mt-4 rounded-2xl border border-border/80 bg-muted/35 p-3">
                <p className="text-xs font-bold">Uygunluk kuralları</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold">
                    Asgari güven skoru
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={minimumTrustScore}
                      onChange={event =>
                        setMinimumTrustScore(event.target.value)
                      }
                      className="mt-1.5"
                    />
                  </label>
                  <label className="mt-5 flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={requiresVerifiedSocial}
                      onChange={event =>
                        setRequiresVerifiedSocial(event.target.checked)
                      }
                      className="size-4 accent-teal-700"
                    />{" "}
                    Doğrulanmış sosyal hesap gerekli
                  </label>
                </div>
              </div>
              <label className="mt-4 block text-xs font-bold">
                Kullanıcı talimatları{" "}
                <span className="font-normal text-muted-foreground">
                  (her satır bir adım)
                </span>
                <Textarea
                  value={instructionsText}
                  onChange={event => setInstructionsText(event.target.value)}
                  className="mt-1.5 min-h-24"
                />
              </label>
              <p className="mt-4 rounded-xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mr-1 inline size-3.5" /> Platform
                API’si yapılandırılmamış sosyal görevler otomatik başarı
                üretmez; seçtiğiniz fallback manuel inceleme veya UNAVAILABLE
                olarak uygulanır.
              </p>
              <Button
                disabled={createTask.isPending || taskName.trim().length < 3}
                className="mt-5 w-full rounded-xl"
              >
                Görevi oluştur
              </Button>
              {createTask.error && (
                <p className="mt-2 text-xs text-destructive">
                  {createTask.error.message}
                </p>
              )}
            </form>
            <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold">
                    Görev envanteri
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Yayınlanan ve planlanan görevler
                  </p>
                </div>
                <span className="text-sm font-bold text-teal-700 dark:text-teal-300">
                  {taskList.data?.length ?? 0}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {!taskList.data?.length ? (
                  <EmptyState
                    icon={Target}
                    title="Henüz görev yok"
                    description="İlk görevi oluşturduğunuzda güvenli görev envanteri burada oluşur."
                  />
                ) : (
                  taskList.data.map(task => (
                    <div
                      key={task.id}
                      className="rounded-2xl border border-border/80 p-4"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{task.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {task.platform} · {task.verificationMethod} · kota{" "}
                            {task.claimedQuota}/{task.totalQuota}
                          </p>
                        </div>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                          {task.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-teal-700 dark:text-teal-300">
                        +{task.rewardPoints} puan
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}
        {tab === "rewards" && (
          <section
            className={`grid gap-5 ${can("rewards.write") ? "xl:grid-cols-[0.85fr_1.15fr]" : "max-w-4xl"}`}
          >
            <form
              onSubmit={event => {
                event.preventDefault();
                createReward.mutate({
                  name: rewardName,
                  pointsCost: Number(rewardPoints),
                  stock: Number(rewardStock),
                  deliveryType: "custom",
                  maxPerUser: 1,
                });
              }}
              className={`${can("rewards.write") ? "" : "hidden"} rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm`}
            >
              <h2 className="font-display text-lg font-bold">Yeni ödül</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Talep sırasında puan, stok, limit ve risk kontrolü yapılır.
              </p>
              <label className="mt-5 block text-xs font-bold">
                Ödül adı
                <Input
                  value={rewardName}
                  onChange={e => setRewardName(e.target.value)}
                  className="mt-1.5"
                  placeholder="Örn. Dijital hediye kartı"
                />
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-bold">
                  Puan maliyeti
                  <Input
                    value={rewardPoints}
                    onChange={e => setRewardPoints(e.target.value)}
                    inputMode="numeric"
                    className="mt-1.5"
                  />
                </label>
                <label className="text-xs font-bold">
                  Stok
                  <Input
                    value={rewardStock}
                    onChange={e => setRewardStock(e.target.value)}
                    inputMode="numeric"
                    className="mt-1.5"
                  />
                </label>
              </div>
              <Button
                disabled={
                  createReward.isPending || rewardName.trim().length < 3
                }
                className="mt-5 w-full rounded-xl"
              >
                Ödülü yayınla
              </Button>
            </form>
            <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
              <h2 className="font-display text-lg font-bold">Ödül kataloğu</h2>
              <div className="mt-4 space-y-3">
                {!rewards.data?.length ? (
                  <EmptyState
                    icon={Gift}
                    title="Aktif ödül bulunmuyor"
                    description="İlk ödülünüzü yayınlayarak kataloğu başlatın."
                  />
                ) : (
                  rewards.data.map(reward => (
                    <div
                      key={reward.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 p-4"
                    >
                      <div>
                        <p className="text-sm font-bold">{reward.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {reward.deliveryType} · stok {reward.stock} ·
                          kullanıcı başına {reward.maxPerUser}
                        </p>
                      </div>
                      <p className="font-display text-base font-bold text-teal-700 dark:text-teal-300">
                        {new Intl.NumberFormat("tr-TR").format(
                          reward.pointsCost
                        )}{" "}
                        puan
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
            {can("redemptions.write") && (
              <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Ödül talepleri ve teslimat</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      İşlem sırası sunucuda korunur. Reddedilen veya iptal edilen bekleyen talepte puan iadesi tekil ledger kaydıyla yapılır.
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{rewardRequests.data?.length ?? 0} talep</span>
                </div>
                {!rewardRequests.data?.length ? (
                  <div className="mt-4"><EmptyState icon={Gift} title="Henüz ödül talebi yok" description="Kullanıcı bir ödül talep ettiğinde inceleme ve teslimat işlemleri burada yönetilir." /></div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {rewardRequests.data.map(request => {
                      const note = redemptionNotes[request.id] ?? "";
                      const options = request.status === "requested"
                        ? [["under_review", "İncelemeye al"], ["approved", "Onayla"], ["rejected", "Reddet"], ["cancelled", "İptal et"]]
                        : request.status === "under_review"
                          ? [["approved", "Onayla"], ["rejected", "Reddet"], ["cancelled", "İptal et"]]
                          : request.status === "approved"
                            ? [["preparing", "Hazırlanıyor yap"]]
                            : request.status === "preparing"
                              ? [["shipped", "Kargoya ver"]]
                              : request.status === "shipped"
                                ? [["delivered", "Teslim edildi"]]
                                : [];
                      return (
                        <article key={request.id} className="rounded-2xl border border-border/80 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">{request.rewardName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{request.displayName || request.username || `Kullanıcı #${request.userId}`} · {new Intl.NumberFormat("tr-TR").format(request.pointsCost)} puan</p>
                            </div>
                            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">{request.status}</span>
                          </div>
                          {options.length > 0 && (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <Input value={note} onChange={event => setRedemptionNotes(current => ({ ...current, [request.id]: event.target.value }))} placeholder="İşlem notu (kullanıcıya bildirilir)" />
                              <div className="flex flex-wrap gap-2">
                                {options.map(([status, label]) => (
                                  <Button key={status} type="button" size="sm" variant={status === "rejected" || status === "cancelled" ? "outline" : "default"} disabled={processRedemption.isPending || note.trim().length < 3} onClick={() => processRedemption.mutate({ redemptionId: request.id, status: status as "under_review" | "approved" | "preparing" | "shipped" | "delivered" | "rejected" | "cancelled", note })} className="rounded-xl">{label}</Button>
                                ))}
                              </div>
                            </div>
                          )}
                          {request.fulfillmentData && typeof request.fulfillmentData.lastNote === "string" && <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Son not: {request.fulfillmentData.lastNote}</p>}
                        </article>
                      );
                    })}
                  </div>
                )}
                {processRedemption.error && <p className="mt-3 text-xs text-destructive">{processRedemption.error.message}</p>}
              </div>
            )}
          </section>
        )}
        {tab === "verification" && (
          <section>
            <div className="mb-5 rounded-3xl border border-amber-500/25 bg-amber-500/[0.05] p-5">
              <h2 className="font-display text-lg font-bold">
                Doğrulama merkezi
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Bekleyen kararlar; sinyaller, oturum ve risk bağlamı ile ele
                alınmalıdır. Onay işleminden sonra tekil ledger kaydı
                oluşturulur.
              </p>
            </div>
            {!reviews.data?.length ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Bekleyen manuel inceleme yok"
                description="Platform API’si kullanılamayan veya sinyalleri kesin olmayan görevler burada görünür."
              />
            ) : (
              <div className="space-y-3">
                {reviews.data.map(review => (
                  <article
                    key={review.id}
                    className="rounded-2xl border border-border/80 bg-card/75 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold">
                          İnceleme #{review.id}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Doğrulama denemesi #{review.verificationAttemptId}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                        pending
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={decideReview.isPending}
                        onClick={() =>
                          decideReview.mutate({
                            reviewId: review.id,
                            decision: "approved",
                            reason: "Yönetici incelemesiyle onaylandı.",
                          })
                        }
                        className="rounded-xl"
                      >
                        Onayla
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decideReview.isPending}
                        onClick={() =>
                          decideReview.mutate({
                            reviewId: review.id,
                            decision: "rejected",
                            reason: "Doğrulama sinyalleri yeterli değil.",
                          })
                        }
                        className="rounded-xl"
                      >
                        Reddet
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
        {tab === "risk" && (
          <section>
            <div className="mb-5 rounded-3xl border border-violet-500/25 bg-violet-500/[0.05] p-5">
              <h2 className="font-display text-lg font-bold">Risk merkezi</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Güven skoru bir karar desteğidir; tek başına kullanıcıyı
                cezalandırmaz. Kısıtlı ve askıya alınmış durumlar ödül talebini
                sunucu tarafında engeller.
              </p>
            </div>
            {can("risk.write") && (
              <form
                onSubmit={event => {
                  event.preventDefault();
                  updateRiskStatus.mutate({
                    userId: Number(riskUserId),
                    status: riskStatus as "normal" | "watch" | "review" | "restricted" | "suspended",
                    reason: riskReason,
                  });
                }}
                className="mb-5 rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm"
              >
                <h3 className="font-display text-base font-bold">Gerekçeli risk aksiyonu</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Bu işlem kullanıcının ödül uygunluğunu etkileyebilir; karar gerekçesi risk olayı ve audit log’a yazılır.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-[0.7fr_1fr_2fr_auto]">
                  <Input value={riskUserId} onChange={event => setRiskUserId(event.target.value)} inputMode="numeric" placeholder="Kullanıcı ID" />
                  <select value={riskStatus} onChange={event => setRiskStatus(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="normal">Normal</option>
                    <option value="watch">İzleme</option>
                    <option value="review">İnceleme</option>
                    <option value="restricted">Kısıtlı</option>
                    <option value="suspended">Askıya alındı</option>
                  </select>
                  <Input value={riskReason} onChange={event => setRiskReason(event.target.value)} placeholder="Karar gerekçesi" />
                  <Button disabled={updateRiskStatus.isPending || !/^\d+$/.test(riskUserId) || riskReason.trim().length < 3} className="rounded-xl">Durumu güncelle</Button>
                </div>
                {updateRiskStatus.error && <p className="mt-3 text-xs text-destructive">{updateRiskStatus.error.message}</p>}
              </form>
            )}
            {!risk.data?.length ? (
              <EmptyState
                icon={UsersRound}
                title="Henüz hesap risk kaydı yok"
                description="Kullanıcılar profilini tamamladığında, hesap güven skoru ve durumları burada görünür."
              />
            ) : (
              <div className="overflow-hidden rounded-3xl border border-border/80 bg-card/75 shadow-sm">
                {risk.data.map(entry => (
                  <div
                    key={entry.userId}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-bold">
                        {entry.displayName ||
                          entry.username ||
                          `Kullanıcı #${entry.userId}`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Son güncelleme{" "}
                        {new Date(entry.updatedAt).toLocaleString("tr-TR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-xl bg-muted px-3 py-1.5 text-sm font-bold">
                        {entry.score}/100
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${entry.status === "normal" ? "bg-teal-500/10 text-teal-700 dark:text-teal-300" : entry.status === "watch" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300"}`}
                      >
                        {entry.status}
                      </span>
                      {can("risk.write") && <Button type="button" size="sm" variant="outline" onClick={() => { setRiskUserId(String(entry.userId)); setRiskStatus(entry.status); }} className="rounded-xl">İşlem seç</Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        {tab === "comments" && (
          <section
            className={`grid gap-5 ${can("comment_pools.write") ? "xl:grid-cols-[0.8fr_1.2fr]" : "max-w-4xl"}`}
          >
            <form
              onSubmit={event => {
                event.preventDefault();
                createPool.mutate({ name: poolName });
              }}
              className={`${can("comment_pools.write") ? "" : "hidden"} rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm`}
            >
              <h2 className="font-display text-lg font-bold">Yorum havuzu</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Yorumlar kullanıcı tarafından kopyalanır; platforma otomatik
                gönderim yapılmaz.
              </p>
              <label className="mt-5 block text-xs font-bold">
                Havuz adı
                <Input
                  value={poolName}
                  onChange={e => setPoolName(e.target.value)}
                  className="mt-1.5"
                  placeholder="Örn. Marka yorumları"
                />
              </label>
              <Button
                disabled={createPool.isPending || poolName.trim().length < 3}
                className="mt-5 w-full rounded-xl"
              >
                Havuz oluştur
              </Button>
            </form>
            <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
              <h2 className="font-display text-lg font-bold">Havuzlar</h2>
              <div className="mt-4 space-y-3">
                {!pools.data?.length ? (
                  <EmptyState
                    icon={Boxes}
                    title="Yorum havuzu yok"
                    description="İlk havuzu oluşturduktan sonra yorumları ağırlık ve kullanım limitiyle yönetebilirsiniz."
                  />
                ) : (
                  pools.data.map(pool => (
                    <div
                      key={pool.id}
                      className="flex items-center justify-between rounded-2xl border border-border/80 p-4"
                    >
                      <div>
                        <p className="text-sm font-bold">{pool.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {pool.language} · tekrar aralığı{" "}
                          {pool.perUserReuseHours} saat
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                        {pool.isActive ? "aktif" : "pasif"}
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={() => setActivePoolId(pool.id)} className="rounded-xl">İçerikleri yönet</Button>
                    </div>
                  ))
                )}
              </div>
            </div>
            {can("comment_pools.write") && (
              <div className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm xl:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">Yorum içerik çalışma alanı</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">İçerikler yalnız uygulama içinde havuza kaydedilir; hiçbir sosyal platforma otomatik gönderilmez.</p>
                  </div>
                  <select value={activePoolId ?? ""} onChange={event => setActivePoolId(event.target.value ? Number(event.target.value) : null)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Havuz seçin</option>
                    {pools.data?.map(pool => <option key={pool.id} value={pool.id}>{pool.name}</option>)}
                  </select>
                </div>
                {activePoolId ? (
                  <>
                    <form onSubmit={event => { event.preventDefault(); addComment.mutate({ poolId: activePoolId, body: commentBody, weight: Number(commentWeight) }); }} className="mt-4 grid gap-3 md:grid-cols-[1fr_140px_auto]">
                      <Input value={commentBody} onChange={event => setCommentBody(event.target.value)} placeholder="Kullanıcının kopyalayabileceği yorum metni" />
                      <Input value={commentWeight} onChange={event => setCommentWeight(event.target.value)} inputMode="numeric" placeholder="Ağırlık" />
                      <Button disabled={addComment.isPending || commentBody.trim().length < 3 || Number(commentWeight) < 1} className="rounded-xl">İçerik ekle</Button>
                    </form>
                    <div className="mt-4 space-y-2">
                      {!poolComments.data?.length ? (
                        <EmptyState icon={Boxes} title="Bu havuz henüz boş" description="İlk yorum içeriğini ekleyerek kullanım kurallarına uygun havuzu oluşturun." />
                      ) : poolComments.data.map(comment => (
                        <article key={comment.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/80 p-4">
                          <p className="max-w-3xl text-sm leading-6">{comment.body}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full bg-muted px-2 py-1">ağırlık {comment.weight}</span>
                            <span className="rounded-full bg-muted px-2 py-1">kullanım {comment.usedCount}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                    {addComment.error && <p className="mt-3 text-xs text-destructive">{addComment.error.message}</p>}
                  </>
                ) : (
                  <p className="mt-4 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">İçerik eklemek için önce bir yorum havuzu seçin veya oluşturun.</p>
                )}
              </div>
            )}
          </section>
        )}
        {tab === "audit" && (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-bold">Audit log</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kritik yönetici işlemleri zaman sırasıyla kaydedilir.
                </p>
              </div>
              <FileClock className="size-5 text-teal-700 dark:text-teal-300" />
            </div>
            {!audit.data?.length ? (
              <EmptyState
                icon={ScrollText}
                title="Henüz audit kaydı yok"
                description="Görev, ödül ve inceleme işlemleri gerçekleştiğinde hareket geçmişi burada görünür."
              />
            ) : (
              <div className="overflow-hidden rounded-3xl border border-border/80 bg-card/75 shadow-sm">
                {audit.data.map(log => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-bold">{log.action}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {log.entityType}{" "}
                        {log.entityId ? `#${log.entityId}` : ""}
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("tr-TR")}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
