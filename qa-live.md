
## 2026-08-28 OAuth ve admin canlı QA

- Canonical Vercel Google authorization URL’si `https://6lory.vercel.app/api/social-oauth/youtube/callback` redirect URI’sini taşıdı.
- Google hesap seçimi ve test uygulaması uyarısı sonrasında kullanıcı onayıyla consent ekranı açıldı; consent başlığında `6lory.vercel.app` göründü.
- Google consent tamamlandıktan sonra canlı dönüş `https://6lory.vercel.app/profile?google=connected&youtube=connected` oldu. Profil ekranında `YouTube hesabı bağlı`, `socialtrade`, `socialtradeturkey@gmail.com` ve bakiye özeti göründü.
- Aynı oturumda `https://6lory.vercel.app/admin` açıldı ve `Ana yönetici` rolü ile Genel bakış, Analitik, Katılımcı istatistikleri, Kullanıcılar, Görevler, Ödüller, Doğrulama, Risk merkezi, Yorum havuzları ve Audit log sekmeleri göründü.
- Admin Görevler sekmesinde görev oluşturma formu; YouTube, Secret Code, minimum izleme, kod görünme süresi, rastgele zaman aralığı, kota, kullanıcı limiti ve uygunluk alanlarıyla yüklendi. Envanterde mevcut görevler ve durum/kota kontrolleri göründü.

### Kullanıcı rotası doğrulaması

- Google callback sonrası `/admin` doğru `Ana yönetici` oturumunu açtı.
- Aynı oturumla `/profile` yeniden yüklendiğinde `Çıkış yap`, kullanıcı `socialtrade` ve `YouTube hesabı bağlı` bilgileri korundu; cookie/session navigasyon sonrasında çalışıyor.
- İlk `/tasks` açılışında kısa süreli skeleton görüldü, yeniden yükleme sonrasında kullanıcı oturumu ve üst kullanıcı menüsü göründü.
- `/tasks` sorgusu tamamlandığında güvenli boş durum (`Şu an yayınlanmış aktif görev yok`) gösterildi; bu, admin kataloğundaki görevlerin aktif olmamasından kaynaklanıyor ve hata ekranı değil.

### Admin görev yönetimi doğrulaması

- Google ile bağlanan `socialtrade` hesabı aynı Vercel oturumunda admin paneline erişti.
- Görevler sekmesinde kampanya ve yeni görev çalışma alanı yüklendi; görev başlığı/açıklaması, platform, eylem, hedef URL, doğrulama yöntemi, fallback, ödül puanı, kota, kullanıcı limiti, YouTube minimum süre, Secret Code görünme süresi, rastgele kod aralığı, oturum süresi, günlük limit ve uygunluk alanları görünür.
- Mevcut görev envanterinde durum selectleri, kapasite kontrolleri ve yetkili görevlerde Sil işlemleri görünür; aktif görev sayacı 1 olarak raporlandı.

### Görev formu ayrıntılı görünüm

- Admin görev formu canlıda başarıyla açıldı ve başlık, açıklama, platform, eylem tipi, hedef URL, doğrulama yöntemi, fallback, ödül, kota, kullanıcı limiti, tahmini süre, YouTube minimum izleme, Secret Code görünme süresi, rastgele kod başlangıç/bitiş aralığı, oturum süresi, günlük limit ve uygunluk alanları görünür.
- Mevcut envanterde önceki canary görevleri arşivli veya sonlandırılmış; `sadsada` adlı görev aktif ancak yalnızca atanan kullanıcı kitlesine bağlı. Kullanıcıya açık yeni görev oluşturma ve kontrollü biçimde sonlandırma/arşivleme testi gerekiyor.

Admin sayfası form doldurma öncesi tekrar doğrulandı. Görev başlığı alanı üst bölümde; açıklama, platform, eylem, URL, doğrulama yöntemi ve kota/süre/Secret Code alanları formun devamında. Canlı test için düşük ödüllü, geçici ve sonlandırılabilir bir görev kullanılacak; YouTube playback bot/embedding kısıtı nedeniyle puan yazımı yalnızca gerçek doğrulama varsa değerlendirilecek.

Canlı admin formu görev başlığı görünümünden görev ayrıntıları görünümüne kaydırıldı. Formda YouTube seçeneği, Secret Code yöntemi, kota/süre ve beklenen görev yaşam döngüsü alanları aktif. Envanterde eski canary kayıtları korunuyor; yeni QA kaydı düşük ödül ve kota ile oluşturulup tamamlandıktan sonra arşivlenecek.

### Görev detay smoke testi

- Aynı authenticated Vercel oturumuyla `/tasks/270001` doğrudan açıldı. Üst kabukta kullanıcı `socialtrade` ve bakiye alanı göründü; görev detay gövdesi ise `YÜKLENİYOR` skeleton’ında kaldı ve görev içeriği yüklenmedi.
- Bu durum görev detay query’sinin production’da beklediği biçimde sonuçlanmadığını gösteriyor; görev akışı ve YouTube player testinden önce detail query/ID veya API yanıtı izole edilmelidir. Puan/ledger işlemi yapılmadı.

### Channel ID otomasyonu yerel doğrulaması

Güncel kaynak yerel preview’da admin hesabıyla açıldı; admin paneli ve yetki sekmeleri hatasız yüklendi. YouTube URL parser/resolver testleri, OAuth host regresyonları ve TypeScript kontrolü başarılıdır. Admin görev formundaki URL alanı ile `Channel ID’yi bul` geri bildiriminin etkileşimli doğrulaması sonraki adımdır.

Yerel preview admin oturumu yeniden görüntülendi; `Görevler` sekmesi ve diğer rol tabları erişilebilir, aktif görev sayacı yüklenmiştir. Güncel form etkileşimi için doğru sekme hedefi tespit edildi.

Görevler sekmesi güncel yerel preview’da açıldı. Formda platform seçimi ve hedef URL alanı görünür; YouTube seçildiğinde yeni `Channel ID’yi bul` kontrolünün açılacağı etkileşim alanına ulaşıldı. Mevcut görev verileri değiştirilmedi.

Platform select alanı yerel preview’da odaklandı. Tarayıcının native select katmanı nedeniyle metin tuşuyla seçim değişmedi; uygulama veya veritabanı verisi etkilenmedi. Resolver davranışı unit testlerle doğrulanmış durumda, UI seçimi koordinat/klavye akışıyla sürdürülüyor.

Platform klavye ile YouTube’a geçirildi. Form, `YouTube kanal ID’si`, abonelik/beğeni zorunlulukları, hedef URL ve `Channel ID’yi bul` düğmesini koşullu olarak gösterdi. `Af6i6ChAVTw` video URL’si hedef alana girildi; bir sonraki adım resmi YouTube API sonucunun alana otomatik yazıldığını doğrulamaktır.

`Channel ID’yi bul` çağrısı bağlı Google/YouTube admin hesabıyla yerel preview üzerinden resmi API’ye ulaştı. `https://www.youtube.com/watch?v=Af6i6ChAVTw` girdisi `MrBeast · UCX6OQ3DkcsbYNE6H8uQQuVA` olarak çözüldü ve `YouTube kanal ID’si` alanı otomatik dolduruldu. Görev oluşturulmadı; envanter, puan ve ledger verisi değişmedi.

Production veritabanı salt-okunur kontrolünde hem `socialtradeturkey@gmail.com` hem `murathand08@gmail.com` yönetici hesapları için güncel `youtube_connections` satırları ve ileri tarihli access-token süreleri görüldü. Token içerikleri okunmadı. Bu, Google/Vercel callback sonrasında token exchange’in başarılı olup bağlantının kalıcı yazıldığını doğrular.

### Production manuel auth QA

`https://6lory.vercel.app/#auth` anonim oturumda açıldı. Giriş yap ve Yeni kayıt sekmeleri, Google giriş düğmesi, e-posta/kullanıcı adı ve parola alanları göründü. Yeni kayıt sekmesi ad-soyad, kullanıcı adı, e-posta ve parola alanlarını yükledi; geçici QA hesabıyla kayıt ve yeniden giriş testi için form hazırdır.

Yeni kayıt formu `6lory QA Test` adını ve benzersiz `qa6lory_0828c` kullanıcı adını istemci doğrulama hatası olmadan kabul etti. E-posta/parola ve submit adımları tamamlanarak sunucu kaydı sınanacaktır.

Geçici `qa6lory.20260828c@example.com` e-postası kayıt formuna girildi. Parola alanı ve `Güvenli hesabımı oluştur` submit düğmesi görünür; test hesabının sunucu tarafında oluşturulması sonraki adımdır.

Geçici QA kaydı production’da başarıyla tamamlandı. Uygulama ana sayfaya döndü, `6lory QA Test` kullanıcı oturumu açıldı ve başlangıç değerleri 0 puan, 0 tamamlanan görev, 0 bildirim olarak gösterildi. Yeni hesap otomatik olarak standart kullanıcı deneyimine alındı.

Yeni standart kullanıcıyla `/admin` açıldığında `Yetkili erişim gerekli` ekranı gösterildi ve yönetici paneli verileri sunulmadı. Kullanıcı ana sayfasına dönüşte `6lory QA Test` oturumu ile 0 puan/0 görev durumu korundu; istemci ve sunucu rol koruması production’da doğrulandı.

Geçici QA hesabında Çıkış yap işlemi production session’ını temizledi ve anonim giriş yüzeyine döndürdü. Giriş yap sekmesinde kullanıcı adı/e-posta, parola ve manuel giriş submit alanları yeniden yüklendi; aynı hesabın yeniden oturum açma testi için hazırdır.

Çıkış sonrası aynı `qa6lory_0828c` kullanıcı adı ve test parolası manuel giriş formuna kabul edildi. Submit sonrası yeni session’ın açılması ve kullanıcı ana sayfasına dönüş doğrulanacaktır.

Manuel giriş production’da başarıyla tamamlandı. Uygulama ana sayfaya döndü, yeni session açıldı ve aynı `6lory QA Test` kullanıcı kimliği ile 0 puan/0 görev başlangıç durumu korundu. Böylece yeni kayıt, çıkış, kullanıcı adıyla manuel yeniden giriş ve standart kullanıcı rol koruması uçtan uca doğrulandı.


## Mobil responsive QA

375x812 görünümünde ana sayfa, görevler, ödüller, bildirimler, profil ve admin rotaları ayrı ayrı render edildi. Alt navigasyon güvenli alan içinde kaldı; aktif sekme, bildirim rozeti, profil bağlantı durumu, admin çıkış düğmesi ve kart yüzeyleri telefon genişliğinde taşmadı. Görevler ve ödüller veri boşluğu durumları skeleton/empty-state bileşenleriyle okunabilir kaldı. Tasarım ikon seti olarak mevcut lisanssız Lucide ikonları korunacaktır; marka özel SVG değişikliği bu kapsamda gerekli görülmedi.
