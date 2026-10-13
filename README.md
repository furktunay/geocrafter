# GeoCrafter: a Minecraft-style block game inside real street photos

GeoCrafter is GeoGuessr meets Minecraft: a block game you play inside Google Street View and other
real 360° street photos. You stand in the photo, step from one to the next, build with blocks, dig
up the real road and blow up the real buildings.

An experimental project, made by [furk.ai](https://www.instagram.com/furk.ai/). Formerly called
**Street Craft** (StreetCraft), the name on the logo in the first videos.

**Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.** Not
affiliated with Google or GeoGuessr either. Every drawing and sound in this repository is the game's
own.

Türkçe: [README.tr.md](README.tr.md)

## Run it

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`. Node 20 or newer.

## Street photos

Two places in Amsterdam, **Nieuwmarkt** and **Arena Boulevard**, work straight away on free street
photos. Every other place, and adding your own, needs Google Street View with your own key.

## Getting a Google key

1. In the [Google Cloud Console](https://console.cloud.google.com/), pick or create a project with
   billing enabled.
2. Enable the **Map Tiles API** for it.
3. Create an **API key**. Restrict it to the Map Tiles API, and to the address you play from
   (`http://localhost:5173/*`).
4. In the game: **Options → Google Street View**, paste the key, save.

Good to know:

- The key stays in your browser. It is never in the repository or in a build.
- Google gives the first 100,000 Street View tiles a month for free and charges after that (check
  its current prices). The game stops at 90,000 a month unless you raise that in Options.

## Data and licences

- Amsterdam panoramas: open data of [Gemeente Amsterdam](https://api.data.amsterdam.nl/panorama/)
- Elevation: [AHN](https://www.ahn.nl) (PDOK, open data); building outlines: [3D BAG](https://3dbag.nl), CC BY 4.0
- Roads, water, land cover: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via [OpenFreeMap](https://openfreemap.org)
- Tokyo buildings: [Project PLATEAU](https://www.mlit.go.jp/plateau/); elevation elsewhere: GSI Japan, Mapzen Terrarium
- Volunteer panoramas where used: [Panoramax](https://panoramax.fr) contributors, CC BY-SA 4.0
- Street View: © Google, shown through the Map Tiles API with the player's own key
- Menu typeface: [Jersey 15](https://fonts.google.com/specimen/Jersey+15), SIL Open Font License

The code is under the [MIT licence](LICENSE).
