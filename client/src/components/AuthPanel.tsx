import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function AuthPanel() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPasswordConfirmation, setSetupPasswordConfirmation] = useState("");
  const setupToken = new URLSearchParams(window.location.search).get("setupAdmin");
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
  const setupAdminPassword = trpc.auth.setupAdminPassword.useMutation({
    onSuccess: () => {
      window.history.replaceState({}, "", "/");
      setMessage("Admin parolanız oluşturuldu. Şimdi e-posta ve parolanızla giriş yapabilirsiniz.");
      setSetupPassword("");
      setSetupPasswordConfirmation("");
    },
    onError: error => setMessage(error.message),
  });
  const pending = login.isPending || register.isPending || setupAdminPassword.isPending;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (mode === "login") login.mutate({ email: email.trim(), password });
    else register.mutate({ name: name.trim(), username: username.trim(), email: email.trim(), password });
  };

  const submitAdminSetup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!setupToken) return;
    if (setupPassword !== setupPasswordConfirmation) {
      setMessage("Parola tekrarı eşleşmiyor.");
      return;
    }
    setupAdminPassword.mutate({ token: setupToken, password: setupPassword });
  };

  if (setupToken) {
    return (
      <div className="rounded-[2rem] border border-border/80 bg-card/90 p-5 shadow-2xl shadow-slate-950/10 backdrop-blur-xl sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Güvenli hesap kurulumu</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Admin parolanızı belirleyin</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Bu bağlantı yalnızca admin hesabının ilk parolasını oluşturmak içindir. Parolanız tarayıcıdan doğrudan sunucuya gider ve düz metin olarak saklanmaz.</p>
        <form className="mt-5 space-y-4" onSubmit={submitAdminSetup}>
          <div className="space-y-2"><Label htmlFor="setup-password">Yeni parola</Label><Input id="setup-password" type="password" value={setupPassword} onChange={event => setSetupPassword(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required placeholder="En az 10 karakter" /></div>
          <div className="space-y-2"><Label htmlFor="setup-password-confirmation">Yeni parola tekrarı</Label><Input id="setup-password-confirmation" type="password" value={setupPasswordConfirmation} onChange={event => setSetupPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required placeholder="Parolayı tekrar girin" /></div>
          {message && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm leading-5 text-amber-900 dark:text-amber-200">{message}</p>}
          <Button className="w-full rounded-xl" type="submit" disabled={pending}>{pending ? "Parola oluşturuluyor…" : "Admin parolasını oluştur"}</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-border/80 bg-card/90 p-5 shadow-2xl shadow-slate-950/10 backdrop-blur-xl sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700 dark:text-teal-300">Hesabınızla devam edin</p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Manuel giriş</h2>
        </div>
        <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-700 dark:text-teal-300">SSL + scrypt</span>
      </div>
      <div className="mt-5 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label="Hesap işlemi">
        <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setMessage(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Giriş yap</button>
        <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setMessage(null); }} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>Yeni kayıt</button>
      </div>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        {mode === "register" && <div className="space-y-2"><Label htmlFor="auth-name">Ad soyad</Label><Input id="auth-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" placeholder="Adınız Soyadınız" required minLength={2} maxLength={96} /></div>}
        {mode === "register" && <div className="space-y-2"><Label htmlFor="auth-username">Kullanıcı adı</Label><Input id="auth-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" placeholder="kullanici_adi" required minLength={3} maxLength={48} pattern="[A-Za-z0-9_]+" /></div>}
        <div className="space-y-2"><Label htmlFor="auth-email">{mode === "login" ? "Kullanıcı adı veya e-posta" : "E-posta"}</Label><Input id="auth-email" type="text" value={email} onChange={event => setEmail(event.target.value)} autoComplete={mode === "login" ? "username" : "email"} placeholder={mode === "login" ? "kullanici_adi veya ornek@mail.com" : "ornek@mail.com"} required /></div>
        <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="auth-password">Parola</Label><span className="text-[11px] text-muted-foreground">En az 10 karakter</span></div><Input id="auth-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} placeholder="••••••••••" required minLength={mode === "register" ? 10 : 1} maxLength={128} /></div>
        {message && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm leading-5 text-amber-900 dark:text-amber-200">{message}</p>}
        <Button className="w-full rounded-xl" type="submit" disabled={pending}>{pending ? "İşleniyor…" : mode === "login" ? "Manuel giriş yap" : "Güvenli hesabımı oluştur"}</Button>
      </form>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Bu uygulamada giriş kullanıcı adı veya e-posta ve parola ile yapılır. Yeni kayıt sırasında benzersiz bir kullanıcı adı belirleyin. Parolalar düz metin saklanmaz.</p>
    </div>
  );
}
