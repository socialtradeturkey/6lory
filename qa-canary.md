# Canary QA kayıtları

- Production’da yeni bundle ve service worker v6 aktif; görev detayında eski Google/Manus düğmesi yerine manuel giriş yüzeyi gösterildi.
- `murathand08@gmail.com` hesabıyla birleşik Google/YouTube OAuth tamamlandı; profil ekranında `YouTube hesabı bağlı` göründü.
- Canary görev: `330001`; görev açık, kota 1, önceki izole session temizlendi.
- My Browser’da kullanıcı oturumu açıldı ve görev session’ı başarıyla oluşturuldu.
- Sonraki adım: gömülü YouTube player’ın gerçek PLAYING durumunu, Secret Code üretimini ve YouTube API kanıtlarını doğrulamak.

- Player iframe `Qtl8lJwbd4g` yüklendi fakat My Browser’da 0:00 ve spinner’da kaldı; uygulama durum metni doğru biçimde `Video duraklatıldı; sayaç ilerlemiyor.` gösterdi.
- Görev session’ı aktif ve bağlı hesabın kullanıcı ID’si 4050001; start endpoint’i quota reset sonrası başarılı.
- Gömülü iframe kontrolleri tarayıcı otomasyonunda element olarak görünmedi; doğrudan YouTube açılışı daha önce Google bot/robot doğrulama sayfasına yönlenmişti. Bu nedenle gerçek PLAYING/watch-time kanıtı henüz oluşmadı; puan/ledger yazılmadı.

- YouTube iframe’deki kontroller browser element ağacına çıkmadı; klavye odağı Secret Code alanı ve görev düğmeleri arasında kaldı.
- Player 0:00/spinner’da kalmaya devam ediyor; uygulama sayacı bunu PLAYING olarak kabul etmiyor. Bu nedenle Secret Code üretme, YouTube subscription/like kanıtı ve admin onayı zinciri gerçek izleme olmadan ilerletilmedi.

- Kullanıcının paylaştığı canlı ekran görüntüsünde video `Video oynuyor` durumunda, Secret Code overlay’i ve giriş alanı görünür; kod `359225` olarak girilmiş.
- Uygulama uyarısı, görev gönderimini durduran iki gerçek koşulu açıkça gösteriyor: kanal aboneliği ve video beğenisi eksik. Bu aşamada puan yazılmadı.

- Yeni düzeltme: Abone ol ve Videoyu beğen düğmeleri artık görev session’ına bağlı resmi YouTube API mutation’larını çağırıyor; dış sekme açmıyor.
- UI, başarılı abonelik/beğeni durumunu kilitli düğme olarak gösteriyor; geçersiz session stale state’i temizliyor; geçerli active session tekrar kullanılıyor.
- Son yerel doğrulama: 17 test dosyası başarılı, 70 test başarılı, 3 test atlandı; TypeScript ve production build başarılı. Yeni checkpoint sonrası canlı canary yeniden çalıştırılacak.

- Yeni fallback: IFrame 10 saniye içinde hazır olmazsa spinner yerine neden açıklaması, Player’ı yeniden dene ve YouTube sayfasını yalnızca kontrol amaçlı aç seçenekleri görünür; dış izleme hiçbir zaman sayaç/başarı kanıtı sayılmıyor.
- Fallback sonrası doğrulama: 17 test dosyası başarılı, 70 test başarılı, 3 test atlandı; TypeScript ve production build başarılı.

- Resmi YouTube API ile salt-okunur yeniden kontrolde canary hesabı için `subscribed: true` ve `liked: true` görüldü. Kullanıcı onayından sonra `videos.rate` çağrısı başarılı oldu; beğeni gerçek hesapta oluşturuldu.
- Bu sonuç YouTube koşullarının hesap seviyesinde hazır olduğunu gösterir; ancak görev session’ının gerçek PLAYING watch-time ve Secret Code kanıtı olmadan görev tamamlanmış sayılmayacak ve puan/ledger yazılmayacaktır.

- Canary kapanışı: görev `330001` `archived`, `claimedQuota=0`, `totalQuota=1`; 5 session `cancelled`, 6 assignment `cancelled`; `point_ledger` kaydı ve toplam tutar `0`. Geçici test canlı kullanıcı bakiyesini etkilemeden kapatıldı.

- Yeni hedef `https://www.youtube.com/watch?v=Af6i6ChAVTw` için YouTube oEmbed salt-okunur yanıtı başarılı: başlık `Last To Leave Mansion, Keeps It`, yayıncı `MrBeast`, video ID `Af6i6ChAVTw`; video public oEmbed iframe HTML’i döndü. Embed endpoint HTTP 200 verdi. Bu, URL’nin public ve embed için aday olduğunu gösterir; ancak önceki tarayıcıdaki YouTube bot/iframe kısıtının bu hedefte kesin kalktığını kanıtlamaz.

- Yeni canary v2 (`Af6i6ChAVTw`, görev `360001`) canlıda oluşturuldu ve bağlı kullanıcıyla session başlatıldı. OEmbed başarılı, player başlığı yüklendi; ancak gerçek canlı iframe yine `0:00 / spinner` durumunda kaldı ve PLAYING sinyali oluşmadı. Bu nedenle Secret Code, görev verify, admin approval ve wallet geçişi çalıştırılmadı.
- Güvenli kapanış: görev `archived`, `claimedQuota=1/1` (session başlatma kotası), 1 session `cancelled`, 1 assignment `cancelled`, `point_ledger` etkisi `0`. Kullanıcıya puan verilmedi.
