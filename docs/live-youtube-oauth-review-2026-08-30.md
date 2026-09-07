# Canlı YouTube OAuth inceleme notu — 2026-08-30

## Depo akışı

- Başlangıç endpoint’i: `GET /api/social-oauth/youtube/start`.
- Profil bağlantısında callback host istek hostundan seçilir; Vercel yüzeyleri canonical olarak `https://6lory.vercel.app` kabul edilir.
- Google login modunda başlangıç ve callback canonical Vercel yüzeyini kullanır.
- Callback: `GET /api/social-oauth/youtube/callback`.
- OAuth state HMAC ile imzalanır ve 10 dakika TTL ile doğrulanır.
- Authorization code, Google token endpoint’inde aynı `redirect_uri` ile exchange edilir.
- Access token şifreli saklanır; refresh token varsa o da şifreli saklanır.
- YouTube API eylemleri `youtube.force-ssl` scope’u ile yapılır.

## Google resmi kaynak bulguları

Google’ın web-server OAuth dokümanı, authorization-code kullanan confidential server uygulaması akışını ve redirect URI’nin OAuth client’ta kayıtlı URI ile birebir eşleşmesi gerektiğini belirtir: https://developers.google.com/identity/protocols/oauth2/web-server

YouTube Data API `subscriptions.list`, `subscriptions.insert`, `videos.getRating` ve `videos.rate` belgeleri resmi API çağrı şekillerini tanımlar: https://developers.google.com/youtube/v3/docs/subscriptions/list, https://developers.google.com/youtube/v3/docs/subscriptions/insert, https://developers.google.com/youtube/v3/docs/videos/getRating, https://developers.google.com/youtube/v3/docs/videos/rate

`videos.rate`, kullanıcının kişisel rating’ini ayarlar; kamuya açık video like sayacını değiştirmez.

## Canlı test prosedürü

1. Google Cloud projesinde YouTube Data API v3’ü etkinleştir.
2. OAuth consent screen’i yapılandır; uygulama adı, destek e-postası, geliştirici iletişim e-postası ve privacy policy/terms URL’lerini production gereksinimlerine göre ekle. Test modunda gerçek test Google hesabını Test users listesine ekle; production yayını ve doğrulama gereksinimlerini Google Console’daki güncel durumdan kontrol et.
3. OAuth client türü olarak Web application oluştur. Authorized redirect URI’ye tam olarak `https://6lory.vercel.app/api/social-oauth/youtube/callback` ekle. Scheme, host, path ve trailing slash authorize isteğiyle birebir aynı olmalı.
4. Vercel Production ortamında `DATABASE_URL`, `JWT_SECRET`, `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` ve uygulamanın kullandığı diğer sunucu değişkenlerini tanımla. Secret’ları `VITE_*` ile başlamayan sunucu değişkenleri olarak sakla.
5. Vercel deployment’ın `/api/*` Function yönlendirmesini ve `main` commit’ini kullandığını doğrula. `https://6lory.vercel.app/api/social-oauth/youtube/start?mode=login` ile login akışını; giriş yapılmış kullanıcıyla `https://6lory.vercel.app/api/social-oauth/youtube/start` ile profil bağlantısını test et.
6. Google consent ekranında `youtube.force-ssl` yetkisini onayla. Callback’in 302 ile `/profile?google=connected&youtube=connected` veya `/profile?youtube=connected` hedefine dönmesini bekle.
7. Profilde `youtube.connectionStatus` sonucu bağlı görünmeli. DB’de tokenların yalnızca ciphertext olarak bulunduğunu doğrula; access/refresh tokenı loglama.
8. YouTube görevinde, hedef video ve kanal için görev başlat. Abonelik düğmesi `subscriptions.list` ile mevcut aboneliği kontrol eder ve gerekirse `subscriptions.insert` çağırır. Beğeni düğmesi önce `videos.getRating`, sonra gerekirse body’siz `videos.rate` çağırır.
9. `YouTube koşullarını kontrol et` düğmesi güncel API read-after-write sonucunu birkaç kez retry eder. API eksik dönüyorsa UI başarı göstermemeli; local session progress bayrakları API sonucunu override edemez.
10. Secret Code ve YouTube koşulları tamamlanmadan `tasks.verify` gönderilmemeli. Başarılı kullanıcı gönderimi `manual_review` ve pending points üretmeli; admin kararı olmadan kesin ledger puanı yazılmamalı.
11. Negatif testleri gerçekleştir: consent deny, yanlış redirect URI, expired/revoked token, YouTube scope olmadan token, farklı video/kanal parametresi, API’nin abonelik/beğeni için boş sonuç döndürmesi ve player engeli. Bu durumlarda başarı veya puan oluşmamalı.
12. Test sonrasında geçici görev/session/assignment kayıtlarını temizle; test hesabının aboneliğini ve beğenisini manuel olarak geri al; OAuth tokenını revoke et veya bağlantıyı profil üzerinden kes.

## Kod değişiklikleri

`server/routers.ts`: local `taskSessions.progress` bayraklarının güncel API sonucunu başarıya yükseltmesi kaldırıldı. `youtube.verify`, session’ın task kaydını okuyor ve `videoId`, `channelId`, YouTube platformu ve aktif YouTube koşullarıyla eşleşmeyi zorluyor. `tasks.verify` de YouTube kanıtı üretirken yalnızca `youtubeVerification` sonucunu kullanıyor.

`server/youtube.ts`: mutation yardımcısı request body’yi opsiyonel destekliyor. `subscriptions.insert` JSON gövdesini koruyor; `videos.rate` resmi sözleşmeye uygun biçimde body göndermiyor.

`server/critical-flows.test.ts`: local progress true iken API’nin abonelik ve rating sonuçları eksik olduğunda `youtube.verify` sonucunun false kaldığını doğrulayan regresyon testi eklendi.

`server/youtube.test.ts`: `videos.rate` çağrısının POST, doğru query parametreleri ve body olmadan gönderildiği doğrulanıyor.

`server/admin.guard.test.ts`: DATABASE_URL olmayan ortamlarda DB bağımlı admin guard testleri koşullu atlanıyor; DB mevcutsa testler çalışmaya devam ediyor.

## Yerel doğrulama

- `pnpm check`: başarılı.
- Tam test: 79 başarılı, 8 koşullu atlandı.
- `pnpm build`: başarılı.
- Son commit: `e2e4c6b`.
