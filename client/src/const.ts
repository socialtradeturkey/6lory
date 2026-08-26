// Manuel auth tek giriş yoludur. Eski çağrı noktaları kullanıcıyı ana sayfadaki
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
