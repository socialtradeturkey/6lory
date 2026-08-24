# 6lory: Geçici Vercel Geçiş Planı

## Amaç ve kapsam

Bu belge, 6lory’nin **geçici Vercel kullanımı** için güvenli geçiş sınırlarını tanımlar. Proje şu anda React/Vite istemcisi ile Express/tRPC sunucusunu birlikte çalıştırır. Bu nedenle yalnızca statik dosyaları dağıtmak, görev doğrulaması, point ledger, ödül redemption, bildirim merkezi ve yönetici operasyonlarını çalıştırmak için yeterli değildir.

Vercel Express uygulamalarını bir Vercel Function olarak çalıştırabilir; ancak Function yaşam döngüsüne uygun giriş noktası, statik varlık düzeni ve ortam değişkenleri gerekir.[1] Vite tek sayfa uygulamalarında derin bağlantılar için ayrıca fallback rewrite tanımlanmalıdır.[2]

| Dağıtım profili | Ne çalışır | Sınır |
| --- | --- | --- |
| **Statik önizleme** | UI, tasarım, PWA kabuğu ve oturum açmamış ekranlar | tRPC API, OAuth, doğrulama, ledger ve ödül işlemleri çalışmaz. Ürün kullanımı için uygun değildir. |
| **Tam yığın Vercel** | İstemci + Express/tRPC Function + harici DB | Mevcut dahili OAuth ve platform servislerinin eşdeğerlerinin Vercel ortamında yapılandırılması gerekir. |
| **Mevcut yönetilen dağıtım** | Projenin mevcut kimlik ve sunucu bütünleşmeleri | Geçici Vercel ihtiyacı bittiğinde en az uyarlama gerektiren geri dönüş yoludur. |

## Önerilen geçici akış

1. GitHub deposunu Vercel’e bağlayın ve önce bir **Preview Deployment** oluşturun. Preview ortamı, ana üretim dalından farklı dallar için ayrı ortam değişkenleri destekler.[3]
2. Önce UI ve rota davranışını kontrol edin. Tam yığın işlevsellik için aşağıdaki ortam değişkenleri ve OAuth adapter çalışması tamamlanmadan üretime yönlendirme yapmayın.
3. Vercel domaini netleştiğinde OAuth callback URL’sini `https://<vercel-domain>/api/oauth/callback` olarak ilgili kimlik sağlayıcısında izinli redirect URI listesine ekleyin.
4. Geçiş boyunca veritabanı migrasyonlarını Vercel Function içinde otomatik çalıştırmayın; migrasyonlar sürümlenmiş SQL ile kontrollü olarak uygulanmalıdır.
5. Geri dönüş gerektiğinde Vercel’in deployment rollback özelliğini kullanın veya domaini önceki barındırma hedefine geri yönlendirin.[1]

## Vercel uyarlama kontrol listesi

| Konu | Gereken çalışma | Durum |
| --- | --- | --- |
| Express Function girişi | Express uygulamasını port dinlemeyen, varsayılan export veren bir `server.ts` veya `src/server.ts` girişine ayırmak | Geçici adaptasyon gerektiğinde uygulanacak |
| Vite build | `pnpm build` ile istemci varlıklarını üretmek | Mevcut komut hazır |
| SPA deep link | API yollarını Function’a, kullanıcı rotalarını `index.html` fallback’ine yönlendirmek | `vercel.json` adaptasyonunda eklenecek |
| Statik varlıklar | Vercel’de `public/**` ile CDN servis edildiğini dikkate almak | PWA manifest/service worker varlıkları kontrol edilecek |
| OAuth | Vercel domain callback URL’si, cookie SameSite/Secure politikası ve sağlayıcı sırları | Domain netleştiğinde zorunlu |
| Veritabanı | Vercel Function’a erişebilen TLS destekli MySQL/TiDB bağlantısı | Üretim öncesi zorunlu |
| Uygulama içi bildirimler | Veritabanı erişimi ve kullanıcı oturumu | Mevcut tRPC akışıyla çalışır; ek cihaz anahtarı gerektirmez |

## Ortam değişkenleri

Vercel ortam değişkenlerini Project Settings üzerinden Production ve Preview ortamları için ayrı tanımlayın. Değişiklikler yalnızca sonraki deployment’larda uygulanır.[3] `VITE_` ile başlayan değişkenler istemci derleme çıktısına dahil olabileceğinden gizli değerleri bu önekle tanımlamayın.[2]

| Değişken | Vercel’de gerekli mi? | Not |
| --- | --- | --- |
| `DATABASE_URL` | Evet | TLS destekli, Function’dan erişilebilir MySQL/TiDB bağlantısı |
| `JWT_SECRET` | Evet | Her ortamda yüksek entropili ve ayrı değer |
| `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` | OAuth adapter’a bağlı | Mevcut sağlayıcının Vercel uyumluluğu doğrulanmalı; aksi durumda sağlayıcı değiştirilir |
| `BUILT_IN_FORGE_API_*` | Özellik kullanımına bağlı | Vercel dışında erişim ve yetkilendirme eşdeğeri sağlanmadan varsayılmamalı |

## GitHub ve secret güvenliği

Paylaşılan depo: `https://github.com/socialtradeturkey/6lory.git`.

GitHub deposuna `.env`, veritabanı bağlantı metni, JWT, OAuth secret, gerçek kullanıcı kaydı veya uygulama günlüğü göndermeyin. Vercel, ortam değişkenlerini proje ayarlarında şifreli saklar; bu değerleri kaynak koda yazmak yerine ilgili ortamda yapılandırın.[3]

## Dağıtım öncesi kontrol

```bash
pnpm check
pnpm test
pnpm build
```

Tam yığın geçiş tamamlanmadan yalnızca tasarım ve statik önizleme için Vercel kullanın. Doğrulama, puan ve ödül işlemleri erişilemezse kullanıcıya başarı sonucu göstermek yerine açık bir bakım/uygun değil durumu sunun.

## Kaynaklar

[1] [Vercel — Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

[2] [Vercel — Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)

[3] [Vercel — Environment Variables](https://vercel.com/docs/environment-variables)
