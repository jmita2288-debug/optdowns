# Changelog

All notable changes to this project are listed here. The userscript version is the `@version` in `optdowns.user.js`. The Worker has no version shown to the user.

## 2.14.0

### Added
- YouTube in **On this page**. The tab identifies the open video from its URL (`/watch?v=`, `/shorts/`, `/live/`, `/embed/`) and uses the same flow as **By link**: same card, same quality picker, same download path. The result is shared between both tabs for 45 seconds, and the refresh button forces a new lookup.
- Instagram in **By link** through the Worker and your Cobalt instance: Reels, posts with video or photos, and carousels, with one card per item. If the Worker or Cobalt is unavailable, the anonymous public read from earlier versions is used.
- `LINK_PROXY_INSTAGRAM` and `LINK_PROXY_INSTAGRAM_ORDER` in the userscript.
- Worker routes `/ig/info` and `/ig/dl`, and `probe=1` on `/yt/dl` and `/ig/dl` to check an item without opening the tunnel.
- Worker variables `COBALT_CONCURRENCY`, `COBALT_GAP_MS`, `COBALT_RETRIES`, `COBALT_BACKOFF_MS` and `COBALT_COOLDOWN_MS`.
- 240p in the default `YT_QUALITIES`.
- Interface language: Portuguese (Brazil), English and Spanish, with a flag selector at the bottom of the panel.
- Error codes `COBALT_RATE_LIMIT`, `COBALT_UNAVAILABLE` and the `IG_*` family.

### Changed
- Fewer requests to Cobalt: at most two concurrent calls with a minimum gap, retries with backoff on 429, 502, 503 and 504 that honor `Retry-After`, a global pause after repeated 429, a 20-second cache for permanent failures, and adaptive probing that skips redundant qualities and returns a partial list if Cobalt starts limiting.
- One tunnel per download instead of three. The browser no longer makes a request that CORS would discard, and the tunnel resolved for the pre-check is reused for 45 seconds.
- YouTube and Instagram downloads no longer use `Range`, because the Cobalt tunnel does not serve it. The Worker answers 200 with the full file and `Accept-Ranges: none`.
- The userscript reads the Worker's JSON error and stops retrying on permanent errors.

### Fixed
- Received size is compared with `Content-Length`, and a mismatch is reported and retried instead of saving a truncated file.
- A WebM file is never renamed to MP4. If an option labeled MP4 receives `video/webm`, the extension is corrected and `x-optdowns-ext-corrected` is sent.
- The Short badge is kept when a Shorts URL is converted to a watch URL.

## 2.13.1

### Fixed
- "The received MP4 has no video track" on YouTube. The **On this page** scan read the player's `blob:` source and created a card from whatever the player was playing, such as a short ad. Nothing is registered on restricted platforms now, including `blob:`, and the tab offers a button that opens the Worker flow.
- A video request for which Cobalt returns only audio is dropped from the search and refused at download (`YT_AUDIO_ONLY`).

### Changed
- The Worker reuses the resolved tunnel for about 45 seconds, so the HEAD, the pre-check and the GET cost one POST to Cobalt.
- Worker and Cobalt errors for YouTube are read before downloading and shown with the real message.

## 2.13.0

### Added
- YouTube videos and Shorts in **By link**, through the Worker and your own Cobalt instance.
- Worker routes `/yt/info`, `/yt/dl` and `/yt/status`.
- Quality picker that lists only the options Cobalt confirmed (MP4, WebM and MP3).
- `LINK_PROXY_YOUTUBE` and `LINK_PROXY_YOUTUBE_SIZES`.

### Fixed
- Worker 502 `YT_ORIGIN_UNREACHABLE` on `/yt/info`. `redirect: 'error'` does not exist on Cloudflare Workers, so the Worker now uses `manual`, treats a 3xx from Cobalt as `COBALT_REDIRECT`, and validates `COBALT_API_KEY` without ever printing it.

## 2.12.0

### Added
- HD video, photo posts, ZIP of photos, audio and MP3 conversion for public links.

## 2.9.0

### Added
- Sites other than TikTok can use the Worker as a last resort, for hosts listed in `ALLOWED_HOSTS`.
