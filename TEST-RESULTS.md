# Doğrulama sonuçları

Tarih: 18 Kasım 2026

## 19 Kasım 2026 — Anahtarsız kopyalama

Son güncelleme: önizleme kaldırıldı. Chrome ve Edge'de doğrudan kopyalama, pano izni reddinde görünmeyen seçim-kopyalama yöntemi ve her iki yöntemin başarısızlığı kontrol edildi. Gerçek Enter tuş girdisiyle yeni checklist satırı, odak taşıma, boş satırda Enter ve formun yanlışlıkla kaydedilmemesi sınandı. Orta satıra ekleme, basılı tuş tekrarı ve IME durumları da kontrol edildi. Önizlemeye ilişkin aşağıdaki maddeler önceki sürümün test kaydıdır.

- 10 otomatik test geçti: not metnini koruma, checklist sırası, boş madde atlama, tamamlanma durumuna dokunmama ve pano erişimi reddini ele alma dahil.
- Chrome ve Edge'de yerel Trello taklidiyle iki düğme, içerik önizlemesi, pano API'si başarı yolu, izin reddinde metni seçerek Ctrl+C yönlendirmesi ve dar kart düzeni doğrulandı.
- Kopyalama sırasında özel kayıtlara hiçbir ek yazma yapılmadığı doğrulandı. Gerçek işletim sistemi panosu yerine testte pano API'si taklidi kullanıldı.
- Canlı Trello'da kullanıcının yapıştırmasıyla ortak açıklama/checklist oluşturma henüz doğrulanmadı. Bu sürüm ortak alanlara otomatik yazmaz ve API anahtarı istemez.

## Başarılı

- Gömülü bölüm güncellemesi: 7 otomatik test; imzalı `card-back-section` iframe adresi, oturum kapalıyken bölüm göstermeme ve mevcut özel veri biçiminin korunması dahil.

- Node.js 24.22.1 üzerinde 5 test: boş kayıt, Türkçe/emoji/HTML benzeri metinlerin saklanması, checklist değişiklikleri, JSON dahil kapasite sınırı, diğer özel anahtarların boyuta katılması, özel kart erişim parametreleri, simüle kullanıcı/kart ayrımı, ağ hatası sonrası taslak koruma ve yeniden deneme, desteklenmeyen kayıt biçimi.
- Kurulu Chrome ve Edge ile headless arayüz testi: başlangıç durumu, not ve madde girişi, tamamlanma sayacı, kaydetme, HTML içeriğinin metin kalması, limit aşımında engelleme, başarısız kayıtta taslağı koruma, yeniden kaydetme, madde silme ve boş not kaydetme.
- Her iki tarayıcıda 340 piksel genişlikte yatay taşma kontrolü; `artifacts/chrome.png` ve `artifacts/edge.png` ekran görüntülerinin görsel incelemesi.
- Statik dosyalar `dist/` klasörüne derleme/bağımlılık kurulumu gerektirmeden kopyalandı.

## Henüz doğrulanmayan

Tarayıcı testleri yerel SDK taklidi kullanır. Gerçek Trello sunucusunda kayıt, kartın yeniden açılması, aynı hesabın cihazlar arası erişimi, iki farklı gerçek hesabın gizlilik ayrımı, canlı Trello iframe davranışı ve hosting ayarları henüz doğrulanmadı. Bunlar için HTTPS yayını ve Trello hesapları gerekir. Adımlar README içindeki canlı kabul kontrolündedir.

Chrome ve Edge testleri sandbox içinde tarayıcı başlatılamadığı için izinli sandbox dışı çalıştırmada, yeni geçici profillerle tamamlandı; mevcut kişisel tarayıcı profilleri kullanılmadı.
