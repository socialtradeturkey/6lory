# Sosyal OAuth Entegrasyon Notları

## Instagram

Meta’nın Instagram API with Instagram Login belgesi, akışın yalnızca Instagram profesyonel hesapları (business/creator) için tasarlandığını belirtir. Bu kurulumda Facebook Sayfası bağlantısı zorunlu değildir. Temel hesap bağlantısı için en düşük kapsam `instagram_business_basic`; yayınlama, mesajlaşma ve yorum yönetimi yalnızca ürün gerçekten bu işlemleri sunacaksa sırasıyla `instagram_business_content_publish`, `instagram_business_manage_messages` ve `instagram_business_manage_comments` ile ayrıca istenmelidir.

Kaynak: <https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login>

## YouTube

YouTube Data API, özel kullanıcı verisi için OAuth 2.0 kullanır. Sunucu taraflı web uygulaması akışı, access token ile birlikte yenileme token’ını güvenli sunucuda saklayabilen uygulamalar için uygundur. YouTube kullanıcı hesabı bağlamak için Google API Console’da OAuth istemci kimlik bilgileri ve onaylı dönüş URI’leri gerekir; service account’lar YouTube hesabına bağlanamadığından kullanıcı kanalı erişiminde kullanılmaz.

Kaynak: <https://developers.google.com/youtube/v3/guides/authentication>

## TikTok

TikTok Login Kit Web, kayıtlı bir uygulama, `https` ile başlayan statik ve önceden kaydedilmiş bir redirect URI, `client_key`, server-side saklanan `client_secret`/refresh token ve tek kullanımlık, eşleşmesi doğrulanan CSRF `state` gerektirir. En temel profil bağlantısı için `user.info.basic` kapsamı yeterlidir; callback’te dönen authorization code yalnız sunucuda access token ile değiştirilmelidir. Callback, kullanıcı reddi veya uygun olmama hatalarını başarı gibi göstermeden ele almalıdır.

Kaynak: <https://developers.tiktok.com/docs/en/login-kit-web>
