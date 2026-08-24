# 6lory Mimari Kararı

## Ürün sınırı

6lory, kullanıcıların uygun görevleri tamamlayıp **doğrulanmış** sonuçlar karşılığında puan kazandığı ve puanlarını ödül talebinde kullanabildiği mobil öncelikli bir PWA’dır. Kullanıcının bir butona basması, görevi gerçekleştirdiğini beyan etmesi veya yalnızca bir kod girmesi başarı anlamına gelmez. Puan, yalnızca geçerli bir görev oturumu için başarılı doğrulama sonucu oluşan sunucu taraflı bir ledger kaydından sonra görünür.

| Katman | Sorumluluk | Kesin sınır |
| --- | --- | --- |
| Kullanıcı PWA’sı | Görev keşfi, talimatlar, oturum başlatma, doğrulama isteği ve ödül talebi | Puan, kota, uygunluk veya başarı kararı vermez. |
| Yönetici paneli | Kampanya/görev yapılandırması, inceleme, risk operasyonu ve ödül yönetimi | Kullanıcıyı taklit ederek görev veya puan işlemi yapmaz. |
| Uygulama sunucusu | Yetkilendirme, görev durumu, doğrulama orkestrasyonu, ledger ve redemption işlemleri | Her kritik değişikliği veritabanı transaction’ı içinde yürütür. |
| Veritabanı | İlişkisel kayıt, unique constraint, idempotency, audit ve bakiye projeksiyonu | Gerçek kaynak; istemci belleği kaynak kabul edilmez. |
| Harici adapter’lar | Platformun resmî ve izinli API’leri üzerinden doğrulanabilir sinyalleri toplama | Scraping, bypass ve otomasyon yapmaz; destek yoksa `UNAVAILABLE` döner. |

## Rotalar ve yetki sınırları

| Alan | Başlıca rotalar | Erişim |
| --- | --- | --- |
| Kullanıcı uygulaması | `/`, `/tasks`, `/tasks/:id`, `/rewards`, `/leaderboard`, `/profile`, `/notifications` | Oturum açmış kullanıcı; gerektiğinde görev uygunluğu tekrar kontrol edilir. |
| Yönetici uygulaması | `/admin`, `/admin/tasks`, `/admin/campaigns`, `/admin/verifications`, `/admin/risk`, `/admin/rewards`, `/admin/comments`, `/admin/audit` | Sadece sunucu tarafında doğrulanmış `admin` rolü; daha ayrıntılı izinler veri modeliyle genişletilir. |
| İşlem API’leri | Görev başlatma/doğrulama, ledger, redemption, bildirimler | İstemci kimliği, kaynak sahipliği, idempotency ve iş kuralları prosedür seviyesinde denetlenir. |

## Kritik akış

> **Task Started → Valid Task Session → Completion Conditions → Verification Request → Verification Engine → VERIFIED → Idempotency Check → Point Ledger Transaction → Balance Projection → Notification**

Bu zincirdeki her adım bir önceki adımı sunucu tarafında doğrular. Bir kullanıcı aynı isteği yeniden gönderirse idempotency anahtarı ve başarılı işlem için unique constraint sayesinde ikinci bir puan kaydı oluşturulmaz. Aynı yaklaşım ödül taleplerinde stok, kullanıcı limiti ve puan düşümünün tek transaction içinde işlenmesi için kullanılır.

| Alan | Başlangıç yaklaşımı | Üretim kuralı |
| --- | --- | --- |
| Görev uygunluğu | Doğrulanmış hesap, risk durumu, kota, zaman penceresi ve önceki tamamlama | Her gösterim ve başlatma anında sunucuda yeniden değerlendirilir. |
| Task Session | Kullanıcı/görev bağı, imzalı referans, sunucu saatiyle süre sonu ve anti-replay | Oturum sahibi olmayan kullanıcı işlemi göremez veya tamamlayamaz. |
| Web görevi | Görünürlük, odak, süre, etkileşim ve geçerli oturum sinyalleri | Tek başına mutlak kanıt kabul edilmez; görev politikasına göre eşiğe bağlanır. |
| Secret Code | Kullanıcı/görev/oturum bağlı, tek kullanımlık, hash saklanan ve süresi dolan kod | Sadece koşullar sağlandıktan sonra doğrulama sinyali olur. |
| Sosyal görev | Resmî API veya izinli yöntem ile adapter sonucu | API desteklemiyorsa `UNAVAILABLE` veya yapılandırılmış manuel inceleme döner; başarı taklit edilmez. |
| Manuel inceleme | Doğrulama sinyalleri, neden, risk olayları ve deneme geçmişi | İnceleyici kararı audit log’a yazılır ve ledger’ı idempotent biçimde tetikler. |

## İlk veri modeli

Kimlik doğrulama altyapısındaki kullanıcı kaydı genişletilir; ürün verisi aşağıdaki domain gruplarında normalleştirilir. Tüm iş zamanları UTC saklanır, kullanıcı arayüzünde yerel saat diliminde gösterilir.

| Domain | Temel tablolar | Bütünlük ilkesi |
| --- | --- | --- |
| Kimlik ve yetki | `users`, `user_profiles`, `roles`, `role_permissions` | Varsayılan en düşük yetki; yönetici erişimi sunucuda kontrol edilir. |
| Sosyal hesap | `social_accounts`, `social_verifications` | Hesap sahipliği ile görev eylemi doğrulaması ayrı kayıtlardır. |
| Görev | `campaigns`, `tasks`, `task_assignments`, `task_sessions`, `task_attempts` | Kota tahsisi ve oturum başlangıcı transaction ile güvence altındadır. |
| Doğrulama ve risk | `verification_attempts`, `verification_signals`, `manual_reviews`, `risk_events`, `trust_scores` | Tüm teşhis sinyalleri değiştirilemez deneme kaydına bağlanır. |
| Puan | `point_ledger`, `point_balances` | Ledger eklemeli/değiştirilemezdir; bakiye performans projeksiyonudur. |
| Ödül | `rewards`, `reward_redemptions` | Stok, puan düşümü ve redemption kaydı tek atomik işlemde gerçekleşir. |
| Operasyon | `notifications`, `notification_deliveries`, `comment_pools`, `comments`, `audit_logs` | Kritik yönetici hareketleri açıklama ve aktör bilgisiyle izlenir. |

## Deneyim ilkeleri

Arayüz, parlak neon veya casino çağrışımından kaçınan; derin lacivert, soğuk gri, kırık beyaz ve sınırlı turkuaz/viyole vurgu renklerini kullanan zarif bir ürün dili benimser. Açık ve koyu tema aynı hiyerarşiyi korur. Kullanıcı uygulamasında ana navigasyon alt çubukta yer alır; yönetici alanında tablet ve masaüstüne uygun bir kenar çubuğu kullanılır. Hareketler kısa, erişilebilir ve `prefers-reduced-motion` tercihiyle uyumludur.

PWA manifesti, güvenli HTTPS kurulumu, service worker ve çevrimdışı uygulama kabuğu kullanıcı katmanına eklenir. Görev, doğrulama, puan ve ödül bildirimleri veri tabanında saklanan uygulama içi bildirim merkezi üzerinden kullanıcı hesabına iletilir. Okundu işaretleme ve yalnızca okunmuş kayıtları temizleme işlemleri, kaynak sahipliğiyle sunucu tarafında sınırlandırılır.

## Entegrasyon durumu

Instagram, TikTok ve YouTube için adapter sınırları hazırlanacaktır; üretimde ancak gerekli resmî uygulama kimlik bilgileri, izinler ve o platformun desteklediği doğrulama yetenekleri mevcut olduğunda etkinleştirilecektir. Desteklenmeyen aksiyonlar kullanıcıya açık biçimde `UNAVAILABLE` gösterilecek veya görev politikası izin veriyorsa manuel inceleme kuyruğuna alınacaktır.

## GitHub yedekleme akışı

Paylaşılan `https://github.com/socialtradeturkey/6lory.git` deposu **public ve boş** durumdadır. Bu, tamamlanan projenin ilk güvenli dışa aktarımı için uygundur. Proje sürümleri öncelikle çalışma alanında checkpoint olarak saklanır; GitHub’a aktarım, kullanıcı hesabı bağlantısı ve açık onay sonrasında yapılır. Kaynak kontrolü gönderiminden önce ortam değişkenleri, erişim anahtarları, kullanıcı verileri, işlem günlükleri ve build çıktıları depodan hariç tutulur.

## Doğrulanmış rota ve erişim matrisi

| Rota grubu | Örnek rota | Sunucu tarafı erişim kuralı | İstemci davranışı |
| --- | --- | --- | --- |
| Uygulama ana alanı | `/`, `/tasks`, `/rewards`, `/leaderboard` | Oturum açmış kullanıcı; görev verisi yalnızca uygunluk filtresinden sonra döner. | Alt navigasyon üzerinden erişilir; yetkisiz durumda giriş akışına yönlenir. |
| Hassas kullanıcı alanı | `/profile`, `/notifications`, `/tasks/:id` | Kaynak sahipliği ve kullanıcı kimliği kontrol edilir; başka kullanıcıya ait kayıt döndürülmez. | Güvenli profil ayarları ve bildirim merkezi sunulur. |
| Yönetici operasyon alanı | `/admin`, `/admin/tasks`, `/admin/campaigns`, `/admin/rewards` | `admin` rolü zorunludur; prosedürler yönetici yetkisini her istekte denetler. | Tablet/masaüstü kenar çubuğu, sadece yetkili kullanıcıya görünür. |
| İnceleme ve risk alanı | `/admin/verifications`, `/admin/risk`, `/admin/audit` | Yalnızca yönetici; daha dar roller eklendiğinde işlem bazında izin denetimi uygulanır. | Sinyal, neden ve işlem geçmişi okunabilir; kritik kararlar audit log oluşturur. |

## Zamanlanmış iş tasarımı

6lory, sunucu belleğinde çalışan `setInterval` veya `node-cron` kullanmaz. Dağıtım tamamlandıktan sonra arka plan işlemleri, kimliği doğrulanmış ve idempotent `/api/scheduled/*` callback’leri üzerinden yönetilen Heartbeat altyapısıyla yürütülür.

| İş | Önerilen tetikleme | Callback | İdempotency ve güvenlik |
| --- | --- | --- | --- |
| Süresi dolan Task Session temizliği | Saatlik | `/api/scheduled/expire-sessions` | Oturum yalnızca `active`/`pending_verification` durumundaysa ve sunucu saati `expiresAt` değerini geçtiyse güncellenir. |
| Manual review hatırlatması | Saatlik | `/api/scheduled/review-reminders` | Aynı review için son teslimat kontrol edilmeden ikinci bildirim kuyruğa eklenmez. |
| Görev/pencere yenileme | Saatlik | `/api/scheduled/refresh-task-status` | Kampanya ve görev durumu yalnızca geçerli zaman penceresine göre ilerletilir; puan ya da kullanıcı ataması oluşturmaz. |

Callback’ler kurulmadan önce proje dışarıya dağıtılmış olmalı; callback kimliği `taskUid` üzerinden doğrulanmalı ve 5xx yanıtlarında hata bağlamı JSON olarak dönmelidir. Geçici Vercel dağıtımında bu endpoint’ler ayrıca uyarlanıp doğrulanmadan scheduler etkinleştirilmez.
