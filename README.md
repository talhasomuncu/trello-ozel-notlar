# Özel Notlarım — Trello Power-Up

Kartın içinde gömülü bir kişisel düz metin notu ve checklist. Türkçe arayüz, açık Kaydet düğmesi, kapasite göstergesi ve hata durumunda pencere içindeki taslağı koruma. İstenirse kart düğmesiyle ayrı pencerede de açılır.

## Çalıştırma ve paketleme

Node.js 24 ile, bağımlılık kurulumu olmadan:

```powershell
node --test tests/model.test.js
node scripts/build.js
node scripts/browser-test.js
Compress-Archive -Path dist/* -DestinationPath ozel-notlarim-powerup.zip -Force
```

`public/` uygulama kaynaklarını, `dist/` yalnızca yayınlanacak dosyaları içerir. Tarayıcı testi Windows'taki standart Chrome ve Edge kurulum yollarını kullanır. Testin yerel sunucusu yalnızca 127.0.0.1 üzerinde dinler ve gerçek Trello yerine SDK taklidi kullanır. Gerçek Trello hesabına erişmez. `artifacts/` altında test ekran görüntüleri üretilir.

## HTTPS yayını ve Trello kurulumu

### Bu deponun GitHub Pages yayını

GitHub Pages için yayın dosyaları `docs/` klasöründe tutulur. Kaynakta değişiklik yaptıktan sonra `node scripts/build.js` çalıştırın ve `dist/` içeriğini `docs/` içine kopyalayın.

Depoda **Settings → Pages → Build and deployment → Deploy from a branch** seçin. Dal **main**, klasör **/docs** olmalıdır. Yayın hazır olduğunda **Enforce HTTPS** açık olmalıdır.

Trello **Iframe Connector URL**:

`https://talhasomuncu.github.io/trello-ozel-notlar/index.html`

GitHub Pages yalnızca uygulama kodunu sunar. Not ve checklist içerikleri bu depoya veya GitHub Pages'e gönderilmez.

### Genel kurulum

1. `dist/` içeriğini veya ZIP içindeki dosyaları HTTPS destekleyen statik barındırma hizmetine yükleyin. `index.html` yayın kökünde olmalıdır. Alt klasörde yayın da desteklenir. Dosyalar giriş ekranı olmadan erişilebilir olmalıdır; bunlar uygulama kodudur, kişisel notlar değildir.
2. `https://ADRESINIZ/index.html`, `editor.html`, JavaScript, CSS ve SVG dosyalarının erişilebilir olduğunu doğrulayın. JavaScript dosyalarını JavaScript MIME türüyle sunun. Hosting ayarlarında Trello iframe'lerini engelleyen `X-Frame-Options: DENY/SAMEORIGIN` veya `frame-ancestors 'self'` kullanmayın. `Content-Security-Policy` kullanılıyorsa `frame-ancestors https://trello.com` ve `script-src 'self' https://p.trellocdn.com` izinlerini sağlayın.
3. [Trello Power-Up yönetimini](https://trello.com/apps/admin) açıp yeni bir Power-Up oluşturun. Ad: **Özel Notlarım**. Kendi çalışma alanınızı seçin; iletişim, destek e-postası ve yazar bilgilerinizi doldurun.
4. **Iframe Connector URL** alanına `https://ADRESINIZ/index.html` yazın. Power-Up capabilities kullanılmadığını söyleyen seçeneği işaretlemeyin.
5. **İşlevler / Capabilities** bölümünde **card-back-section** (kart arkası bölümü) ve **card-buttons** özelliklerini etkinleştirin. Önceden kurduysanız özellikle yeni **card-back-section** özelliğini açın; yalnızca dosya güncellemesi Trello'daki bu ayarı açmaz.
6. Hedef panoda **Power-Ups → Add Power-Ups** üzerinden kendi/özel Power-Up'ınızı ekleyin. Özel Power-Up, oluşturulurken seçilen çalışma alanının panolarına bağlıdır.
7. Panoyu yenileyip normal bir kartı açın. Kartın içinde **Özel Notlarım** bölümü görünür. Not veya checklist ekleyin, **Kaydet** düğmesine basın. Eski kayıtlar aynı `personalNotes` alanından okunur; veri taşıma gerekmez. Kart düğmesi de ek bir açma yolu olarak korunur.

### Yansıtılan kartlar

Trello'nun yerleşik yansıma görünümünde Power-Up kullanımı desteklenmez. Kaynak kartı kendi panosunda açın ve Power-Up'ın kaynak panoda da etkin olduğundan emin olun. Bu kısıtlama gömülü bölüm eklenerek aşılamaz. Kaynak: [Trello kart yansıtma açıklaması](https://support.atlassian.com/trello/docs/mirroring-cards/).

Bu sürüm ayrı API anahtarı, OAuth akışı, sunucu veya veritabanı gerektirmez. Genel Trello kataloğunda yayın içermez. HTTPS hesabı ve Trello çalışma alanı bu kaynak paketine bağlı değildir; canlı yayın henüz yapılmış sayılmaz.

## Veri ve gizlilik

### Not ve checklisti ekiple paylaşmak

Not ve checklist başlıklarının yanındaki **↗ Kopyala** düğmeleri API anahtarı gerektirmez. Düğme önce mevcut ekrandaki içeriğin (kaydedilmemiş düzenlemeler dahil) önizlemesini açar; **Panoya kopyala** ile metni kopyalayabilirsiniz. Tarayıcı iframe içinde otomatik kopyalamayı engellerse önizleme metni seçilir; **Ctrl+C** kullanın.

- Notu, kartın normal açıklamasını düzenleyerek mevcut açıklamanın sonuna yapıştırıp Trello'da kaydedin.
- Checklist maddelerini, normal Trello checklistinin madde ekleme alanına yapıştırın. Birden fazla satır için Trello'nun ayrı maddeler oluşturma seçeneğini kullanın. Tamamlanma işaretleri aktarılmaz; boş maddeler atlanır.
- İçerik ancak siz Trello'nun ortak alanına yapıştırıp kaydettiğinizde kartı gören kişilere görünür olur. Düğmeler Trello'nun ortak alanlarına otomatik yazmaz; özel kayıtlar değişmez ve silinmez.

### Saklama

- `t.get('card', 'private', 'personalNotes')` ve `t.set('card', 'private', 'personalNotes', value)` kullanılır. JSON biçimi: `{ version: 1, note: string, items: [{ id: string, text: string, done: boolean }] }`.
- İçerik Trello tarafından kullanıcı ve kart bazında saklanır. Aynı hesapla diğer tarayıcılardan erişilebilir. Düğmenin kendisi diğer üyelere de görünebilir; onlar kendi verilerini açarlar.
- Kart açıklaması, yorumları, Trello'nun ortak checklistleri ve `shared` depolama kullanılmaz. Notlar yerel depolamaya, analitik sistemlerine veya uygulama loglarına yazılmaz.
- Bu, Trello kullanıcıları arasında erişim ayrımıdır; uçtan uca şifreleme değildir.
- 4096 karakter sınırı bütün JSON nesnesi, alan adları, checklist kimlikleri ve varsa aynı Power-Up'ın diğer özel anahtarları dahil hesaplanır. Metin alanında 4096 karakter yazılabileceği anlamına gelmez. Kaydetmeden önce alan yeniden okunup sınır kontrol edilir; Trello'nun sunucu reddi de hata olarak ele alınır.
- Kaydetme sırasında düzenleme kilitlenir. Ağ hatasında taslak yalnızca açık pencerenin belleğinde kalır. Popup kapatıldığında taslak kaybolabilir; kapanış onayı Trello iframe'lerinde garanti edilmez.
- Aynı hesap aynı kartı birden fazla pencerede düzenlerse son başarılı kayıt geçerlidir. Ortak düzenleme ve çatışma birleştirme yoktur.
- Desteklenmeyen kayıt sürümü veya bozuk veri açıldığında düzenleme engellenir; mevcut içerik üzerine yazılmaz.

## Canlı kabul kontrolü

Yerel testler Trello'nun gerçek yetkilendirmesini kanıtlamaz. Yayından sonra aşağıdaki senaryoları Chrome ve Edge'de doğrulayın:

1. Not ve iki madde oluşturun; maddeyi düzenleyin, tamamlayın, diğerini silin ve kaydedin. Kartı kapatıp yeniden açınca son halin geldiğini kontrol edin.
2. Aynı Trello hesabıyla diğer tarayıcıda aynı kartı açın; kayıtlı verinin geldiğini kontrol edin. Başka kartın boş açıldığını doğrulayın.
3. Aynı panoya erişen ikinci, farklı Trello hesabında ilk kullanıcının notlarının ve checklistlerinin görünmediğini doğrulayın. İkinci hesabın kendi kaydının ilk hesabı etkilemediğini kontrol edin.
4. Türkçe karakterler, emoji ve `<img src=x onerror=alert(1)>` gibi metinlerin aynen metin kaldığını kontrol edin.
5. Sınırı aşın: sayaç uyarı vermeli, Kaydet devre dışı kalmalı, içerik kesilmemelidir. Metni kısaltıp yeniden kaydedin.
6. Pencere yüklendikten sonra tarayıcı geliştirici araçlarıyla ağı çevrimdışı yapın; kaydın başarısız olduğunu ve taslağın kaldığını kontrol edin. Bağlantıyı açıp yeniden kaydedin.
7. Not ve maddeleri temizleyip kaydedin; yeniden açıldığında boş olduğunu doğrulayın.

## Resmi referanslar

- [Trello özel veri alanları ve kapasite](https://developer.atlassian.com/cloud/trello/power-ups/client-library/getting-and-setting-data/)
- [Kart düğmeleri](https://developer.atlassian.com/cloud/trello/power-ups/capabilities/card-buttons/)
- [Popup arayüzü](https://developer.atlassian.com/cloud/trello/power-ups/ui-functions/popup/)
- [Power-Up yönetimi](https://developer.atlassian.com/cloud/trello/guides/power-ups/managing-apps/)
