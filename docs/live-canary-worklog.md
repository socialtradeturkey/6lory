# Canlı Canary Çalışma Notu

- Yönetilen uygulama alanında `socialtrade` yönetici oturumu ile `/admin` erişimi 25 Ağustos 2026 tarihinde doğrulandı.
- Görevler envanterinde canary görev `180001` için `CANARY - Secret Code canlı doğrulama`, `active`, kota `1/1` bilgisi göründü.
- Bu oturumda durum kontrolleri içeren `b3ba2ee6` uygulama sürümü yönetilen alanda hedeflendi; canary görevini arşivleme işlemi sıradaki kullanıcı-arayüzü adımıdır. Temiz service worker yenilemesinin ilk anında sayaçlar sıfır görünse de sorgular tamamlandığında dört aktif görev geri geldi; bu geçici yükleme durumu veri kaybı değildir.
- Yönetici arayüzündeki `task-status-180001` seçicisi kullanılarak canary görev `active` durumundan `archived` durumuna geçirildi. Envanter kartında `Arşivlendi` değeri canlıda yeniden yüklendi; görev oturumu, doğrulama ve puan ledger kayıtları silinmedi.
- Yönetici arayüzündeki canary ödül durum seçicisiyle ödül `150001`, `active` durumundan `archived` durumuna geçirildi. Katalog kartı `Arşivlendi` durumunu gösterirken `reward_redemptions.id=150001` için teslim edilmiş talep ve işlem notu arayüzde korunarak göründü.
- Son kullanıcı `/tasks` ekranında oturum sahibine uygun görev bulunmadığı görünerek `CANARY - Secret Code canlı doğrulama` görevinin arşiv sonrasında kullanıcı kataloğundan gizlendiği doğrulandı.
- Son kullanıcı `/rewards` ekranında `Ödül kataloğu hazırlanıyor` boş durumu görünerek arşivlenen `CANARY - 1 puanlık test ödülü` kullanıcının talep edebileceği aktif katalogdan çıkarıldı.
- Audit zinciri yeniden denetiminde görev kısa süreliğine `paused`, ardından yeniden `archived` durumuna geçirildi. Salt-okunur DB sorgusu, görev `180001` için nihai `archived` durumunu ve iki `task.status_changed` audit kaydını doğruladı.
