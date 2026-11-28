# Devya on YouTube

Educational videos for Devya's channel (`@DevyaSolutions`), narrated in the developer's own professional cloned voice, planned as one upload a day at 19:00 Cairo and staged as Private until the developer approves each one. The editorial plan (series, backlog, calendar, how it pays) is [`docs/youtube/plan.md`](../../docs/youtube/plan.md).

| File | What it is |
|---|---|
| [`episodes.json`](episodes.json) | **Registry**: every upload, long-form and Short. Holds the title, keywords, tags, hashtags, description lead, the project and devya.dev page it links, its 19:00 slot, its playlist and its YouTube id once uploaded |
| `scripts/<slug>.json` | A long-form's script. **Slides** are the screens; **beats** are the narration, one take each, with the keys each beat reveals and lights, and `marks` that move the screen on the word that names a thing |
| [`lexicon.json`](lexicon.json) | How a script word is spelled for the voice (`CLAUDE.md` → "Claude dot md", `443` → "four forty-three"), on top of the Catalyst kit's shared lexicon. Captions keep the word as written |
| `youtube.mjs` | Metadata composer and rules: the description (hook, the project's link, the devya.dev link, contact, chapters, music credit, hashtags), title, tag and chapter limits, the link rule, one upload a day. `render/validate.mjs` runs it, so the calendar gate and CI cover YouTube |
| `voice.mjs` | The cloned voice: ElevenLabs, Professional Voice Clone on the Devya Solutions account, `eleven_v4`, the settings the developer approved (stability 0.5, similarity 0.85, speaker boost, clone strength 0.3). Checks the quota before sending anything |
| `voicecheck.mjs` | The narration checks from the lesson kit's review gate: **words** (Whisper against the script, compared by consonant skeleton) and **tone** (each take's pitch and brightness against the episode's other takes; held heavy stretches) |
| `timeline.mjs` | Where every take sits, what the screen shows when, chapters, and SRT captions from the voice's own character timings |
| `slides.mjs` | Slides in the www.devya.dev theme (black and silver, the official wordmark), 1920×1080 and 1080×1920 for Shorts (title on top, burned-in captions), and the 1280×720 thumbnail |
| `mix.mjs` | The narration on its timeline with a CC0 bed from `social/music/` looped under it, ducked to −38 LUFS under speech, mixed to −14 LUFS, true peak ≤ −1 dBTP |
| `produce.mjs` | The pipeline, one stage at a time (below), and the **review gate** |
| `out/<slug>/` | What goes up with each video and stays as the record: `metadata.json` (title, description, tags, chapters, playlist, schedule), `captions.ar.srt`, `thumbnail.png`, `review.md` (the gate's report) |
| `build/` | Takes, clips, frames and the MP4s (git-ignored) |

## Making an episode

```bash
cd social/youtube
node produce.mjs quota                       # credits left on the voice account (never the key)
node produce.mjs narrate <slug> --dry-run    # what it would cost; refuses (exit 8) if it would need paying for
node produce.mjs narrate <slug>              # takes for every beat whose text or spelling changed
node produce.mjs check <slug>                # word and tone check of every take
node produce.mjs narrate <slug> --only B21   # retake a flagged beat; reword a phrase that fails twice
node produce.mjs render <slug>               # slides, sound, video, captions, chapters, thumbnail, metadata; its Shorts too
node produce.mjs gate <slug>                 # the review gate, written to out/<slug>/review.md
node produce.mjs status                      # every episode, its gate and its YouTube id
```

First run in a fresh checkout: `cd social/render && pnpm install` (Playwright's cached Chromium), plus `ffmpeg` and `whisper-cli` with `~/.cache/whisper-cpp/ggml-large-v3-turbo-q5_0.bin`.

**The voice.** The key is read from the macOS Keychain (service "Devya Solutions ElevenLabs") or `ELEVENLABS_API_KEY`. It is never printed, logged or written to a file. The voice id comes from the lesson kit's voice state (`VOICE_STATE`, default `~/Projects/catalyst/_internal/video/voice/voice.constra.json`), so no id lives in this public repo. The Catalyst lessons use the same account, so `voice.mjs` keeps 5,000 credits in reserve. Every take sent is logged with its character count in `build/credits.jsonl`.

**The review gate** fails an episode (and each of its Shorts) on any of these:
- a take whose words Whisper does not hear as written (under 85%);
- a take off the episode's register (3 st, 4 dB darker), or with a held heavy stretch;
- a mark that fires on no word;
- a screen that holds still for more than 16 s while the voice talks;
- a picture that has not moved to the new state just after a change (frames sampled from the MP4);
- loudness off −14 ±1 LUFS, true peak over −1 dBTP, music under 15 LU below the voice, or a silent end screen;
- captions that overlap, run past three lines or leave a beat uncovered;
- chapters YouTube would refuse;
- a thumbnail that is not 1280×720 or fails the brand check;
- a video over 10 MB (the Studio upload step's limit; slides keep long-forms well under it);
- any metadata or link rule.

## Publishing

Uploads are staged in YouTube Studio from the ceo seat's Chrome, one at a time, from `out/<slug>/metadata.json`. The Devya channel's login lives only there. Each upload gets:
- the video;
- title and description;
- the playlist (Private);
- tags;
- category Education;
- language Arabic;
- not made for kids;
- the Arabic captions file;
- the thumbnail and an end screen (long-forms);
- visibility **Private**.

Nothing goes public, unlisted or scheduled until the developer approves it (their rule, 2026-11-28). `publishAt` is the proposed go-live slot. Once a video is approved, set it to Scheduled at that slot in Studio.

Once Studio gives the video its id, record it in `episodes.json` (`youtube.id`, `youtube.status`). After a video is public, add it to `social/videos.json` so social posts can link it. `validate.mjs --live` checks registered videos through oEmbed, which only answers for public videos.

**Channel limits until YouTube's one-time verification is done.** It needs the owner's phone or ID, so only the developer can do it.
- Description links are not clickable.
- A Short cannot link its full video ("Related video").
- Studio takes 10 uploads a day.

Nothing here posts to any other network.
