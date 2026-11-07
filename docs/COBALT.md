# YouTube and Instagram through Cobalt

OPTDOWNS resolves YouTube videos, Shorts and Instagram posts through **your own** Worker and **your own** [Cobalt](https://github.com/imputnet/cobalt) instance. Without both, YouTube is off, and Instagram uses only the anonymous public read.

- [How it works](#how-it-works)
- [Worker variables](#worker-variables)
- [Routes](#routes)
- [YouTube](#youtube)
- [Instagram](#instagram)
- [Load on Cobalt](#load-on-cobalt)
- [Errors](#errors)
- [Your Cobalt instance](#your-cobalt-instance)
- [Userscript switches](#userscript-switches)
- [Limits](#limits)
- [Testing status](#testing-status)
- [Responsible use](#responsible-use)

## How it works

```
userscript --/yt/info or /ig/info--> Worker --oEmbed (title, thumbnail)---------> YouTube
                                       |--Data API v3 (duration, optional)-----> Google
                                       |--og: tags (preview, Instagram)--------> Instagram
                                       '--POST per quality--------------------> YOUR Cobalt
userscript --/yt/dl or /ig/dl?t=...--> Worker --POST + tunnel stream-----------> YOUR Cobalt
```

- Cobalt needs Node and ffmpeg, so it cannot run on Cloudflare Workers. It runs on a server of yours, and the Worker is the bridge.
- The download link is an **encrypted token** that carries only parameters. It is not the Cobalt tunnel, which expires in about 90 seconds, so Cobalt is asked again at download time. A token from one route is not valid on another.
- No API key is stored in the userscript.

## Worker variables

| Variable | Type | Required | Default | Use |
| --- | --- | --- | --- | --- |
| `COBALT_API_URL` | variable | yes | none | Root of your instance's API (POST `/`), such as `https://cobalt.example.com/`. HTTPS on port 443. Without it YouTube and Instagram through Cobalt are off. |
| `COBALT_API_KEY` | secret | if your instance requires it | none | Sent as `Authorization: Api-Key ...`. Trimmed and validated, never shown, never sent to the browser. |
| `YOUTUBE_API_KEY` | secret | no | none | YouTube Data API v3, used only for the duration. |
| `TOKEN_KEY` or `SECRET` | secret | yes | none | Encrypts the `/yt/dl` and `/ig/dl` tokens. |
| `YT_QUALITIES` | variable | no | `2160:vp9,1440:vp9,1080,720,480,360,240` | Tiers probed for each search. |
| `COBALT_CONCURRENCY` | variable | no | `2` | Maximum simultaneous calls to Cobalt. |
| `COBALT_GAP_MS` | variable | no | `150` | Minimum gap between call starts. |
| `COBALT_RETRIES` | variable | no | `2` | Extra attempts on 429, 502, 503 and 504. |
| `COBALT_BACKOFF_MS` | variable | no | `700` | Base wait, doubled on each attempt. |
| `COBALT_COOLDOWN_MS` | variable | no | `8000` | Pause after retries run out on 429. It doubles on repeated exhaustion up to 30 seconds and resets on the first success. |

The `COBALT_*` tuning defaults were chosen for this release and were not calibrated on a real instance.

```bash
npx wrangler secret put COBALT_API_KEY
npx wrangler secret put YOUTUBE_API_KEY
```

After deploying, open `https://YOUR-WORKER/yt/status?key=YOUR_SECRET`, or use the diagnostics tab. It checks the configuration, the version and services of your instance (including whether `youtube` and `instagram` are enabled), and makes one authenticated test POST that does not reach YouTube. Add `?auth=0` to skip the test POST.

## Routes

| Route | What it does |
| --- | --- |
| `GET /yt/info?url=<youtube>` | Title, channel, thumbnail, duration (with `YOUTUBE_API_KEY`) and the options Cobalt confirmed. `&sizes=1` also asks for sizes. |
| `GET /yt/dl?t=<token>` | Streams the chosen file. `&probe=1` resolves the item without opening the tunnel and returns JSON. |
| `GET /ig/info?url=<instagram>` | Items of a Reel, post or carousel, with a preview when available. |
| `GET /ig/dl?t=<token>` | Streams one item. Supports `&probe=1`. |
| `GET /yt/status` | Configuration check plus a real request to your instance. |

`/yt/dl` and `/ig/dl` do not forward `Range`. The Cobalt tunnel does not serve it, so the Worker answers 200 with the whole file and `Accept-Ranges: none`. With an exact `Content-Length`, any cut becomes a transfer error instead of a truncated file. `MAX_BYTES` is enforced: a declared size above it returns HTTP 413 `TOO_LARGE` before transferring.

## YouTube

- **Links:** `youtube.com/watch?v=`, `youtu.be/`, `/shorts/`, `/embed/` and `/live/`. A playlist link without a video id is refused. Shorts, `youtu.be`, embed and live links are converted to `https://www.youtube.com/watch?v=ID` before reaching the Worker, and the Short badge is kept.
- **Qualities:** the Worker probes each tier and lists only what Cobalt confirmed. Resolution and codec are read from the `classic` file name Cobalt returns. If the name has no resolution, the option shows as "up to Np" with a notice, and a resolution is never invented. Duplicates are removed, and VP9 at 1080p or lower is dropped when an MP4 exists.
- **Codecs:** up to 1080p the Worker asks for H.264 (MP4). Above 1080p it asks for VP9, delivered as **WebM**. Shorts use the shorter side as the quality, so 1080x1920 is 1080p.
- **MP3:** a separate option converted by Cobalt, listed when at least one video was extracted and confirmed at download.
- **WebM is never renamed to MP4.** If an option labeled MP4 gets `video/webm` from the tunnel, the extension is corrected and `x-optdowns-ext-corrected` is sent.
- **Audio only:** a video request that returns only audio is dropped from the search and refused at download (`YT_AUDIO_ONLY`). If Cobalt answers `local-processing` or `picker` for a video request, the option is skipped with a notice.
- **Nothing is invented.** Without `YOUTUBE_API_KEY` there is no duration. A size appears only when the source reports one, and one without an exact `Content-Length` is marked as an estimate. Tunnels that remux often have no size, so progress shows the MB received without a total.
- **On this page:** the tab identifies the video from the URL, waits 700 ms for the URL to settle, cancels the previous lookup when you switch videos, and discards an answer whose id does not match the open video. It runs only with the panel open and the tab visible. `blob:` and MediaSource URLs are never sent anywhere.

## Instagram

- **Flow:** `/ig/info` asks Cobalt for `downloadMode: auto` and `videoQuality: max`, which gives the original file without re-encoding. Reels, `/p/`, `/tv/`, `/reels/`, user links and `/share/` are recognized.
- **Carousels:** one card per item, numbered, with videos before photos and a thumbnail when Cobalt provides one.
- **Metadata:** Cobalt does not report title, duration or resolution for Instagram, so those stay empty. The public `og:image` and `og:title` are fetched in parallel on a best-effort basis, waiting up to about 1.5 seconds. Without them the card shows "Instagram · code".
- **Fallback:** if the Worker or Cobalt is unavailable (no `COBALT_API_URL`, an old Worker, the network), the script uses the anonymous public read and shows no error. If that also fails, the message describes both attempts. Errors about the content itself, such as a private account, do not try the fallback.
- **Order:** `LINK_PROXY_INSTAGRAM_ORDER = 'cobalt-first'` is the default. `'local-first'` tries the lightweight public read first, then Worker and Cobalt only if no media is found, and Cobalt's specific error wins.
- **Not supported:** stories. **Unchanged:** Instagram in **On this page**.

## Load on Cobalt

The default limit of a Cobalt instance is about 20 POSTs per minute per IP. This release reduces what OPTDOWNS asks of it:

- At most two concurrent calls, spaced by a minimum gap, shared by every request in the same isolate.
- Retries with growing waits on 429, 502, 503 and 504. `Retry-After` is honored, and waits above 6 seconds are not awaited.
- After retries run out, a global pause. Requests during the pause fail fast instead of waiting.
- Adaptive probing in descending order: a tier is skipped when a larger request already returned a height at or below it in the same codec. If Cobalt starts limiting mid-search, the Worker stops asking and returns a partial list with a notice (`partial: true`), which is not cached.
- A 20-second cache for permanent failures, so repeating the search does not reach Cobalt. YouTube: login or age required, private, unavailable, not found, live, too long, unsupported, region. Instagram: private, login, unavailable, no media, unsupported.
- One tunnel per download. The resolved tunnel is reused for 45 seconds across the pre-check, HEAD and download, and resolved again if it expired.
- In the userscript, YouTube and Instagram items use `credentials: 'omit'` and no chunked `Range` download, since each chunk would reopen the whole remux.

With all tiers, one YouTube search still makes seven POSTs, which is roughly two searches per minute at the default limit. Results are cached for 60 seconds in the Worker and 45 seconds in the userscript. Lower `YT_QUALITIES` or raise the limit on your instance for heavy use.

## Errors

| Code | Meaning |
| --- | --- |
| `YT_NOT_CONFIGURED` | `COBALT_API_URL` is missing. |
| `YT_NO_FORMATS` | No valid video was obtained. The notices say why. |
| `YT_AUDIO_ONLY` | A video request returned only audio. |
| `YT_TOO_LONG` | The video is longer than your instance allows. |
| `IG_PRIVATE`, `IG_LOGIN_REQUIRED`, `IG_UNAVAILABLE`, `IG_NO_MEDIA`, `IG_BLOCKED` | Specific Instagram cases: private, login or age, removed, no media, blocked by Instagram. |
| `COBALT_RATE_LIMIT` | HTTP 429 with a `Retry-After` header. |
| `COBALT_UNAVAILABLE` | HTTP 503 with a `Retry-After` header. |
| `COBALT_REDIRECT` | Cobalt answered with a 3xx. It is not followed and the key is not resent. |
| `COBALT_KEY_INVALID` | `COBALT_API_KEY` has spaces or invalid characters. The value is never shown. |
| `ORIGIN_UNREACHABLE` | A real network failure (502). |
| `WORKER_REQUEST_INVALID` | A local runtime failure (500), kept apart from network errors. |
| `TOO_LARGE` | The file is above `MAX_BYTES` (413). |
| `USE_YT_ROUTE` | The generic extractor refuses YouTube links. Use `/yt/info`. |

## Your Cobalt instance

Host your own by following `docs/run-an-instance.md` and `docs/protect-an-instance.md` in the Cobalt repository, and create an API key for the Worker.

The Cobalt documentation asks that instances hosted by others are not used by other projects without permission. That is why this repository embeds no public or community instance.

YouTube often needs a session or cookies on the Cobalt server, and so can Instagram content that requires a login. That is configuration on its side: the Worker does not bypass logins or access controls.

## Userscript switches

| Constant | Effect |
| --- | --- |
| `LINK_PROXY_YOUTUBE = false` | Turns YouTube off. The script never sends YouTube links to the Worker. |
| `LINK_PROXY_YOUTUBE_SIZES = true` | Asks Cobalt for each option's size while searching. More requests to Cobalt. |
| `LINK_PROXY_INSTAGRAM = false` | Keeps Instagram on the anonymous public read. |
| `LINK_PROXY_INSTAGRAM_ORDER` | `'cobalt-first'` or `'local-first'`. |

## Limits

- No playlists, live streams, Instagram stories or content that requires a login.
- YouTube and Instagram change often. When Cobalt fails for them, the Worker's message says what to update.
- Above 1080p the output is WebM/VP9 only, with no MP4 or AV1 and no conversion. 2160p and 1440p depend on the source publishing them.
- The browser builds the file in memory before saving. Multi-gigabyte files and resumable downloads are not handled.
- Cobalt is consumed only through its HTTP API and is licensed under AGPL-3.0. If you modify and host Cobalt, the AGPL applies to your instance.

## Testing status

All tests below used a simulated Cobalt, YouTube and Instagram. Nothing was validated against the real services, a real Cobalt instance, the Cloudflare Workers runtime, Tampermonkey or iOS. Read "tested" as "tested with simulation". The suites are not part of this repository.

| Suite | Environment | Result |
| --- | --- | --- |
| Worker | Node, mocked `fetch` that emulates the Workers runtime checks | 205 passed, 0 failed |
| YouTube in By link | Chromium, real Worker code, simulated Cobalt | 33 passed, 0 failed |
| YouTube in On this page | same | 28 passed, 0 failed |
| Regressions (player `blob:`, MP4 validator, audio only) | same | 11 passed, 0 failed |
| Instagram (Reel, carousel, errors, fallback, `local-first`) | same | 30 passed, 0 failed |
| Load and downloads (limits, resolutions, Shorts, 429, 503, truncation) | same | 15 passed, 0 failed |

Not confirmed: the cause of intermittent HTTP 503 from Cobalt, the cause of intermittent failures on Shorts, the `COBALT_*` default values on a real instance, and the exact format of the `classic` file name and the error codes, which come from Cobalt's documentation and code. If a version changes the file name, options show as "up to Np" with a notice.

## Responsible use

Downloading third-party videos can violate the terms of YouTube and Instagram and the copyright of the creator. Use this for your own or licensed content. For your own YouTube videos, YouTube Studio and Google Takeout are better options.
