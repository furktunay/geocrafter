# GeoCrafter: a Minecraft-style block game inside real street photos

GeoCrafter is a block game you play inside Google Street View and other real 360° street photos. You
stand in a street-level panorama, step from photo to photo, put blocks into the picture, dig up the
real road and blow up the real buildings. Underneath the photo there is a block world built from map
data, and it shows wherever you break through.

The name is the idea: GeoGuessr meets Minecraft. The real streets of the one, the blocks of the
other.

Made by [furk.ai](https://www.instagram.com/furk.ai/). Formerly called **Street Craft** (StreetCraft),
the name on the logo in the first videos.

An experimental project. **Not an official Minecraft product. Not approved by or associated with
Mojang or Microsoft.** Not affiliated with Google or GeoGuessr either. Every drawing and sound in
this repository is made by the game's own code; no other game's files are included.

Türkçe: [README.tr.md](README.tr.md)

## Run it

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`. Node 20 or newer. `npm run build` writes a static site to `dist/`.

## Street photos are the game

A place can only be played where there are street photos to stand in. There are two ways to get them.

**Free, no key.** Two places in Amsterdam work out of the box: **Nieuwmarkt** and **Arena Boulevard**.
They use the municipality's own survey panoramas (8000 px, one every 5 m, measured positions) on top
of the Dutch national laser scan, so blocks sit exactly on the real surfaces. The free sources do not
cover other places, and the game does not let you add any on them.

**Google Street View, with your own key.** Switch it on in **Options** and almost every street on
Earth opens up, in sharper photos: the other places in the list (New York, Times Square, Las Vegas,
London, Berlin, Rotterdam, Rome, Barcelona, Tel Aviv, Tokyo) unlock, and **Choose a place → Add your
own place** takes coordinates or a pasted Google Maps link.

To get a key:

1. In the [Google Cloud Console](https://console.cloud.google.com/), pick or create a project with
   billing enabled.
2. Enable the **Map Tiles API** for it.
3. Create an **API key**. Restrict it to the Map Tiles API, and to the address you play from
   (`http://localhost:5173/*`).
4. In the game: **Options → Google Street View**, paste the key, save.

Things to know before you do:

- The key is stored in your browser only (`localStorage`). It is never written to the repository,
  and a build never contains one. While developing you can also put `VITE_GOOGLE_MAPS_KEY=...` into
  `.env.local` (git-ignored); only `npm run dev` reads it.
- Google bills by tile. At the time of writing its price list gave the first 100,000 Street View
  tiles a month for free and charged $2 per 1,000 after that, with a default quota of 15,000 tiles a
  day; check the current numbers yourself. A photo is 32 tiles while you walk and 64 more to sharpen
  when you stop.
- The game counts the tiles it asks for and stops at 90,000 a month unless you tell it (in Options)
  how many tiles you are willing to pay for. The counter only sees this browser; the Cloud Console
  has the real figure.
- Your use of Google's imagery is subject to the Google Maps Platform Terms of Service. The game
  only displays the photos; it does not store or analyse them.

If a place has no photos (Google is off, the key does not work, or there is simply nothing there),
the game says so and sends you back to the list instead of starting.

## Controls

| Key | What it does |
| --- | --- |
| `W` | Step to the photo the arrow you face points at; hold to keep going |
| `A` `S` `D` | Step left, back, right |
| Left click / right click | Break or hit / place or use |
| `1`–`9`, wheel | Pick an item from the hotbar |
| Middle click | Pick the block you point at |
| `E` | Inventory (creative catalogue with tabs) and 2×2 crafting |
| `Tab` | Switch between photo mode and free roam (walk, jump) |
| `F`, double `Space` | Fly, in free roam |
| `G` | Back to the nearest photo |
| `V` | Give the car you point at a solid body (again: undo) |
| `R` twice | Reset this map |
| `P` | Photo on/off (shows the block world underneath) |
| `C` | Fine-tune how the photo sits on the blocks |
| `M`, `F3` | Big map, debug information |

Where the browser cannot lock the pointer (embedded previews), the game falls back to drag-to-look.

## What is in it

- **Building blocks:** stone, bricks, planks, concrete, glass, wool and carpets in sixteen colours,
  ores and their blocks, and the materials real streets are made of (asphalt, paving, kerbs, roof
  tiles), which go into your inventory the first time you dig them up.
- **Shaped blocks:** slabs and stairs in six materials, doors that swing, trapdoors, fences and glass
  panes that join their neighbours, ladders, torches, beds that take two cells, chests that store
  things. Stairs climb away from you, a chest faces you, a second slab on the first makes the whole
  block again.
- **Things to do:** TNT with flint and steel, a bow, a pickaxe and a sword, bread when you are hungry,
  spawn eggs (skeleton archers, creepers, zombies, zombified piglins), an obsidian portal to a Nether
  under every place, and a bed that does what beds do where nobody is supposed to sleep.
- **Three languages:** English, Turkish and Spanish (top right of the menu).

Block changes, the inventory, chests and settings are saved in the browser, per place.

## Texture and sound packs

The game draws all of its own textures and synthesises its own sounds. If you would rather see and
hear files you own, put them into `public/textures/` and `public/sounds/`, laid out like a resource
pack's `textures` and `sounds` folders; `pack.json` in each folder says which file dresses which
part of the game, and anything missing keeps the built-in version.

`npm run textures` and `npm run sounds` copy the files named in `pack.json` from a game installed on
this computer (nothing is downloaded); `npm run textures:prune` and `npm run sounds:prune` delete
whatever `pack.json` does not name. Those folders are git-ignored apart from `pack.json`. Only use
files you have the right to use, and do not publish other people's files with your build: `npm run
build` copies `public/` into `dist/` as it is.

## How it works

- A panorama is projected onto the block world from the spot it was taken. A surface wears the photo
  only where the camera could see it (tested against a distance map rendered from that spot) and
  only while you have not touched it; what you break or place is ordinary blocks.
- Moving is from photo to photo: each one gets an arrow to its nearest neighbour in every direction,
  unless a wall stands between them.
- The block world comes from open map data: laser-scanned terrain and registered building outlines
  in the Netherlands, PLATEAU building models in Tokyo, OpenStreetMap and elevation tiles elsewhere.
- The block grid is turned to run along the streets of the place rather than north-up.
- Shaped blocks are one block number per shape and heading, drawn box by box; textures are looked up
  by position, so a slab shows the lower half of its block's texture and a door its own picture.

## Source files

| File | What it holds |
| --- | --- |
| `src/main.js` | Game loop, input, menu, places, placing and breaking, health/hunger/experience |
| `src/blocks.js`, `src/textures.js` | Every block and shape; the game's own drawings |
| `src/mesher.js`, `src/world.js`, `src/player.js` | Meshing, chunk store and edits, movement and collision |
| `src/pano.js`, `src/google.js` | Street photos: sources, loading, stepping between them; Google Street View tiles |
| `src/materials.js` | Shaders for the blocks and the photo projection |
| `src/ui.js`, `src/items.js`, `src/hand.js`, `src/title.js`, `src/i18n.js` | HUD, inventory, icons, held item, title screen, translations |
| `src/fx.js`, `src/mobs.js`, `src/nether.js`, `src/sound.js` | Explosions, creatures, the Nether, sounds |
| `src/worker.js`, `src/generator.js`, `src/tiles.js`, `src/lidar.js`, `src/grid.js` | Map data to voxel world |
| `src/pack.js`, `scripts/` | Optional texture and sound packs |

## Data and licences

- Amsterdam panoramas: open data of [Gemeente Amsterdam](https://api.data.amsterdam.nl/panorama/)
- Elevation: [AHN](https://www.ahn.nl) (PDOK, open data); building outlines: [3D BAG](https://3dbag.nl), CC BY 4.0
- Roads, water, land cover: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via [OpenFreeMap](https://openfreemap.org)
- Tokyo buildings: [Project PLATEAU](https://www.mlit.go.jp/plateau/); elevation elsewhere: GSI Japan, Mapzen Terrarium
- Volunteer panoramas where used: [Panoramax](https://panoramax.fr) contributors, CC BY-SA 4.0
- Street View: © Google, shown through the Map Tiles API with the player's own key
- Menu typeface: [Jersey 15](https://fonts.google.com/specimen/Jersey+15), SIL Open Font License, loaded from Google Fonts

## Licence

The code is under the [MIT licence](LICENSE). The map data, the street photos and the typeface keep
their own licences, listed above; a texture or sound pack you add is yours to answer for.
