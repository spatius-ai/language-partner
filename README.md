# Language partner

## Overview

Language partner is a speaking partner for people learning a language. The learner steps into a real place (a café, a hotel front desk, a train station ticket office, or their own lesson) and talks or types in the language they are learning. A live Spatius avatar answers out loud, at the learner's level, with lip sync and subtitles.

While they talk, a red pen corrects the learner's own words right in the subtitles, with a short reason in English. Phrases they use correctly go into their pocket, and at the end the pocket becomes a short summary of what they learned and what to practise next.

This repository is a small, complete template. It runs on your computer in a few minutes with only your Spatius API key and App ID. It is for language schools, teachers and learning apps that want a speaking partner with a face. It is also for developers who want to see how a Spatius avatar connects to speech, an LLM and a web page.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/spatius-ai/language-partner)

## Why this matters

Learners rarely get enough speaking practice, and a class has one teacher for many students. A patient partner who speaks the language, stays in a real situation and corrects mistakes gently gives every learner that practice between classes. Because it runs on your own Spatius account, you can add your own places, lessons and languages.

## User flow

1. The learner picks a language, a level, a place and a partner, or pastes their own lesson under "My lesson".
2. They press "Start talking". The partner greets them out loud in that language, in that place.
3. They speak (the microphone stops by itself when they pause) or type. They can also ask "how do I say...?" in English.
4. The red pen marks a mistake in their sentence and shows the correct words and a reason. A purple pen suggests a more natural way. A green tick means the sentence was correct.
5. The partner answers out loud and keeps the conversation going. Words on the board light up when they are used, and a tap on a word says it.
6. "End and open my pocket" shows the new phrases, the corrections and what to try next. From there the learner can keep talking, start again, or go to another place.

## Architecture

```text
language-partner/
  README.md
  LICENSE
  package.json
  vite.config.mjs           builds the web page and copies the avatar engine files
  wrangler.jsonc            Cloudflare Workers settings
  .env.example              settings for running on your computer
  .dev.vars.example         secrets for Cloudflare
  scenes.json               the places, languages, board words and first lines
  server/
    brain.mjs               the language partner itself: the prompt, the red pen rules, the voice style
    voices.mjs              optional ElevenLabs voices, one per person (used when ELEVENLABS_API_KEY is set)
    app.mjs                 the API: session token, hearing, the reply, the voice (uses brain.mjs)
    node.mjs                runs the app on your computer
    worker.mjs              runs the app on Cloudflare Workers
  web/
    index.html              the page: choices, the scene, the pocket, the partner picker
    src/main.ts             the conversation, the red pen, the pocket and the microphone
    src/partner.css         the look of the scene, the subtitles and the pens
    src/seat.ts             the Spatius avatar: load, connect, speak
    public/embed.js         puts the partner on any page with one line
    public/assets/          fonts, faces and the place pictures
```

The code has three parts, so you can keep the part you need. `server/brain.mjs` is what makes it a language partner; `server/app.mjs` connects it to OpenAI and the browser; `web/src/seat.ts` connects the avatar. The same `server/app.mjs` runs in both places. It only uses the standard `fetch`, `Request` and `Response`, so `node.mjs` and `worker.mjs` are thin wrappers around it.

## Runtime modes

| Mode | Command |
| --- | --- |
| On your computer | `npm start` |
| Cloudflare Workers, local | `cp .dev.vars.example .dev.vars`, then `npm run dev:cf` |
| Cloudflare Workers, online | `npm run deploy` or the Deploy button |

**Starter minutes or your own OpenAI key.** Hearing, the replies and the voice use OpenAI. Without `OPENAI_API_KEY`, the partner uses free Spatius starter minutes (30 minutes per Spatius key), sent through `starter.spatius.app` with your Spatius key. When they are used up, the page tells the learner, and you add your own key. With `OPENAI_API_KEY` set, the partner calls OpenAI directly and the starter service is not used.

## Protocols and contracts

The browser talks to the server through five routes.

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/config` | none | `appId`, `region`, `faces`, `choices` (where the page starts), `starter` |
| `POST /api/session` | none | `appId`, `region`, `sessionToken` |
| `POST /api/hear` | Recorded audio as the body, header `x-lang` | `{ text }` |
| `POST /api/talk` | JSON `{ text, face, lang, level, scene, lesson, history }` | `{ reply, translation, fix, good, pocket, board }` |
| `POST /api/speak` | JSON `{ text, face, lang, level }` | The voice as raw PCM16, mono, 24 kHz, streamed |

`fix` is `null` or `{ kind, wrong, right, why }`. `kind` is `fix` for a mistake or `nicer` for a more natural way. `wrong` is always words copied from what the learner said, so the page can cross them out in place. `pocket` holds phrases the learner used correctly, and `board` holds the board words that came up.

Errors come back as `{ "error": "..." }` with a matching HTTP status. When starter minutes are used up, the status is 402 and `starterUsed` is `true`.

The voice is passed to the avatar exactly as it arrives (24 kHz), with no resampling, so the lips and the sound stay together. Beginners hear a slower voice.

## Make it yours

**Places and words.** Each place in `scenes.json` has the partner's role, a picture, where its board sits on the picture, and for each language a board title, the board words and the partner's first line with its English translation. To add a place, add an entry there, a picture in `web/public/assets/lp/`, and a button in `web/index.html`.

**Languages.** Spanish, English, Chinese, Arabic (right to left) and French are included. To add one, add it to `langs` in `scenes.json`, add its words to each place, and add a button in `web/index.html`.

**Your lesson.** Under "My lesson", learners paste a word list or a grammar point, and the partner builds the conversation around it. Set a default with `PARTNER_LESSON`.

**Partners.** The five partners are in `FACES` in `server/app.mjs`, each with a Spatius avatar and a matching voice. You can use any avatar from your Spatius account.

## Use it in your own app

Pick the row that matches what you have.

| You have | Do this |
| --- | --- |
| Any website or web app, and you want the partner inside it | Deploy this template (Cloudflare button or your own server), then add one line where it should appear: `<script src="https://YOUR-PARTNER-ADDRESS/embed.js" data-lang="fr" data-scene="hotel" async></script>`. The `data-` choices are optional. Events arrive on your page as `window` event `spatius:event`. |
| Your own backend, in any language | Copy `server/brain.mjs` (or port it: it is about 100 lines of plain functions). Call `partnerMessages()` before your LLM call and `readTurn()` after it. It needs no network and no framework. |
| Your own web page, and you want the avatar | Copy `web/src/seat.ts`. It loads a Spatius avatar into any element and plays 24 kHz PCM16 audio on it with lip sync. |
| A LiveKit or Agora voice agent | Start from Spatius's official example, [livekit-demo](https://github.com/spatius-ai/spatius-integration-demo/tree/main/livekit-demo) or [agora-demo](https://github.com/spatius-ai/spatius-integration-demo/tree/main/agora-demo), then call `partnerMessages()` / `readTurn()` from your agent's LLM step. The brain is plain functions, so this demo's standout feature works the same over LiveKit or Agora. |
| Another LLM, or an OpenAI-compatible gateway | Set `OPENAI_BASE_URL` with your own `OPENAI_API_KEY`. The brain works with any chat model that can return JSON. |

Spatius's official examples show how to connect an avatar (Direct, LiveKit, Agora, iOS, Android, Flutter): [spatius-integration-demo](https://github.com/spatius-ai/spatius-integration-demo), [livekit-plugins-spatius](https://github.com/spatius-ai/livekit-plugins-spatius) and [create-spatius-app](https://github.com/spatius-ai/create-spatius-app). This template shows what to build on top: the use case and its standout feature, in a brain you can plug into any of them.

## Technical stack

- Spatius avatar SDK (`@spatius/avatarkit`) in Direct mode, drawn in the browser
- OpenAI: `gpt-4o-mini-transcribe` (speech to text, told which language to expect), `gpt-4.1-mini` (replies and corrections as JSON), `gpt-4o-mini-tts` (voice); all can be changed in settings
- Vite for the web page, plain Node for the local server, Cloudflare Workers for hosting
- No database and no framework

## Setup and local development

You need Node 20.3 or newer and a Spatius account, for an API key and App ID from [app.spatius.ai](https://app.spatius.ai). You also need a browser with WebGPU or WebGL2, and a microphone if you want to speak.

```sh
git clone https://github.com/spatius-ai/language-partner
cd language-partner
cp .env.example .env      # paste SPATIUS_API_KEY and SPATIUS_APP_ID
npm install
npm start                 # open http://localhost:3000
```

The page calls `/api/...` and loads `/assets/...` on the same address as the page, so the page, the built files and the API must be served from one origin. `server/node.mjs` and Cloudflare both do this.

## Environment configuration

| Setting | Needed | What it does |
| --- | --- | --- |
| `SPATIUS_API_KEY` | Yes | Your Spatius API key |
| `SPATIUS_APP_ID` | Yes | Your Spatius App ID |
| `SPATIUS_REGION` | No | `us-west` (default) or your region |
| `OPENAI_API_KEY` | No | Your OpenAI key; without it, starter minutes are used |
| `ELEVENLABS_API_KEY` | No | ElevenLabs voices: each person has their own voice, and a native voice for Arabic. Without it, the OpenAI voice is used, and it is also used if ElevenLabs refuses a request. Model: `ELEVENLABS_MODEL` (default `eleven_v4_turbo`) |
| `OPENAI_BASE_URL` | No | Another OpenAI-compatible address for your own key. Your OpenAI key is never sent to the starter service. |
| `SPATIUS_STARTER_URL` | No | Another starter service address (for testing) |
| `PARTNER_LANG` | No | Starting language: `es`, `en`, `zh`, `ar` or `fr` |
| `PARTNER_LEVEL` | No | `beginner`, `intermediate` or `advanced` |
| `PARTNER_SCENE` | No | `cafe`, `hotel`, `train` or `lesson` |
| `PARTNER_FACE` | No | `camille`, `nadia`, `grace`, `victor` or `julian` |
| `PARTNER_LESSON` | No | A default lesson for "My lesson"; write `\n` for a new line |
| `OPENAI_CHAT_MODEL`, `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL` | No | Models |
| `PORT` | No | Local port, 3000 by default |

The learner can still change the language, level, place and partner on the page. On Cloudflare, put the keys in `.dev.vars` (local) or as secrets (online); the other settings are in `wrangler.jsonc` under `vars`.

## Security and deployment guidance

- Keys stay on the server. The browser only receives a short-lived Spatius session token.
- The `/api` routes are open to anyone who can reach your site, and each turn spends your OpenAI key or starter minutes and your Spatius minutes. The server allows 40 API requests per minute per visitor. For a public site, also turn on your host's rate limiting (for example Cloudflare rate limiting rules) and set a monthly limit in your OpenAI account.
- Recordings are turned into text and not stored. Nothing is kept on the server between turns; the conversation history lives in the learner's browser tab.
- `.env` and `.dev.vars` are ignored by git. Never commit them.
- Starter minutes are for trying the template. For real learners, use your own OpenAI key and set limits in your OpenAI account.
- The avatar SDK sends basic performance data to Spatius so failures can be found. See the [Spatius Terms of Service](https://www.spatius.ai/terms-of-service/).

## License and use constraints

The code in this repository is under the MIT License (see `LICENSE`). The Spatius avatar SDK (`@spatius/avatarkit`) and the Spatius service are not part of this license; they are covered by the [Spatius Terms of Service](https://www.spatius.ai/terms-of-service/). The fonts in `web/public/assets/fonts/` (Inter, Geist Mono, Space Grotesk) are under the SIL Open Font License; their license texts are in `web/public/assets/licenses/`. The handwriting font Caveat is loaded from Google Fonts, also under the SIL Open Font License. The place pictures and the face photos are examples for this template.
