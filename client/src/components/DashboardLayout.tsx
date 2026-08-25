import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  ArrowLeft,
  BellRing,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "./ui/sidebar";

const menuItems = [
  { icon: LayoutDashboard, label: "Operasyon merkezi", path: "/admin" },
  { icon: ArrowLeft, label: "Kullanıcı uygulaması", path: "/?view=user" },
];
const managementRoles = [
  "admin",
  "moderator",
  "verification_reviewer",
  "reward_manager",
];
const roleLabels: Record<string, string> = {
  admin: "Ana yönetici",
  moderator: "Moderatör",
  verification_reviewer: "Doğrulama inceleyicisi",
  reward_manager: "Ödül yöneticisi",
};

function InAppNotificationStatus() {
  return (
    <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-500/25 bg-teal-500/[0.05] p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
          <BellRing className="size-4" />
        </span>
        <div>
          <p className="text-xs font-bold">Uygulama içi bildirim merkezi</p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Görev, doğrulama, puan ve ödül gelişmeleri kullanıcı hesabına kalıcı
            olarak kaydedilir.
          </p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-700 dark:text-teal-300">
        Etkin
      </span>
    </section>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { toggleTheme } = useTheme();
  const retryLogin =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("auth") === "retry";

  if (loading)
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  if (!user)
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl shadow-slate-950/5">
          <ShieldCheck className="mx-auto size-9 text-teal-700 dark:text-teal-300" />
          <h1 className="mt-4 font-display text-2xl font-bold">
            Yönetici girişi gerekli
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {retryLogin
              ? "Oturum bulunamadı. Yönetici hesabınızla e-posta ve parolanızı kullanarak giriş yapın."
              : "Bu alan, kampanya ve doğrulama operasyonlarını yetkili kullanıcılarla sınırlar."}
          </p>
          <Button
            onClick={() => startLogin()}
            className="mt-6 w-full rounded-xl"
          >
            Manuel giriş yap
          </Button>
        </div>
      </div>
    );
  if (!managementRoles.includes(user.role))
    return (
      <div className="grid min-h-dvh place-items-center bg-background p-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-xl shadow-slate-950/5">
          <ShieldCheck className="mx-auto size-9 text-amber-600" />
          <h1 className="mt-4 font-display text-2xl font-bold">
            Yetkili erişim gerekli
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Bu alan yalnızca atanmış operasyon rollerine açıktır. Her işlem
            ayrıca sunucu tarafında ayrı izinlerle doğrulanır.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white dark:bg-teal-300 dark:text-slate-950"
          >
            Kullanıcı uygulamasına dön
          </Link>
        </div>
      </div>
    );

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="icon"
        className="border-r border-border/70 bg-background/85 backdrop-blur-xl"
      >
        <SidebarHeader className="px-3 py-5">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-950 text-sm font-black text-white dark:bg-teal-300 dark:text-slate-950">
              6
            </span>
            <span className="font-display text-lg font-bold group-data-[collapsible=icon]:hidden">
              lory<span className="text-teal-600 dark:text-teal-300">.</span>{" "}
              yönetim
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground group-data-[collapsible=icon]:hidden">
            Operasyon
          </p>
          <SidebarMenu className="px-2">
            {menuItems.map(item => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location === item.path}
                  onClick={() => setLocation(item.path)}
                  tooltip={item.label}
                  className="rounded-xl"
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <div className="rounded-2xl border border-border/80 bg-card/70 p-2 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent">
            <div className="flex items-center gap-2 px-1.5 py-2 group-data-[collapsible=icon]:justify-center">
              <span className="grid size-7 place-items-center rounded-lg bg-teal-500/10 text-xs font-bold text-teal-700 dark:text-teal-300">
                {user.name?.slice(0, 1).toUpperCase() || "A"}
              </span>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-bold">{user.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {roleLabels[user.role] ?? "Operasyon kullanıcısı"}
                </p>
              </div>
            </div>
            <div className="flex gap-1 border-t border-border/70 pt-2 group-data-[collapsible=icon]:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleTheme?.()}
                aria-label="Temayı değiştir"
                className="size-8 rounded-lg"
              >
                <Sun className="size-4 dark:hidden" />
                <Moon className="hidden size-4 dark:block" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => logout()}
                aria-label="Çıkış yap"
                className="size-8 rounded-lg"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/75 px-5 backdrop-blur-xl sm:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
              6lory control
            </p>
            <h1 className="font-display text-lg font-bold">
              Operasyon merkezi
            </h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
            <Activity className="size-3.5" /> Güvenli mod
          </span>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <InAppNotificationStatus />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
