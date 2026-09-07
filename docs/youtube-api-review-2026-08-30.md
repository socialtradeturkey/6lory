# YouTube API review — 2026-08-30

## Doğrulanan resmi davranış

- `subscriptions.list` GET `/youtube/v3/subscriptions` çağrısı `part` ve filtrelerden tam birini ister; `mine=true`, `forChannelId` ve `maxResults` birlikte kullanılarak yetkili kullanıcının belirli kanala aboneliği sorgulanabilir. Başarılı yanıtta eşleşme yoksa `items` boş gelir. Kaynak: https://developers.google.com/youtube/v3/docs/subscriptions/list
- `subscriptions.insert` yetkili kullanıcı kanalına abonelik ekler; istek gövdesinde `snippet.resourceId.channelId` zorunludur. Mevcut uygulamanın `part=snippet` ve `{snippet:{resourceId:{channelId}}}` gövdesi resmi şekille uyumludur. Kaynak: https://developers.google.com/youtube/v3/docs/subscriptions/insert
- `videos.getRating` yetkili kullanıcının belirli video için verdiği rating bilgisini döndürür; `items[].rating` alanı `like` ile kontrol edilebilir. `youtube.force-ssl` kapsamı kabul edilen kapsamlar arasındadır. Kaynak: https://developers.google.com/youtube/v3/docs/videos/getRating
- `videos.rate` POST çağrısı `id` ve `rating` query parametrelerini ister, request body verilmez ve `youtube.force-ssl` kapsamı kabul edilir. Mevcut uygulama `videos/rate?id=...&rating=like` ve `{}` gövdesi gönderiyor; API açısından body boş JSON olsa da gereksizdir. Kaynak: https://developers.google.com/youtube/v3/docs/videos/rate
- Resmi dokümana göre `videos.rate`, videonun herkese açık resmi like/dislike sayacını değiştirmez; yalnızca yetkili kullanıcının rating bilgisini ayarlar. Bu nedenle uygulamadaki doğrulama, kullanıcının kişisel `getRating` sonucuna dayanmalı ve bunu "resmi video like sayacı arttı" şeklinde sunmamalıdır.

## Kod inceleme bulgusu

`server/routers.ts` içindeki önceki akış, YouTube API `false` sonucunu `taskSessions.progress.youtubeSubscribed/youtubeLiked` bayraklarıyla `true` yapabiliyordu. Bu, mutation daha önce başarılı işaretlenmiş olsa bile son API doğrulamasında eksik eylemi sahte başarıya çevirebilirdi. Düzeltmede local progress fallback kaldırıldı; `youtube.verify` ve `tasks.verify` artık yalnızca güncel YouTube API okuma sonucunu kullanıyor. Ayrıca `youtube.verify`, gönderilen video/kanal kimliklerini oturumun gerçek görev hedefiyle eşleştiriyor.

## Test kanıtı

- `pnpm check`: başarılı.
- YouTube/OAuth/kritik akışlar: 41 test başarılı.
- Tam test paketi: 79 başarılı, 5 başarısız; beşinin tamamı `admin.guard.test.ts` içinde veritabanı yapılandırılmadığı için `Veritabanı şu anda kullanılamıyor` hatası. Production build başarılı.
- Yeni regresyon testi: API abonelik ve beğeni sonuçları eksikken session progress içindeki `true` bayraklarının doğrulama sonucunu yükseltmediğini doğruluyor.

## Güvenlik

Kullanıcı mesajında bir GitHub PAT açık metin olarak paylaşılmıştır. Bu token kullanılmadı ve commit geçmişine yazılmadı; GitHub üzerinde derhal iptal edilip yeni, minimum yetkili bir token oluşturulmalıdır.

## Kaynaklar

1. [YouTube Data API — Subscriptions: list](https://developers.google.com/youtube/v3/docs/subscriptions/list)
2. [YouTube Data API — Subscriptions: insert](https://developers.google.com/youtube/v3/docs/subscriptions/insert)
3. [YouTube Data API — Videos: getRating](https://developers.google.com/youtube/v3/docs/videos/getRating)
4. [YouTube Data API — Videos: rate](https://developers.google.com/youtube/v3/docs/videos/rate)
5. [GitHub — socialtradeturkey/6lory](https://github.com/socialtradeturkey/6lory)

---

Yukarıdaki not, kaynak sayfalarındaki doğrulanmış bilgilerin ve yerel test çıktılarının çalışma kopyasına kaydıdır.
