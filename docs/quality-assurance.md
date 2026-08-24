# 6lory Kalite Güvence Notu

## Derleme ve test sonucu

| Kontrol | Sonuç | Kapsam |
| --- | --- | --- |
| `pnpm check` | Başarılı | React sayfaları, tRPC istemci sözleşmeleri, RBAC ve TaskDetail geri sayım dahil TypeScript denetimi |
| `pnpm test` | Başarılı — 11 test | Oturum çıkışı, doğrulama kuralları, yetersiz puan engeli ve rol/izin erişim senaryoları |
| `pnpm build` | Başarılı | Vite istemci derlemesi ve Express sunucu paketi |

## Erişilebilirlik kontrolleri

| Alan | Uygulanan kontrol | Kanıt |
| --- | --- | --- |
| Klavye erişimi | Etkileşimli öğeler yerel `button`, `a` veya form kontrolü olarak uygulandı. | Kullanıcı ve yönetici navigasyonu bağlantı tabanlıdır; işlemler `Button` bileşenleriyle sunulur. |
| Focus görünürlüğü | Tüm öğelerde global `outline-ring/50` focus davranışı korunur. | `client/src/index.css` temel katmanı. |
| Anlamlı adlar | Tema, bildirim ve okundu işaretleme işlemlerinde `aria-label` kullanılır. | `AppShell` ve `Notifications` bileşenleri. |
| Canlı durum | Görev oturum geri sayımı `aria-live="polite"` ile sunulur. | `TaskDetail` bileşeni. |
| Hareket tercihi | Arayüz geçişleri `prefers-reduced-motion` ile sınırlandırılır. | `client/src/index.css`. |

## Tema ve mobil görünüm

Uygulama açık ve koyu tema için farklı semantic token setleri kullanır. Butonlar, kartlar ve metinler semantic foreground/background eşleriyle tanımlanmıştır. Mobil kontrollerde 375×812 görünümde ana sayfa, görevler, ödüller ve yönetim merkezi gözden geçirildi; kullanıcı alanında alt navigasyon, yönetim alanında ise çok satırlı operasyon sekmeleri okunabilir kaldı.

> Görsel doğrulama gerçek veri içermeyen durumlarda boş durum bileşenleriyle yapıldı. Gerçek görev ve ödül yayınlandığında aynı ekranlar sunucu verisiyle dolar; içerik yokken başarı ya da sahte puan gösterilmez.
