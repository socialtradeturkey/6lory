import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { startLogin } from "@/const";

export default function AuthPanel() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.assign("/");
    },
    onError: error => setMessage(error.message),
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.assign("/");
    },
    onError: error => setMessage(error.message),
  });
  const pending = login.isPending || register.isPending;
  const isVercelFrontend = typeof window !== "undefined" && window.location.hostname === "6lory.vercel.app";
  const beginOAuth = () => {
    if (!startLogin()) {
      setMessage("Güvenli giriş başlatılamadı. Çerezleri etkinleştirip tekrar deneyin veya e-posta ile giriş yapın.");
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (mode === "login") login.mutate({ email, password });
    else register.mutate({ name, email, password });
  };

  return (
    <div className="rounded-[2rem] border border-border/80 bg-card/90 p-5 shadow-2xl shadow-slate-950/10 backdrop-blur-xl sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Hesabınızla devam edin</p><h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Güvenli giriş</h2></div>
        <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-700 dark:text-teal-300">SSL + scrypt</span>
      </div>
      <div className="mt-5 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Hesap işlemi">
        <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setMessage(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Giriş yap</button>
        <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setMessage(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Yeni kayıt</button>
      </div>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        {mode === "register" && <div className="space-y-2"><Label htmlFor="auth-name">Ad soyad</Label><Input id="auth-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="Adınız Soyadınız" required minLength={2} maxLength={96} /></div>}
        <div className="space-y-2"><Label htmlFor="auth-email">E-posta</Label><Input id="auth-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="ornek@mail.com" required /></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="auth-password">Parola</Label><span className="text-[11px] text-muted-foreground">En az 10 karakter</span></div><Input id="auth-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="••••••••••" required minLength={mode === "register" ? 10 : 1} maxLength={128} /></div>
        {message && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm leading-5 text-amber-900 dark:text-amber-200">{message}</p>}
        <Button className="w-full rounded-xl" type="submit" disabled={pending}>{pending ? "İşleniyor…" : mode === "login" ? "E-posta ile giriş yap" : "Güvenli hesabımı oluştur"}</Button>
      </form>
      <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground"><span className="h-px flex-1 bg-border" />veya<span className="h-px flex-1 bg-border" /></div>
      <Button type="button" variant="outline" className="w-full rounded-xl" onClick={beginOAuth}>Google / Manus ile devam et</Button>
      {isVercelFrontend && <p className="mt-4 rounded-xl border border-teal-500/20 bg-teal-500/5 px-3 py-2.5 text-xs leading-5 text-muted-foreground">Vercel geçici giriş alanıdır. Google/Manus sonrası güvenli oturum, managed 6lory alanında devam eder; giriş tamamlandığında tarayıcıyı orada bırakın.</p>}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Parolalar düz metin saklanmaz. Hesap kurtarma e-postası özelliği ayrıca yapılandırılana kadar parolanızı güvenli yerde tutun.</p>
    </div>
  );
}
