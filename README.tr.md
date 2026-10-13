# Street Craft

Gerçek 360° sokak fotoğraflarının içinde oynanan bir blok oyunu. Sokak seviyesinde çekilmiş bir
panoramanın içinde durursun, fotoğraftan fotoğrafa adım atarsın, fotoğrafın içine blok koyarsın,
gerçek yolu kazar, gerçek binaları patlatırsın. Fotoğrafın altında harita verisinden kurulmuş bir
blok dünyası vardır; kırdığın her yerde o görünür.

Deneysel bir projedir. **Resmî bir Minecraft ürünü değildir; Mojang ya da Microsoft tarafından
onaylanmamıştır ve onlarla bağı yoktur.** Google ile de bağı yoktur. Bu depodaki bütün çizimleri ve
sesleri oyunun kendi kodu üretir; başka bir oyunun dosyası yoktur.

English: [README.md](README.md)

## Çalıştırma

```bash
npm install
npm run dev
```

Sonra tarayıcıda `http://localhost:5173`. Node 20 ya da üstü gerekir. `npm run build`, `dist/`
klasörüne durağan bir site yazar.

## Oyun sokak fotoğrafıdır

Bir konum ancak içinde durulacak sokak fotoğrafı varsa oynanır. Fotoğrafın iki kaynağı var.

**Ücretsiz, anahtarsız.** Amsterdam'da iki konum doğrudan çalışır: **Nieuwmarkt** ve **Arena
Boulevard**. Belediyenin kendi ölçüm panoramalarını (8000 piksel, 5 metrede bir, ölçülmüş konum)
Hollanda'nın lazer taramasının üstünde kullanır; bloklar gerçek yüzeylere tam oturur. Ücretsiz
kaynaklar başka yerleri kapsamaz ve oyun bu kaynaklarla yeni konum eklemeye izin vermez.

**Google Street View, kendi anahtarınla.** **Seçenekler**'den açınca dünyanın neredeyse her sokağı
daha keskin fotoğraflarla açılır: listedeki diğer konumlar (New York, Times Square, Las Vegas,
Londra, Berlin, Rotterdam, Roma, Barselona, Tel Aviv, Tokyo) kilidini açar ve **Konum seç → Kendi
konumunu ekle** kutusu koordinat ya da yapıştırılmış bir Google Maps bağlantısı kabul eder.

Anahtar almak için:

1. [Google Cloud Console](https://console.cloud.google.com/)'da faturalandırması açık bir proje seç
   ya da oluştur.
2. Projede **Map Tiles API**'yi etkinleştir.
3. Bir **API anahtarı** oluştur. Anahtarı Map Tiles API'ye ve oynadığın adrese
   (`http://localhost:5173/*`) kısıtla.
4. Oyunda **Seçenekler → Google Street View** kutusuna anahtarı yapıştır, kaydet.

Önce bilmen gerekenler:

- Anahtar yalnızca tarayıcında saklanır (`localStorage`). Depoya yazılmaz, derleme çıktısına girmez.
  Geliştirirken `.env.local` dosyasına `VITE_GOOGLE_MAPS_KEY=...` da yazabilirsin (depo dışındadır);
  onu yalnızca `npm run dev` okur.
- Google karo başına ücret alır. Bu belge yazılırken fiyat listesinde ayda ilk 100.000 Street View
  karosu ücretsiz, sonrası 1.000 karo başına 2 dolardı; varsayılan kota günde 15.000 karoydu. Güncel
  rakamlara kendin bak. Bir fotoğraf yürürken 32 karo, durunca keskinleşmek için 64 karo daha tutar.
- Oyun istediği karoları sayar ve ayda 90.000'de durur; daha fazlası için Seçenekler'de kaç karo
  ödemeye razı olduğunu yazman gerekir. Sayaç yalnızca bu tarayıcıyı görür; kesin rakam Cloud
  Console'dadır.
- Google'ın görüntülerini kullanman Google Maps Platform Hizmet Şartları'na tabidir. Oyun
  fotoğrafları yalnızca gösterir; saklamaz, çözümlemez.

Bir konumda fotoğraf yoksa (Google kapalıysa, anahtar çalışmıyorsa ya da orada gerçekten bir şey
yoksa) oyun başlamaz; bunu söyler ve seni konum listesine geri gönderir.

## Kontroller

| Tuş | İş |
| --- | --- |
| `W` | Baktığın okun gösterdiği fotoğrafa adım at; basılı tutunca devam eder |
| `A` `S` `D` | Sola, geriye, sağa adım at |
| Sol tık / sağ tık | Kır, vur / koy, kullan |
| `1`–`9`, tekerlek | Alt bardan eşya seç |
| Orta tık | Baktığın bloğu ele al |
| `E` | Envanter (sekmeli yaratıcı katalog) ve 2×2 üretim |
| `Tab` | Fotoğraf modu ile serbest gezinti (yürü, zıpla) arasında geç |
| `F`, çift `Boşluk` | Serbest gezintide uç |
| `G` | En yakın fotoğrafa dön |
| `V` | Baktığın arabaya katı bir gövde ver (tekrar: geri al) |
| `R` iki kez | Bu haritayı sıfırla |
| `P` | Fotoğrafı aç/kapat (alttaki blok dünyası) |
| `C` | Fotoğrafın bloklara oturuşunu elle ayarla |
| `M`, `F3` | Büyük harita, hata ayıklama bilgisi |

Tarayıcı imleci kilitleyemezse (gömülü önizlemeler) oyun sürükle-bak moduna geçer.

## İçinde neler var

- **Yapı blokları:** taş, tuğla, tahta, beton, cam, on altı renkte yün ve halı, cevherler ve
  blokları, bir de gerçek sokakların malzemeleri (asfalt, parke, kaldırım, kiremit); bunlar ilk
  kazdığında envanterine girer.
- **Şekilli bloklar:** altı malzemeden yarım blok ve basamak, açılıp kapanan kapılar, kapaklar,
  komşusuna bağlanan çitler ve cam levhalar, merdiven, meşale, iki hücre kaplayan yatak, eşya
  saklayan sandık. Basamak senden uzağa doğru yükselir, sandık sana bakar, yarım bloğun üstüne
  ikincisini koyunca tam blok olur.
- **Yapılacak şeyler:** çakmakla TNT, yay, kazma ve kılıç, acıkınca ekmek, çağırma yumurtaları
  (iskelet okçu, creeper, zombi, zombileşmiş piglin), her konumun altındaki Nether'a açılan obsidyen
  portal ve kimsenin uyumaması gereken bir yerde yatakların yaptığını yapan bir yatak.
- **Üç dil:** İngilizce, Türkçe, İspanyolca (menünün sağ üstünde).

Blok değişiklikleri, envanter, sandıklar ve ayarlar tarayıcıda, konum başına saklanır.

## Doku ve ses paketleri

Oyun bütün dokularını kendi çizer, seslerini kendi üretir. Sahip olduğun dosyaları görmek ve duymak
istersen onları `public/textures/` ve `public/sounds/` klasörlerine, bir kaynak paketinin `textures`
ve `sounds` klasörlerindeki düzenle koy; her klasördeki `pack.json` hangi dosyanın oyunun hangi
parçasını giydirdiğini söyler, eksik olan kendi çizimiyle kalır.

`npm run textures` ve `npm run sounds`, `pack.json`'da adı geçen dosyaları bu bilgisayarda kurulu
oyundan kopyalar (hiçbir şey indirmez); `npm run textures:prune` ve `npm run sounds:prune`,
`pack.json`'da adı geçmeyenleri siler. Bu klasörler `pack.json` dışında depo dışındadır. Yalnızca
kullanma hakkın olan dosyaları koy ve başkasının dosyalarını derlemenle birlikte yayımlama:
`npm run build`, `public/` klasörünü `dist/` içine olduğu gibi kopyalar.

## Veri ve lisanslar

- Amsterdam panoramaları: [Gemeente Amsterdam](https://api.data.amsterdam.nl/panorama/) açık verisi
- Yükseklik: [AHN](https://www.ahn.nl) (PDOK, açık veri); bina sınırları: [3D BAG](https://3dbag.nl), CC BY 4.0
- Yollar, su, arazi örtüsü: © [OpenStreetMap](https://www.openstreetmap.org/copyright) katkıcıları, [OpenFreeMap](https://openfreemap.org) üzerinden
- Tokyo binaları: [Project PLATEAU](https://www.mlit.go.jp/plateau/); diğer yerlerde yükseklik: GSI Japonya, Mapzen Terrarium
- Kullanıldığı yerde gönüllü panoramaları: [Panoramax](https://panoramax.fr) katkıcıları, CC BY-SA 4.0
- Street View: © Google; oyuncunun kendi anahtarıyla Map Tiles API üzerinden gösterilir
- Menü yazı tipi: [Jersey 15](https://fonts.google.com/specimen/Jersey+15), SIL Open Font License, Google Fonts'tan yüklenir

## Lisans

Kod [MIT lisansı](LICENSE) altındadır. Harita verisi, sokak fotoğrafları ve yazı tipi yukarıda
sayılan kendi lisanslarını korur; eklediğin doku ya da ses paketinin sorumluluğu sendedir.
