// OPTDOWNS Worker: optional download proxy for the OPTDOWNS userscript.
// MIT License. See LICENSE. Setup and routes: worker/README.md

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
];
const PAGE_HOSTS = /(^|\.)tiktok\.com$/i;
const MEDIA_HOSTS = /(^|\.)(tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktokv\.com|tiktokv\.us|tiktokv\.eu|byteoversea\.com|muscdn\.com|ibytedtos\.com)$/i;
const MAX_REDIRECTS = 5;
const PAGE_TIMEOUT_MS = 12000;
const CDN_TIMEOUT_MS = 20000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'range, content-type',
  'access-control-expose-headers': 'content-disposition, content-length, content-range, accept-ranges, x-optdowns-quality, x-optdowns-stage',
  'access-control-max-age': '86400',
};

class ProxyError extends Error {
  constructor(status, code, stage, message, extra = {}) {
    super(message);
    this.status = status; this.code = code; this.stage = stage; this.extra = extra;
  }
}

const rid = () => Math.random().toString(36).slice(2, 10);
const hostOf = u => { try { return new URL(u).hostname; } catch { return '?'; } };
const log = (id, stage, info) => console.log(JSON.stringify({ rid: id, stage, ...info }));

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders } });
}

function errorResponse(err, id) {
  const status = err instanceof ProxyError ? err.status : 502;
  const body = {
    error: err.message || 'falha no proxy', code: err.code || 'INTERNAL', stage: err.stage || 'unknown',
    upstreamStatus: err.extra?.upstreamStatus ?? null, hint: err.extra?.hint || undefined, requestId: id, ...(err.extra?.details ? { details: err.extra.details } : {}),
  };
  const headers = { 'x-optdowns-stage': body.stage };
  if (err.extra?.retryAfter) headers['retry-after'] = String(err.extra.retryAfter);
  return json(status, body, headers);
}

function timeoutSignal(ms) { return AbortSignal.timeout(ms); }

function netError(e, stage, what, site = 'o TikTok') {
  if (e instanceof ProxyError) return e;
  const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
  return new ProxyError(timeout ? 504 : 502, timeout ? 'ORIGIN_TIMEOUT' : 'ORIGIN_UNREACHABLE', stage,
    timeout ? `${what}: ${site} não respondeu a tempo.` : `${what}: falha de rede ao contactar ${site}.`, { hint: 'Tente novamente em instantes.' });
}

function setCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const raw = res.headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,\s=]+=)/) : [];
}
function storeCookies(res, jar) {
  for (const line of setCookies(res)) {
    const [pair, ...attrs] = line.split(';'); const i = pair.indexOf('=');
    if (i <= 0) continue;
    const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
    const expired = attrs.some(a => /^\s*max-age\s*=\s*0\s*$/i.test(a)) || !value;
    if (expired) jar.delete(name); else jar.set(name, value);
  }
}
const cookieHeader = jar => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

async function fetchPage(startUrl, jar, ua, id, trace) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!PAGE_HOSTS.test(hostOf(current)) || new URL(current).protocol !== 'https:') {
      throw new ProxyError(400, 'REDIRECT_NOT_ALLOWED', 'page', 'O link redireciona para fora do TikTok.', { details: { host: hostOf(current) } });
    }
    let res;
    try {
      res = await fetch(current, { redirect: 'manual', signal: timeoutSignal(PAGE_TIMEOUT_MS), headers: {
        'user-agent': ua, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9', ...(jar.size ? { cookie: cookieHeader(jar) } : {}),
      } });
    } catch (e) { throw netError(e, 'page', 'Leitura da página'); }
    storeCookies(res, jar);
    trace.push({ stage: 'page', hop, host: hostOf(current), status: res.status, cookies: [...jar.keys()] });
    log(id, 'page', { hop, host: hostOf(current), status: res.status });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { try { await res.body?.cancel(); } catch {} current = new URL(loc, current).href; continue; }
    if (res.status === 404 || res.status === 410) throw new ProxyError(404, 'VIDEO_NOT_FOUND', 'page', 'Vídeo não encontrado (removido ou link inválido).', { upstreamStatus: res.status });
    if (res.status === 429) throw new ProxyError(429, 'ORIGIN_RATE_LIMIT', 'page', 'O TikTok limitou as requisições deste servidor.', { upstreamStatus: 429, retryAfter: Number(res.headers.get('retry-after')) || 30 });
    if (res.status === 401 || res.status === 403) throw new ProxyError(403, 'ORIGIN_BLOCKED', 'page', 'O TikTok bloqueou a leitura da página a partir deste servidor.', { upstreamStatus: res.status, hint: 'IP/ASN da Cloudflare pode estar bloqueado ou exigindo verificação.' });
    if (res.status >= 500) throw new ProxyError(502, 'ORIGIN_ERROR', 'page', 'O TikTok respondeu com erro ao ler a página.', { upstreamStatus: res.status });
    if (!res.ok) throw new ProxyError(502, 'ORIGIN_UNEXPECTED', 'page', `Resposta inesperada do TikTok (HTTP ${res.status}).`, { upstreamStatus: res.status });
    const html = await res.text();
    return { html, url: current };
  }
  throw new ProxyError(502, 'TOO_MANY_REDIRECTS', 'page', 'Redirecionamentos demais ao abrir o link.');
}

function extractJson(html) {
  for (const re of [
    /<script[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*\bid=["']SIGI_STATE["'][^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  ]) {
    const m = html.match(re);
    if (m) { try { return { data: JSON.parse(m[1]), source: re.source.match(/id=\[[^\]]*\]([A-Z_]+)/)?.[1] || re.source.slice(20, 50) }; } catch {} }
  }
  return null;
}

function urlList(x) {
  if (!x) return [];
  if (typeof x === 'string') return [x];
  if (Array.isArray(x)) return x.flatMap(urlList);
  return [...urlList(x.UrlList), ...urlList(x.urlList), ...urlList(x.url_list), ...urlList(x.url)];
}

function findItem(data, wantedId) {
  const scope = data?.__DEFAULT_SCOPE__?.['webapp.video-detail'];
  const direct = scope?.itemInfo?.itemStruct;
  if (direct && (!wantedId || String(direct.id) === wantedId)) return { item: direct, statusCode: scope?.statusCode };
  const mod = data?.ItemModule && (data.ItemModule[wantedId] || Object.values(data.ItemModule)[0]);
  if (mod) return { item: mod, statusCode: 0 };
  let found = null; const seen = new Set();
  (function walk(v, depth) {
    if (!v || typeof v !== 'object' || depth > 16 || found || seen.has(v)) return;
    seen.add(v);
    if ((v.video || v.imagePost) && (v.id || v.aweme_id) && (!wantedId || String(v.id || v.aweme_id) === wantedId)) { found = v; return; }
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  })(data, 0);
  return found ? { item: found, statusCode: scope?.statusCode } : { item: null, statusCode: scope?.statusCode };
}

function pickVideo(html, wantedId) {
  const parsed = extractJson(html);
  if (!parsed) return { error: 'NO_DATA_SCRIPT', markers: pageMarkers(html) };
  const { item, statusCode } = findItem(parsed.data, wantedId);
  if (!item) return { error: Number(statusCode) ? 'ITEM_UNAVAILABLE' : 'NO_ITEM', statusCode, markers: pageMarkers(html), source: parsed.source };
  if (item.imagePost && !item.video?.playAddr && !item.video?.bitrateInfo?.length) return { error: 'IMAGE_POST', source: parsed.source };
  const v = item.video || {}, cands = [];
  const add = (list, q, kind) => { for (const raw of urlList(list)) { const u = String(raw).replace(/^http:\/\//i, 'https://'); if (/^https:\/\//i.test(u)) cands.push({ url: u, q: Number(q) || 0, kind }); } };
  for (const r of (v.bitrateInfo || v.bit_rate || []).slice().sort((a, b) => (Number(b.Bitrate || b.bit_rate) || 0) - (Number(a.Bitrate || a.bit_rate) || 0))) {
    if (/bytevc2|h266|vvc/i.test(String(r.CodecType || r.codec_type || ''))) continue;
    add(r.PlayAddr || r.play_addr, r.Height || v.height, 'bitrate');
  }
  add(v.downloadAddr || v.download_addr, v.height, 'download');
  add(v.playAddr || v.play_addr, v.height, 'play');
  const seenUrl = new Set(), unique = cands.filter(c => !seenUrl.has(c.url) && seenUrl.add(c.url));
  if (!unique.length) return { error: 'NO_MEDIA_URLS', source: parsed.source, itemKeys: Object.keys(v).slice(0, 20) };
  return { id: String(item.id || item.aweme_id || wantedId || 'video'), candidates: unique, source: parsed.source };
}

function pageMarkers(html) {
  return { bytes: html.length, captcha: /captcha|verify|are you human|security check/i.test(html), login: /\/login|log in to tiktok/i.test(html.slice(0, 20000)),
    hasRehydration: html.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__'), hasSigi: html.includes('SIGI_STATE') };
}

async function fetchMedia(startUrl, jar, ua, rangeHeader, method, profile = 0) {
  let current = startUrl;
  for (let hop = 0; hop <= 3; hop++) {
    if (!MEDIA_HOSTS.test(hostOf(current)) || new URL(current).protocol !== 'https:') return { blocked: true, host: hostOf(current) };
    const headers = { 'user-agent': ua, referer: 'https://www.tiktok.com/', accept: '*/*', 'accept-encoding': 'identity' };
    if (profile === 0) headers.origin = 'https://www.tiktok.com';
    if (jar.size && profile < 2) headers.cookie = cookieHeader(jar);
    if (rangeHeader) headers.range = rangeHeader;
    const res = await fetch(current, { method, redirect: 'manual', headers, signal: timeoutSignal(CDN_TIMEOUT_MS) });
    storeCookies(res, jar);
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { try { await res.body?.cancel(); } catch {} current = new URL(loc, current).href; continue; }
    return { res, host: hostOf(current) };
  }
  return { tooManyRedirects: true, host: hostOf(current) };
}

const MAX_CDN_FETCHES = 16;
async function downloadFromCdn(video, jar, ua, req, id, trace, debug) {
  const attempts = []; let last = 0, fetches = 0;
  const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
  for (const cand of video.candidates) {
    for (let profile = 0; profile < 3 && fetches < MAX_CDN_FETCHES; profile++) {
      fetches++;
      let r;
      try { r = await fetchMedia(cand.url, jar, ua, req.headers.get('range'), method, profile); }
      catch (e) { attempts.push({ host: hostOf(cand.url), status: e?.name === 'TimeoutError' ? 'timeout' : 'network', profile }); log(id, 'cdn', { host: hostOf(cand.url), status: attempts.at(-1).status, profile }); continue; }
      if (r.blocked) { attempts.push({ host: r.host, status: 'host-not-allowed', profile }); break; }
      if (r.tooManyRedirects) { attempts.push({ host: r.host, status: 'redirects', profile }); break; }
      const { res } = r; last = res.status;
      const type = res.headers.get('content-type') || '';
      attempts.push({ host: r.host, status: res.status, type: type.split(';')[0], length: res.headers.get('content-length') || null, profile });
      log(id, 'cdn', { host: r.host, status: res.status, profile });
      const good = (res.status === 200 || res.status === 206) && !/text\/html|application\/json/i.test(type);
      if (res.status === 416) {
        return { response: new Response(null, { status: 416, headers: { ...CORS, 'content-range': res.headers.get('content-range') || '', 'x-optdowns-stage': 'cdn' } }), attempts };
      }
      if (good) {
        const out = new Headers(CORS);
        for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) if (res.headers.get(h)) out.set(h, res.headers.get(h));
        if (!/^video\/|octet-stream/i.test(out.get('content-type') || '')) out.set('content-type', 'video/mp4');
        if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes');
        out.set('content-disposition', `attachment; filename="tiktok-${video.id.replace(/[^\w-]/g, '')}.mp4"`);
        out.set('x-optdowns-quality', String(cand.q || 0)); out.set('x-optdowns-stage', 'cdn');
        out.set('cache-control', 'no-store');
        return { response: new Response(method === 'HEAD' ? null : res.body, { status: res.status, headers: out }), attempts };
      }
      try { await res.body?.cancel(); } catch {}
      if (!(res.status === 401 || res.status === 403 || res.status >= 500)) break;
    }
    if (fetches >= MAX_CDN_FETCHES) break;
  }
  const statuses = attempts.map(a => a.status);
  const only = s => statuses.length && statuses.every(x => x === s);
  const blocked = statuses.includes(403) || statuses.includes(401);
  const status = only(429) || statuses.includes(429) ? 429 : blocked ? 403 : statuses.includes('timeout') && !last ? 504 : 502;
  const gone = statuses.length > 0 && statuses.every(x => x === 404 || x === 410);
  const code = status === 429 ? 'CDN_RATE_LIMIT' : status === 403 ? 'CDN_REFUSED' : status === 504 ? 'CDN_TIMEOUT' : gone ? 'CDN_NOT_FOUND' : 'CDN_FAILED';
  throw new ProxyError(status, code, 'cdn', status === 403 ? 'O CDN do TikTok recusou o arquivo (403) mesmo com cookie e Referer.' : gone ? 'O CDN do TikTok respondeu 404/410 para todas as URLs de vídeo (arquivo expirado ou removido).' : 'Nenhuma URL de vídeo pôde ser baixada.',
    { upstreamStatus: last || null, details: { attempts }, hint: status === 403 ? 'URL assinada recusada para este IP; tente novamente (a URL é renovada a cada chamada) ou use outro caminho.' : undefined });
}

const PAGE_MAX_BYTES = 2 * 1024 * 1024;
const PLAYLIST_MAX_BYTES = 1024 * 1024;
const PLAYLIST_MAX_URIS = 4000;
const SEG_MAX_BYTES = 64 * 1024 * 1024;
const KEY_MAX_BYTES = 64 * 1024;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_TTL = 7200;
const GENERIC_MAX_REDIRECTS = 4;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov)(?:$|[?#])/i;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

function configOf(env) {
  const raw = String(env.ALLOWED_HOSTS || '').toLowerCase().split(/[\s,;]+/).map(x => x.replace(/^\*\./, '').replace(/^\./, '')).filter(Boolean);
  const wantsAny = raw.includes('*');
  return {
    hosts: raw.filter(x => x !== '*' && /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(x)),
    any: wantsAny && !!env.SECRET, anyIgnored: wantsAny && !env.SECRET,
    tokenKey: String(env.TOKEN_KEY || env.SECRET || ''),
    ttl: clamp(Number(env.TOKEN_TTL) || DEFAULT_TTL, 300, 21600),
    maxBytes: clamp(Number(env.MAX_BYTES) || DEFAULT_MAX_BYTES, 1024 * 1024, 4 * 1024 * 1024 * 1024),
    rateResolve: clamp(Number(env.RATE_RESOLVE_PER_MIN) || 30, 1, 600),
    rateMedia: clamp(Number(env.RATE_MEDIA_PER_MIN) || 1500, 10, 20000),
  };
}
const hostAllowed = (cfg, host) => cfg.any || cfg.hosts.some(d => host === d || host.endsWith('.' + d));

function isPublicHost(h) {
  h = String(h || '').toLowerCase().replace(/\.$/, '');
  if (!h || !h.includes('.') || h.includes(':') || h.startsWith('[')) return false;
  if (/^[\d.]+$/.test(h) || /^0x/i.test(h)) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/.test(h)) return false;
  return /^[a-z0-9._-]+$/.test(h);
}
function safeUrl(raw, base) {
  let u; try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== 'https:' || u.port || u.username || u.password || !isPublicHost(u.hostname)) return null;
  u.hash = ''; return u;
}
const siteOrigin = href => { try { return new URL(href).origin; } catch { return ''; } };

class Jar {
  constructor(entries = []) { this.e = new Map(); for (const x of entries) if (Array.isArray(x) && x.length >= 3) this.e.set(`${x[2]}|${x[0]}`, [String(x[0]), String(x[1]), String(x[2]), !!x[3]]); }
  store(res, host) {
    for (const line of setCookies(res)) {
      const [pair, ...attrs] = line.split(';'); const i = pair.indexOf('=');
      if (i <= 0) continue;
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
      let domain = ''; let expired = !value;
      for (const a of attrs) {
        const m = a.match(/^\s*([^=\s]+)\s*(?:=\s*(.*))?$/); if (!m) continue;
        const k = m[1].toLowerCase();
        if (k === 'domain') domain = String(m[2] || '').trim().toLowerCase().replace(/^\./, '');
        if (k === 'max-age' && Number(m[2]) <= 0) expired = true;
      }
      if (domain && !(host === domain || host.endsWith('.' + domain))) continue;
      const d = domain || host, key = `${d}|${name}`;
      if (expired) this.e.delete(key); else this.e.set(key, [name, value, d, !domain]);
    }
  }
  header(host) { return [...this.e.values()].filter(([, , d, only]) => only ? host === d : (host === d || host.endsWith('.' + d))).map(([n, v]) => `${n}=${v}`).join('; '); }
  entries() { const out = []; let size = 0; for (const x of this.e.values()) { size += x[0].length + x[1].length + x[2].length + 8; if (out.length >= 16 || x[1].length > 600 || size > 2400) continue; out.push(x); } return out; }
}

const KEY_CACHE = new Map();
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = str => { const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; };
async function aesKey(cfg) {
  if (!cfg.tokenKey) throw new ProxyError(503, 'NOT_CONFIGURED', 'validate', 'O Worker não tem TOKEN_KEY (nem SECRET) definido; o modo multi-site e HLS precisa de uma chave para cifrar os tokens.', { hint: 'No painel do Cloudflare: Settings > Variables > adicione TOKEN_KEY com um texto longo e aleatório.' });
  if (!KEY_CACHE.has(cfg.tokenKey)) {
    const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`optdowns-token-v1|${cfg.tokenKey}`));
    KEY_CACHE.set(cfg.tokenKey, await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
    if (KEY_CACHE.size > 4) KEY_CACHE.delete(KEY_CACHE.keys().next().value);
  }
  return KEY_CACHE.get(cfg.tokenKey);
}
async function seal(cfg, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(cfg), new TextEncoder().encode(JSON.stringify({ ...data, e: Math.floor(Date.now() / 1000) + cfg.ttl }))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64u(out);
}
async function unseal(cfg, token, kinds) {
  let data;
  try {
    const raw = unb64u(token);
    if (raw.length < 29) throw new Error('short');
    data = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await aesKey(cfg), raw.subarray(12))));
  } catch (e) {
    if (e instanceof ProxyError) throw e;
    throw new ProxyError(403, 'BAD_TOKEN', 'auth', 'Token inválido ou adulterado. Peça /info de novo.');
  }
  if (!data || Number(data.e) < Date.now() / 1000) throw new ProxyError(410, 'TOKEN_EXPIRED', 'auth', 'O token expirou. Peça /info de novo.');
  if (!kinds.includes(data.k) || !safeUrl(data.u)) throw new ProxyError(403, 'BAD_TOKEN', 'auth', 'Token inválido para esta rota.');
  return data;
}

const RATE = new Map();
function rateCheck(bucket, req, limit) {
  const ip = req.headers.get('cf-connecting-ip') || 'anon', now = Date.now(), key = `${bucket}|${ip}`;
  let e = RATE.get(key);
  if (!e || now - e.t > 60000) { e = { t: now, n: 0 }; RATE.set(key, e); }
  e.n++;
  if (RATE.size > 2000) for (const [k, v] of RATE) if (now - v.t > 60000) RATE.delete(k);
  if (e.n > limit) throw new ProxyError(429, 'RATE_LIMIT', 'validate', 'Muitas requisições deste IP. Aguarde um minuto.', { retryAfter: 30 });
}

async function upstreamFetch(startUrl, o) {
  let current = startUrl;
  for (let hop = 0; hop <= GENERIC_MAX_REDIRECTS; hop++) {
    const u = safeUrl(current);
    if (!u) throw new ProxyError(400, 'UNSAFE_URL', o.stage || 'cdn', 'Endereço recusado (precisa ser https, porta 443, host público).', { details: { host: hostOf(current) } });
    if (o.hostCheck && !o.hostCheck(u.hostname)) throw new ProxyError(400, 'REDIRECT_NOT_ALLOWED', o.stage || 'page', 'O link redireciona para um site que não está em ALLOWED_HOSTS.', { details: { host: u.hostname } });
    const headers = { 'user-agent': GENERIC_UA, accept: o.accept || '*/*', 'accept-language': 'en-US,en;q=0.9', 'accept-encoding': 'identity' };
    if (o.referer) { headers.referer = o.referer; headers.origin = siteOrigin(o.referer); }
    const cookie = o.jar?.header(u.hostname); if (cookie) headers.cookie = cookie;
    if (o.range) headers.range = o.range;
    const res = await fetch(u.href, { method: o.method || 'GET', redirect: 'manual', headers, signal: timeoutSignal(o.timeout || PAGE_TIMEOUT_MS) });
    o.jar?.store(res, u.hostname);
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) { try { await res.body?.cancel(); } catch {} current = new URL(loc, u).href; continue; }
    return { res, url: u.href, host: u.hostname };
  }
  throw new ProxyError(502, 'TOO_MANY_REDIRECTS', o.stage || 'page', 'Redirecionamentos demais.');
}
const GENERIC_UA = UA_LIST[0];

function mapUpstreamStatus(status, stage, siteHost) {
  if (status === 404 || status === 410) return new ProxyError(404, stage === 'page' ? 'VIDEO_NOT_FOUND' : 'CDN_NOT_FOUND', stage, `${siteHost} respondeu ${status}: arquivo removido ou expirado.`, { upstreamStatus: status });
  if (status === 429) return new ProxyError(429, 'ORIGIN_RATE_LIMIT', stage, `${siteHost} limitou as requisições deste servidor.`, { upstreamStatus: 429, retryAfter: 30 });
  if (status === 401 || status === 403) return new ProxyError(403, stage === 'page' ? 'ORIGIN_BLOCKED' : 'CDN_REFUSED', stage, `${siteHost} recusou o acesso (HTTP ${status}) a partir deste servidor.`, { upstreamStatus: status, hint: 'O site libera esta mídia só dentro do contexto do player (sessão, rede ou token ligado ao navegador). O Worker não tenta contornar isso: use "Nesta página".' });
  return new ProxyError(502, 'ORIGIN_ERROR', stage, `${siteHost} respondeu HTTP ${status}.`, { upstreamStatus: status });
}

async function readTextCapped(res, max, { truncate = false } = {}) {
  const reader = res.body?.getReader(); if (!reader) return { text: '', truncated: false };
  const dec = new TextDecoder('utf-8', { fatal: false }); let out = '', total = 0, truncated = false;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > max) { try { await reader.cancel(); } catch {} if (!truncate) throw new ProxyError(502, 'RESPONSE_TOO_LARGE', 'parse', 'Resposta maior que o limite permitido.'); truncated = true; break; }
    out += dec.decode(value, { stream: true });
  }
  return { text: out + dec.decode(), truncated };
}
function limitStream(body, max) {
  let n = 0;
  return body.pipeThrough(new TransformStream({ transform(chunk, ctl) { n += chunk.byteLength; if (n > max) { ctl.error(new Error('size-limit')); return; } ctl.enqueue(chunk); } }));
}

const unesc = s => String(s).replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&amp;/gi, '&').replace(/&#x2f;/gi, '/').replace(/&#38;/g, '&');
function attrsOf(tag) { const out = {}; for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? ''; return out; }
function kindOfUrl(url, type = '') {
  if (/\.m3u8(?:$|[?#])/i.test(url)) return 'hls';
  if (VIDEO_EXT.test(url)) return 'mp4';
  if (/mpegurl/i.test(type)) return 'hls';
  if (/^video\/(mp4|webm|x-m4v|quicktime)/i.test(type)) return 'mp4';
  return null;
}
function qualityHint(text) { const m = String(text).match(/(?:^|[^\d])(2160|1440|1080|720|480|360|240)(?:p\b|[_x/])/i); return m ? Number(m[1]) : 0; }

const EXTRACTORS = [
  { name: 'opengraph', run(html) {
    const out = []; let title = '';
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const a = attrsOf(tag), key = (a.property || a.name || '').toLowerCase(), val = unesc(a.content || '');
      if (key === 'og:title' && !title) title = val;
      if (['og:video', 'og:video:url', 'og:video:secure_url', 'twitter:player:stream'].includes(key)) out.push({ url: val, type: '' });
      if (key === 'og:video:type' && out.length) out[out.length - 1].type = val;
    }
    return { title, list: out.map(x => ({ ...x, src: 'og', q: 0 })) };
  } },
  { name: 'json-ld', run(html) {
    const out = []; let title = '';
    for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      let data; try { data = JSON.parse(m[1]); } catch { continue; }
      (function walk(v, d) { if (!v || typeof v !== 'object' || d > 6) return; if (Array.isArray(v)) return v.forEach(x => walk(x, d + 1));
        if (/VideoObject/i.test(String(v['@type'])) && v.contentUrl) { out.push({ url: String(v.contentUrl), type: '', src: 'ld', q: Number(v.height) || 0 }); if (!title && v.name) title = String(v.name); }
        for (const k of Object.keys(v)) walk(v[k], d + 1); })(data, 0);
    }
    return { title, list: out };
  } },
  { name: 'html5-video', run(html) {
    const out = [];
    for (const tag of html.match(/<(?:video|source)\b[^>]*>/gi) || []) { const a = attrsOf(tag); if (a.src) out.push({ url: unesc(a.src), type: a.type || '', src: 'tag', q: Number(a.res || a.height || a['data-res']) || qualityHint(a.title || a.label || '') }); }
    return { list: out };
  } },
  { name: 'media-definitions', run(html) {
    const out = [], text = unesc(html);
    for (const m of text.matchAll(/"videoUrl"\s*:\s*"(https?:[^"]+)"/g)) {
      const from = text.lastIndexOf('{', m.index), to = text.indexOf('}', m.index + m[0].length);
      const win = text.slice(from >= 0 && m.index - from < 600 ? from : Math.max(0, m.index - 150), to >= 0 && to - m.index < 600 ? to + 1 : m.index + m[0].length + 150);
      const q = win.match(/"quality"\s*:\s*"?(\d{3,4})/)?.[1], f = win.match(/"format"\s*:\s*"([a-z0-9]+)"/i)?.[1] || '';
      out.push({ url: m[1], type: /hls/i.test(f) ? 'application/vnd.apple.mpegurl' : '', src: 'defs', q: Number(q) || qualityHint(m[1]) });
    }
    for (const m of text.matchAll(/"(?:quality_|video_url_|src_)?(\d{3,4})p?"\s*:\s*"(https?:[^"]+\.(?:mp4|m3u8)[^"]*)"/g)) out.push({ url: m[2], type: '', src: 'defs', q: Number(m[1]) || 0 });
    return { list: out };
  } },
  { name: 'plain-urls', run(html) {
    const out = [], text = unesc(html);
    for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\()]+?\.(?:m3u8|mp4|webm|m4v|mov)(?:\?[^\s"'<>\\]*)?/gi)) { out.push({ url: m[0], type: '', src: 'url', q: qualityHint(m[0]) }); if (out.length >= 200) break; }
    return { list: out };
  } },
];
const PREVIEW_URL = /(preview|trailer|teaser|sample|promo|\/ads?[/_.-]|thumb|sprite|storyboard)/i;

function extractCandidates(html, baseUrl) {
  const seen = new Map(); let title = ''; const sources = new Set();
  for (const ex of EXTRACTORS) {
    let r; try { r = ex.run(html, baseUrl); } catch { continue; }
    if (r.title && !title) title = r.title;
    for (const c of r.list || []) {
      const u = safeUrl(unesc(c.url).replace(/^http:\/\//i, 'https://'), baseUrl); if (!u) continue;
      const kind = kindOfUrl(u.href, c.type); if (!kind) continue;
      const cand = { url: u.href, kind, q: Number(c.q) || qualityHint(u.pathname), src: c.src, preview: PREVIEW_URL.test(u.pathname) };
      const prev = seen.get(cand.url);
      if (!prev || cand.q > prev.q) seen.set(cand.url, cand);
      sources.add(ex.name);
    }
  }
  if (!title) title = unesc((html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] || '').trim());
  const list = [...seen.values()].sort((a, b) => (a.preview - b.preview) || ((a.kind === 'mp4' ? 0 : 1) - (b.kind === 'mp4' ? 0 : 1)) || (b.q - a.q));
  return { title, candidates: list.slice(0, 24), sources: [...sources] };
}

async function resolveGeneric(cfg, target, id, trace) {
  const jar = new Jar(), allowed = h => hostAllowed(cfg, h), site = target.hostname;
  const referer = `${target.origin}/`;
  const byExt = kindOfUrl(target.pathname);
  if (byExt) {
    trace.push({ stage: 'page', host: site, status: 'direct-link' });
    return { adapter: 'direct', id: slugId(target.pathname), title: titleFromPath(target.pathname), candidates: [{ url: target.href, kind: byExt, q: qualityHint(target.pathname), src: 'link', preview: false }], jar, referer, sources: ['link'] };
  }
  let page;
  try { page = await upstreamFetch(target.href, { jar, hostCheck: allowed, stage: 'page', accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }); }
  catch (e) { throw netError(e, 'page', 'Leitura da página', 'o site'); }
  const { res } = page;
  trace.push({ stage: 'page', host: page.host, status: res.status, cookies: jar.entries().length });
  log(id, 'page', { host: page.host, status: res.status });
  if (!res.ok) { try { await res.body?.cancel(); } catch {} throw mapUpstreamStatus(res.status, 'page', page.host); }
  const type = res.headers.get('content-type') || '';
  const kind = kindOfUrl(page.url, type);
  if (kind && !/text\/html/i.test(type)) { try { await res.body?.cancel(); } catch {} return { adapter: 'direct', id: slugId(new URL(page.url).pathname), title: titleFromPath(new URL(page.url).pathname), candidates: [{ url: page.url, kind, q: 0, src: 'link', preview: false }], jar, referer, sources: ['content-type'] }; }
  const { text, truncated } = await readTextCapped(res, PAGE_MAX_BYTES, { truncate: true });
  if (/^\s*#EXTM3U/.test(text)) return { adapter: 'direct', id: slugId(new URL(page.url).pathname), title: titleFromPath(new URL(page.url).pathname), candidates: [{ url: page.url, kind: 'hls', q: 0, src: 'link', preview: false }], jar, referer, sources: ['playlist'] };
  const found = extractCandidates(text, page.url);
  const markers = { bytes: text.length, truncated, captcha: /captcha|are you human|security check|cf-chl/i.test(text.slice(0, 40000)) };
  trace.push({ stage: 'parse', adapter: 'page', ...markers, candidates: found.candidates.length, sources: found.sources, result: found.candidates.length ? 'ok' : 'NO_MEDIA_URLS' });
  log(id, 'parse', { candidates: found.candidates.length });
  if (!found.candidates.length) throw new ProxyError(markers.captcha ? 502 : 422, markers.captcha ? 'ORIGIN_CHALLENGE' : 'NO_MEDIA_URLS', 'parse',
    markers.captcha ? 'O site devolveu uma verificação anti-robô em vez da página.' : 'A página não publica nenhum arquivo ou playlist de vídeo acessível (o player pode montar a URL por script, exigir login ou usar DRM).', { details: markers });
  return { adapter: 'page', id: slugId(new URL(page.url).pathname), title: found.title, candidates: found.candidates, jar, referer: `${new URL(page.url).origin}/`, sources: found.sources };
}
const slugId = p => (String(p).split('/').filter(Boolean).pop() || 'video').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w-]+/g, '').slice(0, 40) || 'video';
const titleFromPath = p => decodeURIComponent(String(p).split('/').filter(Boolean).pop() || '').replace(/\.[a-z0-9]+$/i, '').slice(0, 120);

const BAD_MEDIA_TYPE = /text\/html|application\/(json|xhtml|xml)|text\/xml/i;
async function streamUpstream(cfg, p, req, id, kind) {
  const jar = new Jar(p.j || []), method = req.method === 'HEAD' ? 'HEAD' : 'GET';
  const max = kind === 'key' ? KEY_MAX_BYTES : kind === 'seg' ? SEG_MAX_BYTES : cfg.maxBytes;
  let r;
  try { r = await upstreamFetch(p.u, { jar, referer: p.r, range: kind === 'key' ? '' : req.headers.get('range') || '', method, timeout: CDN_TIMEOUT_MS, stage: 'cdn' }); }
  catch (e) { throw netError(e, 'cdn', 'Download da mídia', 'o servidor de vídeo'); }
  const { res, host } = r, type = res.headers.get('content-type') || '';
  log(id, 'cdn', { host, status: res.status, kind });
  if (res.status === 416) return new Response(null, { status: 416, headers: { ...CORS, 'content-range': res.headers.get('content-range') || '', 'x-optdowns-stage': 'cdn' } });
  if (res.status !== 200 && res.status !== 206) { try { await res.body?.cancel(); } catch {} throw mapUpstreamStatus(res.status, 'cdn', host); }
  const len = Number(res.headers.get('content-length')) || 0;
  const badType = BAD_MEDIA_TYPE.test(type) || (kind === 'mp4' && !/^video\/|octet-stream|application\/mp4/i.test(type));
  if (badType) { try { await res.body?.cancel(); } catch {} throw new ProxyError(502, 'NOT_MEDIA', 'cdn', `O servidor respondeu "${type.split(';')[0] || 'sem tipo'}" em vez de mídia.`, { upstreamStatus: res.status, details: { host, type: type.split(';')[0] } }); }
  if (len > max) { try { await res.body?.cancel(); } catch {} throw new ProxyError(413, 'TOO_LARGE', 'cdn', 'O arquivo excede o limite configurado no Worker.', { details: { limit: max } }); }
  const out = new Headers(CORS);
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) if (res.headers.get(h)) out.set(h, res.headers.get(h));
  if (kind === 'mp4') { out.set('content-disposition', `attachment; filename="${(p.n || 'video').replace(/[^\w.-]/g, '')}.${/webm/i.test(type) ? 'webm' : 'mp4'}"`); if (!out.has('accept-ranges')) out.set('accept-ranges', 'bytes'); }
  out.set('x-content-type-options', 'nosniff'); out.set('x-optdowns-stage', 'cdn'); out.set('cache-control', 'no-store');
  return new Response(method === 'HEAD' || !res.body ? null : limitStream(res.body, max), { status: res.status, headers: out });
}

const parseAttrList = s => { const o = {}; for (const m of String(s).matchAll(/([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g)) o[m[1]] = m[3] ?? m[2]; return o; };
const drm = (why) => new ProxyError(422, 'DRM_PROTECTED', 'parse', `Esta transmissão usa proteção (${why}). O Worker não baixa conteúdo com DRM.`, { details: { reason: why } });

async function rewritePlaylist(cfg, text, baseUrl, token, workerOrigin) {
  if (!/^\s*#EXTM3U/.test(text)) throw new ProxyError(502, 'NOT_A_PLAYLIST', 'parse', 'A resposta não é uma playlist HLS.');
  const lines = text.split(/\r?\n/), out = []; let uris = 0, nextVariant = false;
  const child = async (raw, kind) => {
    const u = safeUrl(String(raw).replace(/^http:\/\//i, 'https://'), baseUrl);
    if (!u) throw new ProxyError(400, 'UNSAFE_URL', 'parse', 'A playlist referencia um endereço recusado (precisa ser https, porta 443, host público).', { details: { host: hostOf(raw) } });
    if (++uris > PLAYLIST_MAX_URIS) throw new ProxyError(413, 'PLAYLIST_TOO_LARGE', 'parse', 'A playlist tem segmentos demais para o limite do Worker.');
    const t = await seal(cfg, { u: u.href, k: kind === 'hls' ? 'hls' : kind === 'key' ? 'key' : 'seg', r: token.r, j: token.j });
    return `${workerOrigin}${kind === 'hls' ? '/hls/playlist.m3u8' : kind === 'key' ? '/media/key' : '/media/segment'}?t=${t}`;
  };
  for (const line of lines) {
    const l = line.trim();
    if (!l) { out.push(line); continue; }
    if (l.startsWith('#')) {
      const tag = l.slice(0, l.indexOf(':') > 0 ? l.indexOf(':') : l.length);
      if (/^#EXT-X-(PART|PRELOAD-HINT|RENDITION-REPORT|SESSION-DATA)$/.test(tag)) continue;
      if (tag === '#EXT-X-SESSION-KEY') continue;
      if (tag === '#EXT-X-STREAM-INF') { nextVariant = true; out.push(line); continue; }
      if (tag === '#EXT-X-KEY') {
        const a = parseAttrList(l.slice(tag.length + 1)), method = (a.METHOD || 'NONE').toUpperCase();
        if (method === 'NONE') { out.push(line); continue; }
        if (method !== 'AES-128') throw drm(`METHOD=${method}`);
        if (a.KEYFORMAT && a.KEYFORMAT.toLowerCase() !== 'identity') throw drm(`KEYFORMAT=${a.KEYFORMAT}`);
        if (!a.URI || /^(skd|data|urn):/i.test(a.URI)) throw drm('chave sem URI https');
        const keyUrl = await child(a.URI, 'key');
        out.push(l.replace(/URI="[^"]*"/, () => `URI="${keyUrl}"`));
        continue;
      }
      if (/^#EXT-X-(MAP|MEDIA|I-FRAME-STREAM-INF)$/.test(tag) && /URI="([^"]*)"/.test(l)) {
        const m = l.match(/URI="([^"]*)"/), kind = tag === '#EXT-X-MAP' ? 'seg' : 'hls';
        const childUrl = await child(m[1], kind);
        out.push(l.replace(m[0], () => `URI="${childUrl}"`)); continue;
      }
      out.push(line); continue;
    }
    out.push(await child(l, nextVariant ? 'hls' : 'seg')); nextVariant = false;
  }
  return out.join('\n');
}

async function playlistRoute(cfg, req, u, id) {
  const p = await unseal(cfg, u.searchParams.get('t') || '', ['hls']);
  const jar = new Jar(p.j || []);
  let r;
  try { r = await upstreamFetch(p.u, { jar, referer: p.r, timeout: CDN_TIMEOUT_MS, stage: 'cdn', accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*' }); }
  catch (e) { throw netError(e, 'cdn', 'Leitura da playlist', 'o servidor de vídeo'); }
  log(id, 'hls', { host: r.host, status: r.res.status });
  if (!r.res.ok) { try { await r.res.body?.cancel(); } catch {} throw mapUpstreamStatus(r.res.status, 'cdn', r.host); }
  const { text } = await readTextCapped(r.res, PLAYLIST_MAX_BYTES);
  const body = await rewritePlaylist(cfg, text, r.url, { r: p.r, j: jar.entries() }, u.origin);
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { ...CORS, 'content-type': 'application/vnd.apple.mpegurl; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-optdowns-stage': 'cdn' } });
}

async function probeCandidates(cfg, resolved, id) {
  const out = [], probeOne = async (role, url) => {
    try {
      const jar = new Jar(resolved.jar.entries());
      const r = await upstreamFetch(url, { jar, referer: resolved.referer, range: 'bytes=0-0', timeout: 8000, stage: 'cdn' });
      const type = (r.res.headers.get('content-type') || '').split(';')[0];
      out.push({ role, host: r.host, status: r.res.status, type, length: r.res.headers.get('content-length') || null });
      let text = ''; if (role.startsWith('playlist')) text = (await readTextCapped(r.res, PLAYLIST_MAX_BYTES, { truncate: true })).text; else { try { await r.res.body?.cancel(); } catch {} }
      return { r, text };
    } catch (e) { out.push({ role, host: hostOf(url), status: e?.code || e?.name || 'erro' }); return null; }
  };
  const mp4 = resolved.candidates.find(c => c.kind === 'mp4'), hls = resolved.candidates.find(c => c.kind === 'hls');
  if (mp4) await probeOne('mp4', mp4.url);
  if (hls) {
    const jar = new Jar(resolved.jar.entries());
    try {
      let cur = await upstreamFetch(hls.url, { jar, referer: resolved.referer, timeout: 8000, stage: 'cdn' });
      let { text } = await readTextCapped(cur.res, PLAYLIST_MAX_BYTES, { truncate: true });
      out.push({ role: 'playlist-master', host: cur.host, status: cur.res.status, type: (cur.res.headers.get('content-type') || '').split(';')[0] });
      if (cur.res.ok && /#EXT-X-STREAM-INF/.test(text)) {
        const next = text.split(/\r?\n/).find((l, i, a) => l && !l.startsWith('#') && /#EXT-X-STREAM-INF/.test(a[i - 1] || ''));
        const nu = next && safeUrl(next, cur.url);
        if (nu) { cur = await upstreamFetch(nu.href, { jar, referer: resolved.referer, timeout: 8000, stage: 'cdn' }); text = (await readTextCapped(cur.res, PLAYLIST_MAX_BYTES, { truncate: true })).text; out.push({ role: 'playlist-media', host: cur.host, status: cur.res.status }); }
      }
      const segs = text.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => safeUrl(l, cur.url)?.href).filter(Boolean);
      if (segs.length) { await probeOne('segment-first', segs[0]); if (segs.length > 2) await probeOne('segment-middle', segs[segs.length >> 1]); if (segs.length > 1) await probeOne('segment-last', segs[segs.length - 1]); }
      else out.push({ role: 'segments', status: 'nenhum segmento na playlist' });
    } catch (e) { out.push({ role: 'playlist', status: e?.code || e?.name || 'erro' }); }
  }
  log(id, 'probe', { n: out.length });
  return out;
}

function publicCandidates(resolved) { return resolved.candidates.map(c => ({ kind: c.kind, quality: c.q || null, preview: c.preview || undefined, source: c.src })); }

async function handleGeneric(cfg, req, u, target, id, trace, mode) {
  rateCheck('resolve', req, cfg.rateResolve);
  const resolved = await resolveGeneric(cfg, target, id, trace);
  const mp4s = resolved.candidates.filter(c => c.kind === 'mp4'), hlss = resolved.candidates.filter(c => c.kind === 'hls');
  if (mode === 'debug') {
    const probe = u.searchParams.get('probe') === '1' ? await probeCandidates(cfg, resolved, id) : undefined;
    return json(200, { ok: true, requestId: id, adapter: resolved.adapter, sources: resolved.sources, candidates: publicCandidates(resolved), trace, probe, cdn: probe, note: 'Sem cookies/URLs assinadas por segurança. Adicione &probe=1 para testar a mídia a partir deste servidor.' });
  }
  const mint = (c, k) => seal(cfg, { u: c.url, k, r: resolved.referer, j: resolved.jar.entries(), n: `video-${resolved.id}` });
  if (mode === 'info') {
    const cands = [];
    for (const c of [...mp4s.slice(0, 8), ...hlss.slice(0, 4)]) cands.push({ kind: c.kind, quality: c.q || null, preview: c.preview || undefined, url: `${u.origin}${c.kind === 'hls' ? '/hls/playlist.m3u8' : '/media/video'}?t=${await mint(c, c.kind === 'hls' ? 'hls' : 'mp4')}` });
    return json(200, { ok: true, requestId: id, adapter: resolved.adapter, id: resolved.id, title: resolved.title || '', expiresIn: cfg.ttl, candidates: cands });
  }
  const best = mp4s.find(c => !c.preview) || mp4s[0];
  if (!best) throw new ProxyError(409, 'HLS_ONLY', 'cdn', 'O site só publica HLS (playlist). Use /info e baixe os segmentos por /hls.', { details: { hls: hlss.length } });
  return streamUpstream(cfg, { u: best.url, r: resolved.referer, j: resolved.jar.entries(), n: `video-${resolved.id}` }, req, id, 'mp4');
}

function diagnosticPage(req) {
  return new Response(req.method === 'HEAD' ? null : DIAG_HTML, { status: 200, headers: {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  } });
}

async function handleTiktok(req, target, id, trace, debug) {
  const PAGE_RETRY = ['ORIGIN_BLOCKED', 'NO_PAGE_DATA', 'ORIGIN_CHALLENGE', 'ORIGIN_ERROR', 'ORIGIN_TIMEOUT', 'ORIGIN_UNREACHABLE'];
  const CDN_RETRY = ['CDN_REFUSED', 'CDN_FAILED', 'CDN_TIMEOUT'];
  let lastErr = null;
  for (let i = 0; i < UA_LIST.length; i++) {
    const ua = UA_LIST[i], jar = new Map();
    try {
      const page = await fetchPage(target.href, jar, ua, id, trace);
      const wantedId = page.url.match(/\/(?:video|photo)\/(\d+)/)?.[1] || target.pathname.match(/\/(?:video)\/(\d+)/)?.[1] || '';
      const picked = pickVideo(page.html, wantedId);
      const pageInfo = { finalHost: hostOf(page.url), hasVideoId: !!wantedId, ...(picked.markers || {}), source: picked.source };
      trace.push({ stage: 'parse', ...pageInfo, result: picked.error || 'ok', statusCode: picked.statusCode, candidates: picked.candidates?.length });
      log(id, 'parse', { result: picked.error || 'ok', candidates: picked.candidates?.length || 0 });
      if (picked.error) {
        const map = {
          ITEM_UNAVAILABLE: [404, 'VIDEO_UNAVAILABLE', 'O vídeo está indisponível (privado, removido ou restrito).'],
          IMAGE_POST: [422, 'UNSUPPORTED_POST', 'O link é uma publicação de fotos, não um vídeo.'],
          NO_MEDIA_URLS: [502, 'NO_MEDIA_URLS', 'A página não trouxe URLs de vídeo (estrutura do TikTok mudou?).'],
          NO_DATA_SCRIPT: [502, picked.markers?.captcha ? 'ORIGIN_CHALLENGE' : 'NO_PAGE_DATA', picked.markers?.captcha ? 'O TikTok devolveu uma verificação (captcha) em vez do vídeo.' : 'A página não contém os dados do vídeo (bloqueio ou estrutura nova).'],
          NO_ITEM: [502, 'NO_PAGE_DATA', 'Os dados da página não contêm este vídeo.'],
        }[picked.error];
        throw new ProxyError(map[0], map[1], 'parse', map[2], { details: { statusCode: picked.statusCode, ...(picked.markers || {}), itemKeys: picked.itemKeys } });
      }
      const out = await downloadFromCdn(picked, jar, ua, req, id, trace, debug);
      if (debug) { try { await out.response.body?.cancel(); } catch {} }
      if (debug) return json(200, { ok: true, requestId: id, adapter: 'tiktok', uaIndex: i, candidates: picked.candidates.map(c => ({ host: hostOf(c.url), q: c.q, kind: c.kind })), trace, cdn: out.attempts, page: pageInfo, note: 'Sem cookies/URLs assinadas por segurança.' });
      return out.response;
    } catch (e) {
      const err = e instanceof ProxyError ? e : netError(e, 'internal', 'Erro interno');
      lastErr = err;
      trace.push({ stage: 'retry', uaIndex: i, code: err.code, status: err.status });
      if (!(PAGE_RETRY.includes(err.code) || CDN_RETRY.includes(err.code))) throw err;
    }
  }
  throw lastErr;
}

export default {
  async fetch(req, env = {}) {
    const id = rid(), u = new URL(req.url), cfg = configOf(env);
    if (req.method === 'OPTIONS') {
      const asked = req.headers.get('access-control-request-headers');
      return new Response(null, { status: 204, headers: { ...CORS, ...(asked ? { 'access-control-allow-headers': asked } : {}) } });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return errorResponse(new ProxyError(405, 'METHOD', 'validate', 'Use GET.'), id);
    if (u.pathname === '/diagnostico' || u.pathname === '/diagnostico/') return diagnosticPage(req);
    const route = u.pathname.replace(/\/+$/, '');
    const trace = [], debug = u.searchParams.get('debug') === '1';
    try {
      if (route === '/hls/playlist.m3u8') { rateCheck('resolve', req, cfg.rateResolve * 40); return await playlistRoute(cfg, req, u, id); }
      if (route === '/media/video' || route === '/media/segment' || route === '/media/key') {
        rateCheck('media', req, cfg.rateMedia);
        const kind = route === '/media/video' ? 'mp4' : route === '/media/segment' ? 'seg' : 'key';
        return await streamUpstream(cfg, await unseal(cfg, u.searchParams.get('t') || '', [kind]), req, id, kind);
      }
      if (route !== '/dl' && route !== '/info') throw new ProxyError(404, 'NO_ROUTE', 'validate', 'Use /dl?url=<link> ou /info?url=<link>.');
      if (env.SECRET && u.searchParams.get('key') !== env.SECRET) throw new ProxyError(401, 'BAD_KEY', 'auth', 'Chave inválida ou ausente.');
      let target;
      try { target = new URL(u.searchParams.get('url') || ''); } catch { throw new ProxyError(400, 'BAD_URL', 'validate', 'Parâmetro url ausente ou inválido.'); }
      if (target.protocol !== 'https:') throw new ProxyError(400, 'BAD_URL', 'validate', 'Só links https.');
      if (PAGE_HOSTS.test(target.hostname)) {
        if (route === '/info') return json(200, { ok: true, requestId: id, adapter: 'tiktok', candidates: [{ kind: 'mp4', url: `${u.origin}/dl?url=${encodeURIComponent(target.href)}`, needsKey: !!env.SECRET }] });
        return await handleTiktok(req, target, id, trace, debug);
      }
      if (!hostAllowed(cfg, target.hostname) || !safeUrl(target.href)) {
        throw new ProxyError(400, 'HOST_NOT_ALLOWED', 'validate', cfg.hosts.length || cfg.any
          ? 'Este site não está em ALLOWED_HOSTS deste Worker.'
          : cfg.anyIgnored ? 'ALLOWED_HOSTS="*" só vale quando SECRET também está definido.' : 'Este Worker aceita só TikTok. Para outros sites, defina ALLOWED_HOSTS (ver instruções).', { details: { host: target.hostname } });
      }
      if (route === '/info') await aesKey(cfg);
      return await handleGeneric(cfg, req, u, target, id, trace, route === '/info' ? 'info' : debug ? 'debug' : 'dl');
    } catch (e) {
      const err = e instanceof ProxyError ? e : netError(e, 'internal', 'Erro interno');
      log(id, err.stage, { code: err.code, status: err.status, upstream: err.extra?.upstreamStatus ?? null });
      if (debug) return json(err.status, { ok: false, requestId: id, error: err.message, code: err.code, stage: err.stage, upstreamStatus: err.extra?.upstreamStatus ?? null, hint: err.extra?.hint, details: err.extra?.details, trace });
      return errorResponse(err, id);
    }
  },
};

const DIAG_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Diagnóstico do Worker OPTDOWNS</title>
<style>
  :root {
    --bg: #f2f4f7; --card: #ffffff; --ink: #14202b; --ink2: #4b5a69; --line: #d8dee5;
    --accent: #0a6cff; --accent-ink: #ffffff; --field: #eaeef3;
    --ok: #0b7a3b; --ok-bg: #e0f3e8; --bad: #b3261e; --bad-bg: #fbe6e4; --skip: #5d6b79; --skip-bg: #e7ebef; --warn: #8a5a00; --warn-bg: #fdf0d2;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --bg: #0e151c; --card: #17212b; --ink: #e8eef4; --ink2: #9fb0c0; --line: #2a3846; --accent: #4c9aff; --accent-ink: #06121f; --field: #0f1922;
    --ok: #62d68f; --ok-bg: #123322; --bad: #ff8a80; --bad-bg: #3b1714; --skip: #9fb0c0; --skip-bg: #1f2a35; --warn: #f2c14e; --warn-bg: #352a0b; color-scheme: dark; } }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    padding-block: max(16px, env(safe-area-inset-top, 0px)) max(32px, env(safe-area-inset-bottom, 0px));
    padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  main { max-width: 640px; margin: 0 auto; display: grid; gap: 14px; }
  h1 { font-size: 22px; line-height: 1.2; margin: 4px 0 0; text-wrap: balance; }
  .lead { margin: 0; color: var(--ink2); font-size: 15px; }
  .panel { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; display: grid; gap: 12px; min-width: 0; }
  label { display: grid; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ink2); letter-spacing: .02em; text-transform: uppercase; }
  .row { display: flex; gap: 8px; min-width: 0; }
  input[type=text], input[type=url], input[type=password] { flex: 1; min-width: 0; height: 48px; padding: 0 12px; font: 16px/1 var(--mono); color: var(--ink); background: var(--field);
    border: 1px solid var(--line); border-radius: 10px; -webkit-appearance: none; appearance: none; text-transform: none; letter-spacing: 0; font-weight: 400; }
  input:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
  button { font: 600 16px/1 inherit; height: 48px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--line); background: var(--field); color: var(--ink); cursor: pointer; touch-action: manipulation; }
  button.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; width: 100%; font-size: 17px; }
  button:disabled { opacity: .55; }
  .hint { margin: 0; font-size: 13px; color: var(--ink2); }
  .verdict { border-radius: 14px; padding: 14px; display: grid; gap: 6px; border: 1px solid var(--line); }
  .verdict h2 { margin: 0; font-size: 18px; }
  .verdict p { margin: 0; }
  .verdict.ok { background: var(--ok-bg); color: var(--ok); } .verdict.bad { background: var(--bad-bg); color: var(--bad); } .verdict.warn { background: var(--warn-bg); color: var(--warn); }
  .verdict p.body { color: var(--ink); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .step { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; display: grid; gap: 8px; min-width: 0; }
  .step-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .step-head h3 { margin: 0; font-size: 16px; flex: 1 1 140px; min-width: 0; }
  .chip { font: 700 12px/1 var(--mono); padding: 6px 8px; border-radius: 8px; letter-spacing: .02em; white-space: nowrap; }
  .chip.ok { background: var(--ok-bg); color: var(--ok); } .chip.bad { background: var(--bad-bg); color: var(--bad); } .chip.skip { background: var(--skip-bg); color: var(--skip); } .chip.run { background: var(--warn-bg); color: var(--warn); }
  .http { font: 700 12px/1 var(--mono); padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); color: var(--ink2); }
  .step p { margin: 0; font-size: 15px; }
  .step .fix { color: var(--ink2); font-size: 14px; }
  dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font: 13px/1.35 var(--mono); }
  dt { color: var(--ink2); } dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
  details { font-size: 14px; } summary { cursor: pointer; padding: 8px 0; color: var(--ink2); font-weight: 600; }
  pre { margin: 0; padding: 10px; background: var(--field); border-radius: 10px; overflow-x: auto; font: 12px/1.4 var(--mono); max-height: 260px; -webkit-overflow-scrolling: touch; }
  .spin { display: inline-block; width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: sp .8s linear infinite; vertical-align: -2px; }
  @keyframes sp { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
  [hidden] { display: none !important; }
  @media (max-width: 380px) { .row { flex-wrap: wrap; } .row button { flex: 1 1 100%; } }
</style>
</head>
<body>
<main>
  <header>
    <h1>Diagnóstico do Worker OPTDOWNS</h1>
    <p class="lead">Testa o seu Worker do Cloudflare etapa por etapa e explica onde o download por link falha.</p>
  </header>

  <form class="panel" id="form" autocomplete="off" novalidate>
    <label for="worker">URL do Worker
      <input id="worker" type="url" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://optdowns-proxy.seu-usuario.workers.dev">
    </label>
    <label for="link">Link público do vídeo do TikTok
      <span class="row">
        <input id="link" type="url" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://www.tiktok.com/@usuario/video/123…">
        <button type="button" id="paste">Colar</button>
      </span>
    </label>
    <label for="key">Senha SECRET (só se você definiu uma)
      <input id="key" type="password" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="deixe vazio se não usa SECRET">
    </label>
    <button class="primary" id="run" type="submit">Executar diagnóstico</button>
    <p class="hint">A senha nunca é salva nem aparece nos resultados. A URL do Worker fica salva neste navegador. Cada teste usa o link só para pedir o vídeo ao seu Worker; nada é enviado a terceiros.</p>
  </form>

  <section id="out" hidden aria-live="polite">
    <div class="verdict" id="verdict"></div>
    <ol id="steps"></ol>
    <div class="panel" id="tools" hidden>
      <button type="button" id="copy">Copiar relatório</button>
      <details><summary>Resposta técnica do Worker (sem segredos)</summary><pre id="raw"></pre></details>
    </div>
  </section>
</main>

<script>
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY_STORE = 'optdowns.diag.worker';
  var report = '';

  var EXPLAIN = {
    BAD_KEY: ['A senha SECRET está ausente ou errada.', 'Digite no campo a mesma senha definida em Settings > Variables do Worker. Se não definiu SECRET, apague a variável ou deixe o campo vazio.'],
    BAD_URL: ['O link do vídeo está vazio ou inválido.', 'Cole o link completo, começando com https://.'],
    HOST_NOT_ALLOWED: ['O link não é do TikTok (precisa ser https://*.tiktok.com).', 'Cole o link público do vídeo, como https://www.tiktok.com/@usuario/video/123 ou vt.tiktok.com/…'],
    REDIRECT_NOT_ALLOWED: ['O link curto redireciona para fora do TikTok.', 'Abra o link no navegador e cole o endereço final do vídeo.'],
    TOO_MANY_REDIRECTS: ['Redirecionamentos demais ao abrir o link.', 'Cole o endereço final do vídeo em vez do link curto.'],
    VIDEO_NOT_FOUND: ['O TikTok disse que o vídeo não existe (HTTP 404).', 'Confira se o link está completo e se o vídeo não foi apagado.'],
    VIDEO_UNAVAILABLE: ['O vídeo está privado, removido ou com restrição.', 'Teste com outro vídeo público.'],
    UNSUPPORTED_POST: ['O link é um álbum de fotos, não um vídeo.', 'Use o link de um vídeo.'],
    ORIGIN_BLOCKED: ['O TikTok bloqueou a leitura da página a partir do servidor da Cloudflare (HTTP 403).', 'É bloqueio de IP/região do TikTok contra a Cloudflare. Mudar o código não resolve. Tente de novo mais tarde, teste outro vídeo, ou use o botão "Nesta página" do script.'],
    ORIGIN_RATE_LIMIT: ['O TikTok limitou as requisições (HTTP 429).', 'Espere alguns minutos e tente de novo.'],
    ORIGIN_ERROR: ['O TikTok respondeu com erro 5xx ao ler a página.', 'Problema temporário do TikTok. Tente de novo em instantes.'],
    ORIGIN_UNEXPECTED: ['O TikTok devolveu uma resposta inesperada.', 'Copie o relatório e envie para análise.'],
    ORIGIN_UNREACHABLE: ['O Worker não conseguiu conectar ao TikTok.', 'Tente de novo. Se persistir, copie o relatório.'],
    ORIGIN_TIMEOUT: ['O TikTok demorou demais para responder.', 'Tente de novo em instantes.'],
    ORIGIN_CHALLENGE: ['O TikTok devolveu uma verificação (captcha) no lugar do vídeo.', 'É proteção anti-robô contra o IP da Cloudflare. Tente mais tarde ou outro vídeo.'],
    NO_PAGE_DATA: ['A página veio, mas sem os dados do vídeo.', 'Bloqueio disfarçado ou mudança no HTML do TikTok. Copie o relatório para eu ajustar o worker.js.'],
    NO_MEDIA_URLS: ['A página trouxe o vídeo, mas sem endereços de mídia.', 'O formato dos dados do TikTok mudou. Copie o relatório para eu ajustar o worker.js.'],
    CDN_REFUSED: ['O servidor de vídeo do TikTok recusou o arquivo (HTTP 403), mesmo com cookie e Referer.', 'A URL assinada foi recusada para o IP da Cloudflare. Tente de novo (a URL é renovada a cada chamada) ou use outro vídeo.'],
    CDN_RATE_LIMIT: ['O servidor de vídeo limitou as requisições (HTTP 429).', 'Espere alguns minutos.'],
    CDN_TIMEOUT: ['O servidor de vídeo não respondeu a tempo.', 'Tente de novo.'],
    CDN_FAILED: ['Nenhuma URL de vídeo pôde ser baixada.', 'Veja as tentativas por host na resposta técnica e tente de novo.'],
    NO_ROUTE: ['O Worker respondeu, mas esta rota não existe.', 'Normal para a raiz do Worker; a rota certa é /dl.'],
    METHOD: ['Método HTTP não permitido.', 'O Worker aceita GET e HEAD.']
  };
  var STAGE_NAMES = { auth: 'Senha (SECRET)', validate: 'Validação do link', page: 'Leitura da página do TikTok', parse: 'Extração do vídeo', cdn: 'Servidor de vídeo (CDN)' };
  var ORDER = ['auth', 'validate', 'page', 'parse', 'cdn'];

  function safeGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function clean(text, secret) {
    var t = String(text == null ? '' : text).replace(/(https?:\\/\\/[^\\s"'<>?#]+)[?#][^\\s"'<>]*/gi, '$1?…');
    if (secret) t = t.split(secret).join('•••');
    return t;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function extractUrl(v) { var m = String(v || '').match(/https?:\\/\\/[^\\s<>"“”]+/i); return m ? m[0].replace(/[),.;!]+$/, '') : ''; }
  function normWorker(v) {
    var s = String(v || '').trim().replace(/\\/+$/, '');
    if (s && !/^https?:\\/\\//i.test(s)) s = 'https://' + s;
    return s.replace(/\\/dl(\\?.*)?$/i, '');
  }

  function timedFetch(url, opts, ms) {
    var ctl = new AbortController(), t0 = Date.now(), timer = setTimeout(function () { ctl.abort(); }, ms || 45000);
    opts = opts || {}; opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) { r.__ms = Date.now() - t0; r.__ctl = ctl; clearTimeout(timer); return r; },
      function (e) { clearTimeout(timer); e.__ms = Date.now() - t0; e.__timeout = ctl.signal.aborted; throw e; });
  }

  var stepsEl = $('steps');
  function stepCard(id, title) {
    var li = document.createElement('li'); li.className = 'step'; li.id = 'st-' + id;
    li.innerHTML = '<div class="step-head"><h3>' + esc(title) + '</h3><span class="http" hidden></span><span class="chip skip">AGUARDANDO</span></div><div class="body"></div>';
    stepsEl.appendChild(li); return li;
  }
  function setStep(li, state, http, html, ms) {
    var chip = li.querySelector('.chip'), h = li.querySelector('.http');
    chip.className = 'chip ' + state;
    chip.innerHTML = state === 'run' ? '<span class="spin"></span> TESTANDO' : state === 'ok' ? 'OK' : state === 'bad' ? 'FALHOU' : 'NÃO TESTADO';
    if (http != null && http !== '') { h.hidden = false; h.textContent = 'HTTP ' + http + (ms != null ? ' · ' + ms + ' ms' : ''); } else { h.hidden = true; }
    li.querySelector('.body').innerHTML = html || '';
  }
  function kv(pairs) { return '<dl>' + pairs.filter(Boolean).map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>'; }).join('') + '</dl>'; }
  function say(msg, fix) { return '<p>' + esc(msg) + '</p>' + (fix ? '<p class="fix">' + esc(fix) + '</p>' : ''); }

  function verdict(kind, title, text) {
    var v = $('verdict'); v.className = 'verdict ' + kind; v.innerHTML = '<h2>' + esc(title) + '</h2><p class="body">' + esc(text) + '</p>';
  }

  async function run(ev) {
    ev.preventDefault();
    var worker = normWorker($('worker').value), link = extractUrl($('link').value), key = $('key').value.trim();
    if (!/^(https:\\/\\/[^/\\s]+\\.[^/\\s]+|http:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?)/i.test(worker)) { $('worker').focus(); alert_(' Informe a URL do Worker começando com https://'); return; }
    if (!link) { $('link').focus(); alert_(' Cole o link público do vídeo do TikTok.'); return; }
    safeSet(KEY_STORE, worker);
    $('run').disabled = true; $('run').textContent = 'Testando…';
    $('out').hidden = false; $('tools').hidden = true; stepsEl.innerHTML = '';
    verdict('warn', 'Executando…', 'Isto leva de 5 a 30 segundos.');
    $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });

    var lines = ['Diagnóstico OPTDOWNS · ' + new Date().toLocaleString('pt-BR'), 'Worker: ' + clean(worker, key), 'Link: ' + clean(link.split('?')[0], key), ''];
    var results = {}, rawText = '';
    var enc = encodeURIComponent(link), kq = key ? '&key=' + encodeURIComponent(key) : '';

    var s1 = stepCard('reach', '1. Alcançar o Worker'); setStep(s1, 'run');
    var reachable = false;
    try {
      var r1 = await timedFetch(worker + '/', { method: 'GET', cache: 'no-store' }, 20000);
      var j1 = null; try { j1 = await r1.json(); } catch (e) {}
      if (j1 && j1.code === 'NO_ROUTE') { reachable = true; setStep(s1, 'ok', r1.status, say('Worker encontrado e respondendo (HTTP 404 na raiz é o esperado). O CORS permite que esta página leia as respostas.'), r1.__ms); }
      else if (j1 && typeof j1.error === 'string' && r1.status < 500) { reachable = true; setStep(s1, 'ok', r1.status, say('Worker encontrado, mas parece uma versão antiga (resposta sem código de erro). O diagnóstico a seguir confirma se ele tem debug=1.'), r1.__ms); }
      else { setStep(s1, 'bad', r1.status, say('Algo respondeu em ' + new URL(worker).host + ', mas não parece ser o seu Worker (ou ele está com erro).', 'Confira se a URL é a do Worker publicado (termina em .workers.dev) e se o código foi publicado com Deploy.'), r1.__ms); }
    } catch (e) {
      setStep(s1, 'bad', '', say(e.__timeout ? 'O Worker não respondeu em 20 segundos.' : 'Não consegui conectar ao Worker.', 'Confira a URL (erros de digitação são o mais comum), a internet do iPhone e se o Worker está publicado. Se a URL estiver certa, o Worker antigo pode não enviar cabeçalhos CORS: publique o worker.js novo.'));
    }
    lines.push('1. Alcançar o Worker: ' + (reachable ? 'OK' : 'FALHOU'));

    var dbg = null, dbgStatus = 0, dbgSupported = false;
    var stepLis = {}; ORDER.forEach(function (s) { stepLis[s] = stepCard(s, (ORDER.indexOf(s) + 2) + '. ' + STAGE_NAMES[s]); setStep(stepLis[s], 'skip', '', say('Aguardando o diagnóstico.')); });
    var sRange = stepCard('range', '7. Download real (primeiros 100 bytes)'); setStep(sRange, 'skip', '', say('Aguardando.'));

    if (!reachable) {
      ORDER.forEach(function (s) { setStep(stepLis[s], 'skip', '', say('Não testado porque o Worker não foi alcançado.')); });
      setStep(sRange, 'skip', '', say('Não testado porque o Worker não foi alcançado.'));
      verdict('bad', 'Não consegui falar com o Worker', 'Corrija a URL do Worker (passo 1) e execute de novo.');
      lines.push('Conclusão: Worker inalcançável.'); finish(lines, null, key); return;
    }
    ORDER.forEach(function (s) { setStep(stepLis[s], 'run'); });
    try {
      var r2 = await timedFetch(worker + '/dl?url=' + enc + kq + '&debug=1', { cache: 'no-store' }, 60000);
      dbgStatus = r2.status; rawText = await r2.text();
      try { dbg = JSON.parse(rawText); } catch (e) { dbg = null; }
      dbgSupported = !!(dbg && Array.isArray(dbg.trace));
      dbg && (dbg.__ms = r2.__ms);
    } catch (e) {
      ORDER.forEach(function (s) { setStep(stepLis[s], 'skip', '', say('Sem resposta do diagnóstico.')); });
      setStep(sRange, 'skip', '', say('Não testado.'));
      verdict('bad', e.__timeout ? 'O Worker demorou demais' : 'A conexão caiu durante o diagnóstico', e.__timeout ? 'Sem resposta em 60 segundos. Tente de novo; se repetir, o TikTok pode estar lento ou travando o Worker.' : 'Tente de novo. Se repetir, copie o relatório.');
      lines.push('Diagnóstico: ' + (e.__timeout ? 'timeout (60 s)' : 'falha de rede')); finish(lines, null, key); return;
    }

    var failStage = null, failCode = '';
    if (!dbgSupported) {
      ORDER.forEach(function (s) { setStep(stepLis[s], 'skip', dbgStatus, say('Este Worker não devolveu o diagnóstico por etapa (debug=1).')); });
      var oldMsg = dbg && (dbg.error || dbg.message) ? clean(dbg.error || dbg.message, key) : '';
      verdict('warn', 'O seu Worker não suporta debug=1',
        'HTTP ' + dbgStatus + (oldMsg ? ' · "' + oldMsg + '"' : '') + '. Provavelmente é o worker.js antigo: publique o novo (ele informa a etapa exata e o status da origem).');
      setStep(sRange, 'skip', '', say('Não testado.'));
      lines.push('debug=1: NÃO SUPORTADO (HTTP ' + dbgStatus + ')');
      finish(lines, dbg, key); return;
    }

    var trace = dbg.trace || [], pageTr = trace.filter(function (t) { return t.stage === 'page'; }), parseTr = trace.filter(function (t) { return t.stage === 'parse'; });
    if (dbg.ok) { failStage = null; } else { failStage = dbg.stage || 'unknown'; failCode = dbg.code || ''; }
    var reached = failStage ? Math.max(ORDER.indexOf(failStage), 0) : ORDER.length;
    ORDER.forEach(function (s, i) {
      var li = stepLis[s];
      if (failStage === s || (failStage && ORDER.indexOf(failStage) === -1 && i === ORDER.length - 1 && false)) {
        var ex = EXPLAIN[failCode] || ['Falha na etapa "' + STAGE_NAMES[s] + '".', 'Copie o relatório para análise.'];
        var extra = kv([
          ['Código', failCode || '—'], ['Status da origem', dbg.upstreamStatus != null ? 'HTTP ' + dbg.upstreamStatus : 'n/d'],
          dbg.details && dbg.details.attempts ? ['Tentativas', dbg.details.attempts.map(function (a) { return a.host + ' → ' + a.status; }).join('; ')] : null,
          dbg.details && dbg.details.captcha != null ? ['Captcha detectado', dbg.details.captcha ? 'sim' : 'não'] : null,
          dbg.details && dbg.details.hasRehydration != null ? ['Dados do TikTok na página', dbg.details.hasRehydration ? 'sim' : 'não'] : null
        ]);
        setStep(li, 'bad', dbg.upstreamStatus != null ? dbg.upstreamStatus : dbgStatus, say(ex[0], ex[1]) + extra, dbg.__ms);
      } else if (failStage && i > ORDER.indexOf(failStage)) {
        setStep(li, 'skip', '', say('Não testado: uma etapa anterior falhou.'));
      } else {
        var info = '', http = '';
        if (s === 'auth') info = say(dbgStatus === 401 ? '' : 'Senha aceita (ou o Worker não exige senha).');
        if (s === 'validate') info = say('Link aceito: é um endereço https do TikTok.');
        if (s === 'page') { var last = pageTr[pageTr.length - 1]; http = last ? last.status : ''; info = say(pageTr.length > 1 ? 'Página lida após ' + (pageTr.length - 1) + ' redirecionamento(s).' : 'Página do vídeo lida.') + (last ? kv([['Host', last.host], ['Cookie de sessão recebido', last.cookies && last.cookies.indexOf('tt_chain_token') >= 0 ? 'sim (tt_chain_token)' : (last.cookies && last.cookies.length ? 'outros cookies, sem tt_chain_token' : 'nenhum')]]) : ''); }
        if (s === 'parse') { var pt = parseTr[parseTr.length - 1]; info = say('Dados do vídeo encontrados na página.') + (pt ? kv([['Fonte dos dados', pt.source || '—'], ['URLs de vídeo', String(pt.candidates != null ? pt.candidates : (dbg.candidates || []).length)]]) : ''); }
        if (s === 'cdn') { var cd = dbg.cdn || []; var okc = cd.filter(function (a) { return a.status === 200 || a.status === 206; })[0]; http = okc ? okc.status : ''; info = say('O servidor de vídeo entregou o arquivo.') + kv([okc ? ['Host', okc.host] : null, okc && okc.length ? ['Tamanho', (Number(okc.length) / 1048576).toFixed(1) + ' MB'] : null, ['Qualidade (altura)', dbg.candidates && dbg.candidates[0] ? String(dbg.candidates[0].q || '?') + ' px' : '?'], ['Tentativas', cd.map(function (a) { return a.host + ' → ' + a.status; }).join('; ') || '1']]); }
        if (s === 'auth' && dbgStatus === 401) setStep(li, 'bad', 401, say(EXPLAIN.BAD_KEY[0], EXPLAIN.BAD_KEY[1])); else setStep(li, 'ok', http, info, s === 'cdn' ? dbg.__ms : null);
      }
    });
    lines.push('debug=1: HTTP ' + dbgStatus);
    ORDER.forEach(function (s) { var li = stepLis[s], c = li.querySelector('.chip').textContent.trim(); lines.push('- ' + STAGE_NAMES[s] + ': ' + c + (li.querySelector('.http').hidden ? '' : ' (' + li.querySelector('.http').textContent + ')')); });
    if (failStage) lines.push('Falha: etapa=' + failStage + ' código=' + failCode + ' origem=' + (dbg.upstreamStatus != null ? dbg.upstreamStatus : 'n/d'));

    if (failStage) {
      setStep(sRange, 'skip', '', say('Não testado: o diagnóstico falhou antes do download.'));
      var ex2 = EXPLAIN[failCode] || ['Falha na etapa ' + failStage + '.', ''];
      verdict('bad', 'Falhou em: ' + (STAGE_NAMES[failStage] || failStage), ex2[0] + ' ' + ex2[1]);
    } else {
      setStep(sRange, 'run');
      try {
        var r3 = await timedFetch(worker + '/dl?url=' + enc + kq, { headers: { Range: 'bytes=0-99', 'Cache-Control': 'no-cache' } }, 60000);
        var buf = await r3.arrayBuffer(), ct = r3.headers.get('content-type') || '', cr = r3.headers.get('content-range') || '', q = r3.headers.get('x-optdowns-quality') || '';
        var good = (r3.status === 206 || r3.status === 200) && /video|octet/i.test(ct);
        setStep(sRange, good ? 'ok' : 'bad', r3.status, (good ? say(r3.status === 206 ? 'Download parcial funcionando (Range) e CORS liberado para esta página.' : 'Download funcionando, mas o servidor ignorou o Range; baixar por blocos pode ficar mais lento.') : say('Resposta inesperada no download.', 'Veja o tipo recebido abaixo e copie o relatório.')) +
          kv([['Tipo', ct.split(';')[0] || '—'], ['Content-Range', cr || '—'], ['Bytes recebidos', String(buf.byteLength)], ['Qualidade informada', q ? q + ' px' : '—']]), r3.__ms);
        lines.push('- Download real (Range): ' + (good ? 'OK' : 'FALHOU') + ' HTTP ' + r3.status + ' tipo=' + ct.split(';')[0]);
        if (good) verdict('ok', 'Tudo certo com o Worker', 'Todas as etapas passaram para este vídeo. Se o script ainda mostrar erro, confirme que LINK_PROXY no .user.js tem exatamente a URL ' + clean(worker, key) + (key ? ' e que LINK_PROXY_KEY tem a mesma senha' : '') + '.');
        else verdict('warn', 'O Worker achou o vídeo, mas o download falhou', 'O diagnóstico passou, porém o download real devolveu HTTP ' + r3.status + '. Copie o relatório.');
      } catch (e) {
        setStep(sRange, 'bad', '', say(e.__timeout ? 'O download não respondeu em 60 segundos.' : 'O navegador bloqueou ou perdeu a conexão no download.', e.__timeout ? 'Tente de novo.' : 'Normalmente é CORS: publique o worker.js novo, que responde ao preflight. Se já está publicado, tente de novo.'));
        lines.push('- Download real (Range): FALHOU (' + (e.__timeout ? 'timeout' : 'rede/CORS') + ')');
        verdict('warn', 'O Worker achou o vídeo, mas o download falhou no navegador', 'Provável problema de CORS ou conexão no download. Copie o relatório.');
      }
    }
    finish(lines, dbg, key);
  }

  function alert_(msg) { verdict('warn', 'Falta um dado', msg.trim()); $('out').hidden = false; stepsEl.innerHTML = ''; $('tools').hidden = true; }

  function finish(lines, dbg, key) {
    report = lines.join('\\n');
    var safe = dbg ? JSON.stringify(dbg, function (k, v) { return k === '__ms' ? undefined : v; }, 2) : '(sem resposta técnica)';
    $('raw').textContent = clean(safe, key);
    report += '\\n\\nResposta técnica:\\n' + clean(safe, key);
    $('tools').hidden = false; $('run').disabled = false; $('run').textContent = 'Executar diagnóstico de novo';
  }

  $('form').addEventListener('submit', run);
  $('paste').addEventListener('click', function () {
    var f = function () { $('link').focus(); };
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { var u = extractUrl(t); if (u) $('link').value = u; else $('link').value = t.trim(); }, f); else f();
  });
  $('copy').addEventListener('click', function () {
    var b = $('copy'), done = function (ok) { b.textContent = ok ? 'Copiado ✓' : 'Selecione e copie abaixo'; setTimeout(function () { b.textContent = 'Copiar relatório'; }, 2200); };
    var fallback = function () { var ta = document.createElement('textarea'); ta.value = report; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:0;top:0;opacity:0;font-size:16px'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, report.length); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done(ok); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(report).then(function () { done(true); }, fallback); else fallback();
  });

  $('worker').value = /^https?:$/.test(location.protocol) && /\\/diagnostico\\/?$/.test(location.pathname) ? location.origin : safeGet(KEY_STORE);
})();
</script>
</body>
</html>
`;
