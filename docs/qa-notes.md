# Son QA notları

26 Ağustos 2026 denetiminde masaüstü 1280×720 ana sayfa screenshot’ında sidebar, manuel giriş CTA’sı, doğrulama zinciri ve metin kontrastı kullanılabilir göründü. 390×844 mobil screenshot denemesi preview capture katmanında başarısız oldu; bu, uygulama kodu kaynaklı doğrulanmış bir hata değil. Mobil görünüm için production build ve responsive sınıflar ayrıca korunuyor.

Veritabanı sağlık sorgusu `SELECT 1` ile başarılı oldu. Sunucu yeniden başlatıldıktan sonra anonim `auth.me` beklenen 200/null yanıtını, kimlik gerektiren `tasks.list` beklenen 401 yanıtını verdi. Testler, TypeScript ve production build başarılıdır.
