import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, Clock3, ListChecks, ShieldAlert } from "lucide-react";
import { Link } from "wouter";

const platformLabels: Record<string, string> = { web: "Web", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", custom: "Özel" };

export default function Tasks() {
  const { isAuthenticated } = useAuth();
  const taskQuery = trpc.tasks.list.useQuery(undefined, { enabled: isAuthenticated });
  return <AppShell title="Görevler" eyebrow="Güvenli kazanım">
    <section className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">Aktif ve yayınlanmış görevler burada görünür.</p><p className="mt-1 text-xs text-muted-foreground">Doğrulama sonucu oluşmadan puan bakiyenize eklenmez.</p></div><span className="inline-flex items-center gap-1.5 rounded-full border border-teal-600/20 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300"><ShieldAlert className="size-3.5" /> Sahte başarı yok</span></section>
    {!isAuthenticated ? <EmptyState icon={ListChecks} title="Görevleri görmek için giriş yapın" description="Görevlerin aktiflik, zaman ve kota kontrolleri sunucu tarafında uygulanır." action={{ label: "Güvenli giriş yap", onClick: startLogin }} /> : taskQuery.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-52 animate-pulse rounded-3xl bg-muted" />)}</div> : !taskQuery.data?.length ? <EmptyState icon={ListChecks} title="Şu an yayınlanmış aktif görev yok" description="Yeni bir görev yayınlandığında burada görünecek." /> : <div className="grid gap-4 lg:grid-cols-2">{taskQuery.data.map(task => <article key={task.id} className="group rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-950/5"><div className="flex items-start justify-between gap-3"><div><span className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-700 dark:text-teal-300">{platformLabels[task.platform]}</span><h2 className="mt-1 font-display text-xl font-bold tracking-tight">{task.title}</h2></div><span className="rounded-xl bg-teal-500/10 px-2.5 py-1.5 text-sm font-bold text-teal-700 dark:text-teal-300">+{task.rewardPoints}</span></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{task.description || "Görev ayrıntıları ve doğrulama koşulları başlamadan önce gösterilecektir."}</p><div className="mt-5 flex items-center justify-between border-t border-border/70 pt-4"><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" /> Yaklaşık {task.estimatedDurationSeconds} sn</span><Link href={`/tasks/${task.id}`} className="inline-flex h-8 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">Görevi incele <ArrowUpRight className="ml-1 size-3.5" /></Link></div></article>)}</div>}
  </AppShell>;
}
