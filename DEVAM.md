# Kaldığımız yer

Son çalışma: 5 Ekim 2026. Bu dosya, projeyi başka bir bilgisayarda (ya da yeni bir oturumda)
kaldığı yerden sürdürmek için yazıldı. Oyunun ne olduğu ve nasıl çalıştığı [README.md](README.md)
içinde.

## Yeni bilgisayarda kurulum

```bash
git clone https://github.com/furktunay/street-craft.git
cd street-craft
npm install
npm run dev
```

Sonra `http://localhost:5173`. Node 20 ya da üstü gerekir.

## Depoyla birlikte gelmeyenler

Bunlar bilerek depo dışında ya da yalnızca eski bilgisayarın tarayıcısında:

- **Ses ve doku dosyaları.** `public/sounds/` ve `public/textures/` altında yalnızca `pack.json`
  eşleştirme dosyaları depoda. Klasörlere kopyalanan dosyalar `.gitignore` ile dışarıda tutuluyor,
  yeni bilgisayarda yeniden kopyalanmaları gerekir. Onlar olmadan oyun kendi ürettiği seslerle ve
  kendi çizimleriyle çalışır. Klasörün tamamı kopyalanırsa `npm run sounds:prune` ve
  `npm run textures:prune` kullanılmayanları siler.
- **Tarayıcıda saklananlar.** Blok değişiklikleri (kraterler, yapılar), envanter düzeni, deneyim
  puanı, ölçülen kamera yükseklikleri ve varsa Mapillary token'ı `localStorage` içinde; depoya
  girmez, yeni tarayıcıda sıfırdan başlar. Kamera yüksekliği ilk girişte yeniden ölçülür.

## Şu anki durum

Çalışan ve önizlemede denenmiş olanlar:

- Fotoğraftan fotoğrafa ışınlanma (`W A S D`, yerdeki oklar ve halkalar), yumuşak geçiş.
- Amsterdam'da ölçüm aracının zeminden silinmesi; İstanbul'da çekimi yapan kişinin bulanık dolguyla
  kapatılması.
- Alt bar (can, açlık, deneyim), envanter ve 2×2 üretim, ölüm ve yeniden doğma ekranı.
- TNT + çakmak, patlama ve krater; yay ve ok; iskelet yumurtası ve iskelet okçu.
- Aletlerin sağ alttan yukarı doğru, kalınlığı görünür biçimde tutulması.
- Ses paketi ve doku paketi klasörleri (gerçek dosyalarla hizası kontrol edildi).
- Haritayı sıfırlama: oyunda iki kez `R`, menüde "Bu haritayı / Tüm haritaları sıfırla".
- Blok dünyasında ağaç yok (bina sayılmayan yüksek nesneler de dahil).

Denenmemiş olanlar:

- Gerçek imleç kilidiyle oynama. Bütün testler önizleme panelinde, sürükle-bak modunda yapıldı.
- Seslerin kulakla kontrolü; yay, ok ve iskelet için eşleştirilen 10 ses dosyası hiç denenmedi.
- Serbest uçuş (`F`) ve fotoğrafa dönüş (`G`), oka tıklayarak ışınlanma.
- Çakmak, ekmek ve boş elin yeni tutuş duruşu; dar pencerede kol ve alet boyutu.
- "Tüm haritaları sıfırla" düğmesinin silme adımı (yalnızca göründüğü ve saydığı doğrulandı).
- `npm run sounds` ve `npm run textures` (oyun kurulu bir bilgisayar olmadığı için).
- Mapillary yolu (token'la gerçek istek hiç atılmadı).
- Brouwersgracht, Museumplein, Kadıköy İskelesi ve Moda konumları açılıp bakılmadı; denenenler
  Dam, Prinsengracht ve Eminönü.

## Bilinen pürüzler

- Fotoğraf geçişlerinde yakındaki ağaçlar yarım saniye kadar arkadaki cephenin üstünde kayar.
- Dam'daki anıt gibi bina sayılmayan nesnelerin bloğu yok; fotoğrafta görünür ama kırılamaz.
- Araç silinen zemin bulanık: komşu fotoğrafın 4000 piksellik halinden kuruluyor.
- İstanbul konumlarında fotoğraf konumu GPS hassasiyetinde; koyulan bloklar gerçek yüzeye tam
  oturmayabilir, geçişler Amsterdam'daki kadar temiz değil.
- Doku paketiyle alttaki envanter penceresinde figürün sağında kullanılmayan boş bir yuva görünür.
- İskelet, fotoğrafın içinde kaçamayan oyuncuya göre ayarlandı; yine de birkaçı birden öldürücü.

## Alınmış kararlar

- **Oyunun kendi çizimleri ve sesleri özgün kalır.** Depoda başka bir oyunun dosyası yok; iskelet,
  oklar ve karakter (baretli yol işçisi) oyunun kendi çizimi ve doku paketinden etkilenmez.
- **Ses ve doku paketleri isteğe bağlı klasörlerdir.** Dosya adları kaynak paketlerindeki düzenle
  aynıdır; dosyaları kullanıcı kendisi koyar.
- **Konum listesi kısa tutulur.** Yalnızca verisi iyi olan yerler: 4 Amsterdam, 3 İstanbul.
  Türkiye'de açık ve araçsız 360° çekim şu an yalnızca bu üç İstanbul noktasında var.
- **Uydurma eşya yok.** Simit ve "kızgın çaydanlık" kaldırıldı; yerlerine yay, iskelet yumurtası ve
  ekmek geldi.

## Sırada ne olabilir

Kararlaştırılmış bir sonraki adım yok. Akla gelenler:

- Normal bir tarayıcıda imleç kilidiyle baştan sona bir oynayış ve çıkan pürüzlerin giderilmesi.
- Araç silinen zemini 8000 piksellik komşu fotoğraftan kurmak (daha keskin olur, daha çok bellek ister).
- Ses klasörünü serbest lisanslı (CC0) kayıtlarla doldurmak; teklif edildi, karar verilmedi.
