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
| Kimlik | `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` | Domain değiştiğinde callback URL ayarı ayrıca güncellenir. |
| İstemci görünürlüğü | `VITE_*` | Bu önekli değişkenler build çıktısına dahil olabileceği için gizli veri içermez. |

## Doğrulama sınırlamaları

Platform API’si, izin kapsamı veya güvenilir adapter bulunmayan sosyal görevler **başarılı** gösterilmez. Sistem bu hallerde `UNAVAILABLE` döner ya da görev politikası izin veriyorsa manuel inceleme kuyruğuna yönlendirir. Görev, doğrulama, puan ve ödül gelişmeleri kullanıcı hesabına ait kalıcı **uygulama içi bildirim merkezi** üzerinden iletilir; okunma ve temizleme işlemleri kaynak sahipliğiyle sunucuda sınırlandırılır.

## Geçici Vercel kullanımı

Geçici Vercel dağıtımı için teknik geçiş planı, gerekli ortam değişkenleri, OAuth yönlendirme notları ve geri dönüş prosedürü [`docs/vercel-transition.md`](docs/vercel-transition.md) dosyasındadır. Vercel’e aktarırken gizli anahtarları, kullanıcı verilerini ve yerel günlükleri GitHub’a göndermeyin.
