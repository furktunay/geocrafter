// Three languages. The game's own text is English and doubles as the key: tx('Play') looks the
// sentence up for the chosen language and falls back to the English. Keys with {0}, {1}… match
// sentences with something variable in them ('Crafted: Planks').

export const LANG_KEY = 'geocrafter:lang';
export const LANGS = { en: 'English', tr: 'Türkçe', es: 'Español' };

function pick() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS[saved]) return saved;
  } catch (e) {
    // a worker, or storage blocked
  }
  return 'en'; // English until the player picks another
}

export const lang = pick();
export const locale = { en: 'en-US', tr: 'tr-TR', es: 'es-ES' }[lang];

// english: [turkish, spanish]
const WORDS = {
  // ---- title screen
  'Play': ['Oyna', 'Jugar'],
  'Loading…': ['Yükleniyor…', 'Cargando…'],
  'Back to Game': ['Oyuna Dön', 'Volver al juego'],
  'Place: {0}': ['Konum: {0}', 'Lugar: {0}'],
  'Language: {0}': ['Dil: {0}', 'Idioma: {0}'],
  'Options…': ['Seçenekler…', 'Opciones…'],
  'Controls': ['Kontroller', 'Controles'],
  'Options': ['Seçenekler', 'Opciones'],
  'Choose a place': ['Konum seç', 'Elige un lugar'],
  'Back': ['Geri', 'Atrás'],
  'Save': ['Kaydet', 'Guardar'],
  'STREET EDITION': ['SOKAK SÜRÜMÜ', 'EDICIÓN CALLEJERA'],
  'Getting ready…': ['Hazırlanıyor…', 'Preparando…'],
  'Custom place': ['Özel konum', 'Lugar propio'],
  'My place': ['Konumum', 'Mi lugar'],
  'Add your own place': ['Kendi konumunu ekle', 'Añade tu propio lugar'],
  'Add': ['Ekle', 'Añadir'],
  'Name (optional)': ['Ad (isteğe bağlı)', 'Nombre (opcional)'],
  'Latitude, longitude, or a Google Maps link': ['Enlem, boylam ya da bir Google Maps bağlantısı', 'Latitud, longitud o un enlace de Google Maps'],
  'Your own places open with Google Street View. Connect it in Options.': ['Kendi konumların Google Street View ile açılır. Seçenekler\'den bağla.', 'Tus propios lugares se abren con Google Street View. Conéctalo en Opciones.'],
  'Remove this place': ['Bu konumu kaldır', 'Quitar este lugar'],
  'No street photos here': ['Burada sokak fotoğrafı yok', 'Aquí no hay fotos de calle'],
  'There are no 360° street photos at this spot.': ['Bu noktada 360° sokak fotoğrafı yok.', 'No hay fotos de calle en 360° en este punto.'],
  'Google gave no photos: {0}.': ['Google fotoğraf vermedi: {0}.', 'Google no dio fotos: {0}.'],
  'Choose another place.': ['Başka bir konum seç.', 'Elige otro lugar.'],
  'Google tile cap reached: no more photos can be loaded here (see Options)': ['Google karo sınırına ulaşıldı: burada daha fazla fotoğraf yüklenemez (Seçenekler\'e bak)', 'Límite de teselas de Google alcanzado: aquí no se pueden cargar más fotos (mira Opciones)'],
  'Format: 52.3731, 4.8932': ['Biçim: 52.3731, 4.8932', 'Formato: 52.3731, 4.8932'],
  'Playing with free street photos': ['Ücretsiz sokak fotoğraflarıyla oynuyorsun', 'Juegas con fotos de calle gratuitas'],
  'Google Street View shows almost every street on Earth, in sharper photos': [
    'Google Street View dünyanın neredeyse her sokağını daha keskin fotoğraflarla gösterir',
    'Google Street View muestra casi cualquier calle del mundo, con fotos más nítidas',
  ],
  'Connect the Google Street View API': ['Google Street View API\'sini bağla', 'Conectar la API de Google Street View'],
  'Google Street View is on': ['Google Street View açık', 'Google Street View activado'],
  'On real streets!': ['Gerçek sokaklarda!', '¡En calles reales!'],
  'Break the asphalt too!': ['Asfaltı da kır!', '¡Rompe también el asfalto!'],
  'From photo to photo!': ['Fotoğraftan fotoğrafa!', '¡De foto en foto!'],
  'Mind the TNT!': ['TNT\'ye dikkat!', '¡Cuidado con la TNT!'],
  'There is stone under it!': ['Altından taş çıkar!', '¡Debajo hay piedra!'],
  'You died!': ['Öldün!', '¡Has muerto!'],
  'Respawn': ['Yeniden doğ', 'Reaparecer'],
  '{0}: downloading map data…': ['{0}: harita verisi indiriliyor…', '{0}: descargando el mapa…'],
  'Fetching elevation data…': ['Yükseklik verisi alınıyor…', 'Obteniendo la elevación…'],
  'Looking for 360° street photos…': ['360° sokak fotoğrafı aranıyor…', 'Buscando fotos de calle en 360°…'],
  '{0} is ready.': ['{0} hazır.', '{0} está listo.'],

  // ---- controls
  '<kbd>W</kbd> step to the arrow you face · <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> left, back, right': [
    '<kbd>W</kbd> baktığın oka adım at · <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> sol, geri, sağ',
    '<kbd>W</kbd> avanza hacia la flecha que miras · <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> izquierda, atrás, derecha',
  ],
  '<kbd>Left click</kbd> break / hit · <kbd>Right click</kbd> place / use': [
    '<kbd>Sol tık</kbd> kır / vur · <kbd>Sağ tık</kbd> koy / kullan',
    '<kbd>Clic izquierdo</kbd> romper / golpear · <kbd>Clic derecho</kbd> colocar / usar',
  ],
  '<kbd>1</kbd>–<kbd>9</kbd>, wheel: pick an item · <kbd>E</kbd> inventory and crafting': [
    '<kbd>1</kbd>–<kbd>9</kbd>, tekerlek: eşya seç · <kbd>E</kbd> envanter ve üretim',
    '<kbd>1</kbd>–<kbd>9</kbd>, rueda: elegir objeto · <kbd>E</kbd> inventario y fabricación',
  ],
  'Place TNT, <kbd>right click</kbd> it with flint and steel: the fuse burns, 4 seconds later it goes off': [
    'TNT koy, çakmakla <kbd>sağ tık</kbd>la: fitil yanar, 4 saniye sonra patlar',
    'Coloca TNT y hazle <kbd>clic derecho</kbd> con el mechero: la mecha arde y estalla a los 4 segundos',
  ],
  'Bow: hold <kbd>right click</kbd>, let go to shoot · eggs: <kbd>right click</kbd> to set a creature down · bread: eat': [
    'Yay: <kbd>sağ tık</kbd> basılı tut, bırakınca atar · yumurtalar: <kbd>sağ tık</kbd> ile yaratık bırak · ekmek: ye',
    'Arco: mantén <kbd>clic derecho</kbd> y suelta para disparar · huevos: <kbd>clic derecho</kbd> para soltar una criatura · pan: comer',
  ],
  '<kbd>Space</kbd> jump · in the Nether: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk, <kbd>G</kbd> back up to the street': [
    '<kbd>Boşluk</kbd> zıpla · Nether\'da: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> yürü, <kbd>G</kbd> sokağa geri dön',
    '<kbd>Espacio</kbd> saltar · en el Nether: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> caminar, <kbd>G</kbd> volver a la calle',
  ],
  'Portal: put the portal egg down with <kbd>right click</kbd> (or build an upright obsidian frame, 2×3 inside, and light it with flint and steel), then <kbd>right click</kbd> the portal and wait 4 seconds → Nether': [
    'Portal: portal yumurtasını <kbd>sağ tık</kbd>la bırak (ya da içi 2×3 dik bir obsidyen çerçeve kurup çakmakla yak), sonra portala <kbd>sağ tık</kbd>la ve 4 saniye bekle → Nether',
    'Portal: suelta el huevo de portal con <kbd>clic derecho</kbd> (o construye un marco vertical de obsidiana, 2×3 por dentro, y enciéndelo con el mechero), luego haz <kbd>clic derecho</kbd> en el portal y espera 4 segundos → Nether',
  ],
  'Chest: <kbd>right click</kbd> to open · Bed: <kbd>right click</kbd> to try to sleep (it explodes)': [
    'Sandık: <kbd>sağ tık</kbd> ile aç · Yatak: <kbd>sağ tık</kbd> ile uyumayı dene (patlar)',
    'Cofre: <kbd>clic derecho</kbd> para abrir · Cama: <kbd>clic derecho</kbd> para intentar dormir (explota)',
  ],
  'Cars: look at the road under the side of a car that faces you, <kbd>V</kbd>: the car turns solid and breaks when hit · <kbd>V</kbd> on it again: undo · <kbd>Shift</kbd>: crosswise': [
    'Arabalar: arabanın sana bakan yanının altındaki yola bak, <kbd>V</kbd>: araba katılaşır ve vurunca kırılır · üstünde tekrar <kbd>V</kbd>: geri al · <kbd>Shift</kbd>: enine',
    'Coches: mira la calzada bajo el lado del coche que da hacia ti, <kbd>V</kbd>: el coche se vuelve sólido y se rompe al golpearlo · <kbd>V</kbd> otra vez: deshacer · <kbd>Shift</kbd>: atravesado',
  ],
  '<kbd>R</kbd> twice: reset this map · <kbd>P</kbd> photo on/off · <kbd>M</kbd> map · <kbd>F3</kbd> info': [
    '<kbd>R</kbd> iki kez: bu haritayı sıfırla · <kbd>P</kbd> fotoğraf aç/kapat · <kbd>M</kbd> harita · <kbd>F3</kbd> bilgi',
    '<kbd>R</kbd> dos veces: reiniciar este mapa · <kbd>P</kbd> foto sí/no · <kbd>M</kbd> mapa · <kbd>F3</kbd> información',
  ],

  // ---- options
  'Reset this map': ['Bu haritayı sıfırla', 'Reiniciar este mapa'],
  'Reset all maps': ['Tüm haritaları sıfırla', 'Reiniciar todos los mapas'],
  'Sure? Click again': ['Emin misin? Tekrar tıkla', '¿Seguro? Pulsa otra vez'],
  'Block changes on this map: {0}': ['Bu haritadaki blok değişikliği: {0}', 'Cambios de bloques en este mapa: {0}'],
  'No changes on this map': ['Bu haritada değişiklik yok', 'Sin cambios en este mapa'],
  '{0} on other maps ({1})': ['diğer haritalarda {0} ({1} harita)', '{0} en otros mapas ({1})'],
  'In the game, R resets this map.': ['Oyunda R bu haritayı sıfırlar.', 'En el juego, R reinicia este mapa.'],
  'Movement speed': ['Hareket hızı', 'Velocidad de movimiento'],
  'Align the blocks with the streets': ['Blokları sokaklarla hizala', 'Alinear los bloques con las calles'],
  'Here the grid is turned {0}° to the right.': ['Burada ızgara {0}° sağa dönük.', 'Aquí la cuadrícula está girada {0}° a la derecha.'],
  'Here the grid is turned {0}° to the left.': ['Burada ızgara {0}° sola dönük.', 'Aquí la cuadrícula está girada {0}° a la izquierda.'],
  'Here the streets already run north-south, or share no direction.': ['Burada sokaklar zaten kuzey-güney uzanıyor ya da ortak bir yönleri yok.', 'Aquí las calles ya van de norte a sur, o no comparten dirección.'],
  'The grid faces north.': ['Izgara kuzeye bakıyor.', 'La cuadrícula mira al norte.'],
  'Google Street View (optional, sharper photos)': ['Google Street View (isteğe bağlı, daha keskin fotoğraflar)', 'Google Street View (opcional, fotos más nítidas)'],
  'Use Google Street View': ['Google Street View kullan', 'Usar Google Street View'],
  'The game starts with free street photos. With your own Google Maps key (Map Tiles API enabled) almost every street on Earth opens up, in much sharper photos.': [
    'Oyun ücretsiz sokak fotoğraflarıyla başlar. Kendi Google Maps anahtarınla (Map Tiles API açık) dünyanın neredeyse her sokağı, çok daha keskin fotoğraflarla açılır.',
    'El juego empieza con fotos de calle gratuitas. Con tu propia clave de Google Maps (Map Tiles API activada) se abre casi cualquier calle del mundo, con fotos mucho más nítidas.',
  ],
  'Google Maps API key': ['Google Maps API anahtarı', 'Clave de la API de Google Maps'],
  'No key. It takes a Google Cloud key with the "Map Tiles API" enabled.': ['Anahtar yok. Google Cloud\'da "Map Tiles API" açık bir anahtar gerekir.', 'Sin clave. Hace falta una clave de Google Cloud con la "Map Tiles API" activada.'],
  'A key is saved, but Google Street View is switched off: the free photos are used.': ['Anahtar kayıtlı ama Google Street View kapalı: ücretsiz fotoğraflar kullanılıyor.', 'Hay una clave guardada, pero Google Street View está apagado: se usan las fotos gratuitas.'],
  'Trying the key…': ['Anahtar deneniyor…', 'Probando la clave…'],
  'Google Street View connected — save it empty to remove the key from this browser.': ['Google Street View bağlı — boş kaydedersen anahtar bu tarayıcıdan silinir.', 'Google Street View conectado: guarda el campo vacío para quitar la clave de este navegador.'],
  'Google is not working: {0}. The other sources are used.': ['Google çalışmıyor: {0}. Diğer kaynaklar kullanılıyor.', 'Google no funciona: {0}. Se usan las otras fuentes.'],
  'Google is not working: {0}.': ['Google çalışmıyor: {0}.', 'Google no funciona: {0}.'],
  'Google Street View is not working': ['Google Street View çalışmıyor', 'Google Street View no funciona'],
  'See Options for the reason': ['Sebebi için Seçenekler\'e bak', 'Mira el motivo en Opciones'],
  'Google is giving no photos right now: {0}. The other sources are used.': ['Google şu an fotoğraf vermiyor: {0}. Diğer kaynaklar kullanılıyor.', 'Google no da fotos ahora mismo: {0}. Se usan las otras fuentes.'],
  'This month {0} / {1} tiles · today {2} / {3}': ['Bu ay {0} / {1} karo · bugün {2} / {3}', 'Este mes {0} / {1} teselas · hoy {2} / {3}'],
  'paid for so far {0} / {1}': ['şimdiye dek ödenen {0} / {1}', 'pagadas hasta ahora {0} / {1}'],
  'cap reached: the free photo sources are used': ['sınıra ulaşıldı: ücretsiz fotoğraf kaynakları kullanılıyor', 'límite alcanzado: se usan las fuentes gratuitas'],
  'the paid tiles are used up: only the free ones from here on': ['ödenecek karolar bitti: bundan sonra yalnızca ücretsiz olanlar', 'las teselas de pago se acabaron: desde ahora solo las gratuitas'],
  'Tiles to pay for, in all (now {0})': ['Ödenecek toplam karo (şu an {0})', 'Teselas de pago, en total (ahora {0})'],
  'Tiles to pay for, in all (now none)': ['Ödenecek toplam karo (şu an yok)', 'Teselas de pago, en total (ahora ninguna)'],
  'Google gives the first 100,000 Street View tiles a month for free, then charges $2 per 1,000. Without a number above the game stops at 90,000 a month and goes on with the free photo sources. With one, it uses Google until that many tiles past the free ones have been paid for, all told, and after that only the free ones each month. A photo costs 32 tiles while walking, 64 more to sharpen when you stop, and 32 more for each neighbouring photo not yet loaded that is needed to mend the ground under the camera car. The counter only sees requests made from this browser; the exact figure is in the Google Cloud Console.': [
    'Google ayda ilk 100.000 Street View karosunu ücretsiz verir, sonrası 1.000 karo başına 2 dolar. Yukarıya sayı yazmazsan oyun ayda 90.000\'de durur ve ücretsiz fotoğraf kaynaklarıyla devam eder. Sayı yazarsan, ücretsizlerin üstüne toplamda o kadar karo ödenene dek Google\'ı kullanır, sonra her ay yalnızca ücretsiz olanları. Bir fotoğraf yürürken 32 karo, durunca keskinleşmek için 64 karo daha, kamera arabasının altındaki zemini onarmak için gereken ve henüz yüklenmemiş her komşu fotoğraf için 32 karo daha tutar. Sayaç yalnızca bu tarayıcıdan yapılan istekleri görür; kesin rakam Google Cloud Console\'dadır.',
    'Google regala las primeras 100.000 teselas de Street View al mes y después cobra 2 $ por cada 1.000. Sin un número arriba, el juego se detiene en 90.000 al mes y sigue con las fuentes gratuitas. Con un número, usa Google hasta haber pagado en total esa cantidad de teselas por encima de las gratuitas, y después solo las gratuitas de cada mes. Una foto cuesta 32 teselas al caminar, 64 más para afinarla al parar y 32 más por cada foto vecina aún no cargada que haga falta para reparar el suelo bajo el coche de la cámara. El contador solo ve las peticiones hechas desde este navegador; la cifra exacta está en Google Cloud Console.',
  ],
  'Report a problem with this photo': ['Bu fotoğrafla ilgili sorun bildir', 'Informar de un problema con esta foto'],

  // ---- places
  'Amsterdam · stadium forecourt, wide square': ['Amsterdam · stadyum önü, geniş meydan', 'Ámsterdam · explanada del estadio, plaza amplia'],
  'Amsterdam · the Waag, cobbled square': ['Amsterdam · Waag, taş meydan', 'Ámsterdam · el Waag, plaza adoquinada'],
  'Amsterdam · canals of the Jordaan': ['Amsterdam · Jordaan kanalları', 'Ámsterdam · canales del Jordaan'],
  'Istanbul · New Mosque square': ['İstanbul · Yeni Cami meydanı', 'Estambul · plaza de la Mezquita Nueva'],
  'Istanbul · square and ferry pier': ['İstanbul · meydan ve iskele', 'Estambul · plaza y muelle del ferri'],
  'Istanbul · streets of Kadıköy': ['İstanbul · Kadıköy sokakları', 'Estambul · calles de Kadıköy'],
  'Kadıköy Pier': ['Kadıköy İskelesi', 'Muelle de Kadıköy'],
  'Paris · paved square, one façade all round': ['Paris · taş meydan, çepeçevre tek cephe', 'París · plaza empedrada, una sola fachada alrededor'],
  'Manhattan · Fifth Avenue': ['Manhattan · Beşinci Cadde', 'Manhattan · Quinta Avenida'],
  'New York · Broadway and Seventh Avenue': ['New York · Broadway ve Yedinci Cadde', 'Nueva York · Broadway y la Séptima Avenida'],
  'Las Vegas · the wide boulevard of the casinos': ['Las Vegas · kumarhanelerin geniş bulvarı', 'Las Vegas · el ancho bulevar de los casinos'],
  'Rotterdam · city boulevard, laser-scanned ground': ['Rotterdam · şehir bulvarı, lazerle taranmış zemin', 'Róterdam · bulevar urbano, suelo escaneado por láser'],
  'Barcelona · the grid of the Eixample': ['Barselona · Eixample ızgarası', 'Barcelona · la cuadrícula del Eixample'],
  'Tokyo · by the station and the scramble crossing': ['Tokyo · istasyonun ve dev yaya geçidinin yanı', 'Tokio · junto a la estación y el cruce peatonal'],
  'Dizengoff Square · the round plaza and its fountain': ['Dizengoff Meydanı · yuvarlak meydan ve fıskiyesi', 'Plaza Dizengoff · la plaza redonda y su fuente'],
  'Needs Google Street View': ['Google Street View gerekir', 'Requiere Google Street View'],
  'Brandenburg Gate': ['Brandenburg Kapısı', 'Puerta de Brandeburgo'],
  'Colosseum': ['Kolezyum', 'Coliseo'],

  // ---- in the game
  'Error: {0}': ['Hata: {0}', 'Error: {0}'],
  'Crafted: {0}': ['Üretildi: {0}', 'Fabricado: {0}'],
  'Added to inventory: {0}': ['Envantere eklendi: {0}', 'Añadido al inventario: {0}'],
  'Google tile cap reached: from here on the free photo sources are used (see Options)': ['Google karo sınırına ulaşıldı: bundan sonra ücretsiz fotoğraf kaynakları kullanılır (Seçenekler\'e bak)', 'Límite de teselas de Google alcanzado: desde ahora se usan las fuentes gratuitas (mira Opciones)'],
  'Press R again to reset this map': ['Bu haritayı sıfırlamak için tekrar R\'ye bas', 'Pulsa R otra vez para reiniciar este mapa'],
  'Nothing to reset on this map': ['Bu haritada sıfırlanacak bir şey yok', 'No hay nada que reiniciar en este mapa'],
  'Map reset ({0} block put back)': ['Harita sıfırlandı ({0} blok geri kondu)', 'Mapa reiniciado ({0} bloque repuesto)'],
  'Map reset ({0} blocks put back)': ['Harita sıfırlandı ({0} blok geri kondu)', 'Mapa reiniciado ({0} bloques repuestos)'],
  'Could not lock the pointer: drag to look, click to break/place, Esc for the menu': ['İmleç kilitlenemedi: sürükleyerek bak, tıklayarak kır/koy, menü için Esc', 'No se pudo fijar el puntero: arrastra para mirar, haz clic para romper/colocar, Esc para el menú'],
  'No way on in this direction — see the arrows on the ground': ['Bu yönde yol yok — yerdeki oklara bak', 'No hay paso en esta dirección: mira las flechas del suelo'],
  'No 360° street photo nearby': ['Yakında 360° sokak fotoğrafı yok', 'No hay fotos de calle en 360° cerca'],
  'Photo on': ['Fotoğraf açık', 'Foto activada'],
  'Photo off: the block world underneath': ['Fotoğraf kapalı: alttaki blok dünyası', 'Foto desactivada: el mundo de bloques de debajo'],
  'Alignment: ← → heading · ↑ ↓ camera height · I J K L shift · Backspace reset': ['Hizalama: ← → yön · ↑ ↓ kamera yüksekliği · I J K L kaydır · Backspace sıfırla', 'Alineación: ← → rumbo · ↑ ↓ altura de cámara · I J K L desplazar · Retroceso reiniciar'],
  'Alignment off': ['Hizalama kapalı', 'Alineación desactivada'],
  'Block detail distance: {0} m': ['Blok ayrıntı mesafesi: {0} m', 'Distancia de detalle de bloques: {0} m'],
  'Portal lit · right-click it, or step in and wait': ['Portal yandı · sağ tıkla ya da içine girip bekle', 'Portal encendido · hazle clic derecho, o entra y espera'],
  'Portal lit · right-click it to go through': ['Portal yandı · geçmek için sağ tıkla', 'Portal encendido · hazle clic derecho para cruzar'],
  'No room for a portal here': ['Burada portala yer yok', 'Aquí no cabe un portal'],
  'A portal needs an upright obsidian frame: at least 2 blocks wide and 3 high inside': ['Portal için dik bir obsidyen çerçeve gerekir: içi en az 2 blok geniş, 3 blok yüksek', 'Un portal necesita un marco vertical de obsidiana: al menos 2 bloques de ancho y 3 de alto por dentro'],
  'Nether · W A S D walk, Space jump · portal or G: go back': ['Nether · W A S D yürü, Boşluk zıpla · portal ya da G: geri dön', 'Nether · W A S D caminar, Espacio saltar · portal o G: volver'],
  'There is no room for the Nether under this place': ['Bu yerin altında Nether için yer yok', 'No hay sitio para el Nether bajo este lugar'],
  'Car body removed ({0} block)': ['Araba gövdesi kaldırıldı ({0} blok)', 'Carrocería retirada ({0} bloque)'],
  'Car body removed ({0} blocks)': ['Araba gövdesi kaldırıldı ({0} blok)', 'Carrocería retirada ({0} bloques)'],
  'Aim at the road under the side of the car that faces you': ['Arabanın sana bakan yanının altındaki yola nişan al', 'Apunta a la calzada bajo el lado del coche que da hacia ti'],
  'No room here': ['Burada yer yok', 'Aquí no hay sitio'],
  'No room here (or too many creatures)': ['Burada yer yok (ya da çok fazla yaratık var)', 'Aquí no hay sitio (o hay demasiadas criaturas)'],
  'Car body placed: a hit now breaks the car · wrong? point at it and press again · Shift: crosswise': ['Araba gövdesi kondu: artık vurunca araba kırılır · yanlış mı? üstüne bakıp tekrar bas · Shift: enine', 'Carrocería colocada: ahora un golpe rompe el coche · ¿mal? apúntale y pulsa otra vez · Shift: atravesado'],
  'You can\'t sleep here…': ['Burada uyuyamazsın…', 'Aquí no puedes dormir…'],
  'Obsidian only breaks with a pickaxe': ['Obsidyen yalnızca kazmayla kırılır', 'La obsidiana solo se rompe con un pico'],
  'You are not hungry': ['Karnın tok', 'No tienes hambre'],
  'No 360° street photos around here': ['Bu çevrede 360° sokak fotoğrafı yok', 'No hay fotos de calle en 360° por aquí'],
  'Photo: {0} · {1} · {2}': ['Fotoğraf: {0} · {1} · {2}', 'Foto: {0} · {1} · {2}'],
  'anonymous': ['anonim', 'anónimo'],
  'open data': ['açık veri', 'datos abiertos'],
  'Nether ({0}) · portal or G: go back': ['Nether ({0}) · portal ya da G: geri dön', 'Nether ({0}) · portal o G: volver'],
  'Off the photos · G: back to the nearest one': ['Fotoğrafların dışındasın · G: en yakınına dön', 'Fuera de las fotos · G: volver a la más cercana'],
  'nether wastes': ['nether çorağı', 'yermos del Nether'],
  'crimson forest': ['kızıl orman', 'bosque carmesí'],
  'warped forest': ['çarpık orman', 'bosque distorsionado'],
  'soul sand valley': ['ruh kumu vadisi', 'valle de arena de almas'],
  'basalt deltas': ['bazalt deltaları', 'deltas de basalto'],
  'Loading the next photo…': ['Sonraki fotoğraf yükleniyor…', 'Cargando la siguiente foto…'],
  'W A S D: step along the arrows · Space: jump': ['W A S D: oklar boyunca adım at · Boşluk: zıpla', 'W A S D: avanza por las flechas · Espacio: saltar'],
  'No 360° street photos around here — block world': ['Bu çevrede 360° sokak fotoğrafı yok — blok dünyası', 'No hay fotos de calle en 360° por aquí: mundo de bloques'],
  'Loading the map… ({0})': ['Harita yükleniyor… ({0})', 'Cargando el mapa… ({0})'],

  'All items': ['Tüm eşyalar', 'Todos los objetos'],
  'Building blocks': ['Yapı blokları', 'Bloques de construcción'],
  'Natural blocks': ['Doğal bloklar', 'Bloques naturales'],
  'Streets': ['Sokak', 'Calles'],
  'Coloured blocks': ['Renkli bloklar', 'Bloques de colores'],
  'Useful blocks': ['İşlevsel bloklar', 'Bloques funcionales'],
  'Tools and combat': ['Aletler ve savaş', 'Herramientas y combate'],
  'Spawn eggs': ['Çağırma yumurtaları', 'Huevos generadores'],
  'Crafting': ['Üretim', 'Fabricación'],
  'Log → planks · sand + gravel → TNT · steel + gravel → flint and steel': ['Kütük → tahta · kum + çakıl → TNT · çelik + çakıl → çakmak', 'Tronco → tablones · arena + grava → TNT · acero + grava → mechero'],

  // ---- things
  'Pickaxe': ['Kazma', 'Pico'], 'Sword': ['Kılıç', 'Espada'], 'Flint and steel': ['Çakmak', 'Mechero'], 'Bread': ['Ekmek', 'Pan'],
  'Skeleton egg': ['İskelet yumurtası', 'Huevo de esqueleto'], 'Bow': ['Yay', 'Arco'], 'Diamond': ['Elmas', 'Diamante'],
  'Creeper egg': ['Creeper yumurtası', 'Huevo de creeper'], 'Zombie egg': ['Zombi yumurtası', 'Huevo de zombi'],
  'Zombified piglin egg': ['Zombileşmiş piglin yumurtası', 'Huevo de piglin zombificado'], 'Car body (4×2×2)': ['Araba gövdesi (4×2×2)', 'Carrocería (4×2×2)'],
  'Portal egg': ['Portal yumurtası', 'Huevo de portal'],
  'Air': ['Hava', 'Aire'], 'Stone': ['Taş', 'Piedra'], 'Dirt': ['Toprak', 'Tierra'], 'Grass': ['Çim', 'Hierba'], 'Sand': ['Kum', 'Arena'],
  'Gravel': ['Çakıl', 'Grava'], 'Water': ['Su', 'Agua'], 'Asphalt': ['Asfalt', 'Asfalto'], 'Road marking': ['Yol çizgisi', 'Marca vial'],
  'Pavement': ['Kaldırım', 'Acera'], 'Paving bricks': ['Parke taşı', 'Adoquines'], 'Concrete': ['Beton', 'Hormigón'],
  'Dark concrete': ['Koyu beton', 'Hormigón oscuro'], 'White tile': ['Beyaz karo', 'Baldosa blanca'], 'Bricks': ['Tuğla', 'Ladrillos'],
  'Beige tile': ['Bej karo', 'Baldosa beis'], 'Steel': ['Çelik', 'Acero'], 'Glass': ['Cam', 'Cristal'], 'Tinted glass': ['Füme cam', 'Cristal tintado'],
  'Roof concrete': ['Çatı betonu', 'Hormigón de azotea'], 'Kawara roof tile': ['Kawara kiremit', 'Teja kawara'], 'Blue roof tile': ['Mavi kiremit', 'Teja azul'],
  'Brown roof tile': ['Kahverengi kiremit', 'Teja marrón'], 'Plaster': ['Sıva', 'Yeso'], 'Planks': ['Tahta', 'Tablones'], 'Log': ['Kütük', 'Tronco'],
  'Leaves': ['Yaprak', 'Hojas'], 'Sakura': ['Sakura', 'Sakura'], 'Floor tile': ['Zemin karosu', 'Baldosa de suelo'], 'Rail': ['Ray', 'Raíl'],
  'Bedrock': ['Katman kayası', 'Piedra base'], 'Farmland': ['Tarla', 'Tierra de cultivo'], 'Turf': ['Saha çimi', 'Césped'],
  'Blue panel': ['Mavi panel', 'Panel azul'], 'Brown tile': ['Kahve karo', 'Baldosa marrón'], 'Torii red': ['Torii kırmızısı', 'Rojo torii'],
  'Lamp': ['Lamba', 'Lámpara'], 'Copper roof': ['Bakır çatı', 'Tejado de cobre'], 'Snow': ['Kar', 'Nieve'], 'Viaduct': ['Viyadük', 'Viaducto'],
  'Viaduct marking': ['Viyadük çizgisi', 'Marca de viaducto'], 'Rail viaduct': ['Demiryolu viyadüğü', 'Viaducto ferroviario'],
  'Viaduct track': ['Viyadük rayı', 'Vía de viaducto'], 'Window': ['Pencere', 'Ventana'], 'Tinted window': ['Füme pencere', 'Ventana tintada'],
  'Tree crown': ['Ağaç tacı', 'Copa de árbol'], 'Obsidian': ['Obsidyen', 'Obsidiana'], 'Diamond ore': ['Elmas cevheri', 'Mena de diamante'],
  'Block of diamond': ['Elmas bloğu', 'Bloque de diamante'], 'Netherrack': ['Nether kayası', 'Netherrack'], 'Soul sand': ['Ruh kumu', 'Arena de almas'],
  'Glowstone': ['Parıltı taşı', 'Piedra luminosa'], 'Nether bricks': ['Nether tuğlası', 'Ladrillos del Nether'], 'Lava': ['Lav', 'Lava'],
  'Nether portal': ['Nether portalı', 'Portal del Nether'], 'Chest': ['Sandık', 'Cofre'], 'Bed': ['Yatak', 'Cama'], 'Photo fill': ['Fotoğraf dolgusu', 'Relleno de foto'],
  'Magma block': ['Magma bloğu', 'Bloque de magma'], 'Nether quartz ore': ['Nether kuvars cevheri', 'Mena de cuarzo del Nether'],
  'Nether gold ore': ['Nether altın cevheri', 'Mena de oro del Nether'], 'Basalt': ['Bazalt', 'Basalto'], 'Blackstone': ['Kara taş', 'Piedra negra'],
  'Soul soil': ['Ruh toprağı', 'Tierra de almas'], 'Crimson nylium': ['Kızıl nylium', 'Nylium carmesí'], 'Warped nylium': ['Çarpık nylium', 'Nylium distorsionado'],
  'Crimson stem': ['Kızıl gövde', 'Tallo carmesí'], 'Warped stem': ['Çarpık gövde', 'Tallo distorsionado'], 'Nether wart block': ['Nether siğili bloğu', 'Bloque de verrugas del Nether'],
  'Warped wart block': ['Çarpık siğil bloğu', 'Bloque de verrugas distorsionado'], 'Shroomlight': ['Mantar ışığı', 'Champiluz'],
  'Cobblestone': ['Kırıktaş', 'Roca'], 'Mossy cobblestone': ['Yosunlu kırıktaş', 'Roca musgosa'], 'Stone bricks': ['Taş tuğla', 'Ladrillos de piedra'],
  'Mossy stone bricks': ['Yosunlu taş tuğla', 'Ladrillos de piedra musgosos'], 'Smooth stone': ['Düz taş', 'Piedra lisa'], 'Andesite': ['Andezit', 'Andesita'],
  'Diorite': ['Diyorit', 'Diorita'], 'Granite': ['Granit', 'Granito'], 'Deepslate': ['Derin kayrak', 'Pizarra profunda'], 'Sandstone': ['Kumtaşı', 'Arenisca'],
  'Clay': ['Kil', 'Arcilla'], 'Ice': ['Buz', 'Hielo'], 'Spruce planks': ['Ladin tahtası', 'Tablones de abeto'], 'Birch planks': ['Huş tahtası', 'Tablones de abedul'],
  'Dark oak planks': ['Koyu meşe tahtası', 'Tablones de roble oscuro'], 'Bookshelf': ['Kitaplık', 'Librería'], 'Crafting table': ['Çalışma masası', 'Mesa de trabajo'],
  'Pumpkin': ['Balkabağı', 'Calabaza'], 'Melon': ['Karpuz', 'Sandía'], 'Hay bale': ['Saman balyası', 'Fardo de heno'], 'Block of gold': ['Altın bloğu', 'Bloque de oro'],
  'Block of emerald': ['Zümrüt bloğu', 'Bloque de esmeralda'], 'Block of lapis lazuli': ['Lapis lazuli bloğu', 'Bloque de lapislázuli'],
  'Block of redstone': ['Kızıltaş bloğu', 'Bloque de redstone'], 'Block of coal': ['Kömür bloğu', 'Bloque de carbón'], 'Block of quartz': ['Kuvars bloğu', 'Bloque de cuarzo'],
  'Coal ore': ['Kömür cevheri', 'Mena de carbón'], 'Iron ore': ['Demir cevheri', 'Mena de hierro'], 'Gold ore': ['Altın cevheri', 'Mena de oro'],
  'Emerald ore': ['Zümrüt cevheri', 'Mena de esmeralda'], 'Redstone ore': ['Kızıltaş cevheri', 'Mena de redstone'], 'Lapis lazuli ore': ['Lapis lazuli cevheri', 'Mena de lapislázuli'],
  'Terracotta': ['Terakota', 'Terracota'], 'Sea lantern': ['Deniz feneri', 'Linterna marina'], 'Furnace': ['Ocak', 'Horno'],
  'Oak slab': ['Meşe yarım blok', 'Losa de roble'], 'Oak stairs': ['Meşe basamak', 'Escaleras de roble'],
  'Cobblestone slab': ['Kırıktaş yarım blok', 'Losa de roca'], 'Cobblestone stairs': ['Kırıktaş basamak', 'Escaleras de roca'],
  'Stone brick slab': ['Taş tuğla yarım blok', 'Losa de ladrillos de piedra'], 'Stone brick stairs': ['Taş tuğla basamak', 'Escaleras de ladrillos de piedra'],
  'Brick slab': ['Tuğla yarım blok', 'Losa de ladrillos'], 'Brick stairs': ['Tuğla basamak', 'Escaleras de ladrillos'],
  'Sandstone slab': ['Kumtaşı yarım blok', 'Losa de arenisca'], 'Sandstone stairs': ['Kumtaşı basamak', 'Escaleras de arenisca'],
  'Quartz slab': ['Kuvars yarım blok', 'Losa de cuarzo'], 'Quartz stairs': ['Kuvars basamak', 'Escaleras de cuarzo'],
  'Oak door': ['Meşe kapı', 'Puerta de roble'], 'Iron door': ['Demir kapı', 'Puerta de hierro'], 'Oak trapdoor': ['Meşe kapak', 'Trampilla de roble'],
  'Oak fence': ['Meşe çit', 'Valla de roble'], 'Glass pane': ['Cam levha', 'Panel de cristal'], 'Iron bars': ['Demir parmaklık', 'Barrotes de hierro'],
  'Ladder': ['Merdiven', 'Escalera de mano'], 'Torch': ['Meşale', 'Antorcha'],
};

// the sixteen colours of wool and carpet: [english, turkish, spanish (feminine: lana, alfombra)]
for (const [en, tr, es] of [
  ['White', 'Beyaz', 'blanca'], ['Orange', 'Turuncu', 'naranja'], ['Magenta', 'Eflatun', 'magenta'], ['Light blue', 'Açık mavi', 'azul claro'],
  ['Yellow', 'Sarı', 'amarilla'], ['Lime', 'Açık yeşil', 'verde lima'], ['Pink', 'Pembe', 'rosa'], ['Gray', 'Gri', 'gris'],
  ['Light gray', 'Açık gri', 'gris claro'], ['Cyan', 'Camgöbeği', 'cian'], ['Purple', 'Mor', 'morada'], ['Blue', 'Mavi', 'azul'],
  ['Brown', 'Kahverengi', 'marrón'], ['Green', 'Yeşil', 'verde'], ['Red', 'Kırmızı', 'roja'], ['Black', 'Siyah', 'negra'],
]) {
  WORDS[`${en} wool`] = [`${tr} yün`, `Lana ${es}`];
  WORDS[`${en} carpet`] = [`${tr} halı`, `Alfombra ${es}`];
}

const col = lang === 'tr' ? 0 : lang === 'es' ? 1 : -1;
const patterns = [];
if (col >= 0) {
  for (const key of Object.keys(WORDS)) {
    if (!key.includes('{0}')) continue;
    const order = [];
    const re = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d)\}/g, (_, n) => {
      order.push(+n);
      return '(.+?)';
    });
    patterns.push([new RegExp(`^${re}$`, 's'), order, WORDS[key][col]]);
  }
}

const fill = (s, args) => s.replace(/\{(\d)\}/g, (_, n) => args[+n] ?? '');
const squeeze = (s) => s.replace(/\s+/g, ' ').trim();

// A sentence in the chosen language. Extra arguments fill {0}, {1}…; without them, a sentence
// that was already filled in is recognised by its pattern.
export function tx(text, ...args) {
  if (typeof text !== 'string') return text;
  if (args.length) return fill(col >= 0 && WORDS[text] ? WORDS[text][col] : text, args);
  if (col < 0) return text;
  const hit = WORDS[text];
  if (hit) return hit[col];
  for (const [re, order, to] of patterns) {
    const m = text.match(re);
    if (m) return to.replace(/\{(\d)\}/g, (_, n) => m[order.indexOf(+n) + 1] ?? '');
  }
  return text;
}

// Translate the page itself: every element marked data-t (its text or markup is the key) and
// every placeholder.
export function localize(root) {
  if (col < 0) return;
  for (const el of root.querySelectorAll('[data-t]')) {
    const key = squeeze(el.innerHTML);
    if (WORDS[key]) el.innerHTML = WORDS[key][col];
  }
  for (const el of root.querySelectorAll('[placeholder]')) el.placeholder = tx(el.placeholder);
  document.documentElement.lang = lang;
}

export function nextLang() {
  const all = Object.keys(LANGS);
  return all[(all.indexOf(lang) + 1) % all.length];
}
