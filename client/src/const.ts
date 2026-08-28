// Manuel auth tek giriş yoludur. Eski çağrı noktaları kullanıcıyı ana sayfadaki
// Google OAuth için tek kanonik production yüzeyi Vercel’dir. Manus önizleme/managed
// adresinden tıklansa bile callback SSL sorununa düşmemesi için akış burada başlar.
export const GOOGLE_LOGIN_URL = "https://6lory.vercel.app/api/social-oauth/youtube/start?mode=login";

// e-posta/parola formuna taşır; harici sağlayıcı yönlendirmesi yapılmaz.
export const startLogin = (): boolean => {
  if (typeof window === "undefined") return false;
  if (window.location.pathname === "/") {
    window.location.hash = "auth";
    return true;
  }
  window.location.assign("/#auth");
  return true;
};
