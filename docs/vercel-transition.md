# Vercel dağıtım ve üretim çalışma modeli

6lory’nin kaynak deposu `https://github.com/socialtradeturkey/6lory.git` adresindedir. Vercel projesi bu GitHub deposunun `main` dalına bağlıdır. `main` dalına başarılı bir push geldiğinde Vercel yeni bir production deployment oluşturur; build tamamlandığında deployment durumu Vercel panelinden izlenebilir.

## Uygulama ve API sınırı

Vercel alan adı kullanıcı arayüzünü ve `/api/*` Function yönlendirmesini sunar. Uygulamanın güvenilir veri ve oturum katmanı yönetilen 6lory sunucusundadır. Production ortamında `DATABASE_URL` ve `JWT_SECRET` gibi değerler yalnızca sunucu tarafında yapılandırılmalı; GitHub’a, tarayıcı bundle’ına veya loglara yazılmamalıdır.

## Kimlik doğrulama

Kullanıcı erişimi uygulama içindeki **kullanıcı adı/e-posta ve parola** formuyla veya YouTube kapsamlarını da veren tek Google OAuth akışıyla yapılır. Google OAuth’un kanonik başlangıç ve callback yüzeyi `https://6lory.vercel.app` adresidir; eski managed Manus callback’i yalnızca `https://6lory.vercel.app/?auth=retry&legacy=1` adresine yönlendiren, önbelleksiz bir uyumluluk köprüsüdür. Token değişimi sırasında kullanılan `redirect_uri`, authorize isteğinde kullanılan Vercel callback URI’siyle birebir aynı olmalıdır. Parolalar scrypt ve benzersiz salt ile hashlenir; oturumlar güvenli host-only session cookie ile sürdürülür. Admin kullanıcısı başarılı girişten sonra `/admin` alanına yönlendirilir ve sunucu tarafındaki rol/izin kontrolleri tüm yönetim prosedürlerinde uygulanır.

## Görev ve veri güvenliği

Görev başlatma, workspace sinyalleri, doğrulama, immutable ledger ve ödül işlemleri sunucu tarafında yürütülür. Tarayıcıdaki iframe veya video görünürlüğü tek başına başarılı doğrulama sayılmaz. Sağlayıcı API’si bulunmayan sosyal görevler `UNAVAILABLE` veya manuel inceleme sonucuna gider; sahte başarı, puan veya kullanıcı yorumu üretilmez.

## Yayın öncesi kontrol

```bash
pnpm check
pnpm test -- --run
pnpm build
```

GitHub tokenı yalnızca push veya bakım işlemi için güvenli ortam değişkeni olarak kullanılmalıdır. Token uygulama koduna, `.env` dosyasına veya commit geçmişine eklenmemelidir. Vercel ortam değişkenleri Project Settings içinde Production ve Preview için ayrıca kontrol edilmelidir; yerel başarı, eksik production env değerlerinin yerine geçmez.

## Geri dönüş

Bir deployment hata verirse önce Vercel build ve runtime logları incelenir. Sorun kaynak değişikliğinden kaynaklanıyorsa son doğrulanmış checkpoint’e geri dönülür ve yeni bir commit ile `main` dalı güncellenir. Veritabanında destructive migration veya kullanıcı verisi silme işlemi geri dönüş yöntemi olarak kullanılmaz.

## Kaynaklar

[1] [Vercel — Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

[2] [Vercel — Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)

[3] [Vercel — Environment Variables](https://vercel.com/docs/environment-variables)
