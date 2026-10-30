# OPTDOWNS Worker

An example Cloudflare Worker that works as an optional fallback for the OPTDOWNS userscript. Plain JavaScript, no dependencies, one file: [`worker.js`](worker.js).

**Português:** a tradução completa desta página está no final do arquivo.

## When you need it

The userscript downloads directly from the browser whenever it can. A Worker is useful when a CDN refuses direct requests from the browser, which happens a lot with TikTok links. Without any configuration the Worker only serves TikTok. Other sites have to be allow-listed. For YouTube, the Worker is the bridge to a Cobalt instance that you host, see [`../docs/YOUTUBE.md`](../docs/YOUTUBE.md).

This is meant to be **your own private deployment**. Do not share its address and do not run it as a public service.

## Deploy

### Option 1: Cloudflare dashboard

1. In the Cloudflare dashboard open **Workers & Pages** and create a new Worker. Give it a name such as `optdowns-proxy` and deploy the starter code.
2. Open the code editor, replace everything with the contents of `worker.js`, and deploy again.
3. Go to the Worker's **Settings**, then **Variables and Secrets**, and add the values from the table below. At minimum add `TOKEN_KEY`, a long random string.
4. Copy the `*.workers.dev` address of the Worker and paste it into `LINK_PROXY` in the userscript.
5. Open `https://YOUR-WORKER.workers.dev/diagnostico` on your phone to test it.

Menu names change from time to time, so look for the equivalent if something is labeled differently.

### Option 2: Wrangler

```toml
# wrangler.toml
name = "optdowns-proxy"
main = "worker.js"
compatibility_date = "2025-01-01"

[vars]
ALLOWED_HOSTS = "example.com"
```

```bash
npx wrangler login
npx wrangler secret put TOKEN_KEY
npx wrangler secret put SECRET      # optional
npx wrangler secret put COBALT_API_KEY    # only if your Cobalt instance asks for a key
npx wrangler secret put YOUTUBE_API_KEY   # optional, only for the video duration
npx wrangler deploy
```

Keep secrets out of `wrangler.toml` and out of git. The repository `.gitignore` already skips `.dev.vars` and `.env` files.

## Variables

All variables are optional. With none set, the Worker serves TikTok only.

| Name | Meaning |
| --- | --- |
| `SECRET` | Password required on `/dl` and `/info` as `?key=`. Put the same value in `LINK_PROXY_KEY` in the userscript. |
| `ALLOWED_HOSTS` | Comma-separated hostnames, such as `site1.com,site2.com`. Subdomains are included. `*` allows any public site, but only works when `SECRET` is also set. |
| `TOKEN_KEY` | Key used to encrypt the media tokens. Falls back to `SECRET`. Required for `/info`, HLS and any non-TikTok site. |
| `TOKEN_TTL` | Token lifetime in seconds. Default 7200, limited to 300 to 21600. |
| `MAX_BYTES` | Size limit for one MP4. Default 2 GiB. |
| `RATE_RESOLVE_PER_MIN` | Link resolutions per IP per minute. Default 30. |
| `RATE_MEDIA_PER_MIN` | Media requests per IP per minute. Default 1500. |
| `COBALT_API_URL` | Root of the API of **your** Cobalt instance, such as `https://cobalt.example.com/`. HTTPS on port 443. Without it, YouTube stays off. |
| `COBALT_API_KEY` | Secret. Sent as `Authorization: Api-Key ...` if your instance requires it. Never reaches the browser. |
| `YOUTUBE_API_KEY` | Secret. YouTube Data API v3 key, used only to show the duration. |
| `YT_QUALITIES` | Tiers tested for each search. Default `2160:vp9,1440:vp9,1080,720,480,360`. Each tier costs one request to Cobalt per search. |

Rate limits are best effort and apply per Worker instance.

## Routes

| Route | What it does |
| --- | --- |
| `GET /dl?url=<link>` | TikTok: streams the MP4. Allowed sites: streams the best MP4 found. Supports `Range` and `HEAD`. |
| `GET /dl?url=<tiktok>&part=video`, `image`, `audio` or `cover` | A specific part of a TikTok post: a video option (`&n=`, or `&q=sd` for the lightest), photo number `&i=`, the sound, or the cover. |
| `GET /tt?url=<tiktok>` | JSON with the post type (video or photo), video options (HD/SD), photos, audio and cover, with ready `/dl` URLs. |
| `GET /info?url=<link>` | Returns JSON with the candidates (MP4 and HLS) and token URLs for them. |
| `GET /hls/playlist.m3u8?t=<token>` | An HLS playlist rewritten so the segments pass through the Worker. |
| `GET /media/video`, `/media/segment`, `/media/key` with `?t=<token>` | Streams media that the Worker itself discovered and sealed into a token. |
| `GET /yt/info?url=<youtube>` | JSON with title, thumbnail, duration and the options (MP4, WebM, MP3) that your Cobalt instance confirmed. Needs `COBALT_API_URL`. |
| `GET /yt/dl?t=<token>` | Streams the chosen file. The token carries only the parameters, and Cobalt is asked at download time. |
| `GET /yt/status` | Real check of the YouTube setup: configuration plus a request to your Cobalt instance. |
| `GET /diagnostico` | A small HTML page that tests the Worker step by step. |
| `GET /dl?url=<link>&debug=1` | JSON report of each stage. Add `&probe=1` to also test the media from the server side. |

Every failure comes back as JSON with `error`, `code`, `stage`, `upstreamStatus`, `hint` and `requestId`. The stage is one of `auth`, `validate`, `page`, `parse` or `cdn`, and the HTTP status reflects the real cause (400, 401, 403, 404, 422, 429, 502, 504) instead of a generic 502.

## Security model

This Worker is built so it cannot be used as an open proxy:

- Pages from sites other than TikTok are read only if the host is in `ALLOWED_HOSTS`.
- Only `https` on port 443, with no credentials in the URL and a public hostname. IP addresses, `localhost` and internal suffixes are refused. The check is repeated on every redirect.
- `/hls` and `/media` only fetch URLs that the Worker found on the page or in the playlist and sealed into an AES-GCM token with an expiry. The client never sees the signed CDN URL or any cookie, and a tampered or expired token is rejected.
- Limits exist for page size, playlist size, segment size, key size, file size and number of URIs.
- DRM (SAMPLE-AES, Widevine, PlayReady, FairPlay) is refused. Only unencrypted HLS or AES-128 with a public key is accepted.
- It does not fake sessions or IPs. It sends a regular browser user agent, the site's own Referer and Origin, and only the cookies the site gave to the Worker.
- Logs contain only the stage, the status and the hostname. No cookies, tokens, query strings or signed URLs.
- API keys stay inside the Worker and are never sent to the browser. A Cobalt tunnel on an unexpected host is refused.

What it cannot do: `SECRET` lives inside the userscript on your device, so treat it as a light lock and not as strong authentication. Some platforms block Cloudflare IP ranges. When that happens the Worker reports `ORIGIN_BLOCKED` and does not try to work around it.

Keep `ALLOWED_HOSTS` short, avoid `*`, and keep the address private.

## Adding a site

Site support lives in the `EXTRACTORS` list inside `worker.js`. An extractor takes the page HTML and returns candidate media URLs. Keep new extractors limited to what the page already publishes.

---

<details>
<summary><b>Português</b></summary>

## Worker do OPTDOWNS

Um Cloudflare Worker de exemplo que funciona como alternativa opcional para o userscript OPTDOWNS. JavaScript puro, sem dependências, em um arquivo: [`worker.js`](worker.js).

### Quando você precisa dele

Para o YouTube, o Worker é a ponte até uma instância do Cobalt hospedada por você, veja [`../docs/YOUTUBE.pt-BR.md`](../docs/YOUTUBE.pt-BR.md).

O userscript baixa direto do navegador sempre que consegue. O Worker ajuda quando um CDN recusa requisições diretas do navegador, o que acontece bastante com links do TikTok. Sem nenhuma configuração, o Worker atende só o TikTok. Os outros sites precisam entrar em uma lista de permitidos.

Ele foi feito para ser **uma instalação sua e privada**. Não compartilhe o endereço e não rode como serviço público.

### Publicar

**Pelo painel da Cloudflare**

1. No painel da Cloudflare, abra **Workers & Pages** e crie um novo Worker. Dê um nome como `optdowns-proxy` e publique o código inicial.
2. Abra o editor de código, substitua tudo pelo conteúdo de `worker.js` e publique de novo.
3. Em **Settings**, depois **Variables and Secrets**, adicione os valores da tabela abaixo. No mínimo, adicione `TOKEN_KEY`, um texto longo e aleatório.
4. Copie o endereço `*.workers.dev` do Worker e cole em `LINK_PROXY` no userscript.
5. Abra `https://SEU-WORKER.workers.dev/diagnostico` no celular para testar.

Os nomes dos menus mudam de vez em quando, então procure o equivalente se algo estiver com outro rótulo.

**Pelo Wrangler**: use o `wrangler.toml` e os comandos da seção em inglês acima. Mantenha segredos fora do `wrangler.toml` e do git.

### Variáveis

Todas são opcionais. Sem nenhuma, o Worker atende só o TikTok.

| Nome | Significado |
| --- | --- |
| `SECRET` | Senha exigida em `/dl` e `/info` como `?key=`. Use o mesmo valor em `LINK_PROXY_KEY` no userscript. |
| `ALLOWED_HOSTS` | Hostnames separados por vírgula, como `site1.com,site2.com`. Subdomínios entram junto. `*` libera qualquer site público, mas só vale se `SECRET` também estiver definido. |
| `TOKEN_KEY` | Chave que cifra os tokens de mídia. Se faltar, usa `SECRET`. Obrigatória para `/info`, HLS e qualquer site que não seja o TikTok. |
| `TOKEN_TTL` | Validade do token em segundos. Padrão 7200, limitado de 300 a 21600. |
| `MAX_BYTES` | Limite de tamanho de um MP4. Padrão 2 GiB. |
| `RATE_RESOLVE_PER_MIN` | Resoluções de link por IP por minuto. Padrão 30. |
| `RATE_MEDIA_PER_MIN` | Requisições de mídia por IP por minuto. Padrão 1500. |
| `COBALT_API_URL` | Raiz da API da **sua** instância do Cobalt, como `https://cobalt.exemplo.com/`. HTTPS na porta 443. Sem ela, o YouTube fica desligado. |
| `COBALT_API_KEY` | Secret. Enviada como `Authorization: Api-Key ...` se a sua instância exigir. Nunca vai ao navegador. |
| `YOUTUBE_API_KEY` | Secret. Chave da YouTube Data API v3, usada só para mostrar a duração. |
| `YT_QUALITIES` | Camadas testadas a cada busca. Padrão `2160:vp9,1440:vp9,1080,720,480,360`. Cada camada custa uma requisição ao Cobalt por busca. |

Os limites por IP são de melhor esforço e valem por instância do Worker.

### Segurança

O Worker foi feito para não virar um proxy aberto: só lê sites da lista `ALLOWED_HOSTS` (fora o TikTok), só aceita `https` na porta 443 com host público e revalida a cada redirecionamento, só busca URLs que ele mesmo descobriu e selou em um token AES-GCM com validade, e recusa DRM. Ele não falsifica sessão nem IP, e os logs guardam só etapa, status e hostname.

O `SECRET` fica dentro do userscript, no seu aparelho, então vale como um cadeado leve e não como autenticação forte. Algumas plataformas bloqueiam os IPs da Cloudflare. Nesse caso o Worker informa `ORIGIN_BLOCKED` e não tenta contornar.

Mantenha `ALLOWED_HOSTS` curto, evite `*` e mantenha o endereço privado.

</details>
