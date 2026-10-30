# YouTube support

OPTDOWNS can list and download YouTube videos and Shorts, with one condition: it goes through **your own** Worker and **your own** [Cobalt](https://github.com/imputnet/cobalt) instance. Nothing about YouTube runs without both.

## How it works

```
userscript --/yt/info--> Worker --oEmbed (title, thumbnail)-----------> YouTube (official)
                           |--Data API v3 (duration, optional)--------> Google (official)
                           '--one POST per quality--------------------> YOUR Cobalt instance
userscript --/yt/dl?t=...--> Worker --POST + tunnel stream------------> YOUR Cobalt instance
```

- Cobalt does **not** run on Cloudflare Workers, because it needs Node and ffmpeg. It lives on a server of yours, and the Worker is only the bridge.
- The Worker tests each quality against Cobalt and lists only the **confirmed** ones. Resolution and codec are read from the file name Cobalt returns, duplicates are dropped, and vertical Shorts use the shorter side (1080x1920 counts as 1080p).
- The download link is an **encrypted token** with the parameters. It is not the Cobalt tunnel, which expires in about 90 seconds, so Cobalt is asked again at download time.
- Nothing is invented. Without `YOUTUBE_API_KEY` there is no duration. A size is shown only when the source reports one: with `LINK_PROXY_YOUTUBE_SIZES = true` the Worker asks Cobalt for it, and a size without an exact Content-Length is marked as an estimate. Tunnels that remux often have no size, so progress shows the MB received without a total.

## Worker variables

| Variable | Type | Required | Use |
| --- | --- | --- | --- |
| `COBALT_API_URL` | variable | yes | Root of your instance's API (POST `/`), such as `https://cobalt.example.com/`. HTTPS on port 443. Without it YouTube is off, with a clear error. |
| `COBALT_API_KEY` | secret | if your instance requires it | Sent as `Authorization: Api-Key ...`. Never reaches the browser. |
| `YOUTUBE_API_KEY` | secret | no | YouTube Data API v3, only for the duration. |
| `TOKEN_KEY` (or `SECRET`) | secret | yes | Already used by the Worker. Encrypts the `/yt/dl` links. |
| `YT_QUALITIES` | variable | no | Default `2160:vp9,1440:vp9,1080,720,480,360`. Each tier costs one request to Cobalt per search, plus one for audio. Above 1080p YouTube only publishes VP9 or AV1 (WebM). |

```bash
npx wrangler secret put COBALT_API_KEY
npx wrangler secret put YOUTUBE_API_KEY
```

After deploying, open `https://YOUR-WORKER/yt/status?key=YOUR_SECRET`, or use the diagnostics tab of the script. It sends a real request to your instance and checks the version and whether the `youtube` service is enabled.

## Your Cobalt instance

Host your own by following `docs/run-an-instance.md` and `docs/protect-an-instance.md` in the Cobalt repository, and create an API key for the Worker.

The Cobalt documentation asks that instances hosted by others are **not** used by other projects without permission. That is why this repository does not embed any public or community instance.

YouTube often needs a session or cookies on the Cobalt server. That is configuration on its side: the Worker does not bypass logins or access controls. Cobalt's default rate limit can also be reached, since one search makes about 7 POSTs. Raise `RATE_LIMIT_MAX` on Cobalt or shorten `YT_QUALITIES`.

## Dependencies and licenses

- No new library in the userscript or the Worker for this feature.
- External services: your Cobalt instance (required), YouTube oEmbed (no key) and the YouTube Data API v3 (optional).
- Cobalt is used only through its HTTP API and is licensed under AGPL-3.0. If you modify and host Cobalt, the AGPL applies to your instance. Check the current license in its repository.

## Switches in the userscript

| Constant | Effect |
| --- | --- |
| `LINK_PROXY_YOUTUBE = false` | Turns YouTube off completely. The script never sends YouTube links to the Worker. |
| `LINK_PROXY_YOUTUBE_SIZES = true` | Asks Cobalt for each option's size while searching. More requests to Cobalt. |

## Limits and notes

- No playlists, live streams or content that requires a login. If Cobalt fails for YouTube, which happens because YouTube changes often, the Worker's message says what to update.
- Automatic detection of media inside youtube.com stays off. Paste the link in the **By link** tab.
- Files pass through browser memory, like every other download, so very large videos can fail on phones.
- The file-name format Cobalt returns and its error codes were implemented from Cobalt's documentation and code. If your version changes the file name, the options show as "up to Np" with a notice instead of inventing a resolution.
- The author's tests used a simulated Cobalt and a simulated YouTube, not live ones, so expect to adjust things on first use.

## Responsible use

Downloading videos from third parties can violate the YouTube Terms of Service and copyright. Use this for your own or licensed content. For your own videos, YouTube Studio and Google Takeout are better options.
