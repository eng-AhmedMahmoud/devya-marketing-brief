# Music licences and credits

Background music beds for Devya's daily vertical video (Reels, Stories, LinkedIn video). Every track here is free of charge and licensed for commercial use on social networks. `render/audio.mjs` only plays files listed in `tracks.json`, and refuses a file whose SHA-256 does not match.

## Tracks

| File | Title | Artist | Licence | Source | SHA-256 |
|---|---|---|---|---|---|
| `loyalty-freak-music-one-cool-minute.mp3` | One Cool Minute | Loyalty Freak Music | CC0 1.0 | [archive.org](https://archive.org/details/MINIMALAMBIENTBOUNCE) | `4b269a25…71ba26` |
| `loyalty-freak-music-static-shoes.mp3` | Static Shoes | Loyalty Freak Music | CC0 1.0 | [archive.org](https://archive.org/details/MINIMALAMBIENTBOUNCE) | `8b606742…68ba632a0b4` |
| `loyalty-freak-music-lag.mp3` | Lag | Loyalty Freak Music | CC0 1.0 | [archive.org](https://archive.org/details/MINIMALAMBIENTBOUNCE) | `642a842f…f8175fae52` |

Full hashes are in `tracks.json`.

All three come from the album **MINIMAL AMBIENT BOUNCE** (Loyalty Freak Music, 2017; genres: ambient, electronic, techno, "utilitarian music"). They were downloaded unchanged on **2026-11-27** from the Internet Archive item `MINIMALAMBIENTBOUNCE` (`https://archive.org/download/MINIMALAMBIENTBOUNCE/Loyalty Freak Music - MINIMAL AMBIENT BOUNCE - <NN> <Title>.mp3`).

### Licence: CC0 1.0 Universal (public domain dedication)

- Artist's own album page: https://loyaltyfreakmusic.com/music/minimal-ambient-bounce/ ("Licence: CC-0", linking https://creativecommons.org/publicdomain/zero/1.0/), checked 2026-11-27.
- Internet Archive item metadata: `licenseurl` = `http://creativecommons.org/publicdomain/zero/1.0/`, checked 2026-11-27.
- Also published on the Free Music Archive: https://freemusicarchive.org/music/Loyalty_Freak_Music/MINIMAL_AMBIENT_BOUNCE

CC0 waives all copyright and related rights: the tracks may be copied, modified, mixed and used commercially, on any platform, with no attribution and no fee. That is also why the files can sit in this **public** repository. Credit is optional; this file is our record.

Legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode

## Why not Pixabay or the YouTube Audio Library

Pixabay Music was checked first (2026-11-27). Its Content License allows free commercial use in social videos without attribution, but it forbids distributing the audio "on a Standalone basis", and this repository is public: committing the raw MP3s here would let anyone download the unmodified tracks. Pixabay also marks many corporate tracks "Content ID Registered", which can get a Reel muted or claimed. The YouTube Audio Library has the same no-redistribution rule and needs a YouTube Studio sign-in. CC0 avoids all three problems. If this repository ever goes private, Pixabay tracks without Content ID could be added the same way (record each track's page URL and the licence summary here).

## Platform claims

CC0 tracks are not registered with Content ID or Meta Rights Manager by the artist, but anyone can upload public-domain audio to a claim system. The publish worker waits for Facebook's copyright check before posting a Reel; if a network ever flags one of these tracks, remove it from `tracks.json` and note why here.

## Adding a track

1. Only free tracks whose licence allows commercial use on social networks **and** redistribution in a public repository (CC0, or CC BY with the credit added to every post that uses it).
2. Save the unmodified file here, add it to `tracks.json` (sha256, two or three steady 10-second `windows` in seconds), and add a row above with its source page and licence evidence.
3. Run `node --test social/render/audio.test.mjs`.
