# YouTube görev doğrulama notları

- `subscriptions.list` resmi API çağrısı, yetkili kullanıcının aboneliklerini sorgulayabilir; `mine=true` ve `forChannelId` ile ilgili kanal aboneliği kontrol edilebilir. Kaynak: https://developers.google.com/youtube/v3/docs/subscriptions/list
- `videos.getRating` resmi API çağrısı, yetkili kullanıcının belirli videoya verdiği rating değerini döndürür. `rating=like` ise beğeni doğrulanabilir. Gerekli kapsamlar arasında `https://www.googleapis.com/auth/youtube` ve `https://www.googleapis.com/auth/youtube.force-ssl` bulunur. Kaynak: https://developers.google.com/youtube/v3/docs/videos/getRating
- Bu iki kontrol için kullanıcı adına YouTube OAuth yetkilendirmesi gerekir; yalnızca IFrame player olayı veya Secret Code abonelik/beğeni kanıtı sayılmaz.
- Uygulama yaklaşımı: izleme + Secret Code -> kullanıcı OAuth bağlantısı -> subscriptions.list ve videos.getRating sunucu doğrulaması -> tüm koşullar sağlanırsa admin onay kuyruğu -> admin onayında ledger/cüzdan puanı.
