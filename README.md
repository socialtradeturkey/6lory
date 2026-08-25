# 6lory

6lory; mobil öncelikli, kurulabilir bir görev-doğrulama-puan-ödül platformudur. Uygulama, kullanıcı beyanını başarı kabul etmez; görev oturumu, doğrulama sonucu, idempotency ve immutable point ledger zinciri tamamlanmadan puan oluşmaz.

## Yerel geliştirme

```bash
pnpm install
pnpm dev
```

Kalite kontrolleri aşağıdaki komutlarla çalıştırılır.

```bash
pnpm check
pnpm test
pnpm build
```

## Mimari özeti

| Katman | Teknoloji | Sorumluluk |
| --- | --- | --- |
| Kullanıcı uygulaması | React, Vite, Tailwind | Görevler, ödüller, liderlik, profil, bildirim merkezi ve PWA deneyimi |
| Yönetim merkezi | React, tRPC, RBAC | Kampanya/görev, ödül, doğrulama, risk, yorum havuzu ve audit operasyonları |
| Sunucu | Express, tRPC, Drizzle | Yetkilendirme, Task Session, Verification Engine, ledger ve redemption iş kuralları |
| Veri | MySQL/TiDB uyumlu Drizzle şeması | İlişkisel kayıtlar, idempotency, audit ve veri bütünlüğü |

## Güvenlik ilkeleri

> Puan yalnızca başarılı doğrulama ardından, sunucu tarafında ve idempotent bir ledger işlemiyle oluşur.

Tarayıcı sinyalleri tek başına otomatik puan onayı vermez. Resmî platform API’si kullanılamıyorsa doğrulama sonucu açık biçimde `UNAVAILABLE` veya manuel inceleme olur. Ödül talepleri stok, kullanıcı limiti, puan bakiyesi ve risk durumu kontrol edilerek tek transaction içinde işlenir.

## Temel tRPC sözleşmeleri

| Alan | Sözleşmeler | Güvenlik sınırı |
| --- | --- | --- |
| Kimlik ve profil | `auth.me`, `profile.me`, `profile.setup`, `profile.addSocialAccount` | Oturum ve kaynak sahipliği sunucu tarafında doğrulanır. |
| Görev | `tasks.list`, `tasks.detail`, `tasks.start`, `tasks.verify` | Task Session süreli ve idempotenttir; doğrulama sonucu puan garantisi değildir. |
| Puan ve ödül | `dashboard.summary`, `rewards.list`, `rewards.redeem` | Ledger ve bakiye değişimi transaction içinde, idempotency ile yapılır. |
| Yönetim | `admin.createTask`, `admin.createReward`, `admin.verificationQueue`, `admin.decideReview`, `admin.riskCenter` | Yönetim rolleri ayrı `role_permissions` kayıtlarıyla sınırlandırılır. |

## Ortam değişkenleri

| Grup | Örnekler | Kural |
| --- | --- | --- |
| Veri ve oturum | `DATABASE_URL`, `JWT_SECRET` | Sadece sunucuda saklanır; kaynak kontrolüne eklenmez. |
| Kimlik | `JWT_SECRET` | Manuel kullanıcı adı/e-posta ve parola oturumunu imzalamak için yalnız sunucuda kullanılır. |
| İstemci görünürlüğü | `VITE_*` | Bu önekli değişkenler build çıktısına dahil olabileceği için gizli veri içermez. |

## Doğrulama sınırlamaları

Platform API’si, izin kapsamı veya güvenilir adapter bulunmayan sosyal görevler **başarılı** gösterilmez. Sistem bu hallerde `UNAVAILABLE` döner ya da görev politikası izin veriyorsa manuel inceleme kuyruğuna yönlendirir. Görev, doğrulama, puan ve ödül gelişmeleri kullanıcı hesabına ait kalıcı **uygulama içi bildirim merkezi** üzerinden iletilir; okunma ve temizleme işlemleri kaynak sahipliğiyle sunucuda sınırlandırılır.

## Kimlik doğrulama

6lory’de kullanıcı girişi yalnızca **kullanıcı adı veya e-posta + parola** ile yapılır. Yeni kayıt benzersiz kullanıcı adı, ad soyad, e-posta ve güçlü parola ister; parola scrypt ve salt ile hashlenir. Başarılı giriş host-only, HttpOnly ve güvenli session cookie oluşturur. Hesap kilitleme, başarısız deneme sınırı, duplicate e-posta/kullanıcı adı kontrolü ve role göre `/admin` yönlendirmesi sunucu tarafında korunur.

Google/Manus OAuth, OAuth callback route’u ve OAuth bridge kodu kaldırılmıştır. `/api/oauth/callback` artık uygulama API’sinin bir parçası değildir. Vercel ve managed alan aynı manuel auth formunu kullanır; kullanıcı oturumu yalnız giriş yapılan origin’e ait güvenli cookie ile devam eder. Vercel’e aktarırken gizli anahtarları, kullanıcı verilerini ve yerel günlükleri GitHub’a göndermeyin.
