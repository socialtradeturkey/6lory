import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Crown, Medal } from "lucide-react";

export default function Leaderboard() {
  const { isAuthenticated } = useAuth();
  const query = trpc.leaderboard.list.useQuery(undefined, { enabled: isAuthenticated });
  return <AppShell title="Liderlik" eyebrow="Gerçek kazanımlar"><section className="mb-7"><p className="text-sm leading-6 text-muted-foreground">Sıralama yalnızca doğrulanmış ledger kayıtlarından oluşur. Kişisel veriler gereksiz biçimde gösterilmez.</p></section>{!isAuthenticated ? <EmptyState icon={Medal} title="Liderlik için giriş yapın" description="Doğrulanmış kazanımlara dayalı sıralamayı görmek için hesabınıza giriş yapın." action={{ label: "Giriş yap", onClick: startLogin }} /> : query.isLoading ? <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}</div> : !query.data?.length ? <EmptyState icon={Crown} title="Henüz sıralanacak kayıt yok" description="Doğrulanmış görevler tamamlandığında liderlik tablosu burada oluşur." /> : <div className="overflow-hidden rounded-3xl border border-border/80 bg-card/75 shadow-sm">{query.data.map((entry, index) => <div key={entry.userId} className="flex items-center gap-4 border-b border-border/70 px-5 py-4 last:border-0"><span className={`grid size-8 place-items-center rounded-xl text-sm font-black ${index < 3 ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>{index + 1}</span><span className="grid size-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{(entry.displayName || entry.username).slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{entry.displayName || entry.username}</p><p className="text-xs text-muted-foreground">Doğrulanmış kazanım</p></div><p className="font-display text-base font-bold text-teal-700 dark:text-teal-300">{new Intl.NumberFormat("tr-TR").format(entry.lifetimeEarned)} <span className="text-xs">puan</span></p></div>)}</div>}</AppShell>;
}
