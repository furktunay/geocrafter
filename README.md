# Street Craft

Gerçek 360° sokak fotoğrafının içinde blok oyunu: fotoğraftan fotoğrafa ışınlanırsın, fotoğrafın
içine blok koyarsın, gerçek yolu ve binaları kırarsın ya da TNT ile havaya uçurursun; altından blok
dünyası çıkar.

Hayran yapımı bir projedir; Mojang ya da Microsoft ile bağı yoktur. Oyundaki bütün çizimler ve
sesler bu depoda üretilir, başka bir oyunun dosyası kullanılmaz.

## Çalıştırma

```bash
npm install
npm run dev
```

Sonra tarayıcıda `http://localhost:5173`. Başka bir yer için menüdeki konumlardan birini seç ya da
adres çubuğuna `?lat=52.37309&lon=4.89318` gibi koordinat ekle.

## Konumlar

Liste bilerek kısa: yalnızca verisi iyi olan yerler.

- **Amsterdam** (Dam, Prinsengracht, Brouwersgracht, Museumplein): belediyenin ölçüm aracıyla
  5 metrede bir çektiği 8000 piksellik panoramalar (`api.data.amsterdam.nl/panorama`), ülke çapındaki
  lazer taraması (AHN, 0,5 m) ve resmî bina kaydı (3D BAG). Fotoğrafın konumu ve yönü ölçüm
  sisteminden gelir; tahmin yok.
- **İstanbul** (Eminönü, Kadıköy İskelesi, Moda): bir gönüllünün yürüyerek çektiği 7680 piksellik
  panoramalar (Panoramax). Araç yok; konumlar GPS hassasiyetinde, geometri bina taban alanlarından.

Fotoğrafın içinde durduğun sürece görüntü her yerde kusursuzdur (fotoğrafı çekildiği noktadan
görüyorsun). Fark, blok koyarken ve geçişlerde çıkar: Amsterdam'da bloklar gerçek yüzeye tam oturur,
İstanbul'da biraz kayık durabilir.

## Kontroller

| Tuş | İş |
| --- | --- |
| `W` | Baktığın yöndeki oka (bir sonraki fotoğrafa) ışınlan; basılı tutunca devam eder |
| `A` `S` `D` | Soldaki, arkadaki, sağdaki fotoğrafa ışınlan |
| Oka ya da halkaya tıklama | Oraya ışınlan |
| Sol tık / sağ tık | Kır, vur / koy, kullan |
| 1–9, tekerlek | Alt bardan eşya seç |
| `E` | Envanter ve üretim |
| `F` | Serbest uçuş (fotoğraftan uzaklaştıkça görüntü bozulur) |
| `G` | En yakın fotoğrafa dön |
| `R` iki kez | Bu haritayı sıfırla: kırdığın ve koyduğun her şey geri alınır |
| `P` | Fotoğrafı aç/kapat (alttaki blok dünyası) |
| `C` | Elle hizalama: ← → yön, ↑ ↓ kamera yüksekliği, I J K L kaydır, Backspace sıfırla |
| `M`, `F3` | Büyük harita, hata ayıklama bilgisi |

Sol alttaki W A S D kutuları o yönde gidilecek fotoğraf varsa sarı yanar.

Tarayıcı imleci kilitleyemezse (gömülü önizlemeler) oyun sürükle-bak moduna geçer: sürükleyerek
bakarsın, tıkladığın yere koyup kırarsın, `Esc` menüye döner.

## Eşyalar

- **Kazma**: basılı tutunca hızlı kırar. **Kılıç**: yaprak ve cam keser, iskelete en çok o vurur.
- **Yay**: sağ tıkı basılı tutup bırakınca ok atar; bir saniyeye kadar gerdikçe ok hızlanır ve daha
  çok can götürür. Oklar yere ve duvarlara saplanır.
- **TNT + çakmak**: TNT'yi koy, çakmakla sağ tıkla; fitil 4 saniye yanar, sonra krater açılır.
  Yakındaysan can gider. Yan yana TNT'ler zincirleme patlar.
- **İskelet yumurtası**: sağ tıkla yere bırak, içinden bir iskelet okçu çıkar. Mesafesini korur ve
  seni görünce ok atar; fotoğrafın içindeyken kaçamadığın için isabeti bilerek düşük tutuldu.
  İki dolu yay atışı ya da üç kılıç darbesiyle dağılır.
- **Ekmek**: açlığı doldurur. Can, karın tokken kendiliğinden dolar.
- Kırdığın gerçek yüzeyin malzemesi (asfalt, parke, tuğla, pencere…) ilk seferde envantere eklenir.
- Üretim (envanterdeki 2×2 kare): kütük → tahta, kum + çakıl → TNT, 4 kum → cam, 4 taş → beton,
  çelik + çakıl → çakmak, 2 çelik + tahta → kılıç, 3 çelik + tahta → kazma.

Envanter, deneyim puanı ve yaptığın blok değişiklikleri tarayıcıda saklanır. Menüdeki "Bu haritayı
sıfırla" ve "Tüm haritaları sıfırla" düğmeleri değişiklikleri siler.

## Ses paketi

Sesler kodla üretilir; depoda ses dosyası yoktur. Kayıt kullanmak istersen dosyaları
`public/sounds/` klasörüne koyarsın, oyun bulduklarını üretilen seslerin yerine çalar.

Klasör düzeni ve dosya adları kaynak paketlerindeki `sounds` klasörüyle aynıdır
(`dig/stone1.ogg`, `step/grass3.ogg`, `random/explode1.ogg`, `random/fuse.ogg`, `fire/ignite.ogg`,
`damage/hit1.ogg`, `entity/player/attack/strong1.ogg` …). Öyle bir klasörün içindekileri
`public/sounds/` altına kopyalaman yeter; başka ayar gerekmez.

Oyun bu bilgisayarda kuruluysa elle kopyalamaya gerek yok: `npm run sounds`, `pack.json`'da adı
geçen dosyaları kendi kurulumundan bulup yerine koyar (hiçbir şey indirmez). Başka bir başlatıcı
kullanıyorsan assets klasörünün yolunu ver: `npm run sounds -- "/yol/assets"`.

Hangi sesin hangi dosyayı çaldığı `public/sounds/pack.json` içinde yazar, istediğin gibi
değiştirebilirsin:

```json
{ "gain": 1, "dig.grass": ["dig/grass1.ogg", "dig/grass2.ogg"], "boom": "patlama.ogg" }
```

Adlar: `dig`, `place`, `step` (üçü malzemeye göre de verilebilir: `dig.stone`, `dig.grass`,
`dig.gravel`, `dig.wood`, `dig.sand`, `dig.snow`, `dig.glass`), `swing`, `hit`, `flint`, `fuse`,
`boom`, `hurt`, `pick`, `pop`, `eat`, `level`, `bow`, `thud` (okun saplanması), `bones` ve `rattle`
(iskeletin darbe alması ve dağılması). Liste verirsen her seferinde biri rastgele çalınır; bulunamayan
dosyanın sesi üretilen haliyle kalır.

Klasörün tamamını kopyaladıysan `npm run sounds:prune` kullanılmayan dosyaları siler. Kopyaladığın
ses dosyaları `.gitignore` ile depo dışında tutulur. Yalnızca kullanma hakkın olan dosyaları koy ve
başkasının dosyalarını projeyle birlikte yayımlama.

## Doku paketi

Görseller de aynı mantıkla değiştirilebilir. Depodaki çizimlerin hepsi oyunun kendi çizimidir;
`public/textures/` klasörüne koyduğun görseller onların yerine geçer. Klasör düzeni ve dosya adları
kaynak paketlerindeki `textures` klasörüyle aynıdır:

```
public/textures/block/stone.png
public/textures/item/iron_sword.png
public/textures/gui/sprites/hud/hotbar.png
public/textures/gui/container/inventory.png
```

Kapsam: blok dokuları (kırdığın ve koyduğun bloklar, simgeler, eldeki blok), eşya simgeleri (kılıç,
kazma, çakmak, yay, iskelet yumurtası, ekmek), alt bar (bar, seçim çerçevesi, kalpler, açlık, deneyim)
ve envanter pencereleri. İskeletin kendisi, oklar ve karakterin kolu oyunun kendi çizimi olarak kalır.

Hangi dokunun hangi dosyadan geldiği `public/textures/pack.json` içinde yazar. Gerçek dünyadaki
malzemelerin birebir karşılığı olmadığı için (asfalt, kaldırım, kiremit…) en yakın doku seçildi;
istediğini değiştirebilirsin. Gri gelen dokular (çim, yaprak, su) `tint` rengiyle boyanır:

```json
{ "blocks": { "asphalt": "block/gray_concrete_powder.png", "grass_top": { "file": "block/grass_block_top.png", "tint": "#91bd59" } } }
```

- `npm run textures`: oyun bu bilgisayarda kuruluysa listedeki görselleri kendi kurulumundan kopyalar.
- `npm run textures:prune`: klasörün tamamını kopyaladıysan kullanılmayan dosyaları siler.

Bulunamayan dosyanın yerinde oyunun kendi çizimi kalır. Kopyaladığın görseller `.gitignore` ile depo
dışında tutulur; `npm run build` ise `public/` klasörünü çıktıya olduğu gibi kopyalar, yani derlemeyi
yayımlarsan oradaki dosyalar da yayımlanır. Yalnızca kullanma hakkın olan dosyaları koy.

## Nasıl çalışıyor

- Panorama, çekildiği noktadan dünyaya yansıtılır. Bir yüzey yalnızca o noktadan görünüyorsa
  (çekim noktasından çizilen mesafe haritasıyla sınanır) ve sen dokunmadıysan fotoğrafı taşır.
  Kırdığın yerin arkası ve koyduğun bloklar normal blok olarak kalır.
- Gezinme fotoğraftan fotoğrafadır: her fotoğraftan, her yönde en yakın komşuya bir ok çıkar.
  Arada duvar varsa ok çıkmaz (çekim sırasındaki ardışık kareler hariç: orada araç gerçekten geçmiş).
  Geçişte iki fotoğraf birbirine karışırken kamera yeni çekim noktasına kayar.
- Çekim aracı görünmez: Amsterdam'da aracın kapattığı zemin, bir önceki ve bir sonraki panoramanın
  aynı zemini gördüğü piksellerden yeniden kurulur. İstanbul'da (konumlar bunun için yeterince
  hassas değil) çekimi yapan kişinin olduğu alt bölge, çevresindeki zeminin renkleriyle yumuşakça
  doldurulur.
- Kamera yüksekliği veride yok, ölçülüyor: komşu iki panorama aynı kaldırım taşını görür; ikisi de
  zemine yansıtılıp karşılaştırılır, görüntülerin çakıştığı yükseklik gerçek yüksekliktir
  (Amsterdam'ın 2025 aracı için 2,24 m).
- Bloklar ölçülen yüzeyden kurulur; zemin bloklara yuvarlanmak yerine ölçülen yüksekliğine oturtulur.
- Blok dünyasında ağaç yoktur: yalnızca zemin, su, yollar ve binalar. Bloklar bir ağaç tacının
  biçimini tutturamadığı için fotoğraf üstlerine düzgün oturmuyordu; şimdi fotoğraftaki ağaç,
  arkasındaki yüzeyin üstünde durur. Lamba, tente, anıt gibi bina sayılmayan yüksek nesneler için
  de aynısı geçerli.

## Kaynak dosyalar

| Dosya | İçerik |
| --- | --- |
| `src/main.js` | Oyun döngüsü, girdi, menü, can/açlık/deneyim |
| `src/pano.js` | Panorama kaynakları, yükleme, geçişler ve oklar, mesafe haritası, aracı zeminden silme, kamera yüksekliği ölçümü |
| `src/ui.js`, `src/items.js` | Alt bar, envanter penceresi, harita; eşyalar, simgeler, üretim tarifleri |
| `src/textures.js`, `src/pack.js` | Oyunun kendi blok dokuları; isteğe bağlı doku paketi |
| `scripts/` | Ses ve doku klasörlerini kendi kurulumundan doldurma ve budama komutları |
| `src/hand.js`, `src/fx.js`, `src/mobs.js`, `src/sound.js` | Kol ve eldeki eşya; TNT, patlama, parçacıklar; iskelet okçular ve oklar; sesler ve ses paketi |
| `src/lidar.js` | AHN lazer taraması ve 3D BAG bina sınırları (Hollanda) |
| `src/skyline.js`, `src/align.js` | GPS'li görüntüler için gökyüzü çizgisiyle hizalama; zemin eşleştirme |
| `src/materials.js` | Blok ve fotoğraf yansıtma shader'ları |
| `src/world.js`, `src/mesher.js` | Chunk deposu, blok düzenleme, greedy mesher, zemini ölçülen yüksekliğe oturtma |
| `src/worker.js`, `src/generator.js`, `src/tiles.js` | Harita verisi → voxel dünya ve uzak silüet |

## Veri ve lisanslar

- Amsterdam panoramaları: Gemeente Amsterdam açık verisi (kullanım koşulları için veri portalına bak)
- AHN yükseklik verisi: Rijkswaterstaat / PDOK, açık veri
- Bina sınırları: [3D BAG](https://3dbag.nl), CC BY 4.0
- İstanbul sokak fotoğrafları: [Panoramax](https://panoramax.fr) katkıcıları, CC BY-SA 4.0
- Yollar, su, yeşil alan: © OpenStreetMap katkıcıları, [OpenFreeMap](https://openfreemap.org)
- Listede olmayan koordinatlar için: Mapillary (kendi token'ınla), [Project PLATEAU](https://www.mlit.go.jp/plateau/)
  (Tokyo binaları, [indigo-lab/plateau-lod2-mvt](https://github.com/indigo-lab/plateau-lod2-mvt), CC BY 4.0),
  GSI Japonya ve Mapzen Terrarium yükseklik verisi
