# Canlı kritik yol doğrulaması

Bu belge 6lory’nin mevcut manuel kimlik doğrulama ve görev operasyonu akışını kaydeder. Kullanıcı parolaları, tokenlar ve hassas oturum değerleri bu belgede tutulmaz.

| Alan | Kontrol | Sonuç |
| --- | --- | --- |
| Manuel auth | Kullanıcı adı/e-posta + parola formu, scrypt hash ve güvenli session cookie | Uygulandı |
| Admin kurulumu | Credential yokken kısa ömürlü imzalı kurulum tokenı ile parola belirleme | Uygulandı; token tek kullanımlık ve parola loglanmıyor |
| Admin yetkisi | Admin rolü, rol izinleri ve sunucu tarafı yönetim prosedürü kontrolleri | Uygulandı |
| Görev kataloğu | Aktif görevlerin ana sayfa ve Görevler sekmesinde aynı API sonucu ile gösterilmesi | Uygulandı |
| Görev kitlesi | Aktif kayıtlı kullanıcılar, kapasite ve atama kotasıyla güvenli toplu atama | Uygulandı |
| Workspace | Video, Instagram/Web ve genel görevlerin dashboard içinde açılması; başlatma ve doğrulama sinyalleri | Uygulandı |
| Veri bütünlüğü | Task Session, doğrulama, idempotency, immutable ledger, bildirim ve audit kayıtları | Testlerle doğrulandı |
| PWA/mobil | Manifest, kurulabilir kabuk, responsive dashboard ve mobil öncelikli layout | Production build içinde doğrulandı |
| GitHub → Vercel | `socialtradeturkey/6lory` `main` dalına push sonrası bağlı Vercel production deployment | Bağlantı doğrulandı |
| Production deployment | Son bağlı Vercel deployment durumu `READY`; ana sayfa HTTP 200 HTML döndürüyor | Doğrulandı |
| Production runtime | Son 24 saatte gruplanmış Vercel runtime error bulunmadı | Doğrulandı |

## Test komutları

```bash
pnpm test -- --run
pnpm check
pnpm build
```

Gerçek admin parolası kullanıcı tarafından tarayıcıda belirlenir ve sistem tarafından düz metin olarak saklanmaz. Bu nedenle son uçtan uca adım, kullanıcının `murathand08@gmail.com` ile giriş yapıp `/admin` panelini açması ve bir test görevi oluşturmasıdır. Bu kullanıcı onayı alınmadan canlı görev oluşturma kanıtı varmış gibi gösterilmez.

Gerçek sosyal platform doğrulaması için resmi sağlayıcı API’si, yetki kapsamı ve kullanıcı hesabı bağlantısı gerekir. Bu koşullar yoksa sistem başarılı sonuç veya puan üretmek yerine `UNAVAILABLE` ya da manuel inceleme durumunu korur.
