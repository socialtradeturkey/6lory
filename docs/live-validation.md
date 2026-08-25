# Canlı Kritik Yol Doğrulaması

Bu not iki ayrı kanıt türünü birbirine karıştırmadan kaydeder. İlk bölüm, yetkili yönetici hesabıyla kullanıcı arayüzünde yürütülen ve kalıcı, denetlenebilir business kayıtları bırakan canlı canary’dir. İkinci bölüm, yalnız `itest_` ön ekli fixture kayıtlarıyla çalışan ve test sonunda temizlenen gerçek veritabanı entegrasyon testidir.

| Alan | Kanıt | Sonuç |
| --- | --- | --- |
| Yönetilen OAuth | `login=1` köprüsü, hesap seçici, callback, host-only nonce ve yönetilen oturum | Başarılı |
| Vercel giriş noktası | `6lory.vercel.app` güvenli giriş eylemi, izinli yönetilen OAuth köprüsüne geçer | Başarılı |
| Yönetici dönüşü | OAuth sonrası yalnız güvenli `/admin` hedefi kabul edilir ve `socialtrade` yönetici merkezi açılır | Başarılı |
| Kullanıcı arayüzü | Ana sayfa, görev listesi/detayı, ödüller, bildirimler, profil ve liderlik ekranları oturumlu görünümde yüklendi | Başarılı |
| Yönetici arayüzü | Genel bakış ile kampanya/görev, ödül/talep, doğrulama, risk, yorum ve audit çalışma alanları görüntülendi | Başarılı |
| Canlı UI canary — görev | Kullanıcı onayıyla görev `180001`, `CANARY - Secret Code canlı doğrulama`: başlatma → süre eşiği → Secret Code alma → tek kullanımlık doğrulama → `+1` immutable ledger kaydı | Başarılı; görev daha sonra yönetici UI’sinden `archived` yapıldı |
| Canlı UI canary — ödül | Ödül `150001`, `CANARY - 1 puanlık test ödülü`: 1 puanlık talep → `requested` → `under_review` → `approved` → `preparing` → `shipped` → `delivered` | Başarılı; ödül daha sonra yönetici UI’sinden `archived` yapıldı, redemption `150001` teslim edilmiş olarak korundu |
| Canlı UI canary — görünürlük | Arşivden sonra `/tasks` ekranı canary görevi, `/rewards` ekranı canary ödülü sunmaz; yönetici envanteri ve teslimat kaydı denetim için saklanır | Başarılı |
| İzole gerçek DB fixture — görev doğrulama | `itest_` kullanıcısında task start → Secret Code → doğrulama → idempotent ledger zinciri | Başarılı |
| İzole gerçek DB fixture — ödül ve operasyon | Aynı fixture kullanıcıda ödül talebi, teslimat durum geçişi, ret/iade, stok, katalog arşivleme ve audit/bildirim etkileri | Başarılı |

İzole gerçek veritabanı testi yalnız `itest_` ön ekli kendi fixture kayıtlarını oluşturur. Test sonunda kalan `itest_` kullanıcı sayısı `0` olarak doğrulanmıştır. Canlı UI canary bunun dışında, kullanıcı yetkisiyle üretim hesabında oluşturulmuş denetim kanıtıdır; immutable ledger, doğrulama, redemption, bildirim ve audit kayıtları silinmez. Görev ve ödül yalnız kullanıcı kataloglarından çıkarılmak üzere arşivlenmiştir. Gerçek sosyal platform başarısı üretilmez; resmi sağlayıcı kimlik bilgisi olmayan akışlar `UNAVAILABLE` veya manuel inceleme sonucunu korur.

Giriş sırasında uygulama paketi yüklenirken `6lory hazırlanıyor`, OAuth köprüsü devredeyken ise `Güvenli girişe yönlendiriliyorsunuz` durumu gösterilir. Bu durumlar, yavaş ağda boş ekran algısını önler; OAuth güvenlik modelini değiştirmez.
