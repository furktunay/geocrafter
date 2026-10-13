# GeoCrafter: gerçek sokak fotoğraflarının içinde Minecraft tarzı blok oyunu

GeoCrafter, GeoGuessr ile Minecraft'ın karışımı: Google Street View'un ve başka gerçek 360° sokak
fotoğraflarının içinde oynanan bir blok oyunu. Fotoğrafın içinde durursun, birinden öbürüne adım
atarsın, blok koyarsın, gerçek yolu kazar, gerçek binaları patlatırsın.

Deneysel bir projedir. Yapan: [furk.ai](https://www.instagram.com/furk.ai/). Eski adı **Street
Craft** (StreetCraft) idi; ilk videolardaki logoda o yazar.

**Resmî bir Minecraft ürünü değildir; Mojang ya da Microsoft tarafından onaylanmamıştır ve onlarla
bağı yoktur.** Google ve GeoGuessr ile de bağı yoktur.

English: [README.md](README.md)

## Çalıştırma

Adımlar Windows'ta ve macOS'ta aynıdır.

1. [Node.js](https://nodejs.org) 20 ya da üstünü kur.
2. Projeyi al: `git clone https://github.com/furktunay/geocrafter.git`, ya da GitHub'dan ZIP olarak
   indirip aç.
3. Proje klasöründe bir terminal aç (macOS'ta Terminal, Windows'ta Komut İstemi ya da PowerShell)
   ve şunları çalıştır:

   ```bash
   npm install
   npm run dev
   ```

4. Tarayıcıda `http://localhost:5173` adresini aç. O port doluysa terminal kullanılacak adresi
   yazar.

Windows'ta PowerShell `npm` komutunu çalıştırmayı reddederse Komut İstemi'ni kullan.

## Sokak fotoğrafları

Amsterdam'da iki konum, **Nieuwmarkt** ve **Arena Boulevard**, ücretsiz sokak fotoğraflarıyla
doğrudan çalışır. Diğer bütün konumlar ve kendi konumunu eklemek için kendi anahtarınla Google
Street View gerekir.

## Google anahtarı almak

1. [Google Cloud Console](https://console.cloud.google.com/)'da faturalandırması açık bir proje seç
   ya da oluştur.
2. Projede **Map Tiles API**'yi etkinleştir.
3. Bir **API anahtarı** oluştur. Anahtarı Map Tiles API'ye ve oynadığın adrese
   (`http://localhost:5173/*`) kısıtla.
4. Oyunda **Seçenekler → Google Street View** kutusuna anahtarı yapıştır, kaydet.

Bilmen gerekenler:

- Anahtar yalnızca tarayıcında durur. Depoya da derleme çıktısına da girmez.
- Google ayda ilk 100.000 Street View karosunu ücretsiz verir, sonrası ücretlidir (güncel fiyatlara
  bak). Oyun ayda 90.000'de durur; bunu Seçenekler'den yükseltebilirsin.

## Veri ve lisanslar

- Amsterdam panoramaları: [Gemeente Amsterdam](https://api.data.amsterdam.nl/panorama/) açık verisi
- Yükseklik: [AHN](https://www.ahn.nl) (PDOK, açık veri); bina sınırları: [3D BAG](https://3dbag.nl), CC BY 4.0
- Yollar, su, arazi örtüsü: © [OpenStreetMap](https://www.openstreetmap.org/copyright) katkıcıları, [OpenFreeMap](https://openfreemap.org) üzerinden
- Tokyo binaları: [Project PLATEAU](https://www.mlit.go.jp/plateau/); diğer yerlerde yükseklik: GSI Japonya, Mapzen Terrarium
- Kullanıldığı yerde gönüllü panoramaları: [Panoramax](https://panoramax.fr) katkıcıları, CC BY-SA 4.0
- Street View: © Google; oyuncunun kendi anahtarıyla Map Tiles API üzerinden gösterilir
- Menü yazı tipi: [Jersey 15](https://fonts.google.com/specimen/Jersey+15), SIL Open Font License

Kod [MIT lisansı](LICENSE) altındadır.
