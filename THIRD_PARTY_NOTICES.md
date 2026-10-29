# Third-party notices

OPTDOWNS is released under the MIT License (see `LICENSE`). It uses the following third-party software. None of it is copied into this repository: it is loaded at runtime.

## mux.js

- Project: https://github.com/videojs/mux.js
- Version: 6.3.0
- Copyright: Brightcove, Inc. and the Video.js contributors
- License: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
- Use: converts MPEG-TS segments to MP4 (fragmented MP4) inside the browser.
- How it is loaded: `@require https://unpkg.com/mux.js@6.3.0/dist/mux.js` in the userscript header, and `importScripts` from the same address inside the Web Worker.

## Services contacted at runtime

These are services, not bundled code. They are listed so you know what the script talks to.

| Service | Purpose | Data sent |
| --- | --- | --- |
| unpkg.com | Delivers mux.js | Standard request headers |
| Google favicon service (gstatic.com, google.com/s2/favicons) | Site logos | Site hostname |
| DuckDuckGo icons (icons.duckduckgo.com) | Site logos, fallback | Site hostname |
| Your Cloudflare Worker (optional) | Fallback download proxy | The link being downloaded |

## Trademarks

TikTok, Instagram, Cloudflare, Brightcove and other names are trademarks of their respective owners. This project is not affiliated with or endorsed by them.
