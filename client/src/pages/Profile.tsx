import { useState } from "react";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  BadgeCheck,
  KeyRound,
  Link2,
  ShieldCheck,
  UserRound,
} from "lucide-react";

export default function Profile() {
  const { isAuthenticated } = useAuth();
  const profileQuery = trpc.profile.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const socialQuery = trpc.profile.socialAccounts.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const setup = trpc.profile.setup.useMutation({
    onSuccess: () => profileQuery.refetch(),
  });
  const updateProfile = trpc.profile.update.useMutation({ onSuccess: () => profileQuery.refetch() });
  const addSocial = trpc.profile.addSocialAccount.useMutation({
    onSuccess: () => socialQuery.refetch(),
  });
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
    },
  });
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [province, setProvince] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "non_binary" | "prefer_not_to_say">("prefer_not_to_say");
  const [social, setSocial] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  if (!isAuthenticated)
    return (
      <AppShell title="Profil" eyebrow="Hesap güvenliği">
        <EmptyState
          icon={UserRound}
          title="Profilinizi güvenle yönetin"
          description="Sosyal hesap sahipliği, bildirim tercihleri ve güven durumunuz hesabınıza bağlıdır."
          action={{ label: "Giriş yap", onClick: startLogin }}
        />
      </AppShell>
    );

  return (
    <AppShell title="Profil" eyebrow="Hesap güvenliği">
      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid size-14 place-items-center rounded-2xl bg-slate-950 font-display text-xl font-bold text-white dark:bg-teal-300 dark:text-slate-950">
              {profileQuery.data?.profile?.displayName
                ?.slice(0, 1)
                .toUpperCase() ||
                profileQuery.data?.user.name?.slice(0, 1).toUpperCase() ||
                "U"}
            </span>
            <div>
              <h2 className="font-display text-xl font-bold">
                {profileQuery.data?.profile?.displayName ||
                  profileQuery.data?.user.name ||
                  "Hesabınız"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {profileQuery.data?.profile
                  ? `@${profileQuery.data.profile.username}`
                  : "Profil kurulumu bekliyor"}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
                <ShieldCheck className="size-3.5" />{" "}
                {profileQuery.data?.trust?.status || "normal"} güven durumu
              </span>
            </div>
          </div>
          {!profileQuery.data?.profile && (
            <form
              onSubmit={event => {
                event.preventDefault();
                setup.mutate({ username });
              }}
              className="mt-6 rounded-2xl bg-muted/60 p-4"
            >
              <p className="text-sm font-bold">Profilinizi tamamlayın</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Kullanıcı adı görev geçmişiniz ve liderlik görünümü için
                kullanılır.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  placeholder="kullanici_adi"
                  aria-label="Kullanıcı adı"
                />
                <Button
                  disabled={setup.isPending || username.length < 3}
                  className="rounded-xl"
                >
                  Kaydet
                </Button>
              </div>
              {setup.error && (
                <p className="mt-2 text-xs text-destructive">
                  {setup.error.message}
                </p>
              )}
            </form>
          )}
        </section>
        {profileQuery.data?.profile && (
          <section className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
            <h2 className="font-display text-lg font-bold">Profil bilgileri</h2>
            <p className="mt-1 text-sm text-muted-foreground">Hesabınızı ve görev uygunluğunuzu güncel tutun.</p>
            {(!profileQuery.data.profile.phoneNumber || !profileQuery.data.profile.province || !profileQuery.data.profile.age || !profileQuery.data.profile.gender) && <div className="mt-4 rounded-2xl bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">Profiliniz eksik. Eksik bilgiler ileride görev uygunluğunuzu ve kazanılmış puanların korunmasını etkileyebilir.</div>}
            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); updateProfile.mutate({ phoneNumber: phoneNumber || undefined, province: province || undefined, age: age ? Number(age) : undefined, gender }); }}>
              <Input placeholder="Cep telefonu" value={phoneNumber || profileQuery.data.profile.phoneNumber || ""} onChange={event => setPhoneNumber(event.target.value)} />
              <Input placeholder="Bulunduğunuz il" value={province || profileQuery.data.profile.province || ""} onChange={event => setProvince(event.target.value)} />
              <Input type="number" min="13" max="120" placeholder="Yaş" value={age || (profileQuery.data.profile.age ? String(profileQuery.data.profile.age) : "")} onChange={event => setAge(event.target.value)} />
              <select value={gender} onChange={event => setGender(event.target.value as typeof gender)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="prefer_not_to_say">Belirtmek istemiyorum</option><option value="female">Kadın</option><option value="male">Erkek</option><option value="non_binary">Non-binary</option></select>
              <p className="text-xs text-muted-foreground sm:col-span-2">E-posta: {profileQuery.data.user.email || "-"} · Kayıt tarihi: {new Date(profileQuery.data.user.createdAt).toLocaleDateString("tr-TR")}</p>
              <Button disabled={updateProfile.isPending} className="rounded-xl sm:col-span-2">Profil bilgilerini kaydet</Button>
            </form>
          </section>
        )}
        <section className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold">Parolayı değiştir</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Mevcut parolanızı doğrulayarak hesabınız için yeni bir parola belirleyin.
              </p>
            </div>
            <KeyRound className="size-5 text-teal-700 dark:text-teal-300" />
          </div>
          <form
            className="mt-4 grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              if (newPassword !== passwordConfirmation) return;
              changePassword.mutate({ currentPassword, newPassword });
            }}
          >
            <Input
              type="password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              placeholder="Mevcut parola"
              autoComplete="current-password"
              aria-label="Mevcut parola"
            />
            <Input
              type="password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="Yeni parola (en az 10 karakter, harf ve rakam)"
              autoComplete="new-password"
              aria-label="Yeni parola"
            />
            <Input
              type="password"
              value={passwordConfirmation}
              onChange={event => setPasswordConfirmation(event.target.value)}
              placeholder="Yeni parola tekrarı"
              autoComplete="new-password"
              aria-label="Yeni parola tekrarı"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={
                  changePassword.isPending ||
                  !currentPassword ||
                  newPassword.length < 10 ||
                  newPassword !== passwordConfirmation
                }
                className="rounded-xl"
              >
                Parolayı güncelle
              </Button>
              {newPassword && newPassword !== passwordConfirmation && (
                <p className="text-xs text-destructive">Yeni parolalar eşleşmiyor.</p>
              )}
            </div>
            {changePassword.isSuccess && (
              <p className="text-sm font-semibold text-teal-700 dark:text-teal-300">
                Parolanız güvenli biçimde güncellendi.
              </p>
            )}
            {changePassword.error && (
              <p className="text-sm text-destructive">{changePassword.error.message}</p>
            )}
          </form>
        </section>
        <aside className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm">
          <h2 className="font-display text-lg font-bold">Puan özeti</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Kullanılabilir</dt>
              <dd className="font-bold text-teal-700 dark:text-teal-300">
                {new Intl.NumberFormat("tr-TR").format(
                  profileQuery.data?.balance?.availablePoints ?? 0
                )}{" "}
                puan
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Toplam kazanım</dt>
              <dd className="font-semibold">
                {new Intl.NumberFormat("tr-TR").format(
                  profileQuery.data?.balance?.lifetimeEarned ?? 0
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Kullanılan</dt>
              <dd className="font-semibold">
                {new Intl.NumberFormat("tr-TR").format(
                  profileQuery.data?.balance?.lifetimeSpent ?? 0
                )}
              </dd>
            </div>
          </dl>
        </aside>
        <section className="rounded-3xl border border-border/80 bg-card/75 p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">
                Sosyal hesaplar
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hesap sahipliği ile görev doğrulaması birbirinden ayrı
                değerlendirilir.
              </p>
            </div>
            <BadgeCheck className="size-5 text-teal-700 dark:text-teal-300" />
          </div>
          <form
            onSubmit={event => {
              event.preventDefault();
              addSocial.mutate({ platform: "instagram", username: social });
            }}
            className="mt-4 flex flex-wrap gap-2"
          >
            <Input
              value={social}
              onChange={event => setSocial(event.target.value)}
              placeholder="Instagram kullanıcı adı"
              className="max-w-xs"
              aria-label="Instagram kullanıcı adı"
            />
            <Button
              variant="outline"
              disabled={addSocial.isPending || social.length < 2}
              className="rounded-xl"
            >
              <Link2 className="mr-1.5 size-4" /> Hesap ekle
            </Button>
          </form>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {socialQuery.data?.map(account => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-2xl border border-border/80 p-3"
              >
                <div>
                  <p className="text-sm font-bold">{account.platform}</p>
                  <p className="text-xs text-muted-foreground">
                    @{account.username}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  {account.verificationStatus}
                </span>
              </div>
            )) || (
              <p className="text-sm text-muted-foreground">
                Henüz sosyal hesap eklemediniz.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
