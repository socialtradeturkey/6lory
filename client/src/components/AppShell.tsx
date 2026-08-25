import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { Bell, Gift, Home, LayoutDashboard, LogOut, Medal, Moon, ShieldCheck, Sun, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import PwaInstall from "./PwaInstall";

const nav = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/tasks", label: "Görevler", icon: LayoutDashboard },
  { href: "/rewards", label: "Ödüller", icon: Gift },
  { href: "/leaderboard", label: "Liderlik", icon: Medal },
  { href: "/profile", label: "Profil", icon: UserRound },
];

function formatPoints(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

export default function AppShell({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const summary = trpc.dashboard.summary.useQuery(undefined, { enabled: isAuthenticated });
  const availablePoints = summary.data?.balance.availablePoints ?? 0;
  const unread = summary.data?.unreadNotifications ?? 0;

  return (
    <div className="min-h-dvh bg-background text-foreground selection:bg-teal-500/20">
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[430px] bg-[radial-gradient(ellipse_at_14%_0%,oklch(0.82_0.08_196_/_0.32),transparent_52%),radial-gradient(ellipse_at_88%_4%,oklch(0.82_0.055_280_/_0.26),transparent_46%)] dark:bg-[radial-gradient(ellipse_at_14%_0%,oklch(0.31_0.07_196_/_0.32),transparent_52%),radial-gradient(ellipse_at_88%_4%,oklch(0.28_0.06_280_/_0.3),transparent_46%)]" />
      <div className="mx-auto flex min-h-dvh max-w-[1440px]">
        <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-r border-border/70 bg-background/70 px-4 py-6 backdrop-blur-xl md:flex">
          <Link href="/" className="mb-10 flex items-center gap-3 px-3">
            <span className="grid size-9 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-lg shadow-slate-950/15 dark:bg-teal-300 dark:text-slate-950">6</span>
            <span className="font-display text-xl font-bold tracking-tight">lory<span className="text-teal-600 dark:text-teal-300">.</span></span>
          </Link>
          <nav className="space-y-1" aria-label="Ana navigasyon">
            {nav.map(item => {
              const Icon = item.icon;
              const active = location === item.href;
              return <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-slate-950 text-white shadow-md shadow-slate-950/10 dark:bg-teal-300 dark:text-slate-950" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-[18px]" />{item.label}</Link>;
            })}
          </nav>
          <div className="mt-auto space-y-3 rounded-2xl border border-border/80 bg-card/65 p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-teal-600 dark:text-teal-300" /> Doğrulama merkezli sistem</div>
            {isAuthenticated ? <Button onClick={() => logout()} variant="ghost" className="w-full justify-start gap-2 text-muted-foreground"><LogOut className="size-4" /> Çıkış yap</Button> : <Button onClick={() => startLogin()} className="w-full" title="Google/Manus ile giriş yapın veya ana sayfadaki e-posta formunu kullanın">Google ile devam et</Button>}
          </div>
        </aside>

        <div className="min-w-0 flex-1 pb-24 md:pb-8">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/70 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link href="/" className="flex items-center gap-2 md:hidden"><span className="grid size-8 place-items-center rounded-xl bg-slate-950 text-xs font-black text-white dark:bg-teal-300 dark:text-slate-950">6</span><span className="font-display text-lg font-bold">lory.</span></Link>
                <div className="hidden min-w-0 md:block"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">{eyebrow ?? "6lory"}</p><h1 className="truncate font-display text-xl font-bold tracking-tight">{title}</h1></div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => toggleTheme?.()} aria-label="Temayı değiştir" className="rounded-xl text-muted-foreground"><Sun className="size-4 dark:hidden" /><Moon className="hidden size-4 dark:block" /></Button>
                <PwaInstall />
                {isAuthenticated && <Link href="/notifications" className="relative grid size-9 place-items-center rounded-xl border border-border/80 bg-card/70 text-muted-foreground shadow-sm" aria-label="Bildirimler"><Bell className="size-4" />{unread > 0 && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-teal-500 text-[9px] font-bold text-slate-950">{unread > 9 ? "9+" : unread}</span>}</Link>}
                {isAuthenticated ? <Link href="/profile" className="hidden items-center gap-2 rounded-xl border border-border/80 bg-card/70 py-1.5 pl-1.5 pr-3 shadow-sm sm:flex"><span className="grid size-6 place-items-center rounded-lg bg-slate-200 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">{user?.name?.slice(0, 1).toUpperCase() ?? "U"}</span><span className="max-w-24 truncate text-xs font-semibold">{user?.name ?? "Profil"}</span></Link> : !loading && <Button onClick={() => startLogin()} className="rounded-xl px-3 text-xs sm:px-4 sm:text-sm" title="Google/Manus ile giriş yapın veya ana sayfadaki e-posta formunu kullanın">Google ile başla</Button>}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:px-10 lg:pt-8">{!isAuthenticated && !loading && <div role="note" className="mb-5 rounded-2xl border border-teal-600/20 bg-teal-500/10 px-4 py-3 text-sm leading-6 text-teal-900 dark:text-teal-100"><span className="font-bold">İlk kez mi geliyorsunuz?</span> Google/Manus ile hızlıca başlayabilir veya e-posta ve parola ile yeni bir 6lory hesabı oluşturabilirsiniz.</div>}{children}</main>
          {isAuthenticated && <div className="fixed bottom-5 right-5 z-20 hidden rounded-2xl border border-border/80 bg-card/90 px-4 py-3 shadow-xl shadow-slate-950/10 backdrop-blur-xl lg:block"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Kullanılabilir bakiye</p><p className="mt-0.5 font-display text-lg font-bold text-teal-700 dark:text-teal-300">{formatPoints(availablePoints)} <span className="text-xs">puan</span></p></div>}
        </div>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-2xl border border-white/60 bg-slate-950/95 p-1.5 shadow-2xl shadow-slate-950/25 backdrop-blur-xl dark:border-white/10 md:hidden" aria-label="Mobil navigasyon">
        {nav.map(item => {
          const Icon = item.icon;
          const active = location === item.href;
          return <Link key={item.href} href={item.href} className={`relative flex min-w-12 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition ${active ? "bg-teal-300 text-slate-950" : "text-slate-300"}`}><Icon className="size-[18px]" />{item.label}</Link>;
        })}
      </nav>
    </div>
  );
}
