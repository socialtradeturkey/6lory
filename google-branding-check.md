# Google Cloud Branding Kontrolü

- Tarih: 2026-08-28
- Proje adı: 6lory
- Proje ID: lory-506521
- Proje numarası: 219183351050
- Oturum hesabı: socialtradeturkey@gmail.com
- Google Auth Platform Branding ekranı erişilebilir.
- App name alanı zaten `6lory` olarak ayarlı.
- User support email: socialtradeturkey@gmail.com
- Developer contact email: socialtradeturkey@gmail.com
- Uygulama durumu: Testing; doğrulama zorunlu değil.
- Branding ekranında Save ve Discard changes seçenekleri mevcut.
- App domain alanları sayfa içeriğinde bulunuyor; mevcut değerlerin ayrıntısı görsel viewport’ta henüz açılmadı.

Sonuç: Kullanıcının istediği uygulama adı değişikliği bu projede zaten yapılmış görünüyor; mevcut değer `6lory`. Kaydetme gerektiren bir değişiklik bulunmuyor.


## OAuth Client doğrulaması

Google Auth Platform → Clients ekranında `youtube` adlı tek OAuth istemcisi görüldü. Türü Web application, oluşturulma tarihi 25 Ağustos 2026 ve Client ID başlangıcı `219183351050-4eh8...`; bu başlangıç proje numarasıyla eşleşiyor. Böylece uygulamanın doğru 6lory projesindeki OAuth istemcisini kullandığı doğrulandı. Branding ekranındaki App name zaten `6lory` olduğu için kullanıcı adına yapılacak ek bir değişiklik bulunmuyor.


## Google OAuth client edit kontrolü

Google Auth Platform → Clients → `youtube` istemcisi açıldı. Client ID `219183351050-4eh84mr3kdmmsba9cge66f652dvm7rtd.apps.googleusercontent.com`; proje numarasıyla eşleşiyor. İstemci türü Web application. Edit ekranında Authorized redirect URIs bölümü ve Save düğmesi mevcut; Google değişikliklerin 5 dakika ile birkaç saat içinde etkili olabileceğini belirtiyor. Vercel domainleri için URI eklemek gerektiği, kaynak kodundaki eski sabit Manus callback davranışı nedeniyle teşhis edildi.
