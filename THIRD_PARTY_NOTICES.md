# Third-party notices

OPTDOWNS is released under the MIT License (see `LICENSE`). It uses the following third-party software. None of it is copied into this repository. mux.js and lamejs are loaded at runtime, and Cobalt is an optional external service.

## mux.js

- Project: https://github.com/videojs/mux.js
- Version: 6.3.0
- Copyright: Brightcove, Inc. and the Video.js contributors
- License: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
- Use: converts MPEG-TS segments to MP4 (fragmented MP4) inside the browser.
- How it is loaded: `@require https://unpkg.com/mux.js@6.3.0/dist/mux.js` in the userscript header, and `importScripts` from the same address inside the Web Worker.

## lamejs

- Project: https://github.com/zhuker/lamejs
- Version: 1.2.1
- License: LGPL-3.0, as the project states (it is a port of the LAME MP3 encoder)
- Use: encodes MP3 files in the browser.
- How it is loaded: `@require https://unpkg.com/lamejs@1.2.1/lame.min.js` in the userscript header. It is not copied into this repository.

## Cobalt (optional)

- Project: https://github.com/imputnet/cobalt
- License: AGPL-3.0, as the project states
- Use: backend for YouTube downloads. The Worker only calls its HTTP API, on an instance that you host yourself.
- No Cobalt code is included here and no public instance is built in. If you modify and host Cobalt, the AGPL applies to your instance.

## Services contacted at runtime

These are services, not bundled code. They are listed so you know what the script talks to.

| Service | Purpose | Data sent |
| --- | --- | --- |
| unpkg.com | Delivers mux.js and lamejs | Standard request headers |
| Google favicon service (gstatic.com, google.com/s2/favicons) | Site logos | Site hostname |
| DuckDuckGo icons (icons.duckduckgo.com) | Site logos, fallback | Site hostname |
| Your Cloudflare Worker (optional) | Fallback download proxy and YouTube bridge | The link being downloaded |
| YouTube oEmbed and Data API (optional, through your Worker) | Title, thumbnail and duration of YouTube videos | The video link or id |
| Your Cobalt instance (optional, through your Worker) | YouTube files | The video link and chosen quality |

## Trademarks

TikTok, Instagram, Cloudflare, Brightcove and other names are trademarks of their respective owners. This project is not affiliated with or endorsed by them.
