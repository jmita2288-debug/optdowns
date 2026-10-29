// ==UserScript==
// @name         OPTDOWNS
// @namespace    video-direct-downloader
// @version      2.11.0
// @description  OPTDOWNS: vídeo e áudio HLS locais, seleção de faixas, links públicos TikTok/Instagram, páginas com vários vídeos, logos dos sites, miniaturas confiáveis e painel para celular.
// @description:en  OPTDOWNS: local HLS video and audio, track selection, public TikTok/Instagram links, multi-video pages, site logos, reliable thumbnails and a mobile-first panel.
// @author       jmita2288-debug
// @license      MIT
// @homepageURL  https://github.com/jmita2288-debug/optdowns
// @supportURL   https://github.com/jmita2288-debug/optdowns/issues
// @downloadURL  https://raw.githubusercontent.com/jmita2288-debug/optdowns/main/optdowns.user.js
// @updateURL    https://raw.githubusercontent.com/jmita2288-debug/optdowns/main/optdowns.user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-start
// @grant        GM_download
// @grant        GM.download
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_openInTab
// @grant        unsafeWindow
// @connect      *
// @require      https://unpkg.com/mux.js@6.3.0/dist/mux.js
// ==/UserScript==

(() => {
  'use strict';

  const APP = {
    hlsUrls: new Set(),
    hlsMasters: new Map(),
    hlsResources: new Set(),
    linkController: null,
    socialScanAt: 0,
    socialScanPage: "",
    dashUrls: new Set(),
    directUrls: new Set(),
    mediaInfo: new Map(),
    mediaIdentityUrls: new Map(),
    videoIds: new WeakMap(),
    nextVideoId: 1,
    nextMediaOrder: 1,
    activeTab: 'page',
    linkResults: [],
    linkBusy: false,
    panelOpen: false,
    working: false,
    observer: null,
    scanTimer: null,
    renderTimer: null,
    toastTimer: null,
    networkHooksInstalled: false,
    requestReferrer: '',
    recentNetworkMedia: [],
    recentBinaryCandidates: [],
    recentNetworkRequests: [],
    siteProbeKeys: new Set(),
    hlsJob: null,
    hlsController: null,
  };
  Object.assign(APP, { navGen: 0, navAt: 0, perfSeen: 0, dropped: new Map(), activeVideoKey: '', activeAt: 0,
    expandedGroups: new Set(), directController: null, eventScanTimer: null });

  // Optional: URL of your own Cloudflare Worker (see worker/README.md). Leave empty to disable.
  const LINK_PROXY = '';
  const LINK_PROXY_KEY = '';
  const LINK_PROXY_GENERIC = true;
  const SCRIPT_VERSION = '2.11.0';
  const NET = Object.freeze({
    pageIdleTimeout: 90000,
    requestTimeout: 90000,
    fullRequestTimeout: 10 * 60 * 1000,
    retries: 3,
    rangeChunkSize: 4 * 1024 * 1024,
    maxUnknownRangeChunks: 4096,
    saveTimeout: 3 * 60 * 1000,
    manualUrlLifetime: 10 * 60 * 1000,
    linkRequestTimeout: 45000,
    maxLinkHtmlSize: 12 * 1024 * 1024,
  });

  const CSS = `
#vdd-root {
  all: initial;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  color-scheme: dark;
  line-height: 1.45;
  text-align: left;
  --canvas: #090a0b;
  --surface: #111314;
  --surface-raised: #1a1c1d;
  --surface-high: #252829;
  --line: rgba(255, 255, 255, .09);
  --text: #f4f5f2;
  --muted: #a7ada3;
  --quiet: #727970;
  --accent: #a8f500;
  --accent-ink: #121606;
  --danger: #e9847a;
  --brand-image: url("https://hebbkx1anhila5yf.public.blob.vercel-storage.com/BF5D51E4-BE58-4333-9D33-F91463487117-bkNO4Xwi9KhwGj0MCZAY9A69ZnyOMI.png");
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --ic-dl: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 4v11'/%3E%3Cpath d='m7 11 5 5 5-5'/%3E%3Cpath d='M5 20h14'/%3E%3C/svg%3E");
  --ic-spin: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round'%3E%3Cpath d='M12 3a9 9 0 1 0 9 9'/%3E%3C/svg%3E");
  --ic-vid: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5zm5.2 2.1v6.8a.6.6 0 0 0 .9.5l5.2-3.4a.6.6 0 0 0 0-1l-5.2-3.4a.6.6 0 0 0-.9.5z' fill-rule='evenodd'/%3E%3C/svg%3E");
  --ic-chev: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ebebf5' stroke-opacity='.6' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E");
}

#vdd-root,
#vdd-root * {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

#vdd-root [hidden]:not(#vdd-boot) { display: none !important; }
#vdd-root :is(button, input, select) { margin: 0; color: inherit; font: inherit; letter-spacing: normal; text-shadow: none; text-indent: 0; text-transform: none; }
#vdd-root button { cursor: pointer; touch-action: manipulation; -webkit-appearance: none; appearance: none; }
#vdd-root button:disabled,
#vdd-root select:disabled { cursor: not-allowed; opacity: .56; }
#vdd-root button:active:not(:disabled) { transform: scale(.985); }
#vdd-root :is(button, input, select):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

#vdd-open {
  position: fixed;
  right: max(16px, env(safe-area-inset-right));
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 2147483646;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 0;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid rgba(168, 245, 0, .65);
  border-radius: 17px;
  color: var(--accent);
  background: #050607;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .42), 0 0 0 1px rgba(168, 245, 0, .08), inset 0 1px 0 rgba(255, 255, 255, .08);
  transition: transform .2s var(--ease-out), border-color .2s, background .2s, box-shadow .2s;
}
#vdd-open:active { transform: scale(.95); }
#vdd-open::before {
  position: absolute;
  inset: 1px;
  z-index: 0;
  border-radius: inherit;
  background: var(--brand-image) center / cover no-repeat;
  content: "";
  pointer-events: none;
  transition: transform .24s var(--ease-out);
}
#vdd-open > svg { position: relative; z-index: 1; display: block; width: 46px; height: 46px; overflow: visible; }
#vdd-open .vdd-arrow,
#vdd-open > svg > path:last-child { opacity: 0; }
#vdd-root .vdd-logo svg { display: block; width: 25px; height: 25px; overflow: visible; opacity: 0; }
#vdd-root .vdd-ring { opacity: 0; color: var(--accent); }
#vdd-root .vdd-arrow { color: var(--accent); }
#vdd-root:has(.vdd-btn:disabled, #vdd-link-submit:disabled) #vdd-open { border-color: var(--accent); background: #11170a; box-shadow: 0 8px 30px rgba(0, 0, 0, .48), 0 0 0 2px rgba(168, 245, 0, .16); }
#vdd-root:has(.vdd-btn:disabled, #vdd-link-submit:disabled) #vdd-open .vdd-ring { opacity: .9; }

#vdd-panel {
  position: fixed;
  z-index: 2147483647;
  top: max(8px, var(--vdd-ct, 72px));
  left: max(8px, var(--vdd-cl, 8px));
  display: none;
  flex-direction: column;
  width: min(var(--vdd-cw, 480px), calc(100vw - 16px));
  height: min(var(--vdd-ch, 810px), calc(100dvh - 16px));
  overflow: hidden;
  overscroll-behavior: contain;
  border: 1px solid var(--line);
  border-radius: 17px;
  color: var(--text);
  background: var(--canvas);
  box-shadow: 0 18px 52px rgba(0, 0, 0, .42), 0 2px 8px rgba(0, 0, 0, .24);
  transform: translateY(10px) scale(.99);
  transform-origin: bottom right;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  transition: opacity .2s ease, transform .26s var(--ease-out), visibility 0s linear .26s;
}
#vdd-panel.show,
#vdd-panel.vdd-closing { display: flex; }
#vdd-panel.show {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: none;
  transition: opacity .2s ease, transform .26s var(--ease-out), visibility 0s;
  animation: vdd-panel-in .22s ease both;
}
#vdd-panel.vdd-full {
  top: 0;
  left: 0;
  width: var(--vdd-w, 100vw);
  height: var(--vdd-h, 100dvh);
  max-width: 100vw;
  max-height: 100dvh;
  padding: var(--vdd-sat, env(safe-area-inset-top, 0px)) var(--vdd-sar, env(safe-area-inset-right, 0px)) var(--vdd-sab, env(safe-area-inset-bottom, 0px)) var(--vdd-sal, env(safe-area-inset-left, 0px));
  border: 0;
  border-radius: 0;
  box-shadow: none;
  transform: translateY(10px) scale(.99);
  transform-origin: center;
}
#vdd-panel.vdd-full.show { transform: none; }
#vdd-root.vdd-resizing #vdd-panel { transition: none !important; }
#vdd-panel::before,
#vdd-panel::after,
#vdd-root .vdd-aurora { display: none !important; }
#vdd-root .vdd-head,
#vdd-root .vdd-tabs,
#vdd-root .vdd-body,
#vdd-root .vdd-footer { position: relative; z-index: 1; }

#vdd-root .vdd-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: clamp(7px, 1vw, 11px);
  padding: 17px clamp(16px, 2vw, 24px) 14px;
}
#vdd-root .vdd-logo {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 42px;
  height: 42px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--accent);
  background-color: #050607;
  background-image: var(--brand-image);
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
#vdd-root .vdd-logo svg { width: 25px; height: 25px; }
#vdd-root .vdd-head-main { flex: 1 1 auto; min-width: 0; }
#vdd-root .vdd-eyebrow { margin-bottom: 3px; color: var(--quiet); font-size: 9px; font-weight: 700; letter-spacing: .14em; }
#vdd-root .vdd-title { color: var(--text); font-size: clamp(18px, 2.4vw, 22px); font-weight: 760; letter-spacing: -.045em; line-height: 1.1; white-space: nowrap; }
#vdd-root .vdd-title span { display: inline-flex; align-items: center; margin-left: 5px; padding: 3px 6px; border: 1px solid var(--line); border-radius: 5px; color: var(--muted); background: var(--surface-raised); font-size: 9px; font-weight: 650; letter-spacing: .03em; vertical-align: 3px; }
#vdd-root .vdd-sub { margin-top: 4px; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
#vdd-root .vdd-icon {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--muted);
  background: transparent;
  transition: color .18s ease, background .18s ease, border-color .18s ease, transform .18s var(--ease-out);
}
#vdd-root .vdd-icon svg { display: block; width: 18px; height: 18px; }
#vdd-root .vdd-icon:active { transform: scale(.94); color: var(--text); background: var(--surface-raised); }
#vdd-root #vdd-refresh svg { transition: transform .36s var(--ease-out); }
#vdd-root #vdd-refresh.vdd-spinning svg { animation: vdd-refresh .48s var(--ease-out); }
#vdd-root .vdd-expand svg { position: absolute; inset: 0; margin: auto; transition: opacity .18s ease, transform .2s var(--ease-out); }
#vdd-root .vdd-expand .vdd-ico-out { opacity: 1; transform: none; }
#vdd-root .vdd-expand .vdd-ico-in { opacity: 0; transform: scale(.8); }
#vdd-panel.vdd-full .vdd-expand .vdd-ico-out { opacity: 0; transform: scale(.8); }
#vdd-panel.vdd-full .vdd-expand .vdd-ico-in { opacity: 1; transform: none; }

#vdd-root .vdd-tabs {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin: 0 clamp(16px, 2vw, 24px) 13px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #141617;
}
#vdd-root .vdd-tab {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  font-size: 12.5px;
  font-weight: 620;
  line-height: 1.15;
  text-align: center;
  transition: color .18s ease, background .18s ease, transform .16s var(--ease-out);
}
#vdd-root .vdd-tab svg { display: block; flex: 0 0 auto; width: 16px; height: 16px; }
#vdd-root .vdd-tab span { min-width: 0; }
#vdd-root .vdd-tab.active,
#vdd-root .vdd-tab[aria-selected="true"] { color: var(--text); background: var(--surface-raised); }
#vdd-root .vdd-tab:active { transform: scale(.97); }
@supports selector(:has(*)) {
  #vdd-root .vdd-tabs::before {
    position: absolute;
    top: 3px;
    bottom: 3px;
    left: 3px;
    width: calc((100% - 6px) / 3);
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface-raised);
    content: "";
    pointer-events: none;
    transition: transform .26s var(--ease-out);
  }
  #vdd-root .vdd-tabs:has(#vdd-tab-link[aria-selected="true"])::before { transform: translateX(100%); }
  #vdd-root .vdd-tabs:has(#vdd-tab-sites[aria-selected="true"])::before { transform: translateX(200%); }
  #vdd-root .vdd-tab.active,
  #vdd-root .vdd-tab[aria-selected="true"] { background: transparent; }
}

#vdd-root .vdd-body {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-top: 1px solid var(--line);
  overscroll-behavior: contain;
  scrollbar-color: rgba(255, 255, 255, .22) transparent;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
#vdd-root .vdd-view { min-height: 0; }
#vdd-root .vdd-view:not([hidden]) { animation: vdd-view-in .18s ease both; }
#vdd-list,
#vdd-link-results,
#vdd-root .vdd-entries,
#vdd-root .vdd-entry-items {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 25rem), 1fr));
  align-items: start;
  gap: 12px;
}
#vdd-list { padding: 18px clamp(16px, 2vw, 24px) 28px; }
#vdd-link-results { margin-top: 16px; }
#vdd-link-view { padding: 20px clamp(16px, 2vw, 24px) 28px; }
#vdd-link-results { padding: 0; }
#vdd-link-listing { padding-top: 12px; }
#vdd-root .vdd-empty { grid-column: 1 / -1; padding: clamp(42px, 8vh, 72px) 20px; color: var(--muted); font-size: 13px; line-height: 1.6; text-align: center; }
#vdd-root .vdd-empty::before { display: block; width: 42px; height: 42px; margin: 0 auto 14px; background: var(--quiet); content: ""; -webkit-mask: var(--ic-vid) center / contain no-repeat; mask: var(--ic-vid) center / contain no-repeat; }
#vdd-root .vdd-link-form { display: flex; gap: 8px; min-width: 0; }
#vdd-root .vdd-input-wrap { position: relative; display: flex; flex: 1 1 auto; min-width: 0; }
#vdd-link-input,
#vdd-sites-input {
  width: 100%;
  min-width: 0;
  height: 48px;
  padding: 0 42px 0 13px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-raised);
  font-size: 15px;
  transition: border-color .16s ease, background .16s ease, box-shadow .16s ease;
}
#vdd-link-input::placeholder,
#vdd-sites-input::placeholder { color: var(--quiet); opacity: 1; }
#vdd-link-input:focus,
#vdd-sites-input:focus { border-color: rgba(168, 245, 0, .65); outline: none; box-shadow: 0 0 0 3px rgba(168, 245, 0, .12); }
#vdd-root .vdd-link-btn {
  flex: 0 0 auto;
  min-width: 78px;
  min-height: 48px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--accent-ink);
  background: var(--accent);
  font-size: 13px;
  font-weight: 720;
  transition: transform .16s var(--ease-out), background .16s ease, opacity .16s ease;
}
#vdd-root .vdd-link-btn:active:not(:disabled) { transform: scale(.97); }
#vdd-root .vdd-link-btn:disabled { opacity: .55; }
#vdd-root .vdd-input-clear {
  position: absolute;
  top: 50%;
  right: 5px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  transform: translateY(-50%);
}
#vdd-root .vdd-input-clear svg { display: block; width: 15px; height: 15px; }
#vdd-root .vdd-link-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 14px; margin-top: 2px; }
#vdd-root .vdd-tool-group { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
#vdd-root .vdd-text-btn { min-height: 44px; padding: 7px 4px; border: 0; border-radius: 6px; color: var(--accent); background: transparent; font-size: 12px; font-weight: 630; text-align: left; transition: color .16s ease, background .16s ease, transform .16s var(--ease-out); }
#vdd-root .vdd-text-btn:active { transform: scale(.98); }
#vdd-root .vdd-link-note,
#vdd-root .vdd-link-status,
#vdd-root .vdd-progress-text,
#vdd-root .vdd-quality-note { color: var(--muted); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
#vdd-root .vdd-link-note { margin: 8px 0 0; }
#vdd-root .vdd-link-status { margin-top: 12px; }
#vdd-root .vdd-link-status:empty { display: none; }
#vdd-root [data-state="error"] { color: var(--danger); }
#vdd-root [data-state="complete"] { color: var(--accent); }
#vdd-root .vdd-link-seg { display: flex; gap: 3px; margin-top: 14px; padding: 3px; border: 1px solid var(--line); border-radius: 9px; background: #141617; }
#vdd-root .vdd-link-seg button { flex: 1 1 0; min-width: 0; min-height: 40px; padding: 4px 8px; border: 0; border-radius: 6px; color: var(--muted); background: transparent; font-size: 12px; font-weight: 620; transition: background .16s ease, color .16s ease; }
#vdd-root .vdd-link-seg button.on { color: var(--text); background: var(--surface-raised); }
#vdd-root .vdd-link-seg button span { margin-left: 4px; color: var(--quiet); font-weight: 550; }

#vdd-root .vdd-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  contain-intrinsic-size: auto 15rem;
  content-visibility: auto;
  container-type: inline-size;
  transition: border-color .18s ease, background .18s ease, transform .18s var(--ease-out);
}
#vdd-root .vdd-card:last-child { margin-bottom: 0; }
#vdd-root .vdd-card[data-dl="queued"] { border-color: rgba(255, 255, 255, .26); }
#vdd-root .vdd-card[data-dl="running"] { border-color: rgba(168, 245, 0, .6); }
#vdd-root .vdd-card[data-dl="done"] { border-color: rgba(168, 245, 0, .32); }
#vdd-root .vdd-card[data-dl="pending"] { border-color: rgba(168, 245, 0, .45); }
#vdd-root .vdd-card[data-dl="error"] { border-color: rgba(233, 132, 122, .55); }
#vdd-root .vdd-card.vdd-enter,
#vdd-root .vdd-card[data-dl] { content-visibility: visible; contain-intrinsic-size: none; }
@supports selector(:has(*)) {
  #vdd-root .vdd-card:has(.vdd-progress.show) { content-visibility: visible; contain-intrinsic-size: none; }
}
#vdd-root .vdd-fileinfo { margin: 8px 12px 12px; color: var(--muted); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
#vdd-root .vdd-progress-text[data-state="queued"] { color: var(--muted); }
#vdd-root .vdd-card.vdd-variant { margin-left: 8px; border-left: 2px solid rgba(168, 245, 0, .42); }
#vdd-root .vdd-card-top { display: grid; grid-template-columns: minmax(6rem, .9fr) minmax(0, 1.1fr); align-items: start; gap: 14px; padding: 14px; }
@supports (width: 1cqi) {
  #vdd-root .vdd-card-top { gap: clamp(11px, 2.2cqi, 17px); padding: clamp(12px, 3.5cqi, 17px); }
}
#vdd-root .vdd-thumb {
  position: relative;
  width: 100%;
  min-width: 0;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .07);
  border-radius: 9px;
  color: var(--quiet);
  background: #202223;
}
#vdd-root .vdd-thumb img,
#vdd-root .vdd-thumb canvas.vdd-thumb-canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; transform: scale(1.025); transition: opacity .3s ease, transform .38s var(--ease-out); }
#vdd-root .vdd-thumb.has-image img,
#vdd-root .vdd-thumb.has-image canvas.vdd-thumb-canvas { opacity: 1; transform: none; }
#vdd-root .vdd-thumb.has-image .vdd-thumb-fallback { display: none; }
#vdd-root .vdd-thumb-fallback { position: absolute; inset: 0; display: grid; place-items: center; color: var(--quiet); }
#vdd-root .vdd-thumb-fallback svg { display: block; width: 28px; height: 28px; }
#vdd-root .vdd-duration { position: absolute; right: 6px; bottom: 6px; padding: 3px 6px; border: 1px solid rgba(255, 255, 255, .12); border-radius: 5px; color: #fff; background: rgba(14, 15, 15, .82); font-size: 10px; font-variant-numeric: tabular-nums; font-weight: 650; line-height: 1; }
#vdd-root .vdd-main { min-width: 0; align-self: center; }
@container (max-width: 350px) {
  #vdd-root .vdd-card-top { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  #vdd-root .vdd-thumb { aspect-ratio: 16 / 9; }
  #vdd-root .vdd-main { align-self: auto; }
}
#vdd-root .vdd-name { display: -webkit-box; overflow: hidden; color: var(--text); font-size: 15px; font-weight: 690; letter-spacing: -.025em; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
@supports (font-size: 1cqi) {
  #vdd-root .vdd-name { font-size: clamp(14px, 4cqi, 16px); }
}
#vdd-root .vdd-source { display: flex; min-width: 0; align-items: center; gap: 7px; margin-top: 7px; color: var(--muted); font-size: 11.5px; line-height: 1.3; }
#vdd-root .vdd-source > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#vdd-root .vdd-site { display: block; flex: 0 0 auto; width: 17px; height: 17px; border-radius: 4px; object-fit: contain; }
#vdd-root .vdd-site.big { width: 28px; height: 28px; border-radius: 7px; }
#vdd-root canvas.vdd-site-logo { object-fit: contain; }
#vdd-root .vdd-meta-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
#vdd-root .vdd-badge,
#vdd-root .vdd-meta-chip { max-width: 100%; padding: 4px 7px; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: 5px; color: var(--muted); background: rgba(255, 255, 255, .035); font-size: 9.5px; font-weight: 650; line-height: 1.15; }
#vdd-root .vdd-badge.preferred,
#vdd-root .vdd-badge.vdd-chip-active { border-color: rgba(168, 245, 0, .25); color: var(--accent); background: rgba(168, 245, 0, .09); }
#vdd-root .vdd-res { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 15px 12px; }
#vdd-root .vdd-res .vdd-chip { min-height: 30px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 6px; color: var(--muted); background: var(--surface-raised); font-size: 11px; font-weight: 650; line-height: 1.2; transition: border-color .16s ease, color .16s ease, background .16s ease, transform .16s var(--ease-out); }
#vdd-root button.vdd-chip { cursor: pointer; }
#vdd-root button.vdd-chip:active { transform: scale(.96); }
#vdd-root .vdd-chip.on { border-color: rgba(168, 245, 0, .48); color: var(--accent); background: rgba(168, 245, 0, .1); }
#vdd-root .vdd-variants-toggle { display: flex; width: calc(100% - 30px); min-height: 38px; align-items: center; gap: 8px; margin: 0 15px 12px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 7px; color: var(--muted); background: var(--surface-raised); font-size: 11.5px; font-weight: 620; text-align: left; transition: background .16s ease, color .16s ease, transform .16s var(--ease-out); }
#vdd-root .vdd-variants-toggle svg { flex: 0 0 auto; width: 15px; height: 15px; transition: transform .2s var(--ease-out); }
#vdd-root .vdd-variants-toggle.open svg { transform: rotate(180deg); }
#vdd-root .vdd-variant[hidden] { display: none !important; }
#vdd-list:has(.vdd-variant:not([hidden])),
#vdd-link-results:has(.vdd-variant:not([hidden])) { grid-template-columns: minmax(0, 1fr); }

#vdd-root .vdd-quality-wrap { padding: 0 15px 12px; }
#vdd-root .vdd-field-label { display: block; margin: 0 0 10px; color: var(--muted); font-size: 11px; font-weight: 650; letter-spacing: .01em; }
#vdd-root .vdd-quality,
#vdd-root .vdd-audio { display: block; width: 100%; min-width: 0; min-height: 44px; margin-top: 6px; padding: 9px 36px 9px 11px; border: 1px solid var(--line); border-radius: 8px; color: var(--text); background: var(--surface-raised) var(--ic-chev) no-repeat right 10px center / 16px; font-size: 13px; -webkit-appearance: none; appearance: none; }
#vdd-root .vdd-silent-label { display: flex; min-height: 42px; align-items: center; gap: 9px; color: var(--muted); font-size: 11.5px; cursor: pointer; }
#vdd-root .vdd-allow-silent { width: 17px; height: 17px; flex: 0 0 auto; margin: 0; accent-color: var(--accent); }
#vdd-root .vdd-quality-note { margin: 6px 0; }
#vdd-root .vdd-quality-refresh,
#vdd-root .vdd-cancel,
#vdd-root .vdd-ghost { min-height: 42px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); background: var(--surface-raised); font-size: 12px; font-weight: 620; transition: border-color .16s ease, color .16s ease, background .16s ease, transform .16s var(--ease-out); }
#vdd-root .vdd-quality-refresh { width: 100%; margin-top: 8px; }
#vdd-root .vdd-cancel { width: calc(100% - 30px); margin: 0 15px 12px; border-color: rgba(233, 132, 122, .25); color: var(--danger); background: rgba(233, 132, 122, .08); }
#vdd-root .vdd-actions { display: flex; padding: 0 15px 15px; }
#vdd-root .vdd-btn {
  display: flex;
  width: 100%;
  min-height: 43px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--accent-ink);
  background: var(--accent);
  font-size: 12.5px;
  font-weight: 720;
  transition: transform .16s var(--ease-out), background .16s ease, opacity .16s ease;
}
#vdd-root .vdd-btn::before { display: block; width: 16px; height: 16px; flex: 0 0 auto; background: currentColor; content: ""; -webkit-mask: var(--ic-dl) center / contain no-repeat; mask: var(--ic-dl) center / contain no-repeat; }
#vdd-root .vdd-btn:active:not(:disabled) { transform: scale(.985); }
#vdd-root .vdd-btn:disabled { opacity: .72; }
#vdd-root .vdd-btn:disabled::before { -webkit-mask-image: var(--ic-spin); mask-image: var(--ic-spin); transform-origin: center; animation: vdd-button-spin .8s linear infinite; }
#vdd-root .vdd-card:has(.vdd-btn:disabled) { border-color: rgba(168, 245, 0, .38); }
#vdd-root .vdd-progress { display: none; padding: 0 15px 15px; }
#vdd-root .vdd-progress.show { display: block; animation: vdd-fade-in .16s ease both; }
#vdd-root .vdd-progress-line { position: relative; height: 3px; overflow: hidden; border-radius: 99px; background: var(--surface-high); contain: paint; }
#vdd-root .vdd-progress-bar { display: block; position: relative; width: 0; height: 100%; overflow: hidden; border-radius: inherit; background: var(--accent); transform: translate3d(0, 0, 0); transition: width .18s linear; }
#vdd-root .vdd-progress-line[aria-valuenow="100"] .vdd-progress-bar { background: var(--accent); }
#vdd-root .vdd-progress-line[aria-valuenow="100"] .vdd-progress-bar::after { opacity: 0; }
#vdd-root .vdd-progress-line.indeterminate .vdd-progress-bar { width: 32% !important; transition: none; will-change: transform; animation: vdd-progress 1.1s cubic-bezier(.45, 0, .55, 1) infinite alternate; }
#vdd-root.vdd-paused .vdd-progress-line.indeterminate .vdd-progress-bar { animation-play-state: paused; }
#vdd-root .vdd-progress-text { min-height: 1.45em; margin-top: 8px; line-height: 1.45; overflow-wrap: anywhere; }
#vdd-root .vdd-progress-text[data-state="complete"]::before { display: inline-block; margin-right: 5px; color: var(--accent); content: "✓"; animation: vdd-check .24s var(--ease-out) both; }

#vdd-root .vdd-entry { contain-intrinsic-size: auto 17rem; }
#vdd-root .vdd-entry-items { grid-template-columns: repeat(auto-fit, minmax(min(100%, 23rem), 1fr)); gap: 9px; padding: 0 12px 12px; border-top: 1px solid var(--line); background: rgba(0, 0, 0, .12); }
#vdd-root .vdd-entry-items[hidden] { display: none !important; }
#vdd-root .vdd-entry-items .vdd-card { border-radius: 8px; background: var(--surface); box-shadow: none; }
#vdd-root .vdd-entries:empty { display: none; }
#vdd-root .vdd-sentinel { grid-column: 1 / -1; height: 2px; }
#vdd-root .vdd-has-more .vdd-sentinel { height: 52px; margin: 2px 0 8px; border: 1px solid var(--line); border-radius: 9px; background: linear-gradient(90deg, var(--surface), var(--surface-raised), var(--surface)); }
#vdd-root .vdd-more { display: block; grid-column: 1 / -1; margin: 2px auto 16px; }
#vdd-root .vdd-more[hidden] { display: none !important; }
#vdd-root .vdd-trace { margin: 8px 0 0; overflow-wrap: anywhere; color: var(--muted); font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; user-select: text; -webkit-user-select: text; white-space: pre-wrap; }
#vdd-root .vdd-trace[hidden] { display: none !important; }
#vdd-root .vdd-open-page { display: block; margin: 7px 0 2px; text-align: left; }

#vdd-sites-view,
#vdd-diag-view { padding: 20px clamp(16px, 2vw, 24px) 28px; }
#vdd-root .vdd-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); gap: 9px; }
#vdd-root .vdd-tile { position: relative; display: grid; min-width: 0; min-height: 96px; align-content: start; gap: 8px; overflow: hidden; padding: 12px; border: 1px solid var(--line); border-radius: 10px; color: var(--text); background: var(--surface); text-align: left; transition: transform .18s var(--ease-out), border-color .16s ease, background .16s ease; }
#vdd-root .vdd-tile .vdd-site,
#vdd-root .vdd-tile .vdd-glyph { width: 28px; height: 28px; border-radius: 7px; }
#vdd-root .vdd-glyph { display: grid; place-items: center; color: var(--muted); background: var(--surface-raised); }
#vdd-root .vdd-glyph svg { width: 17px; height: 17px; }
#vdd-root .vdd-tile b { font-size: 13px; font-weight: 680; letter-spacing: -.01em; }
#vdd-root .vdd-tile small { color: var(--muted); font-size: 11px; line-height: 1.4; }
#vdd-root .vdd-tile.on { border-color: rgba(168, 245, 0, .42); background: rgba(168, 245, 0, .055); }
#vdd-root .vdd-recent { display: flex; width: 100%; min-width: 0; min-height: 44px; align-items: center; gap: 10px; margin: 0 0 6px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; color: var(--text); background: var(--surface); text-align: left; transition: background .16s ease, border-color .16s ease, transform .16s var(--ease-out); }
#vdd-root .vdd-recent span { flex: 1; min-width: 0; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
#vdd-root .vdd-row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
#vdd-root .vdd-section { margin: 20px 0 9px; color: var(--quiet); font-size: 10px; font-weight: 720; letter-spacing: .12em; text-transform: uppercase; }

#vdd-root .vdd-diag-intro { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
#vdd-root .vdd-diag-actions { display: flex; flex-wrap: wrap; gap: 8px; }
#vdd-root .vdd-diag-actions button { display: flex; flex: 1 1 140px; min-height: 44px; align-items: center; justify-content: center; gap: 8px; padding: 7px 12px; color: var(--text); font-size: 12px; font-weight: 650; }
#vdd-root .vdd-diag-actions button.vdd-primary { border: 1px solid transparent; border-radius: 8px; color: var(--accent-ink); background: var(--accent); }
#vdd-root .vdd-diag-actions svg { width: 16px; height: 16px; flex: 0 0 auto; }
#vdd-root .vdd-check { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
#vdd-root .vdd-check > svg { width: 20px; height: 20px; margin-top: 1px; }
#vdd-root .vdd-check b { display: block; color: var(--text); font-size: 12.5px; font-weight: 680; }
#vdd-root .vdd-check p { margin: 4px 0 0; color: var(--muted); font-size: 11.5px; line-height: 1.5; overflow-wrap: anywhere; }
#vdd-root .vdd-check p.fix { color: var(--accent); }
#vdd-root .vdd-check[data-s="ok"] > svg,
#vdd-root .vdd-check[data-s="warn"] > svg { color: var(--accent); }
#vdd-root .vdd-check[data-s="bad"] > svg { color: var(--danger); }
#vdd-root .vdd-check[data-s="bad"] { border-color: rgba(233, 132, 122, .28); }
#vdd-root .vdd-check[data-s="warn"] { border-color: rgba(168, 245, 0, .24); }

#vdd-root #vdd-boot { position: absolute; inset: 0; z-index: 6; display: grid; place-items: center; align-content: center; gap: 15px; padding: 24px; background: var(--canvas); text-align: center; transition: opacity .22s ease, visibility 0s linear .22s; }
#vdd-root #vdd-boot[hidden] { display: grid !important; visibility: hidden; opacity: 0; pointer-events: none; }
#vdd-root #vdd-boot .vdd-boot-ring { position: relative; display: grid; width: 72px; height: 72px; place-items: center; border: 1px solid var(--line); border-radius: 50%; color: var(--accent); background: var(--surface); }
#vdd-root #vdd-boot .vdd-boot-ring::before,
#vdd-root #vdd-boot .vdd-boot-ring::after { display: none; }
#vdd-root #vdd-boot .vdd-boot-ring svg { position: relative; z-index: 1; width: 32px; height: 32px; }
#vdd-root #vdd-boot h2 { margin: 0; color: var(--text); font-size: 19px; font-weight: 720; letter-spacing: -.03em; }
#vdd-root #vdd-boot p { min-height: 1.5em; margin: 0; color: var(--muted); font-size: 12px; }
#vdd-root #vdd-boot .vdd-boot-bar { width: min(240px, 72%); height: 3px; overflow: hidden; border-radius: 9px; background: var(--surface-high); }
#vdd-root #vdd-boot .vdd-boot-bar i { display: block; width: 0; height: 100%; border-radius: inherit; background: var(--accent); transition: width .4s var(--ease-out); }

#vdd-root .vdd-footer { flex: 0 0 auto; padding: 11px 16px; border-top: 1px solid var(--line); color: var(--quiet); font-size: 10.5px; text-align: center; }
#vdd-root .vdd-footer span { padding: 0 5px; color: var(--accent); }
#vdd-toast { position: fixed; right: max(16px, env(safe-area-inset-right)); bottom: calc(18px + env(safe-area-inset-bottom)); left: max(16px, env(safe-area-inset-left)); z-index: 2147483647; width: fit-content; max-width: min(440px, calc(100vw - 32px)); margin-inline: auto; padding: 11px 15px; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: var(--surface-high); box-shadow: 0 10px 28px rgba(0, 0, 0, .3); font-size: 12px; font-weight: 550; text-align: center; opacity: 0; pointer-events: none; transform: translateY(8px); transition: opacity .18s ease, transform .2s var(--ease-out); }
#vdd-toast.show { opacity: 1; transform: none; }

@keyframes vdd-panel-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes vdd-card-in { from { opacity: 0; transform: translate3d(0, 4px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
@keyframes vdd-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes vdd-progress { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(210%, 0, 0); } }
@keyframes vdd-button-spin { to { transform: rotate(360deg); } }
@keyframes vdd-refresh { to { transform: rotate(180deg); } }
@keyframes vdd-view-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
@keyframes vdd-check { from { transform: scale(.65); opacity: 0; } to { transform: scale(1); opacity: 1; } }

#vdd-root .vdd-card.vdd-enter { animation: vdd-card-in .18s var(--ease-out) both; }
@media (hover: hover) {
  #vdd-open:hover { border-color: var(--accent); background: #11170a; }
  #vdd-open:hover::before { transform: scale(1.04); }
  #vdd-root .vdd-icon:hover { border-color: var(--line); color: var(--text); background: var(--surface-raised); }
  #vdd-root .vdd-tab:hover:not([aria-selected="true"]) { color: var(--text); }
  #vdd-root .vdd-text-btn:hover { color: var(--text); background: rgba(255, 255, 255, .045); }
  #vdd-root .vdd-link-btn:hover:not(:disabled),
  #vdd-root .vdd-btn:hover:not(:disabled),
  #vdd-root .vdd-diag-actions button.vdd-primary:hover:not(:disabled) { background: #c4ff50; transform: translateY(-1px); }
  #vdd-root .vdd-quality-refresh:hover:not(:disabled),
  #vdd-root .vdd-ghost:hover,
  #vdd-root .vdd-cancel:hover { border-color: rgba(255, 255, 255, .18); background: var(--surface-high); }
  #vdd-root .vdd-card:hover { border-color: rgba(255, 255, 255, .16); }
  #vdd-root .vdd-tile:hover { border-color: rgba(168, 245, 0, .38); transform: translateY(-1px); }
  #vdd-root .vdd-recent:hover { border-color: rgba(255, 255, 255, .16); background: var(--surface-raised); }
}

@media (min-width: 761px) {
  #vdd-panel.vdd-full {
    top: 50%;
    left: 50%;
    width: min(calc(var(--vdd-w, 100vw) - 2rem), 1040px);
    height: min(calc(var(--vdd-h, 100dvh) - 2rem), 860px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 18px;
    box-shadow: 0 18px 52px rgba(0, 0, 0, .42), 0 2px 8px rgba(0, 0, 0, .24);
    transform: translate(-50%, calc(-50% + 10px)) scale(.99);
    transform-origin: center;
  }
  #vdd-panel.vdd-full.show { transform: translate(-50%, -50%) scale(1); }
  #vdd-panel.vdd-full .vdd-head,
  #vdd-panel.vdd-full .vdd-tabs,
  #vdd-panel.vdd-full .vdd-body,
  #vdd-panel.vdd-full .vdd-footer { width: min(100%, 1000px); margin-inline: auto; }
  #vdd-panel.vdd-full .vdd-head { padding-inline: clamp(20px, 2.2vw, 28px); }
  #vdd-panel.vdd-full .vdd-tabs { margin-bottom: 15px; }
  #vdd-panel.vdd-full .vdd-footer { padding-bottom: 12px; }
}

@media (max-width: 520px) {
  #vdd-root .vdd-head { padding-top: 14px; padding-bottom: 12px; }
  #vdd-root .vdd-logo { width: 39px; height: 39px; }
  #vdd-root .vdd-icon { width: 44px; height: 44px; }
  #vdd-root .vdd-tabs { margin-bottom: 10px; }
}
@media (max-width: 420px) {
  #vdd-root .vdd-head { gap: 6px; padding-inline: 12px; }
  #vdd-root .vdd-eyebrow,
  #vdd-root .vdd-title span { display: none; }
  #vdd-root .vdd-title { font-size: clamp(17px, 5.3vw, 20px); }
  #vdd-root .vdd-sub { margin-top: 3px; font-size: 11px; }
  #vdd-root .vdd-icon { width: clamp(40px, 11vw, 44px); height: clamp(40px, 11vw, 44px); }
  #vdd-root .vdd-tab { gap: 5px; padding-inline: 4px; font-size: clamp(11px, 3.3vw, 12px); }
  #vdd-root .vdd-tab svg { width: 15px; height: 15px; }
  #vdd-root .vdd-link-view,
  #vdd-sites-view,
  #vdd-diag-view { padding-inline: 13px; }
}
@media (max-width: 360px) {
  #vdd-root .vdd-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    grid-template-areas: "logo main diag close" ". . expand refresh";
    gap: 5px;
    padding: 11px 10px;
  }
  #vdd-root .vdd-logo { grid-area: logo; width: 35px; height: 35px; }
  #vdd-root .vdd-head-main { grid-area: main; }
  #vdd-root #vdd-diag { grid-area: diag; }
  #vdd-root #vdd-close { grid-area: close; }
  #vdd-root #vdd-expand { grid-area: expand; }
  #vdd-root #vdd-refresh { grid-area: refresh; }
  #vdd-root .vdd-icon { width: 38px; height: 38px; }
  #vdd-root .vdd-tabs { margin-inline: 10px; }
  #vdd-root .vdd-tab { min-height: 47px; flex-direction: column; gap: 2px; font-size: 10px; line-height: 1.05; }
  #vdd-root .vdd-tab svg { width: 15px; height: 15px; }
  #vdd-list { padding-inline: 12px; }
}
@media (max-height: 560px) and (max-width: 760px) {
  #vdd-root .vdd-head { padding-top: 7px; padding-bottom: 7px; }
  #vdd-root .vdd-eyebrow,
  #vdd-root .vdd-footer { display: none; }
  #vdd-root .vdd-tabs { margin-bottom: 7px; }
  #vdd-root .vdd-tab { min-height: 38px; }
  #vdd-root .vdd-logo { width: 34px; height: 34px; }
}
@media (prefers-reduced-motion: reduce) {
  #vdd-root *,
  #vdd-root *::before,
  #vdd-root *::after,
  #vdd-open::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
}
  `;
  const CSS2 = ``;

  function addStyle() {
    if (document.getElementById('vdd-style')) return;
    const style = document.createElement('style');
    style.id = 'vdd-style';
    style.textContent = CSS + CSS2;
    (document.head || document.documentElement).appendChild(style);
  }

  const SCROLL_HOLD = { active: false, pending: false, timer: 0 };

  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel']) {
    window.addEventListener(type, event => {
      const target = event.target;
      if (target && target.closest && target.closest('#vdd-root')) event.stopImmediatePropagation();
    }, { capture: true, passive: true });
  }

  const PAGE_LOCK = { on: false, y: 0, saved: null };
  function syncPageLock() {
    const panel = document.getElementById('vdd-panel');
    const want = Boolean(panel && panel.classList.contains('show') && panel.classList.contains('vdd-full') && window.matchMedia('(pointer: coarse)').matches);
    const body = document.body, html = document.documentElement;
    if (!body || want === PAGE_LOCK.on) return;
    if (want) {
      PAGE_LOCK.y = window.pageYOffset || html.scrollTop || 0;
      const keys = ['position', 'top', 'left', 'right', 'width', 'overflow'];
      PAGE_LOCK.saved = { body: keys.map(k => [k, body.style.getPropertyValue(k), body.style.getPropertyPriority(k)]), html: [html.style.getPropertyValue('overflow'), html.style.getPropertyPriority('overflow')] };
      const set = (k, v) => body.style.setProperty(k, v, 'important');
      set('position', 'fixed'); set('top', `${-PAGE_LOCK.y}px`); set('left', '0'); set('right', '0'); set('width', '100%'); set('overflow', 'hidden');
      html.style.setProperty('overflow', 'hidden', 'important');
      PAGE_LOCK.on = true;
    } else {
      const saved = PAGE_LOCK.saved; PAGE_LOCK.on = false; PAGE_LOCK.saved = null;
      if (saved) {
        for (const [k, v, pr] of saved.body) { if (v) body.style.setProperty(k, v, pr); else body.style.removeProperty(k); }
        if (saved.html[0]) html.style.setProperty('overflow', saved.html[0], saved.html[1]); else html.style.removeProperty('overflow');
      }
      try { window.scrollTo({ top: PAGE_LOCK.y, left: 0, behavior: 'instant' }); } catch { window.scrollTo(0, PAGE_LOCK.y); }
    }
  }

  function layoutPanel() {
    const root = document.getElementById('vdd-root');
    if (!root) return;
    const de = document.documentElement, std = document.compatMode === 'CSS1Compat';
    const w = Math.round((std && de.clientWidth) || window.innerWidth), h = Math.round((std && de.clientHeight) || window.innerHeight);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    root.appendChild(probe);
    const cs = getComputedStyle(probe);
    const [sat, sar, sab, sal] = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(v => parseFloat(v) || 0);
    probe.remove();
    const margin = w <= 520 ? 8 : 16, bottom = (w <= 520 ? 82 : 86) + sab;
    const cw = Math.max(240, Math.min(480, w - 2 * margin - sal - sar));
    const ch = Math.max(220, Math.min(810, h - bottom - sat - 12));
    const vars = { w, h, sat, sar, sab, sal, cw, ch, cl: w - cw - margin - sar, ct: h - ch - bottom, d: Math.ceil(Math.hypot(w, h)) + 4 };
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(`--vdd-${key}`, `${value}px`);
  }

  const PANEL_STATE = { shown: false, timer: 0 };
  function syncPanelClosing() {
    const panel = document.getElementById('vdd-panel');
    if (!panel) return;
    if (panel.classList.contains('show')) {
      clearTimeout(PANEL_STATE.timer); PANEL_STATE.shown = true; if (panel.classList.contains('vdd-closing')) panel.classList.remove('vdd-closing');
    } else if (PANEL_STATE.shown) {
      PANEL_STATE.shown = false; panel.classList.add('vdd-closing');
      PANEL_STATE.timer = setTimeout(() => { if (panel.classList.contains('vdd-closing')) panel.classList.remove('vdd-closing'); }, 500);
    }
  }

  function buildUi() {
    if (document.getElementById('vdd-root')) return;
    addStyle();

    const root = document.createElement('div');
    root.id = 'vdd-root';
    root.innerHTML = `
      <button id="vdd-open" type="button" aria-label="Abrir downloads"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-opacity=".32" stroke-width="2"/><circle class="vdd-ring" cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="18 61"/><g class="vdd-arrow" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8.5v10"/><path d="m11.4 14.4 4.6 4.6 4.6-4.6"/></g><path d="M11 23.2h10" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></button>
      <section id="vdd-panel" class="vdd-full" role="dialog" aria-label="Baixar vídeos">
        <div class="vdd-aurora" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="vdd-head">
          <div class="vdd-logo" aria-hidden="true"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-opacity=".32" stroke-width="2"/><circle class="vdd-ring" cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="18 61"/><g class="vdd-arrow" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8.5v10"/><path d="m11.4 14.4 4.6 4.6 4.6-4.6"/></g><path d="M11 23.2h10" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg></div>
          <div class="vdd-head-main">
            <div class="vdd-eyebrow">DOWNLOADS NO NAVEGADOR</div><div class="vdd-title">OPTDOWNS <span>${SCRIPT_VERSION}</span></div>
            <div class="vdd-sub" id="vdd-count">Procurando mídia...</div>
          </div>
          <button class="vdd-icon vdd-expand" id="vdd-expand" type="button" aria-label="Expandir em tela cheia" aria-pressed="true">${ic("expand","vdd-ico-out")}${ic("collapse","vdd-ico-in")}</button>
          <button class="vdd-icon" id="vdd-refresh" type="button" aria-label="Atualizar">${ic("refresh")}</button>
          <button class="vdd-icon" id="vdd-diag" type="button" aria-label="Diagnóstico e correção" aria-pressed="false">${ic("pulse")}</button>
          <button class="vdd-icon" id="vdd-close" type="button" aria-label="Fechar">${ic("close")}</button>
        </div>
        <div class="vdd-tabs" role="tablist" aria-label="Origem do vídeo">
          <button class="vdd-tab active" id="vdd-tab-page" type="button" role="tab" aria-selected="true">${ic("page")}<span>Nesta página</span></button>
          <button class="vdd-tab" id="vdd-tab-link" type="button" role="tab" aria-selected="false">${ic("link")}<span>Por link</span></button>
          <button class="vdd-tab" id="vdd-tab-sites" type="button" role="tab" aria-selected="false">${ic("sites")}<span>Sites</span></button>
        </div>
        <div class="vdd-body">
          <div class="vdd-view" id="vdd-page-view" role="tabpanel">
            <div id="vdd-list"></div>
          </div>
          <div class="vdd-view" id="vdd-link-view" role="tabpanel" hidden>
            <form class="vdd-link-form" id="vdd-link-form">
              <div class="vdd-input-wrap"><input id="vdd-link-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Cole o link do vídeo ou da página" aria-label="Link do vídeo ou da página"><button type="button" class="vdd-input-clear" aria-label="Limpar link" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div>
              <button class="vdd-link-btn" id="vdd-link-submit" type="submit">Buscar</button>
            </form>
            <div class="vdd-link-tools"><span class="vdd-tool-group"><button id="vdd-paste" class="vdd-text-btn" type="button">Colar link</button><button id="vdd-link-clear-all" class="vdd-text-btn" type="button">Limpar tudo</button></span><button id="vdd-link-cancel" class="vdd-text-btn" type="button" hidden>Cancelar busca</button></div><div class="vdd-link-note">TikTok, Instagram, arquivos de vídeo, playlists HLS e páginas com vários vídeos. A disponibilidade depende da fonte.</div>
            <div class="vdd-link-status" id="vdd-link-status" role="status"></div>
            <div class="vdd-link-seg" id="vdd-link-seg" role="tablist" hidden><button type="button" role="tab" data-pane="video" class="on" aria-selected="true">Este vídeo<span id="vdd-seg-video"></span></button><button type="button" role="tab" data-pane="site" aria-selected="false">Vídeos da página<span id="vdd-seg-site"></span></button></div>
            <div id="vdd-link-results"></div>
            <div id="vdd-link-listing" hidden></div>
          </div>
          <div class="vdd-view" id="vdd-sites-view" role="tabpanel" hidden>
            <form class="vdd-link-form" id="vdd-sites-form">
              <div class="vdd-input-wrap"><input id="vdd-sites-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Cole um link aqui" aria-label="Link do site"><button type="button" class="vdd-input-clear" aria-label="Limpar link" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div>
              <button class="vdd-link-btn" type="submit">Buscar</button>
            </form>
            <p class="vdd-link-note" id="vdd-sites-hint">Escolha uma fonte para ver o formato de link aceito. A busca usa o mesmo motor de “Por link”.</p>
            <div class="vdd-section">Fontes</div>
            <div class="vdd-tiles" id="vdd-tiles"></div>
            <div id="vdd-recents" hidden></div>
          </div>
          <div class="vdd-view" id="vdd-diag-view" role="tabpanel" hidden>
            <p class="vdd-diag-intro">Verifica o OPTDOWNS neste dispositivo (gerenciador, conversor HLS, Worker) e explica os erros recentes com sugestões. Ele não altera outros scripts nem contorna login ou proteção dos sites.</p>
            <div class="vdd-diag-actions">
              <button type="button" class="vdd-primary" id="vdd-diag-run">${ic("pulse")}<span>Diagnosticar</span></button>
              <button type="button" class="vdd-ghost" id="vdd-diag-fix">${ic("broom")}<span>Limpar e corrigir</span></button>
              <button type="button" class="vdd-ghost" id="vdd-diag-copy">${ic("copy")}<span>Copiar relatório</span></button>
            </div>
            <div id="vdd-diag-out" aria-live="polite"></div>
          </div>
        </div>
        <div id="vdd-boot" hidden aria-live="polite">
          <div class="vdd-boot-ring"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 6v14"/><path d="m10.5 15 5.5 5.5 5.5-5.5"/><path d="M8 25.5h16"/></svg></div>
          <h2>Iniciando OPTDOWNS</h2>
          <p>Preparando…</p>
          <div class="vdd-boot-bar"><i></i></div>
        </div>
        <div class="vdd-footer">Processamento local <span>•</span> Escolha a qualidade antes de baixar</div>
      </section>
      <div id="vdd-toast" role="status"></div>
    `;
    document.documentElement.appendChild(root);
    new MutationObserver(() => { syncPageLock(); syncPanelClosing(); }).observe(document.getElementById('vdd-panel'), { attributes: true, attributeFilter: ['class'] });
    layoutPanel();
    let layoutFrame = 0;
    const scheduleLayout = () => {
      if (layoutFrame) return;
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0; root.classList.add('vdd-resizing'); layoutPanel();
        requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('vdd-resizing')));
      });
    };
    window.addEventListener('resize', scheduleLayout, { passive: true });
    window.addEventListener('orientationchange', () => { scheduleLayout(); setTimeout(scheduleLayout, 350); }, { passive: true });
    window.addEventListener('pagehide', () => { if (PAGE_LOCK.on) { document.getElementById('vdd-panel')?.classList.remove('show'); syncPageLock(); } });
    for (const type of ['touchmove', 'wheel']) root.addEventListener(type, event => event.stopPropagation(), { passive: true });
    document.getElementById('vdd-expand').addEventListener('click', event => {
      const panel = document.getElementById('vdd-panel');
      const full = panel.classList.toggle('vdd-full');
      event.currentTarget.setAttribute('aria-pressed', String(full));
      event.currentTarget.setAttribute('aria-label', full ? 'Recolher painel' : 'Expandir em tela cheia');
    });
    root.querySelector('.vdd-body').addEventListener('scroll', () => {
      SCROLL_HOLD.active = true;
      clearTimeout(SCROLL_HOLD.timer);
      SCROLL_HOLD.timer = setTimeout(() => {
        SCROLL_HOLD.active = false;
        if (SCROLL_HOLD.pending) { SCROLL_HOLD.pending = false; render(); renderLinkResults(); }
      }, 220);
    }, { passive: true });

    document.getElementById('vdd-open').addEventListener('click', () => {
      APP.panelOpen = !APP.panelOpen;
      document.getElementById('vdd-panel').classList.toggle('show', APP.panelOpen);
      if (APP.panelOpen) { layoutPanel(); scanAll(); runBootScreen(); }
    });

    document.getElementById('vdd-close').addEventListener('click', () => {
      APP.panelOpen = false;
      document.getElementById('vdd-panel').classList.remove('show');
    });

    document.getElementById('vdd-refresh').addEventListener('click', event => {
      const refreshButton = event.currentTarget;
      refreshButton.classList.remove('vdd-spinning'); void refreshButton.offsetWidth; refreshButton.classList.add('vdd-spinning');
      setTimeout(() => refreshButton.classList.remove('vdd-spinning'), 900);
      scanAll();
      toast('Lista atualizada');
    });

    document.getElementById('vdd-link-cancel').addEventListener('click', () => APP.linkController?.abort());
    for (const id of ['vdd-link-input', 'vdd-sites-input']) {
      const field = document.getElementById(id); if (!field) continue;
      const clear = field.parentElement.querySelector('.vdd-input-clear');
      field.addEventListener('input', () => syncInputClear(field));
      field.addEventListener('focus', () => { if (field.value) setTimeout(() => { try { field.select(); } catch {} }, 0); });
      clear?.addEventListener('click', () => { field.value = ''; syncInputClear(field); field.focus(); });
    }
    document.getElementById('vdd-link-clear-all')?.addEventListener('click', clearLinkAll);
    document.getElementById('vdd-link-seg')?.addEventListener('click', event => { const b = event.target.closest('button[data-pane]'); if (b) setLinkPane(b.dataset.pane); });
    document.getElementById('vdd-paste').addEventListener('click', async () => {
      const input = document.getElementById('vdd-link-input');
      try { input.value = await navigator.clipboard.readText(); syncInputClear(input); input.focus(); }
      catch { input.focus(); toast('Toque e segure no campo para colar.'); }
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { APP.panelOpen = false; document.getElementById('vdd-panel').classList.remove('show'); document.getElementById('vdd-open').focus(); }
      if (event.target.matches('.vdd-tab') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const order = ['page', 'link', 'sites'], at = Math.max(0, order.indexOf(APP.activeTab)), step = event.key === 'ArrowRight' ? 1 : -1;
        switchTab(order[(at + step + order.length) % order.length]);
        document.getElementById(`vdd-tab-${APP.activeTab}`)?.focus();
      }
    });
    document.getElementById('vdd-tab-page').addEventListener('click', () => switchTab('page'));
    document.getElementById('vdd-tab-link').addEventListener('click', () => switchTab('link'));
    document.getElementById('vdd-link-form').addEventListener('submit', event => {
      event.preventDefault();
      rememberLink(document.getElementById('vdd-link-input')?.value);
      handleLinkSearch();
    });
    document.getElementById('vdd-tab-sites').addEventListener('click', () => switchTab('sites'));
    document.getElementById('vdd-diag').addEventListener('click', () => switchTab(APP.activeTab === 'diag' ? 'page' : 'diag'));
    document.getElementById('vdd-diag-run').addEventListener('click', runDiagnostics);
    document.getElementById('vdd-diag-fix').addEventListener('click', applySafeFixes);
    document.getElementById('vdd-diag-copy').addEventListener('click', copyDiagnostics);
    const tiles = document.getElementById('vdd-tiles'), sitesInput = document.getElementById('vdd-sites-input'), sitesHint = document.getElementById('vdd-sites-hint');
    tiles.innerHTML = SOURCE_TILES.map(t => `<button type="button" class="vdd-tile" data-id="${t.id}">${t.icon()}<b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.hint)}</small></button>`).join('');
    tiles.addEventListener('click', event => {
      const tile = event.target.closest('.vdd-tile'); if (!tile) return;
      const info = SOURCE_TILES.find(t => t.id === tile.dataset.id); if (!info) return;
      for (const other of tiles.children) other.classList.toggle('on', other === tile);
      sitesInput.placeholder = info.example; sitesHint.textContent = `${info.title}: ${info.hint.toLowerCase()}. A disponibilidade depende da fonte.`; sitesInput.focus();
    });
    document.getElementById('vdd-sites-form').addEventListener('submit', event => {
      event.preventDefault();
      let url; try { url = pastedPublicUrl(sitesInput.value); } catch (error) { sitesHint.textContent = error.message || 'Cole um link público válido.'; return; }
      rememberLink(url); searchFromSites(url);
    });
    document.getElementById('vdd-recents').addEventListener('click', event => {
      if (event.target.closest('#vdd-recents-clear')) { try { localStorage.removeItem(RECENT_KEY); } catch {} renderRecents(); return; }
      const item = event.target.closest('.vdd-recent'); if (item) { const url = readRecents()[Number(item.dataset.i)]; if (url) searchFromSites(url); }
    });
    renderRecents();
    installInteractionFx(root);
  }

  function switchTab(tab) {
    const name = ['page', 'link', 'sites', 'diag'].includes(tab) ? tab : 'page';
    APP.activeTab = name;
    const views = { page: 'vdd-page-view', link: 'vdd-link-view', sites: 'vdd-sites-view', diag: 'vdd-diag-view' };
    for (const [key, id] of Object.entries(views)) { const view = document.getElementById(id); if (view) view.hidden = key !== name; }
    for (const key of ['page', 'link', 'sites']) {
      const element = document.getElementById(`vdd-tab-${key}`), on = key === name;
      element?.classList.toggle('active', on); element?.setAttribute('aria-selected', String(on));
    }
    const diagButton = document.getElementById('vdd-diag');
    diagButton?.classList.toggle('on', name === 'diag'); diagButton?.setAttribute('aria-pressed', String(name === 'diag'));
    const refresh = document.getElementById('vdd-refresh');
    if (refresh) refresh.hidden = name !== 'page';
    const scroller = document.querySelector('#vdd-root .vdd-body'); if (scroller && name !== 'page') scroller.scrollTop = 0;

    if (name === 'link') {
      updateHeaderCount(APP.linkResults.length
        ? `${APP.linkResults.length} ${APP.linkResults.length === 1 ? 'opção' : 'opções'} por link`
        : 'Baixar por link');
      setTimeout(() => document.getElementById('vdd-link-input')?.focus(), 0);
    } else if (name === 'sites') {
      updateHeaderCount('Fontes e links recentes'); renderRecents();
    } else if (name === 'diag') {
      updateHeaderCount('Diagnóstico e correção');
      if (!APP.lastDiag) runDiagnostics();
    } else {
      render();
    }
  }

  function updateHeaderCount(text) {
    const count = document.getElementById('vdd-count');
    if (count) count.textContent = text || '';
  }

  function toast(message, ms = 2300) {
    const el = document.getElementById('vdd-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(APP.toastTimer);
    APP.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function isHttp(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  function absUrl(url, base = location.href) {
    try { return new URL(url, base).href; } catch { return String(url || ''); }
  }

  function isHls(url, type = '') {
    return /\.m3u8(?:$|[?#&])/i.test(String(url || '')) || /mpegurl/i.test(String(type || ''));
  }

  function isDash(url, type = '') {
    return /\.mpd(?:$|[?#&])/i.test(String(url || '')) || /application\/dash\+xml/i.test(String(type || ''));
  }

  function isMp4(url, type = '') {
    const raw = String(url || '');
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch {}
    return /\.(?:mp4|m4v)(?:$|[?#&])/i.test(decoded) || /video\/(?:mp4|x-m4v)/i.test(String(type || ''));
  }

  function isKnownNonMp4Video(url, type = '') {
    return /\.(?:webm|ogv|ogg|mov|mkv|flv|ts|m2ts)(?:$|[?#&])/i.test(String(url || '')) ||
      /video\/(?:webm|ogg|quicktime|x-matroska|x-flv|mp2t)/i.test(String(type || ''));
  }

  function isBlobUrl(url) {
    return /^blob:/i.test(String(url || ''));
  }

  function isUsableDirectUrl(url) {
    return isHttp(url) || isBlobUrl(url);
  }

  function getGmXhr() {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    try {
      if (typeof GM === 'object' && typeof GM?.xmlHttpRequest === 'function') return GM.xmlHttpRequest.bind(GM);
    } catch {}
    return null;
  }

  function getGmDownload() {
    if (typeof GM_download === 'function') return GM_download;
    try {
      if (typeof GM === 'object' && typeof GM?.download === 'function') return GM.download.bind(GM);
    } catch {}
    return null;
  }

  function currentRequestReferrer() {
    const explicit = safeHttpUrl(APP.requestReferrer || '');
    return explicit || location.href;
  }

  function rememberNetworkMedia(url, type = '', metadata = {}) {
    const full = absUrl(url);
    if (!isHttp(full)) return false;
    const normalizedType = mediaContentType(type);
    const hls = isHls(full, normalizedType);
    const directHint = knownDirectFormatHint(full, normalizedType);
    if (!hls && !directHint && !metadata.trusted) return false;

    const now = Date.now();
    APP.recentNetworkMedia = [
      {
        url: full,
        type: normalizedType,
        kind: hls ? 'HLS' : (directHint?.label || 'VÍDEO'),
        time: now,
        trusted: Boolean(metadata.trusted),
      },
      ...APP.recentNetworkMedia.filter(item => item.url !== full)
    ].slice(0, 80);

    return registerMedia(full, normalizedType, false, {
      ...networkMetadata(),
      ...metadata,
      trusted: Boolean(metadata.trusted || hls || directHint),
    });
  }

  function rememberBinaryCandidate(url, type = '') {
    const full = safeHttpUrl(url || '');
    if (!full || restrictedPlatformNotice(full)) return false;
    const now = Date.now();
    const normalizedType = mediaContentType(type);
    APP.recentBinaryCandidates = [
      { url: full, type: normalizedType, time: now },
      ...APP.recentBinaryCandidates.filter(item => item.url !== full)
    ].slice(0, 60);
    return true;
  }

  function rememberNetworkRequest(url, type = '', metadata = {}) {
    const full = safeHttpUrl(url || '');
    if (!full || restrictedPlatformNotice(full)) return false;
    const parsed = (() => { try { return new URL(full); } catch { return null; } })();
    if (!parsed) return false;
    const path = parsed.pathname.toLowerCase();
    if (/\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)(?:$|[?#])/i.test(path)) return false;
    const normalizedType = mediaContentType(type);
    const now = Date.now();
    APP.recentNetworkRequests = [
      {
        url: full,
        type: normalizedType,
        time: now,
        status: Number(metadata.status || 0),
        source: String(metadata.source || ''),
      },
      ...APP.recentNetworkRequests.filter(item => item.url !== full)
    ].slice(0, 160);
    return true;
  }

  function knownDirectFormatHint(url, type = '') {
    const formats = [
      ['mp4', 'video/mp4', 'MP4', /^(?:video\/(?:mp4|x-m4v)|application\/mp4)$/, /\.(?:mp4|m4v)(?:$|[?#&])/i],
      ['mov', 'video/quicktime', 'MOV', /^video\/quicktime$/, /\.mov(?:$|[?#&])/i],
      ['webm', 'video/webm', 'WEBM', /^video\/webm$/, /\.webm(?:$|[?#&])/i],
      ['mkv', 'video/x-matroska', 'MKV', /^(?:video|application)\/x-matroska$/, /\.mkv(?:$|[?#&])/i],
      ['ogv', 'video/ogg', 'OGV', /^(?:video|application)\/ogg$/, /\.(?:ogv|ogg)(?:$|[?#&])/i],
      ['ts', 'video/mp2t', 'TS', /^video\/mp2t$/, /\.(?:ts|m2ts)(?:$|[?#&])/i],
      ['flv', 'video/x-flv', 'FLV', /^video\/x-flv$/, /\.flv(?:$|[?#&])/i],
      ['avi', 'video/x-msvideo', 'AVI', /^video\/(?:x-msvideo|avi)$/, /\.avi(?:$|[?#&])/i],
    ];
    const mime = mediaContentType(type);
    let raw = String(url || '');
    try { raw = decodeURIComponent(raw); } catch {}
    const format = formats.find(item => item[3].test(mime)) || formats.find(item => item[4].test(raw));
    return format ? { ext: format[0], mime: format[1], label: format[2] } : null;
  }

  function isLikelyDirectVideoUrl(url, type = '') {
    return Boolean(knownDirectFormatHint(url, type)) || isBlobUrl(url);
  }

  function directKindFromHint(url, type = '') {
    return knownDirectFormatHint(url, type)?.label || 'VÍDEO';
  }

  function cleanFilenameBase(value) {
    let base = cleanName(value || 'video')
      .replace(/(?:\.(?:mp4|m4v|mov|webm|mkv|ogv|ogg|ts|m2ts|flv|avi|m3u8|bin|dat|download|file))+$/i, '')
      .replace(/[.\s]+$/g, '') || 'video';
    return base.slice(0, 115).replace(/[.\s]+$/g, '') || 'video';
  }

  function filenameForFormat(value, format) {
    const ext = String(format?.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    return `${cleanFilenameBase(value)}.${ext}`;
  }

  function ensureBlobMime(blob, mime) {
    if (!blob?.size) return blob;
    const wanted = String(mime || '').split(';', 1)[0].trim().toLowerCase();
    const current = String(blob.type || '').split(';', 1)[0].trim().toLowerCase();
    if (!wanted || current === wanted) return blob;
    return new Blob([blob], { type: wanted });
  }

  function isoBrand(bytes, ftypStart) {
    if (!bytes || ftypStart < 0 || bytes.byteLength < ftypStart + 12) return '';
    return String.fromCharCode(
      bytes[ftypStart + 8], bytes[ftypStart + 9], bytes[ftypStart + 10], bytes[ftypStart + 11]
    );
  }

  function detectMediaFormatFromBytes(bytes, contentType = '', url = '') {
    if (!bytes?.byteLength) return null;

    const mime = mediaContentType(contentType);
    const hint = knownDirectFormatHint(url, mime);

    const ftypStart = findMp4Start(bytes);
    if (ftypStart >= 0) {
      const brand = isoBrand(bytes, ftypStart);
      if (/^qt\s\s$/i.test(brand)) return { ext: 'mov', mime: 'video/quicktime', label: 'MOV', confirmed: true };
      return { ext: 'mp4', mime: 'video/mp4', label: 'MP4', confirmed: true };
    }

    if (bytes.byteLength >= 4 &&
        bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
      const header = new TextDecoder().decode(bytes.subarray(0, Math.min(4096, bytes.length)));
      if (/matroska/.test(header)) return { ext: 'mkv', mime: 'video/x-matroska', label: 'MKV', confirmed: true };
      if (/webm/.test(header)) return { ext: 'webm', mime: 'video/webm', label: 'WEBM', confirmed: true };
      return hint ? { ...hint, confirmed: false } : null;
    }

    if (bytes.byteLength >= 4 &&
        bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return { ext: 'ogv', mime: 'video/ogg', label: 'OGV', confirmed: true };
    }

    if (looksLikeTs(bytes)) {
      return { ext: 'ts', mime: 'video/mp2t', label: 'TS', confirmed: true };
    }

    try {
      const sample = new TextDecoder('utf-8').decode(bytes.slice(0, Math.min(bytes.byteLength, 256)));
      if (/^\s*#EXTM3U/i.test(sample)) {
        return { ext: 'm3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS', confirmed: true, hls: true };
      }
    } catch {}

    if (bytes.length >= 12 && fourCc(bytes, 0) === 'RIFF' && fourCc(bytes, 8) === 'AVI ') {
      return { ext: 'avi', mime: 'video/x-msvideo', label: 'AVI', confirmed: true };
    }
    if (bytes.length >= 9 && bytes[0] === 70 && bytes[1] === 76 && bytes[2] === 86 && bytes[3] === 1) {
      return { ext: 'flv', mime: 'video/x-flv', label: 'FLV', confirmed: true };
    }
    return hint ? { ...hint, confirmed: false } : null;
  }

  async function detectBlobFormat(blob, urlOrName = '') {
    if (!blob?.size) return null;
    const probeSize = Math.min(blob.size, 1024 * 1024);
    const bytes = new Uint8Array(await blob.slice(0, probeSize).arrayBuffer());
    return detectMediaFormatFromBytes(bytes, blob.type, urlOrName);
  }

  function contentDispositionFilename(value) {
    const raw = String(value || '');
    let match = raw.match(/filename\*=UTF-8''([^;]+)/i);
    if (match) {
      try { return cleanName(decodeURIComponent(match[1].trim().replace(/^"|"$/g, ''))); } catch {}
    }
    match = raw.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
    return cleanName(match?.[1] || match?.[2] || '');
  }

  function cleanName(text) {
    return String(text || 'video')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'video';
  }

  function forceMp4Filename(value) {
    return filenameForFormat(value, { ext: 'mp4' });
  }

  function pageTitle() {
    const og = document.querySelector('meta[property="og:title"]')?.content;
    return cleanName(og || document.title || 'video');
  }

  function cleanDisplayText(value, maxLength = 180) {
    return String(value || '')
      .replace(/[\x00-\x1F\x7F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  function safeHttpUrl(value, base = location.href) {
    if (!String(value || '').trim()) return '';
    const full = absUrl(value, base);
    return isHttp(full) ? full : '';
  }

  function pageThumbnail(root = document, base = location.href) {
    const selectors = [
      'meta[property="og:image"]',
      'meta[property="og:image:secure_url"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ];
    for (const selector of selectors) {
      const value = root.querySelector?.(selector)?.getAttribute('content');
      const full = safeHttpUrl(value, base);
      if (full) return full;
    }
    return '';
  }

  function sourceHost(url) {
    try { return new URL(url).hostname.replace(/^www\./i, ''); }
    catch { return ''; }
  }

  function formatDuration(seconds) {
    const total = Math.round(Number(seconds || 0));
    if (!Number.isFinite(total) || total <= 0 || total > 7 * 24 * 60 * 60) return '';
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function formatResolution(width, height) {
    const w = Math.round(Number(width || 0));
    const h = Math.round(Number(height || 0));
    if (w <= 0 || h <= 0) return '';
    return `${w}×${h}`;
  }

  function mediaTitleFromUrl(url) {
    try {
      const raw = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '');
      const name = cleanDisplayText(raw.replace(/\.(?:mp4|m4v|m3u8)(?:$|[?#])/i, '').replace(/[-_]+/g, ' '), 90);
      if (name && !/^[a-f0-9-]{18,}$/i.test(name) && !/^\d{8,}$/.test(name)) return name;
    } catch {}
    return '';
  }

  function mediaIdentityKey(url, kind = '') {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      const volatile = /^(?:token|sig|signature|expires?|expiry|policy|key-pair-id|hdnts|auth|authorization|jwt|session|x-amz-.+)$/i;
      [...parsed.searchParams.keys()].forEach(key => {
        if (volatile.test(key)) parsed.searchParams.delete(key);
      });
      parsed.searchParams.sort?.();
      return `${kind}:${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return `${kind}:${String(url || '')}`;
    }
  }

  function videoElementId(video) {
    if (!APP.videoIds.has(video)) APP.videoIds.set(video, APP.nextVideoId++);
    return APP.videoIds.get(video);
  }

  function videoMetadata(video, index = 0) {
    const ownerSelector = 'article, figure, li, [role="listitem"], [data-video-id], [data-e2e*="video"], [class*="video"]';
    let owner = video.closest?.(ownerSelector);
    if (owner === video) owner = video.parentElement?.closest?.(ownerSelector) || video.parentElement;
    const scopedOwner = owner && owner !== document.body && owner !== document.documentElement ? owner : null;
    const titleNode = scopedOwner?.querySelector?.('h1, h2, h3, figcaption, [data-e2e*="desc"], [class*="caption"], [class*="title"]');
    const image = scopedOwner?.querySelector?.('img');
    const explicitTitle = [
      video.getAttribute?.('title'),
      video.getAttribute?.('aria-label'),
      video.dataset?.title,
      titleNode?.textContent,
      image?.getAttribute?.('alt'),
    ].map(value => cleanDisplayText(value)).find(value => value && value.length >= 2);
    const poster = safeHttpUrl(
      video.poster || video.getAttribute?.('poster') || image?.currentSrc || image?.src || image?.getAttribute?.('src')
    );

    return {
      title: explicitTitle || pageTitle(),
      titlePriority: explicitTitle ? 4 : 1,
      thumbnail: poster || pageThumbnail(),
      thumbnailPriority: poster ? 4 : 1,
      duration: Number.isFinite(Number(video.duration)) ? Number(video.duration) : 0,
      width: Number(video.videoWidth || 0),
      height: Number(video.videoHeight || 0),
      videoKey: `video-${videoElementId(video)}`,
      videoIndex: index,
      fromDom: true,
    };
  }

  function removeMediaEntry(url, info) {
    APP.directUrls.delete(url); APP.hlsUrls.delete(url); APP.mediaInfo.delete(url);
    if (info?.identity && APP.mediaIdentityUrls.get(info.identity) === url) APP.mediaIdentityUrls.delete(info.identity);
  }

  function dropStaleDomMedia(live) {
    let dropped = false;
    for (const [url, info] of [...APP.mediaInfo]) {
      if (!/^video-\d+$/.test(info.videoKey || '') || live.has(info.videoKey)) continue;
      removeMediaEntry(url, info);
      if (info.identity) APP.dropped.set(info.identity, Date.now());
      dropped = true;
    }
    return dropped;
  }

  function collectFromDom() {
    let changed = false;
    const live = new Set();
    document.querySelectorAll('video').forEach((video, index) => {
      const metadata = videoMetadata(video, index);
      live.add(metadata.videoKey);
      const items = [
        { url: video.currentSrc, type: video.getAttribute('type') || '' },
        { url: video.src, type: video.getAttribute('type') || '' },
      ];
      video.querySelectorAll('source').forEach(source => {
        items.push({ url: source.src || source.getAttribute('src'), type: source.type || '' });
      });
      for (const item of items) {
        if (registerMedia(item.url, item.type, true, metadata)) changed = true;
      }
    });
    if (dropStaleDomMedia(live)) changed = true;
    return changed;
  }

  function collectFromPerformance() {
    let changed = false;
    try {
      const defaults = {
        title: pageTitle(),
        titlePriority: 1,
        thumbnail: pageThumbnail(),
        thumbnailPriority: 1,
      };
      const allEntries = performance.getEntriesByType('resource');
      if (allEntries.length < APP.perfSeen) APP.perfSeen = 0;
      const newEntries = allEntries.slice(APP.perfSeen);
      APP.perfSeen = allEntries.length;
      newEntries.forEach(entry => {
        if (APP.navAt && entry.startTime < APP.navAt) return;
        const initiator = String(entry?.initiatorType || '').toLowerCase();
        const mediaInitiator = /^(?:video|audio|media)$/.test(initiator);
        if (/^(?:fetch|xmlhttprequest|video|audio|media)$/.test(initiator)) {
          rememberNetworkRequest(entry.name, '', { source: `performance:${initiator}` });
        }
        if (mediaInitiator) {
          if (rememberNetworkMedia(entry.name, '', { ...defaults, trusted: true, label: 'Recurso carregado pelo player' })) changed = true;
        } else if (registerMedia(entry.name, '', false, defaults)) {
          changed = true;
        }
      });
    } catch {}
    return changed;
  }

  function collectFromPageMetadata() {
    let changed = false;
    try {
      const candidates = extractPublicMediaCandidates(document, location.href, { scanRawScripts: false });
      if (publicPlatform(location.href) && (APP.socialScanPage !== location.href || Date.now() - APP.socialScanAt > 5000)) {
        APP.socialScanPage = location.href; APP.socialScanAt = Date.now();
        candidates.push(...extractSocialCandidates(document, location.href));
      }
      for (const candidate of candidates) {
        if (registerMedia(candidate.url, candidate.type, true, candidate)) changed = true;
      }
    } catch (error) {
      console.info('[VDD] Metadados públicos da página não puderam ser lidos:', error);
    }
    return changed;
  }

  function registerMedia(url, type = '', fromVideoElement = false, metadata = {}) {
    if (!url) return false;
    const full = absUrl(url);
    if (!isUsableDirectUrl(full)) return false;
    if (!isHls(full, type) && APP.hlsResources.has(mediaIdentityKey(full, 'DIRECT'))) return false;
    if (responseLooksLikeHtml(type)) return false;
    if (isHttp(full) && (restrictedPlatformNotice(full) || restrictedPlatformNotice(location.href))) return false;

    if (/\/(?:blank|empty|transparent|spacer)\.(?:mp4|webm)(?:$|[?#])/i.test(full)) return false;

    let kind = '';
    if (isHls(full, type)) {
      kind = 'HLS';
    } else if (isLikelyDirectVideoUrl(full, type) || fromVideoElement || metadata.trusted) {
      kind = directKindFromHint(full, type);
    }
    if (!kind) return false;

    const identityKind = kind === 'HLS' ? 'HLS' : 'DIRECT';
    const identity = mediaIdentityKey(full, identityKind);
    if (fromVideoElement) APP.dropped.delete(identity);
    else if (APP.dropped.has(identity)) return false;
    const previousUrl = APP.mediaIdentityUrls.get(identity);
    const previous = APP.mediaInfo.get(previousUrl || full);
    const targetSet = kind === 'HLS' ? APP.hlsUrls : APP.directUrls;
    const otherSet = kind === 'HLS' ? APP.directUrls : APP.hlsUrls;

    if (previousUrl && previousUrl !== full) {
      targetSet.delete(previousUrl);
      otherSet.delete(previousUrl);
      APP.mediaInfo.delete(previousUrl);
    }

    const incomingTitle = cleanDisplayText(metadata.title) || mediaTitleFromUrl(full) || pageTitle();
    const incomingTitlePriority = Number(metadata.titlePriority || (metadata.title ? 2 : 0));
    const incomingThumbnail = safeHttpUrl(metadata.thumbnail || '');
    const incomingThumbnailPriority = Number(metadata.thumbnailPriority || (incomingThumbnail ? 2 : 0));
    const keepPreviousTitle = previous && Number(previous.titlePriority || 0) > incomingTitlePriority;
    const keepPreviousThumbnail = previous && Number(previous.thumbnailPriority || 0) > incomingThumbnailPriority;

    const info = {
      ...(previous || {}),
      kind,
      url: full,
      identity,
      order: previous?.order || APP.nextMediaOrder++,
      title: keepPreviousTitle ? previous.title : incomingTitle,
      titlePriority: keepPreviousTitle ? previous.titlePriority : incomingTitlePriority,
      thumbnail: keepPreviousThumbnail ? previous.thumbnail : (incomingThumbnail || previous?.thumbnail || ''),
      thumbnailPriority: keepPreviousThumbnail ? previous.thumbnailPriority : incomingThumbnailPriority,
      duration: Number(metadata.duration || previous?.duration || 0),
      width: Number(metadata.width || previous?.width || 0),
      height: Number(metadata.height || previous?.height || 0) || Number((full.match(/[/_.=-](144|240|360|480|540|576|720|1080|1440|2160|4320)p?(?=$|[/_.?&=-])/i) || [])[1] || 0),
      noWatermark: metadata.noWatermark === true || previous?.noWatermark === true,
      bandwidth: Number(metadata.bandwidth || previous?.bandwidth || 0),
      gen: APP.navGen,
      lastSeen: Date.now(),
      ownerKey: previous?.ownerKey || metadata.ownerKey ||
        ((!metadata.videoKey && !fromVideoElement && APP.activeVideoKey && Date.now() - APP.activeAt < 20000) ? APP.activeVideoKey : ''),
      videoKey: metadata.videoKey || previous?.videoKey || '',
      videoIndex: Number.isFinite(Number(metadata.videoIndex)) ? Number(metadata.videoIndex) : previous?.videoIndex,
      preferred: Boolean(metadata.preferred || previous?.preferred),
      label: cleanDisplayText(metadata.label || previous?.label || '', 60),
      pageUrl: safeHttpUrl(metadata.pageUrl || previous?.pageUrl || location.href),
      type: mediaContentType(type || metadata.type || previous?.type || ''),
      ...Object.fromEntries(['platform', 'postId', 'sourceRole', 'sourceKey', 'alternatives', 'detectedAt', 'hasAudio', 'codec'].filter(key => metadata[key] !== undefined).map(key => [key, metadata[key]])),
    };

    const changed = !previous || previousUrl !== full ||
      previous.title !== info.title || previous.thumbnail !== info.thumbnail ||
      previous.duration !== info.duration || previous.width !== info.width ||
      previous.height !== info.height || previous.preferred !== info.preferred ||
      previous.kind !== info.kind || previous.type !== info.type;

    APP.mediaIdentityUrls.set(identity, full);
    APP.mediaInfo.set(full, info);
    targetSet.add(full);
    otherSet.delete(full);
    return changed;
  }

  function queueRender() {
    if (!APP.panelOpen || APP.activeTab !== 'page' || APP.working) return;
    clearTimeout(APP.renderTimer);
    APP.renderTimer = setTimeout(render, 120);
  }

  function scanAll() {
    collectFromDom();
    collectFromPerformance();
    collectFromPageMetadata();
    collectKnownPublicSiteMedia(location.href).catch(() => {});
    if (APP.mediaInfo.size > 400) {
      const oldest = [...APP.mediaInfo].sort((a, b) => (a[1].lastSeen || 0) - (b[1].lastSeen || 0));
      oldest.slice(0, oldest.length - 300).forEach(([url, info]) => removeMediaEntry(url, info));
    }
    if (APP.panelOpen) render();
  }

  function onNavigated() {
    APP.navGen++; APP.navAt = performance.now(); APP.perfSeen = 0;
    APP.dropped.clear(); APP.activeVideoKey = ''; APP.expandedGroups.clear();
    collectFromDom();
    for (const [url, info] of [...APP.mediaInfo]) if ((info.gen || 0) < APP.navGen) removeMediaEntry(url, info);
    scanAll();
    if (APP.panelOpen) render();
  }

  function watchNavigation() {
    let last = location.href;
    const routeKey = href => {
      try { const u = new URL(href); return `${u.origin}${u.pathname}${u.search}${/^#[/!]/.test(u.hash) ? u.hash : ''}`; }
      catch { return href; }
    };
    const check = () => {
      if (location.href === last) return;
      const changed = routeKey(location.href) !== routeKey(last);
      last = location.href;
      if (changed) onNavigated();
    };
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
    window.addEventListener('pageshow', check);
    try { window.navigation?.addEventListener?.('navigatesuccess', check); } catch {}
    setInterval(() => { if (!document.hidden) check(); }, 1000);
  }

  function onVideoEvent(event) {
    const video = event.target;
    if (event.type === 'play' && video?.tagName === 'VIDEO') {
      APP.activeVideoKey = `video-${videoElementId(video)}`; APP.activeAt = Date.now();
    }
    clearTimeout(APP.eventScanTimer);
    APP.eventScanTimer = setTimeout(scanAll, 250);
  }

  function decorateDuplicateTitles(items) {
    const totals = new Map();
    const seen = new Map();
    items.forEach(item => {
      const key = String(item.title || '').toLocaleLowerCase();
      totals.set(key, (totals.get(key) || 0) + 1);
    });
    return items.map(item => {
      const key = String(item.title || '').toLocaleLowerCase();
      if ((totals.get(key) || 0) <= 1) return { ...item, displayTitle: item.title };
      const position = (seen.get(key) || 0) + 1;
      seen.set(key, position);
      return { ...item, displayTitle: `${item.title} · Opção ${position}` };
    });
  }

  function variantStem(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'blob:') return '';
      const quality = '(?:144|240|360|426|480|540|576|640|720|960|1080|1280|1440|1920|2160|2560|3840|4320)p?|\\d{3,4}x\\d{3,4}|uhd|fhd|qhd|hd|sd|lq|hq|low|mid|medium|high|orig|original|source|master|index|playlist|manifest|main|stream|video|mp4|hls|avc1?|hevc|h26[45]|vp9|av1';
      let path = decodeURIComponent(parsed.pathname).toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '');
      path = path.replace(new RegExp(`(^|[/_.\\-])(?:${quality})(?=$|[/_.\\-])`, 'g'), '$1').replace(/\/{2,}/g, '/').replace(/[/_.\-]+$/g, '');
      let host = parsed.hostname;
      while (/^(?:www|cdn\d*|v\d*|s\d*|video\d*)\./.test(host)) host = host.replace(/^[^.]+\./, '');
      return path.length >= 4 ? `${host}${path}` : '';
    } catch { return ''; }
  }

  function compareVariants(a, b) {
    return Number(b.noWatermark === true) - Number(a.noWatermark === true) ||
      Number(b.height || 0) - Number(a.height || 0) || Number(b.width || 0) - Number(a.width || 0) ||
      Number(b.bandwidth || 0) - Number(a.bandwidth || 0) || Number(Boolean(b.preferred)) - Number(Boolean(a.preferred)) ||
      Number(a.order || 0) - Number(b.order || 0);
  }

  function groupMediaItems(items) {
    const live = new Set(), playing = [];
    document.querySelectorAll('video').forEach(video => {
      const key = `video-${videoElementId(video)}`;
      live.add(key);
      if (!video.paused && !video.ended && video.readyState > 2) playing.push(key);
    });
    const activeKey = playing.includes(APP.activeVideoKey) ? APP.activeVideoKey : (playing[0] || '');
    const ownerOf = item => live.has(item.videoKey) ? item.videoKey : (live.has(item.ownerKey) ? item.ownerKey : '');
    const stemOwner = new Map();
    for (const item of items) {
      const owner = ownerOf(item), stem = owner ? variantStem(item.url) : '';
      if (stem && !stemOwner.has(stem)) stemOwner.set(stem, owner);
    }
    const keyOf = item => {
      const owner = ownerOf(item);
      if (owner) return `v:${owner}`;
      if (item.platform && item.postId) return `p:${item.platform}:${item.postId}`;
      const stem = variantStem(item.url);
      if (stem) return stemOwner.has(stem) ? `v:${stemOwner.get(stem)}` : `s:${stem}`;
      return `u:${item.identity || item.url}`;
    };
    const groups = new Map();
    for (const item of items) {
      const key = keyOf(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const ordered = [...groups].map(([key, members]) => {
      members.sort(compareVariants);
      const index = Math.min(...members.map(m => Number.isFinite(Number(m.videoIndex)) ? Number(m.videoIndex) : 999999));
      return { key, members, index, order: Math.min(...members.map(m => Number(m.order || 0))),
        active: Boolean(activeKey) && key === `v:${activeKey}` };
    }).sort((a, b) => Number(b.active) - Number(a.active) || a.index - b.index || a.order - b.order).slice(0, 60);
    const titles = decorateDuplicateTitles(ordered.map(group => group.members[0]));
    return ordered.flatMap((group, i) => group.members.slice(0, 8).map((member, rank, list) => ({
      ...member, displayTitle: titles[i].displayTitle, groupKey: group.key, groupIndex: rank,
      groupSize: list.length, groupActive: group.active })));
  }

  function pageMediaItems() {
    return groupMediaItems([
      ...[...APP.directUrls].map(url => APP.mediaInfo.get(url) || { kind: directKindFromHint(url), url, title: pageTitle() }),
      ...[...APP.hlsUrls].map(url => APP.mediaInfo.get(url) || { kind: 'HLS', url, title: pageTitle() }),
    ]);
  }

  function render() {
    if (APP.working) return;
    if (SCROLL_HOLD.active) { SCROLL_HOLD.pending = true; return; }
    const list = document.getElementById('vdd-list');
    if (!list) return;
    const items = pageMediaItems();
    if (APP.activeTab === 'page') {
      const videos = new Set(items.map(item => item.groupKey)).size;
      updateHeaderCount(`${videos} vídeo${videos === 1 ? '' : 's'}${items.length > videos ? ` · ${items.length} fontes` : ' encontrado' + (videos === 1 ? '' : 's')}`);
    }
    renderMediaList(
      list,
      items,
      'Nenhum vídeo encontrado ainda.<br><br>Inicie a reprodução e toque em atualizar.',
      'page'
    );
  }

  function renderLinkResults() {
    const list = document.getElementById('vdd-link-results');
    if (!list) return;
    if (LISTING.state && !LISTING.state.related) return;
    if (SCROLL_HOLD.active) { SCROLL_HOLD.pending = true; return; }
    const items = decorateDuplicateTitles(APP.linkResults);
    renderMediaList(list, items, '', 'link');
    if (APP.activeTab === 'link') {
      updateHeaderCount(items.length
        ? `${items.length} opção${items.length === 1 ? '' : 'ões'} encontrada${items.length === 1 ? '' : 's'}`
        : 'Baixar por link');
    }
  }

  function renderMediaList(list, items, emptyMessage, sourceScope = 'page') {
    const signature = JSON.stringify(items.map(item => [item.url, item.kind, item.title, item.displayTitle, item.height, item.noWatermark, item.groupKey, item.groupIndex, item.groupSize, item.groupActive]));
    if (list.dataset.signature === signature) return;
    const children = [...list.children];
    const prepared = children.filter(card => card.dataset.prepared === 'true');
    const preparedIds = new Set(prepared.map(card => card.dataset.identity));
    const reusable = new Map(children.filter(card => card.dataset.identity && card.dataset.prepared !== 'true').map(card => [card.dataset.identity, card]));
    const scroller = list.closest('.vdd-body'); const savedTop = scroller ? scroller.scrollTop : 0;
    list.dataset.signature = signature;
    const entries = [], seen = new Set();
    items.forEach((item, index) => {
      const identity = mediaIdentityKey(item.url, item.kind);
      if (preparedIds.has(identity) || seen.has(identity)) return;
      seen.add(identity);
      const cardSignature = JSON.stringify([item.url, item.kind, item.title, item.displayTitle, item.thumbnail, item.duration, item.width, item.height, item.noWatermark, item.preferred, item.label, item.hasAudio]);
      let card = reusable.get(identity);
      if (!card || card.dataset.sig !== cardSignature) {
        card = createMediaCard(item, index, sourceScope); card.dataset.identity = identity; card.dataset.sig = cardSignature;
        card.style.setProperty('--i', String(Math.min(index, 8))); card.classList.add('vdd-enter');
        const doneEnter = event => { if (event.target !== card) return; card.classList.remove('vdd-enter'); card.removeEventListener('animationend', doneEnter); };
        card.addEventListener('animationend', doneEnter);
      }
      entries.push([card, item]);
    });
    list.replaceChildren(...prepared, ...entries.map(([card]) => card));
    if (!entries.length && !prepared.length && emptyMessage) list.innerHTML = `<div class="vdd-empty">${emptyMessage}</div>`;
    if (sourceScope === 'page') entries.forEach(([card, item]) => syncGroupUi(list, card, item));
    if (scroller && savedTop && scroller.scrollTop !== savedTop) scroller.scrollTop = savedTop;
  }

  function syncGroupUi(list, card, item) {
    const primary = !item.groupIndex, expanded = APP.expandedGroups.has(item.groupKey);
    card.dataset.group = item.groupKey || ''; card.dataset.groupIndex = String(item.groupIndex || 0);
    card.classList.toggle('vdd-variant', !primary);
    card.hidden = !primary && !expanded;
    card.querySelector('.vdd-variants-toggle')?.remove();
    card.querySelector('.vdd-chip-active')?.remove();
    if (!primary) { card.querySelector('.vdd-badge.preferred')?.remove(); return; }
    if (item.groupActive) card.querySelector('.vdd-meta-row')?.insertAdjacentHTML('afterbegin', '<span class="vdd-badge vdd-chip-active">Reproduzindo</span>');
    if (item.groupSize > 1) {
      const count = item.groupSize - 1;
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = `vdd-variants-toggle${expanded ? ' open' : ''}`; toggle.setAttribute('aria-expanded', String(expanded));
      toggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg><span>${count} outra${count === 1 ? '' : 's'} variante${count === 1 ? '' : 's'} (qualidade/formato)</span>`;
      toggle.addEventListener('click', () => {
        const open = !APP.expandedGroups.has(item.groupKey);
        if (open) APP.expandedGroups.add(item.groupKey); else APP.expandedGroups.delete(item.groupKey);
        toggle.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open));
        for (const other of list.children) if (other.dataset.group === item.groupKey && other.dataset.groupIndex !== '0') other.hidden = !open;
      });
      card.querySelector('.vdd-card-top')?.after(toggle);
    }
  }

  function createMediaCard(item, index, sourceScope = 'page') {
    const card = document.createElement('article');
    card.className = 'vdd-card';
    const title = cleanDisplayText(item.displayTitle || item.title) || `Vídeo ${index + 1}`;
    const resolution = formatResolution(item.width, item.height) || (item.height ? `${item.height}p` : '');
    const duration = formatDuration(item.duration);
    const host = sourceHost(item.pageUrl || item.url) || sourceHost(item.url) || 'Fonte de vídeo';
    const sourceLabel = item.label ? `${host} · ${item.label}` : host;
    const chips = [
      `<span class="vdd-badge">${escapeHtml(item.kind)}</span>`,
      resolution && !(item.height && !item.width) ? `<span class="vdd-meta-chip">${escapeHtml(resolution)}</span>` : '',
      item.hasAudio === false ? '<span class="vdd-meta-chip">Fonte informa: sem áudio</span>' : '',
      item.noWatermark === true ? '<span class="vdd-meta-chip">Sem marca d’água · fonte</span>' : '',
      item.preferred ? '<span class="vdd-badge preferred">Preferida</span>' : '',
    ].filter(Boolean).join('');

    card.innerHTML = `
      <div class="vdd-card-top">
        <div class="vdd-thumb">
          <div class="vdd-thumb-fallback" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5zm5.2 2.1v6.8a.6.6 0 0 0 .9.5l5.2-3.4a.6.6 0 0 0 0-1l-5.2-3.4a.6.6 0 0 0-.9.5z"/></svg></div>
          ${duration ? `<span class="vdd-duration">${escapeHtml(duration)}</span>` : ''}
        </div>
        <div class="vdd-main">
          <div class="vdd-name">${escapeHtml(title)}</div>
          <div class="vdd-source">${siteIcon(item.pageUrl || item.url)}<span>${escapeHtml(sourceLabel)}</span></div>
          <div class="vdd-meta-row">${chips}</div>
        </div>
      </div>
      <div class="vdd-res" hidden></div>
      ${item.kind === 'HLS' ? '<div class="vdd-quality-wrap"><label class="vdd-field-label" hidden>Qualidade<select class="vdd-quality" aria-label="Qualidade do vídeo" hidden></select></label><label class="vdd-audio-label vdd-field-label" hidden>Faixa de áudio<select class="vdd-audio" aria-label="Faixa de áudio"></select></label><label class="vdd-silent-label" hidden><input type="checkbox" class="vdd-allow-silent"> Permitir vídeo sem áudio, se a fonte for muda</label><div class="vdd-quality-note"></div><button type="button" class="vdd-quality-refresh" hidden>Atualizar qualidades</button></div>' : ''}
      <div class="vdd-actions">
        <button class="vdd-btn" type="button">${item.kind === 'HLS' ? 'Ver qualidades' : `Baixar ${escapeHtml(item.kind || 'vídeo')}`}</button>
      </div>
      <button type="button" class="vdd-cancel" hidden>Cancelar</button>
      <div class="vdd-progress">
        <div class="vdd-progress-line"><div class="vdd-progress-bar"></div></div>
        <div class="vdd-progress-text">Preparando...</div>
      </div>
    `;

    const thumb = card.querySelector('.vdd-thumb');
    const thumbnail = normalizeThumbUrl(item.thumbnail || '');
    if (thumbnail) loadThumbInto(thumb, thumbnail, item.pageUrl || '');

    if (item.height) setResolutionChips(card, [item.height], Number(item.height));
    attachDownloadHandler(card, { ...item, sourceScope }, title);
    return card;
  }

  const DL_QUEUE = [];
  function dlQueueRefresh() { DL_QUEUE.forEach((entry, i) => entry.show(i + 1, DL_QUEUE.length)); }
  function dlQueuePush(entry) { DL_QUEUE.push(entry); dlQueueRefresh(); return DL_QUEUE.length; }
  function dlQueueRemove(entry) { const i = DL_QUEUE.indexOf(entry); if (i < 0) return false; DL_QUEUE.splice(i, 1); dlQueueRefresh(); return true; }
  function dlQueueNext() {
    if (APP.working || APP.linkBusy) return false;
    while (DL_QUEUE.length) {
      const entry = DL_QUEUE.shift(); dlQueueRefresh();
      if (entry.card && !entry.card.isConnected) continue;
      entry.start(); return true;
    }
    return false;
  }

  function attachDownloadHandler(card, item, title) {
    const button = card.querySelector('.vdd-btn');
    const progress = card.querySelector('.vdd-progress');
    const bar = card.querySelector('.vdd-progress-bar');
    const text = card.querySelector('.vdd-progress-text');
    const defaultButtonText = button.textContent;
    let pendingSave = null;
    let pendingOpen = null;
    let hlsInfo = null;
    const qualitySelect = card.querySelector('.vdd-quality');
    const qualityNote = card.querySelector('.vdd-quality-note');
    const refreshQuality = card.querySelector('.vdd-quality-refresh');
    const cancel = card.querySelector('.vdd-cancel');
    const audioSelect = card.querySelector('.vdd-audio');
    let audioOptions = [];
    const lockChoices = locked => {
      for (const element of card.querySelectorAll('.vdd-quality, .vdd-audio, .vdd-allow-silent, .vdd-quality-refresh, .vdd-res button')) element.disabled = locked;
    };
    const updateAudioOptions = () => {
      const chosen = qualitySelect.value === 'auto' ? hlsInfo.variants[0] : hlsInfo.variants[Number(qualitySelect.value)];
      audioOptions = orderedAudioChoices(chosen?.audioGroups.get(chosen.audioGroup) || []);
      audioSelect.innerHTML = '<option value="auto">Automático · áudio publicado</option>';
      audioOptions.forEach((audio, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = audioChoiceLabel(audio); audioSelect.appendChild(option); });
      card.querySelector('.vdd-audio-label').hidden = !audioOptions.length;
    };
    let chipSync = null;
    let qualityBase = '';
    const updateCodecNote = () => {
      const chosen = qualitySelect.value === 'auto' ? hlsInfo?.variants[0] : hlsInfo?.variants[Number(qualitySelect.value)];
      const warn = chosen ? hlsCodecNote(chosen) : '';
      qualityNote.textContent = warn ? `${qualityBase} · Atenção: ${warn}` : qualityBase;
    };
    qualitySelect?.addEventListener('change', updateAudioOptions);
    qualitySelect?.addEventListener('change', () => updateCodecNote());
    qualitySelect?.addEventListener('change', () => chipSync?.());
    const inspectWithRenewal = async () => {
      const inspect = () => inspectHlsChoices(item.url, { referrer: item.pageUrl || location.href, publicOnly: item.sourceScope === 'link', sessionLink: isSessionLinkItem(item) });
      try { return await inspect(); }
      catch (error) {
        if (!canRenewLinkItem(item, error)) throw error;
        const renewal = await renewLinkItem(item, directErrorStatus(error), APP.hlsController?.signal);
        if (renewal.same) throw mediaError(`A página de origem ainda publica esta playlist, mas o servidor responde HTTP ${directErrorStatus(error)}: ${linkStatusExplanation(directErrorStatus(error))}.${error.hlsDiagnosis ? ` Diagnóstico: ${error.hlsDiagnosis}.` : ''}`, 'MEDIA_RENEW_SAME', directErrorStatus(error));
        const before = item.url;
        item.url = renewal.url;
        try { return await inspect(); } catch (second) { throw renewedFailure(before, item.url, second, error); }
      }
    };
    const loadQualities = async () => {
      hlsInfo = await inspectWithRenewal();
      qualitySelect.innerHTML = '<option value="auto">Melhor qualidade disponível</option>';
      for (let i = 0; i < hlsInfo.variants.length; i++) {
        const option = document.createElement('option'); option.value = String(i);
        option.textContent = hlsChoiceLabel(hlsInfo.variants[i]); qualitySelect.appendChild(option);
      }
      if (hlsInfo.variants.length) qualitySelect.options[0].textContent = `Melhor disponível · ${hlsChoiceLabel(hlsInfo.variants[0])}`;
      qualitySelect.hidden = false; qualitySelect.parentElement.hidden = false; refreshQuality.hidden = false;
      const heights = hlsInfo.variants.map(v => v.height);
      chipSync = () => {
        const index = qualitySelect.value === 'auto' ? 0 : Number(qualitySelect.value);
        setResolutionChips(card, heights, hlsInfo.variants[index]?.height || null, height => {
          const at = hlsInfo.variants.findIndex(v => v.height === height);
          if (at >= 0 && !qualitySelect.disabled) { qualitySelect.value = String(at); qualitySelect.dispatchEvent(new Event('change')); }
        });
      };
      chipSync();
      card.querySelector('.vdd-silent-label').hidden = false; updateAudioOptions();
      qualityBase = hlsInfo.variants.length ? `${hlsInfo.variants.length} qualidades publicadas · vídeo e áudio copiados sem recompressão e conferidos antes de salvar${hlsInfo.selectedUrl ? ' · playlist principal recuperada' : ''}` :
        `${hlsInfo.media.endList ? 'Vídeo' : 'Trecho ao vivo disponível'} · ${formatDuration(hlsInfo.media.duration)} · resolução não informada na playlist`;
      updateCodecNote();
      button.textContent = 'Baixar';
    };
    refreshQuality?.addEventListener('click', async () => {
      if (APP.working || APP.linkBusy) return;
      APP.working = true; refreshQuality.disabled = true;
      try { await loadQualities(); } catch (error) { qualityNote.textContent = error.message; }
      finally { APP.working = false; refreshQuality.disabled = false; dlQueueNext(); }
    });
    let queued = false;
    const queueEntry = {
      card,
      show(position, total) { bar.style.width = '0%'; bar.parentElement.classList.remove('indeterminate'); text.textContent = `Na fila · posição ${position} de ${total}`; text.dataset.state = 'queued'; },
      start() { onDownloadClick(true); },
    };
    const leaveQueue = () => {
      queued = false; delete card.dataset.dl;
      button.disabled = false; button.textContent = item.kind === 'HLS' && hlsInfo ? 'Baixar' : defaultButtonText;
      lockChoices(Boolean(pendingSave)); progress.classList.remove('show'); text.dataset.state = ''; if (cancel) cancel.hidden = true;
    };
    cancel?.addEventListener('click', () => {
      if (queued) { dlQueueRemove(queueEntry); leaveQueue(); toast('Removido da fila'); return; }
      APP.hlsController?.abort(); APP.directController?.abort();
    });

    const onDownloadClick = async (fromQueue = false) => {
      if (queued && !fromQueue) { toast('Este vídeo já está na fila'); return; }
      if (fromQueue) queued = false;
      if (APP.working || APP.linkBusy) {
        const ready = !pendingOpen && !pendingSave && (item.kind !== 'HLS' || Boolean(hlsInfo));
        if (ready && !APP.linkBusy && !fromQueue) {
          queued = true; card.dataset.dl = 'queued'; button.disabled = true; button.textContent = 'Na fila';
          progress.classList.add('show'); lockChoices(true); if (cancel) cancel.hidden = false;
          toast(`Adicionado à fila · posição ${dlQueuePush(queueEntry)}`);
          return;
        }
        toast('Já existe um download sendo preparado');
        return;
      }

      if (item.kind === 'HLS' && !hlsInfo && !pendingSave) {
        APP.working = true; button.disabled = true; button.textContent = 'Lendo qualidades...';
        try { await loadQualities(); } catch (error) { qualityNote.textContent = error.message; button.textContent = defaultButtonText; }
        finally { APP.working = false; button.disabled = false; dlQueueNext(); }
        return;
      }
      APP.working = true;
      button.disabled = true;
      progress.classList.add('show');
      lockChoices(true);
      card.dataset.dl = 'running';

      if (pendingOpen) {
        try {
          setProgress(bar, text, 99, 'Abrindo a fonte no navegador...');
          openDirectUrlFromGesture(pendingOpen);
          pendingOpen.attempts++;
          button.textContent = 'Abrir novamente';
          setProgress(bar, text, 100, 'Use o salvamento do navegador para concluir.');
          toast('Fonte aberta no navegador para salvar', 4200);
        } catch (error) {
          console.error('[VDD] Abertura nativa falhou:', error);
          const msg = error?.message || 'Não foi possível abrir a fonte';
          setProgress(bar, text, 0, msg);
          toast(msg, 4200);
        } finally {
          APP.working = false;
          button.disabled = false; lockChoices(Boolean(pendingSave));
          dlQueueNext();
        }
        return;
      }

      if (pendingSave) {
        try {
          setProgress(bar, text, 99, 'Abrindo o salvamento...');
          const saveMethod = await saveManualBlobFromGesture(pendingSave);
          const saveCompleted = saveMethod === 'picker' || saveMethod === 'share';
          pendingSave.attempts++;
          button.textContent = saveCompleted ? (item.kind === 'HLS' && hlsInfo ? 'Baixar' : defaultButtonText) : 'Salvar novamente';
          setProgress(
            bar,
            text,
            100,
            saveCompleted ? 'Arquivo enviado para o salvamento.' : 'Solicitação enviada. Confira a pasta Downloads.'
          );
          toast(saveCompleted ? 'Vídeo enviado sem alterar os dados' : 'Solicitação enviada ao navegador', 3600);

          if (saveCompleted) {
            if (pendingSave.objectUrl) URL.revokeObjectURL(pendingSave.objectUrl);
            pendingSave = null;
            delete card.dataset.prepared;
            return;
          }

          if (!pendingSave.cleanupTimer) {
            const current = pendingSave;
            current.cleanupTimer = setTimeout(() => {
              if (current.objectUrl) URL.revokeObjectURL(current.objectUrl);
              if (pendingSave === current) {
                pendingSave = null;
                delete card.dataset.prepared; lockChoices(false);
                button.textContent = item.kind === 'HLS' && hlsInfo ? 'Baixar' : defaultButtonText;
              }
            }, NET.manualUrlLifetime);
          }
        } catch (error) {
          console.error('[VDD] Salvamento manual falhou:', error);
          const msg = error?.message || 'O navegador não abriu o salvamento';
          setProgress(bar, text, 0, msg);
          toast(msg, 4200);
        } finally {
          APP.working = false;
          button.disabled = false; lockChoices(Boolean(pendingSave));
          dlQueueNext();
        }
        return;
      }

      const previousRequestReferrer = APP.requestReferrer;
      APP.requestReferrer = safeHttpUrl(item.pageUrl || '') || location.href;

      try {
        if (item.kind !== 'HLS') {
          setProgress(bar, text, 8, 'Validando a fonte...');
          APP.directController = new AbortController(); if (cancel) cancel.hidden = false;
          await downloadPublicItem(item, title, {
            signal: APP.directController.signal,
            allowPageFallback: item.sourceScope !== 'link',
            sessionLink: isSessionLinkItem(item),
            typeHint: item.type || '',
            kindHint: item.kind || '',
            onProgress(percent, label, detail) { setProgress(bar, text, percent, label, detail); }
          });
        } else {
          if (cancel) cancel.hidden = false;
          const hlsOptions = () => ({
            filenameBase: title,
            audioSelection: audioSelect.value === 'auto' ? null : audioOptions[Number(audioSelect.value)],
            allowSilent: card.querySelector('.vdd-allow-silent').checked,
            pageUrl: item.pageUrl,
            selection: qualitySelect.value === 'auto' ? null : hlsInfo.variants[Number(qualitySelect.value)],
            allowPageFallback: item.sourceScope !== 'link',
            sessionLink: isSessionLinkItem(item),
            onTrace: trace => showTraceToggle(card, trace),
            onProgress(percent, label, detail) { setProgress(bar, text, percent, label, detail); }
          });
          try { await downloadHlsAsMp4(hlsInfo.finalUrl, hlsOptions()); }
          catch (hlsError) {
            if (!canRenewLinkItem(item, hlsError)) throw hlsError;
            const chosen = qualitySelect.value === 'auto' ? null : hlsInfo.variants[Number(qualitySelect.value)];
            const status = directErrorStatus(hlsError);
            setProgress(bar, text, null, `O servidor respondeu HTTP ${status}. Relendo a página para renovar o endereço...`, { phase: 'retry' });
            const renewal = await renewLinkItem(item, status, APP.hlsController?.signal);
            if (renewal.same) throw mediaError(`A página de origem ainda publica esta playlist, mas o servidor responde HTTP ${status}: ${linkStatusExplanation(status)}.${hlsError.hlsDiagnosis ? ` Diagnóstico: ${hlsError.hlsDiagnosis}.` : ''} Nenhum arquivo foi salvo.`, 'MEDIA_RENEW_SAME', status);
            const before = item.url;
            item.url = renewal.url;
            try {
              await loadQualities();
              if (chosen) {
                const index = hlsInfo.variants.findIndex(v => v.height === chosen.height && v.bandwidth === chosen.bandwidth);
                qualitySelect.value = index >= 0 ? String(index) : 'auto';
                updateAudioOptions();
              }
              await downloadHlsAsMp4(hlsInfo.finalUrl, hlsOptions());
            } catch (second) { throw renewedFailure(before, item.url, second, hlsError); }
          }
        }
        card.dataset.dl = 'done';
      } catch (error) {
        card.dataset.dl = isManualOpenRequired(error) || isManualSaveRequired(error) ? 'pending' : 'error';
        if (isManualOpenRequired(error)) {
          pendingOpen = {
            url: error.url,
            filename: error.filename,
            attempts: 0,
          };
          button.textContent = 'Abrir vídeo';
          setProgress(bar, text, 98, 'Toque em “Abrir vídeo” para usar o salvamento do navegador.');
          toast('Toque em “Abrir vídeo” para continuar', 5000);
          return;
        }
        if (isManualSaveRequired(error)) {
          card.dataset.prepared = 'true';
          pendingSave = {
            blob: error.blob,
            filename: error.filename,
            objectUrl: '',
            attempts: 0,
            cleanupTimer: null,
          };
          button.textContent = 'Salvar arquivo';
          setProgress(bar, text, 100, 'Arquivo pronto. Toque em “Salvar arquivo”.');
          toast('Toque em “Salvar arquivo” para concluir', 5000);
          return;
        }
        console.error('[VDD]', error);
        const msg = error?.message || 'Falha ao preparar o vídeo';
        setProgress(bar, text, 0, msg);
        if (error?.hlsTrace) { text.style.whiteSpace = 'pre-wrap'; text.textContent += `\n\n${error.hlsTrace}`; console.info('[VDD][diag]', error.hlsTrace); }
        if (isSessionLinkItem(item) && item.pageUrl && ([401, 403, 404, 410, 412].includes(directErrorStatus(error)) || error?.hlsRefusedAll)) appendOpenPageHint(text, item.pageUrl);
        toast(msg, 3600);
      } finally {
        APP.requestReferrer = previousRequestReferrer;
        APP.directController = null;
        if (cancel) cancel.hidden = true;
        APP.working = false;
        button.disabled = false; lockChoices(Boolean(pendingSave));
        dlQueueNext();
      }
    };
    button.addEventListener('click', () => onDownloadClick(false));
  }

  function decodeEmbeddedUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let decoded = raw;
    try { decoded = JSON.parse(`"${raw.replace(/"/g, '\\"')}"`); } catch {}
    decoded = String(decoded)
      .replace(/\\u003[aA]/g, ':')
      .replace(/\\u002[fF]/g, '/')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003[fF]/g, '?')
      .replace(/\\u003[dD]/g, '=')
      .replace(/\\x2[fF]/g, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&')
      .replace(/&#x26;/gi, '&')
      .replace(/&#38;/gi, '&')
      .trim();
    return decoded;
  }

  function parseIsoDuration(value) {
    const match = String(value || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
    if (!match) return 0;
    return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  }

  function extractPublicMediaCandidates(root, baseUrl, options = {}) {
    if (!root?.querySelectorAll) return [];
    const results = new Map();
    const metaContent = selector => cleanDisplayText(root.querySelector(selector)?.getAttribute('content'), 300);
    const defaultTitle = metaContent('meta[property="og:title"]') ||
      metaContent('meta[name="twitter:title"]') || cleanDisplayText(root.title) || pageTitle();
    const defaultThumbnail = pageThumbnail(root, baseUrl);
    const defaultWidth = Number(metaContent('meta[property="og:video:width"]') || 0);
    const defaultHeight = Number(metaContent('meta[property="og:video:height"]') || 0);
    const ogType = metaContent('meta[property="og:video:type"]');

    const add = (rawUrl, type = '', metadata = {}) => {
      const url = safeHttpUrl(decodeEmbeddedUrl(rawUrl), baseUrl);
      if (!url) return;
      if (restrictedPlatformNotice(url) || isPrivateNetworkUrl(url)) return;
      if (responseLooksLikeHtml(type)) return;

      const hls = isHls(url, type);
      const hint = knownDirectFormatHint(url, type);
      if (!hls && !hint && !metadata.trusted) return;

      const kind = hls ? 'HLS' : (hint?.label || 'VÍDEO');
      let score = Number(metadata.score || 0);

      const identity = mediaIdentityKey(url, hls ? 'HLS' : 'DIRECT');
      const candidate = {
        kind,
        url,
        identity,
        title: cleanDisplayText(metadata.title) || defaultTitle || mediaTitleFromUrl(url) || 'Vídeo',
        titlePriority: Number(metadata.titlePriority || 5),
        thumbnail: safeHttpUrl(metadata.thumbnail || defaultThumbnail, baseUrl),
        thumbnailPriority: Number(metadata.thumbnailPriority || 5),
        duration: Number(metadata.duration || 0),
        width: Number(metadata.width || defaultWidth || 0),
        height: Number(metadata.height || defaultHeight || 0),
        label: cleanDisplayText(metadata.label || '', 60),
        pageUrl: safeHttpUrl(metadata.pageUrl || baseUrl, baseUrl),
        score,
        preferred: Boolean(metadata.preferred),
        noWatermark: metadata.noWatermark === true,
        bandwidth: Number(metadata.bandwidth || 0),
        type: mediaContentType(type),
        verified: metadata.verified === true,
      };
      const previous = results.get(identity);
      if (!previous || candidate.score > previous.score) results.set(identity, candidate);
      else results.set(identity, { ...previous, width: candidate.width || previous.width, height: candidate.height || previous.height,
        noWatermark: previous.noWatermark || candidate.noWatermark, bandwidth: candidate.bandwidth || previous.bandwidth });
    };

    const publicMeta = [
      ['meta[property="og:video:secure_url"]', 100, 'Vídeo publicado'],
      ['meta[property="og:video:url"]', 98, 'Vídeo publicado'],
      ['meta[property="og:video"]', 96, 'Vídeo publicado'],
      ['meta[name="twitter:player:stream"]', 92, 'Reprodução pública'],
    ];
    for (const [selector, score, label] of publicMeta) {
      root.querySelectorAll(selector).forEach(node => {
        add(node.getAttribute('content'), node.getAttribute('type') || ogType, { trusted: true, score, label });
      });
    }

    root.querySelectorAll('video').forEach((video, index) => {
      const metadata = {
        trusted: true,
        score: 90,
        label: 'Player da página',
        title: video.getAttribute('title') || video.getAttribute('aria-label') || defaultTitle,
        titlePriority: (video.getAttribute('title') || video.getAttribute('aria-label')) ? 5 : 1,
        thumbnail: video.poster || video.getAttribute('poster') || defaultThumbnail,
        thumbnailPriority: (video.poster || video.getAttribute('poster')) ? 5 : 1,
        duration: Number(video.duration || 0),
        width: Number(video.videoWidth || 0),
        height: Number(video.videoHeight || 0),
        videoIndex: index,
      };
      add(video.currentSrc || video.src || video.getAttribute('src'), video.getAttribute('type') || '', metadata);
      video.querySelectorAll('source').forEach(source => {
        add(source.src || source.getAttribute('src'), source.type || '', { ...metadata, height: Number(source.getAttribute('data-height') || source.getAttribute('res') || 0) || Number((source.getAttribute('label') || '').match(/(\d+)p/)?.[1] || 0) });
      });
    });

    root.querySelectorAll('source[src], link[rel="preload"][as="video"], [data-video-src], [data-video-url]').forEach(node => {
      const raw = node.getAttribute('src') || node.getAttribute('href') ||
        node.getAttribute('data-video-src') || node.getAttribute('data-video-url');
      add(raw, node.getAttribute('type') || '', {
        trusted: node.matches?.('source[src], link[rel="preload"][as="video"]'),
        score: 82,
        label: 'Fonte publicada',
      });
    });

    root.querySelectorAll('[itemprop="contentUrl"], [itemprop="embedUrl"], [data-src], [data-file], [data-url], [data-stream], [data-hls], [data-mp4]').forEach(node => {
      for (const attr of [...(node.attributes || [])]) {
        const name = String(attr.name || '').toLowerCase();
        const raw = decodeEmbeddedUrl(attr.value || '');
        const mediaishName = /(?:video|media|stream|file|source|src|hls|mp4|contenturl|embedurl)/i.test(name);
        const hinted = isHls(raw) || Boolean(knownDirectFormatHint(raw));
        if (!raw || (!mediaishName && !hinted)) continue;
        add(raw, node.getAttribute('type') || '', {
          trusted: hinted || /(?:contenturl|video|media|stream|file|hls|mp4)/i.test(name),
          score: hinted ? 78 : 64,
          label: 'Fonte declarada na página',
        });
      }
    });

    const walkJsonLd = (value, depth = 0) => {
      if (depth > 10 || value == null) return;
      if (Array.isArray(value)) {
        value.forEach(item => walkJsonLd(item, depth + 1));
        return;
      }
      if (typeof value !== 'object') return;

      const thumbnail = Array.isArray(value.thumbnailUrl) ? value.thumbnailUrl[0] : value.thumbnailUrl;
      for (const key of ['contentUrl', 'embedUrl']) {
        if (typeof value[key] === 'string') {
          add(value[key], value.encodingFormat || '', {
            trusted: key === 'contentUrl',
            score: key === 'contentUrl' ? 94 : 72,
            label: key === 'contentUrl' ? 'Conteúdo publicado' : 'Player publicado',
            title: value.name || value.headline || defaultTitle,
            thumbnail,
            duration: parseIsoDuration(value.duration),
            width: Number(value.width || 0),
            height: Number(value.height || 0),
          });
        }
      }
      Object.values(value).forEach(child => walkJsonLd(child, depth + 1));
    };

    root.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try { walkJsonLd(JSON.parse(script.textContent || '')); } catch {}
    });

    if (options.scanRawScripts) {
      const keyInfo = {
        noWatermarkUrl: { score: 102, label: 'Original publicado', noWatermark: true },
        no_watermark_url: { score: 102, label: 'Original publicado', noWatermark: true },
        playAddrNoWatermark: { score: 102, label: 'Original publicado', noWatermark: true },
        downloadAddr: { score: 100, label: 'Download publicado' },
        download_addr: { score: 100, label: 'Download publicado' },
        downloadUrl: { score: 100, label: 'Download publicado' },
        download_url: { score: 100, label: 'Download publicado' },
        videoUrl: { score: 98, label: 'Vídeo publicado' },
        video_url: { score: 98, label: 'Vídeo publicado' },
        videoSrc: { score: 96, label: 'Vídeo publicado' },
        video_src: { score: 96, label: 'Vídeo publicado' },
        contentUrl: { score: 94, label: 'Conteúdo publicado' },
        content_url: { score: 94, label: 'Conteúdo publicado' },
        playbackUrl: { score: 90, label: 'Reprodução pública' },
        playback_url: { score: 90, label: 'Reprodução pública' },
        playAddr: { score: 88, label: 'Reprodução pública' },
        play_addr: { score: 88, label: 'Reprodução pública' },
        mediaUrl: { score: 88, label: 'Mídia publicada' },
        media_url: { score: 88, label: 'Mídia publicada' },
        streamUrl: { score: 88, label: 'Stream publicado' },
        stream_url: { score: 88, label: 'Stream publicado' },
        hlsUrl: { score: 92, label: 'HLS publicado' },
        hls_url: { score: 92, label: 'HLS publicado' },
        manifestUrl: { score: 86, label: 'Manifesto publicado' },
        manifest_url: { score: 86, label: 'Manifesto publicado' },
        file: { score: 82, label: 'Arquivo publicado' },
        fileUrl: { score: 84, label: 'Arquivo publicado' },
        file_url: { score: 84, label: 'Arquivo publicado' },
        source: { score: 72, label: 'Fonte encontrada' },
        src: { score: 55, label: 'Fonte encontrada' },
        url: { score: 45, label: 'Fonte encontrada' },
      };
      const keyNames = Object.keys(keyInfo).join('|');
      const keyedPattern = new RegExp(`["'](${keyNames})["']\\s*[:=]\\s*["']((?:\\\\.|[^"'\\\\])*)["']`, 'gi');
      const mediaUrlPattern = /(?:https?(?::|\\u003a)(?:\/|\\\/|\\u002f){2}|\/\/)[^"'<>\\\s]+?(?:\.m3u8|\.mpd|\.mp4|\.m4v|\.webm|\.mov|\.ogv|\.mkv|\.ts)(?:[^"'<>\\\s]*)/gi;

      const scanText = rawText => {
        const text = String(rawText || '');
        if (!text) return;

        let match;
        while ((match = keyedPattern.exec(text))) {
          const key = match[1];
          const info = keyInfo[key] || { score: 40, label: 'Fonte encontrada' };
          const decoded = decodeEmbeddedUrl(match[2]);
          const strongKey = Number(info.score || 0) >= 80 &&
            !/^(?:src|url|source)$/i.test(key);
          if (strongKey || isHls(decoded) || knownDirectFormatHint(decoded)) {
            add(decoded, '', { trusted: strongKey, ...info });
          }
        }
        keyedPattern.lastIndex = 0;

        while ((match = mediaUrlPattern.exec(text))) {
          const decoded = decodeEmbeddedUrl(match[0]);
          add(decoded, '', { score: 52, label: 'URL de mídia' });
        }
        mediaUrlPattern.lastIndex = 0;

        const listPattern = /["'](?:mediaDefinitions|media_definitions|video_sources|sources|formats)["']\s*:\s*\[/gi;
        let listMatch;
        while ((listMatch = listPattern.exec(text))) {
          const raw = balancedJsonAt(text, listMatch.index + listMatch[0].length - 1);
          if (!raw) continue;
          try {
            for (const found of jsonMediaCandidates(JSON.parse(raw), baseUrl, { allowApi: true })) {
              add(found.url, found.type, { trusted: true, score: found.score, label: found.label, height: found.height, width: found.width, verified: found.verified });
            }
          } catch {}
        }
      };

      let scanned = 0;
      root.querySelectorAll('script:not([src])').forEach(script => {
        if (scanned >= NET.maxLinkHtmlSize) return;
        const rawText = String(script.textContent || '').slice(0, NET.maxLinkHtmlSize - scanned);
        scanned += rawText.length;
        scanText(rawText);

        const type = String(script.getAttribute('type') || '').toLowerCase();
        if (/json/.test(type) || /^\s*[\[{]/.test(rawText)) {
          try {
            const walk = (value, key = '', depth = 0, metadata = {}) => {
              if (depth > 14 || value == null) return;
              if (typeof value === 'string') {
                const info = keyInfo[key] || null;
                const decoded = decodeEmbeddedUrl(value);
                if (info && Number(info.score || 0) >= 80) {
                  add(decoded, metadata.type || '', { ...metadata, trusted: true, ...info });
                } else if (isHls(decoded, metadata.type) || knownDirectFormatHint(decoded, metadata.type)) {
                  add(decoded, metadata.type || '', { ...metadata, score: 60, label: 'Mídia em dados da página' });
                }
                return;
              }
              if (Array.isArray(value)) {
                value.forEach(item => walk(item, key, depth + 1, metadata));
                return;
              }
              if (typeof value === 'object') {
                const quality = String(value.quality || value.label || value.resolution || '');
                const dimensions = quality.match(/(\d+)x(\d+)/);
                const own = { ...metadata,
                  width: Number(value.width || dimensions?.[1] || metadata.width || 0),
                  height: Number(value.height || dimensions?.[2] || quality.match(/(\d+)p/)?.[1] || metadata.height || 0),
                  bandwidth: Number(value.bitrate || value.bandwidth || metadata.bandwidth || 0),
                  type: value.mimeType || value.mime_type || value.type || metadata.type || '',
                  noWatermark: value.hasWatermark === false || value.watermarked === false || metadata.noWatermark === true };
                Object.entries(value).forEach(([childKey, child]) => walk(child, childKey, depth + 1, own));
              }
            };
            walk(JSON.parse(rawText));
          } catch {}
        }
      });

      if (options.rawText) scanText(String(options.rawText).slice(0, NET.maxLinkHtmlSize));
    }

    const sorted = [...results.values()]
      .sort(compareMediaQuality)
      .slice(0, 40);
    if (sorted.length > 1) sorted[0].preferred = true;
    return sorted;
  }

  function beegVideoId(url) {
    try {
      const parsed = new URL(url);
      if (!/(?:^|\.)beeg\.com$/i.test(parsed.hostname)) return '';
      const match = parsed.pathname.match(/\/?(?:video\/)?-?(\d{6,20})(?:\/|$)/i);
      return match?.[1] || '';
    } catch { return ''; }
  }

  async function requestJsonPublic(url, pageUrl = location.href) {
    const response = await mediaRequest(url, { context: { referrer: pageUrl, publicOnly: true }, text: true,
      maxBytes: NET.maxLinkHtmlSize, timeout: NET.linkRequestTimeout, headers: { Accept: 'application/json,*/*;q=0.5' } });
    try { return JSON.parse(response.text); } catch { throw mediaError('A API pública devolveu uma resposta que não é JSON.'); }
  }

  async function extractKnownPublicSiteCandidates(pageUrl) {
    const results = [];
    const id = beegVideoId(pageUrl);
    if (id) {
      const data = await requestJsonPublic(`https://store.externulls.com/facts/file/${encodeURIComponent(id)}`, pageUrl);
      const facts = Array.isArray(data?.fc_facts) ? data.fc_facts : [];
      const firstFact = [...facts].sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0))[0] || {};
      const hlsResources = data?.file?.hls_resources || firstFact?.hls_resources || {};
      const directResources = data?.file?.resources || firstFact?.resources || {};
      const title = cleanDisplayText(data?.file?.stuff?.sf_name) || pageTitle();
      const seen = new Set();
      const pushResource = (key, raw, forceHls = false) => {
        if (!raw || /^(?:set_id|id)$/i.test(String(key))) return;
        const url = /^https?:\/\//i.test(String(raw)) ? String(raw) : `https://video.beeg.com/${String(raw).replace(/^\/+/, '')}`;
        if (seen.has(url)) return;
        seen.add(url);
        const height = Number(String(key).match(/(\d{3,4})/)?.[1] || 0);
        const hls = forceHls || isHls(url) || /hls/i.test(String(key));
        const hint = knownDirectFormatHint(url);
        results.push({
          kind: hls ? 'HLS' : (hint?.label || 'VÍDEO'),
          url, type: hls ? 'application/vnd.apple.mpegurl' : (hint?.mime || ''), title,
          thumbnail: '', pageUrl, trusted: true, preferred: height >= 720,
          height, label: height ? `${hls ? 'HLS' : 'Fonte'} pública ${height}p` : (hls ? 'HLS público' : 'Fonte pública'),
          score: (hls ? 100 : 92) + height,
        });
      };
      Object.entries(hlsResources || {}).forEach(([key, raw]) => pushResource(key, raw, true));
      Object.entries(directResources || {}).forEach(([key, raw]) => pushResource(key, raw, false));
    }
    return results.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }

  async function collectKnownPublicSiteMedia(pageUrl = location.href) {
    const key = `known:${pageUrl}`;
    if (APP.siteProbeKeys.has(key)) return false;
    APP.siteProbeKeys.add(key);
    try {
      const candidates = await extractKnownPublicSiteCandidates(pageUrl);
      let changed = false;
      for (const candidate of candidates) {
        if (registerMedia(candidate.url, candidate.type, false, candidate)) changed = true;
      }
      if (changed) queueRender();
      return changed;
    } catch (error) {
      console.info('[VDD] Endpoint público específico indisponível:', error);
      return false;
    }
  }

  function restrictedPlatformNotice(url) {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch {}
    if (/(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|googlevideo\.com)$/.test(host)) {
      return 'YouTube: use apenas as opções de download oferecidas pelo próprio YouTube ou YouTube Studio.';
    }
    return '';
  }

  function isPrivateNetworkUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) return true;
      if (parsed.origin === location.origin) return false;
      const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1') return true;
      if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
      const match = host.match(/^172\.(\d+)\./);
      return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
    } catch {
      return true;
    }
  }

  async function fetchLinkProbe(url, maxBytes = 65536) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const sameOrigin = new URL(url).origin === location.origin;
      const response = await fetch(url, {
        method: 'GET',
        credentials: sameOrigin ? 'include' : 'omit',
        redirect: 'follow',
        cache: 'no-store',
        headers: { Range: `bytes=0-${maxBytes - 1}`, Accept: 'video/*,application/octet-stream,text/plain,*/*;q=0.5' },
        signal: controller.signal,
      });
      if (!response.ok && response.status !== 206) {
        throw makeHttpError(`Sondagem respondeu ${response.status}`, response.status);
      }

      const chunks = [];
      let received = 0;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        while (received < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          const remaining = maxBytes - received;
          chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value);
          received += Math.min(value.byteLength, remaining);
        }
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
      } else {
        const buffer = new Uint8Array(await response.arrayBuffer());
        chunks.push(buffer.slice(0, maxBytes));
        received = Math.min(buffer.byteLength, maxBytes);
      }

      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return {
        status: response.status,
        finalUrl: response.url || url,
        contentType: response.headers.get('content-type') || '',
        bytes,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function probeLinkTarget(url, context = { referrer: url, publicOnly: true }) {
    let response;
    try {
      response = await mediaRequest(url, { context, prefix: true, maxBytes: 65536,
        timeout: 15000, headers: { Range: 'bytes=0-65535' } });
    } catch (error) {
      if (error.status === 416 || error.status === 400 || error.status === 405) {
        response = await mediaRequest(url, { context, prefix: true, maxBytes: 65536, timeout: 15000 });
      } else if (error.code === 'MEDIA_LIMIT') {
        const head = await gmHeadRequest(url, 12000).catch(() => null);
        const finalUrl = head?.finalUrl || url, contentType = head?.headers?.['content-type'] || '';
        const hint = knownDirectFormatHint(finalUrl, contentType);
        if (hint && !responseLooksLikeHtml(contentType)) return { kind: hint.label, url: finalUrl, contentType, confirmed: false };
        return { page: true, url: finalUrl, contentType };
      } else throw error;
    }
    const finalUrl = response.finalUrl, contentType = response.contentType;
    const sample = new TextDecoder().decode(response.bytes.subarray(0, 2048));
    if (/^\s*#EXTM3U(?:\s|$)/.test(sample)) return { kind: 'HLS', url: finalUrl, contentType: 'application/vnd.apple.mpegurl', confirmed: true };
    const format = detectMediaFormatFromBytes(response.bytes, contentType, finalUrl);
    if (format?.confirmed && !format.hls) return { kind: format.label, url: finalUrl, contentType: format.mime, confirmed: true };
    if (looksLikeHtmlBytes(response.bytes) || responseLooksLikeHtml(contentType) || /^\s*[\[{<]/.test(sample)) return { page: true, url: finalUrl, contentType };
    if (isHls(finalUrl, contentType)) return { kind: 'HLS', url: finalUrl, contentType, confirmed: false };
    const disposition = contentDispositionFilename(response.headers['content-disposition']);
    const hint = knownDirectFormatHint(disposition || finalUrl, contentType);
    if (hint) return { kind: hint.label, url: finalUrl, contentType: hint.mime, confirmed: false };
    return { page: true, url: finalUrl, contentType };
  }

  const linkPageCache = new Map();
  function requestLinkPage(url, context = { referrer: url, publicOnly: true }) {
    const fetchPage = () => mediaRequest(url, { context, text: true, maxBytes: NET.maxLinkHtmlSize, timeout: NET.linkRequestTimeout,
      headers: { Accept: 'text/html,application/xhtml+xml,application/json,application/vnd.apple.mpegurl,*/*;q=0.5' } });
    if (!context.pageCache) return fetchPage();
    const key = `${url}|${wantsSession(context)}`, hit = linkPageCache.get(key);
    if (hit && Date.now() - hit.at < 60000) return hit.promise;
    const promise = fetchPage();
    linkPageCache.set(key, { at: Date.now(), promise });
    while (linkPageCache.size > 3) linkPageCache.delete(linkPageCache.keys().next().value);
    promise.then(result => { if (String(result.text || '').length > 3 * 1024 * 1024) linkPageCache.delete(key); }, () => linkPageCache.delete(key));
    return promise;
  }

  function publicPlatform(url) {
    let parsed; try { parsed = new URL(url); } catch { return null; }
    const host = parsed.hostname.toLowerCase();
    if (/(^|\.)tiktok\.com$/.test(host)) return { name: 'TikTok', kind: 'tiktok', id: parsed.pathname.match(/\/(?:video|player\/v1|embed\/v2)\/(\d+)/)?.[1] || '' };
    if (/(^|\.)instagram\.com$/.test(host)) return { name: 'Instagram', kind: 'instagram', id: parsed.pathname.match(/\/(?:p|reels?|tv)\/([\w-]+)/)?.[1] || '' };
    return null;
  }

  function pastedPublicUrl(value) {
    const decoded = decodeEmbeddedUrl(String(value || '').trim());
    const matches = decoded.match(/https?:\/\/[^\s<>"“”]+/gi) || [];
    if (matches.length !== 1) throw mediaError(matches.length ? 'Cole apenas um link por vez.' : 'Cole um link público começando com https://.', 'MEDIA_INPUT');
    const url = matches[0];
    return assertMediaUrl(new URL(decoded === url || url.includes('?') ? url : url.replace(/[),.;!]+$/, '')).href);
  }

  function jsonDocuments(doc, rawText = '') {
    const out = [];
    let budget = 0;
    const parse = raw => {
      if (!raw || budget >= NET.maxLinkHtmlSize || out.length >= 80) return;
      const text = String(raw).trim(); budget += text.length;
      try { const data = JSON.parse(text); if (data && typeof data === 'object') out.push(data); } catch {}
    };
    doc.querySelectorAll('script:not([src])').forEach(script => {
      const raw = String(script.textContent || '');
      if (/^\s*[\[{]/.test(raw)) { parse(raw); return; }
      const markers = /(?:window\._sharedData\s*=|window\.__additionalDataLoaded\s*\([^,]+,|window\.__INITIAL_STATE__\s*=)\s*/g;
      let match;
      while ((match = markers.exec(raw))) {
        let start = match.index + match[0].length, depth = 0, quote = false, escape = false;
        if (raw[start] !== '{' && raw[start] !== '[') continue;
        for (let i = start; i < Math.min(raw.length, start + NET.maxLinkHtmlSize); i++) {
          const ch = raw[i];
          if (quote) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === '"') quote = false; continue; }
          if (ch === '"') quote = true;
          else if (ch === '{' || ch === '[') depth++;
          else if (ch === '}' || ch === ']') { if (--depth === 0) { parse(raw.slice(start, i + 1)); break; } }
        }
      }
    });
    if (!out.length && /^\s*[\[{]/.test(rawText)) parse(rawText);
    return out;
  }

  function walkPublicData(roots, visit) {
    const stack = roots.map(value => ({ value, depth: 0 }));
    let count = 0;
    while (stack.length && count++ < 18000) {
      const { value, depth } = stack.pop();
      if (!value || typeof value !== 'object' || depth > 22) continue;
      if (visit(value) === false) continue;
      const children = Array.isArray(value) ? value : Object.values(value);
      for (let i = children.length - 1; i >= 0; i--) if (children[i] && typeof children[i] === 'object') stack.push({ value: children[i], depth: depth + 1 });
    }
  }

  function sourceUrlList(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
    if (!value || typeof value !== 'object') return [];
    return sourceUrlList(value.UrlList || value.urlList || value.url_list || value.src || value.url || value.Url || []);
  }

  function extractSocialCandidates(doc, pageUrl, rawText = '', expected = publicPlatform(pageUrl)) {
    if (!expected) return [];
    const documents = jsonDocuments(doc, rawText), items = [], results = [];
    const title = doc.querySelector('meta[property="og:title"]')?.content || doc.title || expected.name;
    const add = (value, metadata, quality = {}) => {
      const urls = [...new Set(sourceUrlList(value).map(raw => safeHttpUrl(decodeEmbeddedUrl(raw), pageUrl)).filter(url => url && !isPrivateNetworkUrl(url)))];
      if (!urls.length) return;
      const width = Number(quality.Width || quality.width || metadata.width || 0);
      const height = Number(quality.Height || quality.height || metadata.height || 0);
      const codec = String(quality.CodecType || quality.codec || '');
      if (/bytevc2|h266|vvc/i.test(codec)) return;
      const bandwidth = Number(quality.Bitrate || quality.bitrate || 0);
      const sourceKey = `${metadata.postId}:${metadata.role}:${width}x${height}:${bandwidth}:${codec}:${metadata.noWatermark === true ? 'clean' : 'published'}${!width && !height && !bandwidth ? ':' + mediaIdentityKey(urls[0]) : ''}`;
      for (let i = 0; i < urls.length; i++) {
        const hint = knownDirectFormatHint(urls[i], quality.mime_type || quality.mimeType || '');
        results.push({ kind: isHls(urls[i]) ? 'HLS' : hint?.label || 'VÍDEO', type: isHls(urls[i]) ? 'application/vnd.apple.mpegurl' : hint?.mime || '',
          url: urls[i], pageUrl, title: cleanDisplayText(metadata.title || title), thumbnail: safeHttpUrl(metadata.thumbnail, pageUrl),
          width, height, duration: Number(metadata.duration || 0), bandwidth, codec, sourceKey,
          postId: metadata.postId, platform: expected.kind, sourceRole: metadata.role, trusted: true, sourceScope: 'link',
          noWatermark: metadata.noWatermark === true, hasAudio: metadata.hasAudio,
          label: metadata.noWatermark ? 'Original sem marca publicado' : (metadata.role === 'playback' ? 'Reprodução publicada' : 'Arquivo publicado'),
          score: metadata.role === 'playback' ? 120 : 110, alternatives: urls.filter(url => url !== urls[i]), detectedAt: Date.now() });
      }
    };
    if (expected.kind === 'tiktok') {
      walkPublicData(documents, value => {
        const id = String(value.id || value.aweme_id || '');
        if (value.video && id && (!expected.id || id === expected.id)) items.push(value);
      });
      if (!expected.id && new Set(items.map(item => String(item.id || item.aweme_id))).size !== 1) return [];
      for (const item of items) {
        const video = item.video, id = String(item.id || item.aweme_id);
        const common = { postId: id, title: item.desc || title, width: video.width, height: video.height,
          duration: video.duration, thumbnail: sourceUrlList(video.cover || video.originCover)[0],
          hasAudio: typeof video.hasAudio === 'boolean' ? video.hasAudio : undefined };
        add(video.playAddr || video.play_addr, { ...common, role: 'playback' });
        add(video.downloadAddr || video.download_addr, { ...common, role: 'download' });
        for (const rate of video.bitrateInfo || video.bit_rate || []) {
          const addr = rate.PlayAddr || rate.play_addr;
          add(addr, { ...common, width: 0, height: 0, role: 'playback' }, { ...rate, ...(addr && typeof addr === 'object' ? addr : {}) });
        }
        add(video.noWatermarkUrl || video.no_watermark_url || video.playAddrNoWatermark, { ...common, role: 'playback', noWatermark: true });
      }
    } else {
      const all = [];
      walkPublicData(documents, value => { if (value.video_url || value.video_versions || value.video_resources || value.carousel_media || value.edge_sidecar_to_children) all.push(value); });
      const exact = expected.id ? all.filter(value => String(value.shortcode || value.code || '') === expected.id) : [];
      const unidentified = all.filter(value => !value.shortcode && !value.code);
      const roots = exact.length ? exact : !expected.id ? (all.length === 1 ? all : []) : unidentified.length === 1 ? unidentified : [];
      const visited = new Set();
      const consume = (value, parentId = expected.id) => {
        if (!value || visited.has(value)) return; visited.add(value);
        const id = String(value.shortcode || value.code || value.pk || value.id || parentId || 'post');
        const common = { postId: id, title: value.title || value.caption?.text || title,
          width: value.dimensions?.width, height: value.dimensions?.height,
          duration: value.video_duration, thumbnail: value.display_url || value.thumbnail_src || value.image_versions2?.candidates?.[0]?.url,
          hasAudio: typeof value.has_audio === 'boolean' ? value.has_audio : undefined, role: 'playback' };
        if (value.is_video !== false) {
          add(value.video_url, common);
          for (const version of value.video_versions || value.video_resources || []) add(version.url || version.src, common, version);
        }
        for (const child of value.carousel_media || []) consume(child, id);
        for (const child of value.edge_sidecar_to_children?.edges || []) consume(child.node, id);
      };
      roots.forEach(value => consume(value));
    }
    const unique = new Map();
    for (const candidate of results.sort(compareMediaQuality)) {
      const identity = mediaIdentityKey(candidate.url, candidate.kind);
      if (!unique.has(identity)) unique.set(identity, candidate);
    }
    const qualities = new Map();
    for (const candidate of unique.values()) {
      const previous = qualities.get(candidate.sourceKey);
      if (previous) previous.alternatives = [...new Set([...previous.alternatives, candidate.url, ...candidate.alternatives])].filter(url => url !== previous.url);
      else qualities.set(candidate.sourceKey, candidate);
    }
    return [...qualities.values()].sort(compareMediaQuality);
  }

  async function resolveSocialLink(url, context = {}) {
    const initial = publicPlatform(url), visited = new Set();
    let expected = initial, firstError = null, login = false, pagesRead = 0;
    const queue = [url];
    const all = [];
    while (queue.length && visited.size < 3) {
      checkMediaAbort(context);
      const target = queue.shift(); if (visited.has(target)) continue; visited.add(target);
      try {
        context.onStage?.(`Lendo a fonte pública do ${initial.name}...`);
        const response = await requestLinkPage(target, { ...context, referrer: url, publicOnly: true });
        pagesRead++;
        const platform = publicPlatform(response.finalUrl);
        if (!platform || platform.kind !== initial.kind) throw mediaError('O link redirecionou para uma fonte diferente.', 'MEDIA_REDIRECT');
        if (platform.id) expected = platform;
        const doc = new DOMParser().parseFromString(response.text, 'text/html');
        const canonical = safeHttpUrl(doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '', response.finalUrl);
        const canonicalPlatform = publicPlatform(canonical);
        if (canonicalPlatform?.kind === initial.kind && canonicalPlatform.id && (!expected.id || canonicalPlatform.id === expected.id)) expected = canonicalPlatform;
        login ||= /\/(?:accounts\/login|login|challenge)(?:\/|\?|$)/.test(response.finalUrl);
        const pageUrl = canonicalPlatform?.id === expected.id ? canonical : response.finalUrl;
        const media = extractSocialCandidates(doc, pageUrl, response.text, expected);
        if (media.length) return media;
        const generic = extractPublicMediaCandidates(doc, response.finalUrl, { scanRawScripts: false });
        all.push(...generic.filter(item => !publicPlatform(item.url) && (isHls(item.url, item.type) || knownDirectFormatHint(item.url, item.type)))
          .map(item => ({ ...item, platform: initial.kind, postId: expected.id, pageUrl: url, detectedAt: Date.now() })));
        if (all.length) return all.sort(compareMediaQuality);
        if (expected.id) {
          const embed = initial.kind === 'tiktok' ? `https://www.tiktok.com/player/v1/${expected.id}` : `https://www.instagram.com/p/${expected.id}/embed/`;
          if (!visited.has(embed)) queue.push(embed);
        }
      } catch (error) {
        checkMediaAbort(context); firstError ||= error;
        if (error.status === 429 || error.code === 'MEDIA_CANCELLED') throw error;
        if (expected.id && visited.size === 1) queue.push(initial.kind === 'tiktok' ? `https://www.tiktok.com/player/v1/${expected.id}` : `https://www.instagram.com/p/${expected.id}/embed/`);
      }
    }
    if (firstError && !pagesRead && ![401, 403, 404].includes(firstError.status)) throw firstError;
    const reason = [401, 403, 404, 410].includes(firstError?.status) && !pagesRead
      ? ` Motivo: ${firstError.status === 404 || firstError.status === 410 ? 'o vídeo não existe mais ou o link é privado' : `a plataforma bloqueou a leitura automática (HTTP ${firstError.status})`}.` : '';
    const error = mediaError(login ? `${initial.name} exigiu login e não publicou uma mídia acessível nesse link.` :
      `${initial.name} não disponibilizou uma URL de vídeo legível nesta consulta.${reason} Abra o post no navegador, reproduza e use “Nesta página”.`, 'MEDIA_PUBLIC_UNAVAILABLE', firstError?.status || 0);
    error.cause = firstError; throw error;
  }

  async function refreshPublicItem(item, options = {}) {
    if (!item.platform || !item.pageUrl || !item.postId) return item;
    const candidates = await resolveSocialLink(item.pageUrl, options.keepSession ? { keepSession: true } : {});
    const fresh = candidates.find(candidate => candidate.postId === item.postId && candidate.sourceKey && candidate.sourceKey === item.sourceKey) ||
      candidates.find(candidate => candidate.postId === item.postId && candidate.width === item.width && candidate.height === item.height && candidate.codec === item.codec && candidate.noWatermark === item.noWatermark && candidate.sourceRole === item.sourceRole);
    if (!fresh) throw mediaError('A fonte não publicou novamente a qualidade escolhida. Faça uma nova busca.', 'MEDIA_EXPIRED');
    return fresh;
  }

  const RENEWABLE_STATUS = Object.freeze([403, 404, 410, 412]);
  const isRenewableLinkError = error => RENEWABLE_STATUS.includes(directErrorStatus(error));
  const canRenewLinkItem = (item, error) => !item.platform && item.sourceScope === 'link' && Boolean(item.pageUrl) && isRenewableLinkError(error);

  function renewalPath(url) {
    try { return decodeURIComponent(new URL(url).pathname).replace(/\/+$/, ''); } catch { return String(url || ''); }
  }

  function pickRenewedCandidate(found, item) {
    const cls = candidate => candidate.kind === 'HLS' ? 'HLS' : 'DIRECT';
    const same = found.filter(candidate => cls(candidate) === cls(item));
    const exact = same.find(candidate => mediaIdentityKey(candidate.url, cls(candidate)) === mediaIdentityKey(item.url, cls(item)));
    if (exact) return exact;
    const sameQuality = candidate => Number(candidate.height || 0) === Number(item.height || 0) && Number(candidate.bandwidth || 0) === Number(item.bandwidth || 0);
    const byPath = same.filter(candidate => renewalPath(candidate.url) === renewalPath(item.url));
    if (byPath.length) return byPath.find(sameQuality) || byPath[0];
    if (same.length === 1 && (!item.height || !same[0].height || Number(same[0].height) === Number(item.height))) return same[0];
    return null;
  }

  function linkStatusExplanation(status) {
    if (status === 404 || status === 410) return 'o arquivo não existe mais no servidor (vídeo removido) ou o endereço expirou';
    if (status === 412) return 'o servidor recusa o acesso porque uma condição exigida (Referer/Origin ou sessão) não foi atendida';
    return 'o servidor recusa este acesso (login, região ou proteção contra download direto)';
  }

  async function renewLinkItem(item, status, signal) {
    let found;
    try { found = await resolvePublicLink(item.pageUrl, new Set(), 0, { signal }); }
    catch (error) {
      if (error.code === 'MEDIA_CANCELLED') throw error;
      const failure = mediaError(`O endereço do arquivo respondeu HTTP ${status} e não consegui reler a página de origem para renová-lo (${error.status ? `HTTP ${error.status}` : error.message}). Nenhum arquivo foi salvo.`, 'MEDIA_RENEW_PAGE', status);
      failure.cause = error; throw failure;
    }
    const candidate = pickRenewedCandidate(found, item);
    if (!candidate) {
      throw mediaError(`O endereço do arquivo respondeu HTTP ${status} e a página de origem, lida de novo, não publica mais este arquivo (${linkStatusExplanation(status)}). Nenhum arquivo foi salvo.`, 'MEDIA_RENEW_GONE', status);
    }
    return { url: candidate.url, candidate, same: candidate.url === item.url };
  }

  function renewedFailure(beforeUrl, afterUrl, error, first = null) {
    const status = directErrorStatus(error);
    if (!status || error?.code === 'MEDIA_CANCELLED') return error;
    const from = sourceHost(beforeUrl), to = sourceHost(afterUrl);
    const failure = mediaError(`O endereço foi renovado pela página${from && to && from !== to ? ` (${from} → ${to})` : ''}, mas a origem também recusou com HTTP ${status}: ${error.message}`, 'MEDIA_RENEW_FAILED', status);
    failure.cause = error; failure.hlsDiagnosis = error.hlsDiagnosis; failure.hlsRefusedAll = error.hlsRefusedAll;
    if (error.hlsTrace || first?.hlsTrace) failure.hlsTrace = `${first?.hlsTrace ? `ANTES da renovação:\n${first.hlsTrace}\n\n` : ''}${error.hlsTrace ? `DEPOIS da renovação:\n${error.hlsTrace}` : ''}`.trim();
    return failure;
  }

  async function downloadPublicItemDirect(item, title, options) {
    let current = item;
    if (!item.platform && needsClassification(item)) {
      const found = await classifyMediaUrl(item.url, { referrer: item.pageUrl || item.url, publicOnly: true, sessionLink: true, signal: options.signal });
      const hlsOptions = url => downloadHlsAsMp4(url, { filenameBase: title, pageUrl: item.pageUrl, allowPageFallback: false, sessionLink: true, onProgress: options.onProgress });
      if (found.type === 'html') throw mediaError(`O endereço desta opção é uma página HTML${found.title ? ` (“${found.title}”)` : ''}, não um arquivo de vídeo. Nada foi salvo. Faça uma nova busca pelo link.`, 'MEDIA_HTML');
      if (found.type === 'hls') return hlsOptions(found.url);
      if (found.type === 'media') current = { ...item, url: found.url, kind: found.format.label, type: found.format.mime };
      if (found.type === 'json') {
        const list = found.candidates;
        const pick = list.find(c => item.height && c.height === item.height) || [...list].sort((a, b) => Number(b.height || 0) - Number(a.height || 0) || Number(b.score || 0) - Number(a.score || 0))[0];
        if (!pick) throw mediaError(`A fonte devolve dados JSON em vez de vídeo (${found.summary}). Nada foi salvo.`, 'MEDIA_JSON');
        if (pick.kind === 'HLS') return hlsOptions(pick.url);
        current = { ...item, ...pick, pageUrl: item.pageUrl, sourceScope: item.sourceScope };
      }
      if (found.type === 'error' && [404, 410].includes(Number(found.error?.status))) {
        throw mediaError(`O endereço desta opção respondeu HTTP ${found.error.status} (${sourceHost(item.url) || 'origem'}): expirou ou o arquivo foi removido. Nada foi salvo.`, 'MEDIA_FILE_GONE', found.error.status);
      }
    }
    if (item.platform && Date.now() - Number(item.detectedAt || 0) > 45000) {
      options.onProgress?.(null, 'Atualizando a URL pública...');
      try { current = await refreshPublicItem(item); } catch {}
    }
    let firstError;
    const canProxyTikTok = current.platform === 'tiktok' && Boolean(LINK_PROXY) && Boolean(current.pageUrl);
    const candidates = [current.url, ...(current.alternatives || []).slice(0, 2)];
    for (const [candidateIndex, url] of candidates.entries()) {
      try { return await downloadDirectSmart(url, title, candidateIndex ? { ...options, retryAttempts: 2 } : options); }
      catch (error) {
        if (error.code === 'MEDIA_CANCELLED') throw error;
        if (error.status === 429 || error.cause?.status === 429) throw error;
        if (isManualSaveRequired(error)) throw error;
        if (isManualOpenRequired(error) && !Number(error.cause?.status) && !(canProxyTikTok && isNetworkFailure(error))) throw error;
        firstError ||= error;
        if (!(isManualOpenRequired(error) || isTransientError(error) || isRenewableLinkError(error))) throw error;
      }
    }
    if (canRenewLinkItem(current, firstError)) {
      const status = directErrorStatus(firstError);
      options.onProgress?.(null, `O servidor respondeu HTTP ${status}. Relendo a página de origem para renovar o endereço...`, { phase: 'retry' });
      const renewal = await renewLinkItem(current, status, options.signal);
      if (renewal.same) {
        throw mediaError(`A página de origem ainda publica este mesmo endereço, mas o servidor responde HTTP ${status}: ${linkStatusExplanation(status)}.${firstError?.hlsDiagnosis ? ` Diagnóstico: ${firstError.hlsDiagnosis}.` : ''} Nenhum arquivo foi salvo.`, 'MEDIA_RENEW_SAME', status);
      }
      options.onProgress?.(null, 'Endereço renovado pela página. Tentando de novo...', { phase: 'retry' });
      try { return await downloadDirectSmart(renewal.url, title, { ...options, retryAttempts: 2 }); }
      catch (error) {
        if (error.code === 'MEDIA_CANCELLED' || isManualSaveRequired(error) || isManualOpenRequired(error)) throw error;
        const status2 = directErrorStatus(error);
        const failure = mediaError(`O endereço foi renovado pela página, mas o servidor também respondeu${status2 ? ` HTTP ${status2}` : ' com erro'}: ${error.message}`, 'MEDIA_RENEW_FAILED', status2);
        failure.cause = error; throw failure;
      }
    }
    if (current.platform) {
      const fresh = await refreshPublicItem(current, { keepSession: true }).catch(() => null);
      if (fresh) {
        try { return await downloadDirectSmart(fresh.url, title, { ...options, retryAttempts: 2 }); }
        catch (error) {
          if (error.code === 'MEDIA_CANCELLED' || isManualSaveRequired(error) || isManualOpenRequired(error)) throw error;
          firstError = error;
        }
      }
    }
    if (canProxyTikTok && ([401, 403, 404, 410].includes(directErrorStatus(firstError)) || isNetworkFailure(firstError))) {
      const manualOpen = isManualOpenRequired(firstError) ? firstError : null;
      const proxied = `${LINK_PROXY.replace(/\/+$/, '')}/dl?url=${encodeURIComponent(current.pageUrl)}${LINK_PROXY_KEY ? `&key=${encodeURIComponent(LINK_PROXY_KEY)}` : ''}`;
      await proxyPreflight(proxied, options.signal);
      try { return await downloadDirectSmart(proxied, title, { ...options, retryAttempts: 2 }); }
      catch (error) {
        if (error.code === 'MEDIA_CANCELLED' || isManualSaveRequired(error) || isManualOpenRequired(error)) throw error;
        firstError = manualOpen || error;
      }
    }
    throw platformDownloadError(current, firstError);
  }

  const WORKER_REASONS = Object.freeze({
    HOST_NOT_ALLOWED: 'este site não está em ALLOWED_HOSTS do seu Worker (ou o Worker está só para TikTok)',
    NOT_CONFIGURED: 'o Worker não tem TOKEN_KEY definido',
    BAD_KEY: 'o Worker recusou a chave (LINK_PROXY_KEY)',
    RATE_LIMIT: 'o Worker limitou as requisições deste IP',
    DRM_PROTECTED: 'a transmissão usa proteção DRM, que o Worker não baixa',
    ORIGIN_BLOCKED: 'o site também bloqueou o servidor do Worker',
    ORIGIN_CHALLENGE: 'o site pediu verificação anti-robô ao servidor do Worker',
    NO_MEDIA_URLS: 'a página não publica um arquivo/playlist acessível ao Worker (o player pode montar a URL por script ou exigir login)',
    VIDEO_NOT_FOUND: 'o site informa que a página não existe mais',
    CDN_REFUSED: 'o servidor de vídeo também recusou o Worker',
    CDN_NOT_FOUND: 'o servidor de vídeo não tem mais o arquivo',
    WORKER_UNREACHABLE: 'não consegui falar com o Worker (rede ou CORS)',
  });
  const WORKER_RETRY_CODES = new Set(['MEDIA_SEGMENT_REFUSED', 'MEDIA_RENEW_SAME', 'MEDIA_RENEW_FAILED', 'MEDIA_RENEW_GONE', 'MEDIA_RENEW_PAGE', 'MEDIA_FILE_GONE']);

  function workerBase() { return String(LINK_PROXY || '').replace(/\/+$/, ''); }

  function canTryLinkWorker(item, error) {
    if (!LINK_PROXY || !LINK_PROXY_GENERIC || !item || item.platform) return false;
    const target = item.pageUrl || item.url || '';
    if (!/^https:\/\//i.test(target) || isPrivateNetworkUrl(target)) return false;
    if (!error || error.code === 'MEDIA_CANCELLED' || isManualSaveRequired(error) || isManualOpenRequired(error)) return false;
    return [401, 403, 404, 410].includes(directErrorStatus(error)) || WORKER_RETRY_CODES.has(error.code) || isNetworkFailure(error);
  }

  async function fetchWorkerInfo(pageUrl, signal) {
    const url = `${workerBase()}/info?url=${encodeURIComponent(pageUrl)}${LINK_PROXY_KEY ? `&key=${encodeURIComponent(LINK_PROXY_KEY)}` : ''}`;
    let response;
    try { response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal }); }
    catch (error) {
      if (signal?.aborted) throw mediaError('Download cancelado.', 'MEDIA_CANCELLED');
      throw Object.assign(new Error(WORKER_REASONS.WORKER_UNREACHABLE), { workerCode: 'WORKER_UNREACHABLE' });
    }
    let body = null; try { body = await response.json(); } catch {}
    if (!response.ok || !body?.ok) {
      const code = body?.code || `HTTP_${response.status}`;
      const note = WORKER_REASONS[code] || body?.error || `o Worker respondeu HTTP ${response.status}`;
      throw Object.assign(new Error(note), { workerCode: code, workerStatus: Number(body?.upstreamStatus || response.status) || 0 });
    }
    const origin = new URL(workerBase()).origin;
    body.candidates = (Array.isArray(body.candidates) ? body.candidates : []).filter(c => {
      try { return ['mp4', 'hls'].includes(c.kind) && new URL(c.url).origin === origin; } catch { return false; }
    });
    return body;
  }

  function workerFailureMessage(error) {
    if (!error) return 'sem detalhes';
    const status = directErrorStatus(error);
    const note = error.workerCode ? (WORKER_REASONS[error.workerCode] || error.message) : '';
    return `${note || error.message || 'falha'}${status && !note ? ` (HTTP ${status})` : ''}`;
  }

  async function downloadViaWorker(item, title, options, firstError) {
    const target = item.pageUrl || item.url;
    options.onProgress?.(null, 'O download direto foi recusado. Pedindo ao seu Worker para tentar este link...', { phase: 'retry' });
    let info;
    try { info = await fetchWorkerInfo(target, options.signal); }
    catch (error) {
      if (error.code === 'MEDIA_CANCELLED') throw error;
      firstError.message += ` O seu Worker também foi consultado e não ajudou: ${workerFailureMessage(error)}.`;
      firstError.workerCode = error.workerCode;
      throw firstError;
    }
    const wantHls = /hls/i.test(String(item.kind || '')) || isHls(item.url, item.type) || firstError.code === 'MEDIA_SEGMENT_REFUSED';
    const usable = info.candidates.filter(c => !c.preview);
    const ordered = [...usable.filter(c => (c.kind === 'hls') === wantHls), ...usable.filter(c => (c.kind === 'hls') !== wantHls)].slice(0, 2);
    if (!ordered.length) {
      firstError.message += ' O seu Worker leu a página, mas não achou arquivo ou playlist para baixar.';
      throw firstError;
    }
    let lastError = null;
    for (const candidate of ordered) {
      try {
        options.onProgress?.(null, candidate.kind === 'hls' ? 'Baixando os segmentos HLS pelo Worker...' : 'Baixando o arquivo pelo Worker...', { phase: 'retry' });
        if (candidate.kind === 'hls') {
          return await downloadHlsAsMp4(candidate.url, { filenameBase: title, pageUrl: target, allowPageFallback: false, sessionLink: false, onProgress: options.onProgress, onTrace: options.onTrace });
        }
        return await downloadDirectSmart(candidate.url, title, { ...options, retryAttempts: 2, allowPageFallback: false, typeHint: 'video/mp4', kindHint: 'MP4' });
      } catch (error) {
        if (error.code === 'MEDIA_CANCELLED' || isManualSaveRequired(error) || isManualOpenRequired(error)) throw error;
        lastError = error;
      }
    }
    firstError.message += ` O seu Worker também tentou e falhou: ${workerFailureMessage(lastError)}.`;
    firstError.workerError = lastError;
    throw firstError;
  }

  async function downloadPublicItem(item, title, options) {
    try { return await downloadPublicItemDirect(item, title, options); }
    catch (error) {
      if (!canTryLinkWorker(item, error)) throw error;
      return downloadViaWorker(item, title, options, error);
    }
  }

  const PROXY_FINAL_CODES = Object.freeze({
    VIDEO_NOT_FOUND: 'O TikTok informa que este vídeo não existe mais ou o link é inválido.',
    VIDEO_UNAVAILABLE: 'O vídeo está indisponível no TikTok (privado, removido ou restrito). Não há arquivo para baixar.',
    UNSUPPORTED_POST: 'Este link é uma publicação de fotos, não um vídeo.',
    CDN_NOT_FOUND: 'O servidor de vídeo do TikTok não tem mais o arquivo (expirado ou removido), mesmo após reler a página.',
    BAD_KEY: 'O Worker recusou a chave (LINK_PROXY_KEY).',
    HOST_NOT_ALLOWED: 'O Worker só aceita links públicos do TikTok.',
  });

  async function proxyPreflight(proxiedUrl, signal) {
    let response;
    try { response = await fetch(proxiedUrl, { method: 'GET', headers: { Range: 'bytes=0-0' }, cache: 'no-store', credentials: 'omit', signal }); }
    catch (error) { if (signal?.aborted) throw mediaError('Download cancelado.', 'MEDIA_CANCELLED'); return; }
    try {
      if (response.ok) return;
      let info = null;
      if (/json/i.test(response.headers.get('content-type') || '')) { try { info = await response.json(); } catch {} }
      if (!info?.code) return;
      const final = PROXY_FINAL_CODES[info.code];
      const stage = info.stage ? ` [etapa: ${info.stage}${info.upstreamStatus ? `, HTTP ${info.upstreamStatus} da origem` : ''}]` : '';
      const error = mediaError(`${final || info.error || 'O Worker não conseguiu obter o vídeo.'}${stage}${final ? '' : (info.hint ? ` ${info.hint}` : '')}`, `PROXY_${info.code}`, response.status);
      error.proxyFinal = Boolean(final); throw error;
    } finally { try { await response.body?.cancel(); } catch {} }
  }

  function platformDownloadError(item, error) {
    const status = Number(error?.status || error?.cause?.status || 0);
    if (!item?.platform || ![401, 403].includes(status)) return error;
    const site = item.platform === 'tiktok' ? 'tiktok.com' : 'instagram.com';
    const failure = new Error(`${item.platform === 'tiktok' ? 'O TikTok' : 'O Instagram'} recusou o arquivo (HTTP ${status}). Essas URLs só funcionam com os cookies da sessão que as gerou e o seu gerenciador de userscripts não os repassou ao servidor de vídeo. O script já renovou a URL e tentou de novo. Alternativa: abra o vídeo em ${site}, reproduza por alguns segundos e use “Nesta página”.`);
    failure.status = status; failure.cause = error;
    return failure;
  }

  async function resolvePublicLink(url, visited = new Set(), depth = 0, operation = {}) {
    assertMediaUrl(url);
    if (visited.has(url) || depth > 2 || visited.size >= 8) return [];
    visited.add(url);
    const context = { ...operation, referrer: url, publicOnly: true, sessionLink: operation.sessionLink !== false };
    checkMediaAbort(context);
    if (publicPlatform(url)) return resolveSocialLink(url, { ...context, sessionLink: false });
    const known = await extractKnownPublicSiteCandidates(url).catch(() => []);
    if (known.length) return known;
    const probed = await probeLinkTarget(url, context);
    if (probed?.page && publicPlatform(probed.url)) return resolveSocialLink(probed.url, { ...context, sessionLink: false });
    if (probed && !probed.page) return [{ kind: probed.kind, type: probed.contentType, url: probed.url,
      title: mediaTitleFromUrl(probed.url) || `Vídeo de ${sourceHost(probed.url)}`, pageUrl: url,
      label: probed.confirmed ? 'Formato confirmado' : 'Formato informado pela fonte', trusted: true }];
    const response = await requestLinkPage(probed?.url || url, context);
    const finalUrl = response.finalUrl;
    if (/^\s*#EXTM3U(?:\s|$)/.test(response.text)) return [{ kind: 'HLS', url: finalUrl, pageUrl: url, type: 'application/vnd.apple.mpegurl', title: mediaTitleFromUrl(finalUrl) }];
    if (/<MPD\b/.test(response.text)) return extractDashDirectCandidates(response.text, finalUrl).map(item => ({ ...item, pageUrl: finalUrl }));
    const doc = new DOMParser().parseFromString(response.text, 'text/html');
    if (/^\s*[\[{]/.test(response.text)) {
      try {
        JSON.parse(response.text);
        const json = doc.createElement('script'); json.type = 'application/json'; json.textContent = response.text;
        doc.body.appendChild(json);
      } catch {}
    }
    const declaredBase = safeHttpUrl(doc.querySelector('base[href]')?.getAttribute('href') || '', finalUrl);
    const base = declaredBase || finalUrl;
    const candidates = extractPublicMediaCandidates(doc, base, { scanRawScripts: true, rawText: response.text }).map(item => ({ ...item, pageUrl: finalUrl }));
    const embeds = [...doc.querySelectorAll('iframe[src], meta[name="twitter:player"], meta[property="og:video"], meta[property="og:video:url"], meta[property="og:video:secure_url"]')]
      .map(node => safeHttpUrl(node.getAttribute('src') || node.getAttribute('content'), base))
      .filter(link => link && !isPrivateNetworkUrl(link) && !restrictedPlatformNotice(link) && !isHls(link) && !knownDirectFormatHint(link));
    const settled = await Promise.allSettled([...new Set(embeds)].slice(0, 3).map(link => resolvePublicLink(link, visited, depth + 1, context)));
    for (const result of settled) if (result.status === 'fulfilled') candidates.push(...result.value);
    const notes = context.notes || [];
    const pending = candidates.filter(needsClassification).sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 6);
    const classified = new Map();
    let recursed = 0;
    for (const candidate of pending) {
      checkMediaAbort(context);
      const result = await classifyMediaUrl(candidate.url, { ...context, referrer: finalUrl });
      const inherit = item => ({ title: candidate.title, thumbnail: candidate.thumbnail, ...item, pageUrl: finalUrl });
      let list = [candidate];
      if (result.type === 'media') list = [{ ...candidate, url: result.url, kind: result.format.label, type: result.format.mime, verified: true }];
      else if (result.type === 'hls') list = [{ ...candidate, url: result.url, kind: 'HLS', type: 'application/vnd.apple.mpegurl', verified: true }];
      else if (result.type === 'json') {
        list = result.candidates.map(inherit);
        if (!list.length) notes.push(`Uma URL do player devolveu JSON sem endereços de vídeo (${result.summary}).`);
      } else if (result.type === 'html') {
        list = [];
        notes.push(`Uma URL sugerida pela página era uma página HTML${result.title ? ` (“${result.title}”)` : ''}, não um vídeo; foi descartada.`);
        if (depth < 2 && recursed < 2 && !visited.has(result.url) && !isPrivateNetworkUrl(result.url)) {
          recursed++;
          try { list = await resolvePublicLink(result.url, visited, depth + 1, context); } catch (error) { if (error.code === 'MEDIA_CANCELLED') throw error; }
        }
      } else if (result.type === 'error' && [404, 410].includes(Number(result.error?.status))) {
        list = [];
        notes.push(`Uma URL de mídia sugerida pela página respondeu HTTP ${result.error.status} (${sourceHost(candidate.url) || 'origem'}) e foi descartada.`);
      }
      classified.set(candidate, list);
    }
    const expanded = candidates.flatMap(candidate => classified.has(candidate) ? classified.get(candidate) : [candidate]);
    const unique = new Map();
    for (const candidate of expanded) {
      if (embeds.includes(candidate.url) && candidate.kind !== 'HLS' && !knownDirectFormatHint(candidate.url, candidate.type)) continue;
      const key = mediaIdentityKey(candidate.url, candidate.kind === 'HLS' ? 'HLS' : 'DIRECT');
      if (!unique.has(key) || candidate.score > unique.get(key).score) unique.set(key, candidate);
    }
    if (!unique.size) { const hint = pageBlockHint(response.text, doc.title || ''); if (hint) notes.push(hint); }
    return [...unique.values()].sort(compareMediaQuality);
  }

  function sanitizeForMessage(value, max = 140) {
    return String(value ?? '').replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]').replace(/\b[A-Za-z0-9_\-+=\/]{28,}\b/g, '[…]')
      .replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function htmlTitleOf(bytes) {
    try { return cleanDisplayText(new TextDecoder('utf-8').decode(bytes.slice(0, Math.min(bytes.byteLength, 16384))).match(/<title[^>]*>([\s\S]{1,160}?)<\/title>/i)?.[1] || '').slice(0, 80); }
    catch { return ''; }
  }

  function summarizeJsonBody(bytes) {
    try {
      const value = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      if (Array.isArray(value)) return `lista com ${value.length} item(ns)`;
      if (value && typeof value === 'object') {
        const message = value.error?.message || value.message || (typeof value.error === 'string' ? value.error : '') || value.reason || value.detail || value.status;
        if (message) return `mensagem da fonte: “${sanitizeForMessage(typeof message === 'object' ? JSON.stringify(message) : message)}”`;
        return `campos: ${Object.keys(value).slice(0, 6).join(', ') || 'nenhum'}`;
      }
      return `valor ${typeof value}`;
    } catch { return 'JSON incompleto ou ilegível'; }
  }

  function describeBodyProblem(bytes, contentType = '') {
    const head = (() => { try { return new TextDecoder('utf-8').decode(bytes.subarray(0, 64)); } catch { return ''; } })();
    if (responseLooksLikeHtml(contentType) || looksLikeHtmlBytes(bytes)) {
      const title = htmlTitleOf(bytes);
      return `uma página HTML${title ? ` (título: “${title}”)` : ''}`;
    }
    if (/^\s*[\[{]/.test(head) || /json/i.test(String(contentType))) return `dados JSON (${summarizeJsonBody(bytes)})`;
    if (/^\s*#EXTM3U/.test(head)) return 'uma playlist HLS';
    return '';
  }

  function jsonMediaCandidates(root, baseUrl, { allowApi = false } = {}) {
    const out = [], seen = new Set();
    const heightOf = obj => {
      const raw = obj.height ?? obj.quality ?? obj.label ?? obj.resolution ?? obj.res;
      const m = String(Array.isArray(raw) ? raw[0] : (raw ?? '')).match(/(\d{3,4})\s*p?/i);
      return m ? Number(m[1]) : 0;
    };
    const visit = (value, depth) => {
      if (!value || typeof value !== 'object' || depth > 8) return;
      if (Array.isArray(value)) { value.slice(0, 200).forEach(item => visit(item, depth + 1)); return; }
      for (const key of ['videoUrl', 'video_url', 'url', 'src', 'file', 'hls', 'mp4', 'contentUrl', 'streamUrl', 'stream_url']) {
        const raw = value[key];
        if (typeof raw !== 'string' || !raw) continue;
        const url = safeHttpUrl(decodeEmbeddedUrl(raw), baseUrl);
        if (!url || seen.has(url) || isPrivateNetworkUrl(url) || restrictedPlatformNotice(url)) continue;
        const format = String(value.format || value.type || value.mimeType || '').toLowerCase();
        const hls = isHls(url, format) || /hls|m3u8|mpegurl/.test(format);
        const hint = knownDirectFormatHint(url, format);
        const api = allowApi && !hls && !hint && (/mp4/.test(format) || value.remote === true);
        if (!hls && !hint && !api) continue;
        seen.add(url);
        const height = heightOf(value);
        out.push({ kind: hls ? 'HLS' : (hint?.label || 'VÍDEO'), type: hls ? 'application/vnd.apple.mpegurl' : (hint?.mime || ''), url,
          height, width: Number(value.width || 0), trusted: true, verified: !api,
          label: `${hls ? 'HLS' : 'Arquivo'} publicado pelo player${height ? ` · ${height}p` : ''}`,
          score: (hls ? 100 : 112) + height / 100 });
      }
      Object.values(value).forEach(item => visit(item, depth + 1));
    };
    visit(root, 0);
    return out;
  }

  function balancedJsonAt(text, from) {
    const open = text[from], close = open === '[' ? ']' : open === '{' ? '}' : '';
    if (!close) return '';
    let depth = 0, inString = false, escaped = false;
    const limit = Math.min(text.length, from + 262144);
    for (let i = from; i < limit; i++) {
      const ch = text[i];
      if (inString) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') inString = false; continue; }
      if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) return text.slice(from, i + 1);
    }
    return '';
  }

  const needsClassification = candidate => Boolean(candidate) && candidate.kind === 'VÍDEO' && !candidate.verified && !candidate.platform &&
    !isBlobUrl(candidate.url) && !knownDirectFormatHint(candidate.url, candidate.type);

  async function classifyMediaUrl(url, context) {
    let response;
    try {
      const probe = await readPrefix(url, { context, maxBytes: 1048576, timeout: 15000, kind: 'sondagem do formato', range: 'bytes=0-1048575',
        headers: { Accept: 'application/json,video/*;q=0.9,text/html;q=0.8,*/*;q=0.5' } });
      if (probe.limited || !probe.result) return { type: 'large' };
      response = probe.result;
    } catch (error) {
      if (error.code === 'MEDIA_LIMIT') return { type: 'large' };
      return { type: 'error', error };
    }
    const { bytes, contentType, finalUrl } = response;
    const head = new TextDecoder().decode(bytes.subarray(0, 4096));
    if (/^\s*#EXTM3U(?:\s|$)/.test(head)) return { type: 'hls', url: finalUrl };
    const format = detectMediaFormatFromBytes(bytes, contentType, finalUrl);
    if (format?.confirmed && !format.hls) return { type: 'media', url: finalUrl, format };
    if (/json/i.test(contentType) || /^\s*[\[{]/.test(head)) {
      let value = null;
      try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch {}
      return { type: 'json', url: finalUrl, summary: summarizeJsonBody(bytes), candidates: value ? jsonMediaCandidates(value, finalUrl) : [] };
    }
    if (responseLooksLikeHtml(contentType) || looksLikeHtmlBytes(bytes) || /<html|<!doctype html/i.test(head)) return { type: 'html', url: finalUrl, title: htmlTitleOf(bytes) };
    return { type: 'unknown', url: finalUrl, contentType };
  }

  function pageBlockHint(html, title = '') {
    const text = String(html || '').slice(0, 200000);
    if (/age[\s-]?(?:verification|gate|check)|verify your age|you must be (?:over )?18|accessAgeDisclaimer|are you (?:over )?18/i.test(text))
      return 'A página pediu verificação de idade. O script não confirma idade nem contorna esse bloqueio: abra o link no navegador, confirme, reproduza o vídeo e use “Nesta página”.';
    if (/captcha|cf-chl|challenge-platform|just a moment|attention required|verify you are human/i.test(text))
      return 'A página devolveu uma verificação anti-robô (captcha/desafio). O script não resolve esse desafio: abra o link no navegador, reproduza o vídeo e use “Nesta página”.';
    if (/<title[^>]*>[^<]*(?:log ?in|sign ?in|entrar)/i.test(text) || /access denied|forbidden/i.test(title))
      return 'A página exigiu login ou negou o acesso sem sessão. O script não usa credenciais: abra o link logado no navegador e use “Nesta página”.';
    return '';
  }

  const HLS_AUTH_PARAM = /^(?:hash|token|sig|signature|expires?|expiry|validto|validfrom|policy|key-pair-id|hdnts|hdl|ipa|ip|auth|exp|st|md5|secure)$/i;
  const authParamNames = url => { try { return [...new URL(url).searchParams.keys()].filter(key => HLS_AUTH_PARAM.test(key)); } catch { return []; } };

  function inheritedQueryUrl(resource) {
    try {
      if (!resource.playlistUrl) return '';
      const target = new URL(resource.url), playlist = new URL(resource.playlistUrl);
      if (target.search || !playlist.search || target.origin !== playlist.origin || !authParamNames(playlist.href).length) return '';
      target.search = playlist.search;
      return target.href;
    } catch { return ''; }
  }

  function tokenSecondsLeft(url) {
    try {
      const params = new URL(url).searchParams;
      for (const key of ['validto', 'expires', 'expire', 'exp', 'expiry']) {
        const value = Number(params.get(key));
        if (value > 1e9 && value < 1e10) return value - Date.now() / 1000;
      }
    } catch {}
    return null;
  }

  function hlsDiagnosis(resource, tried) {
    let host = '?', file = '', params = [], playlistParams = [];
    try { const u = new URL(resource.url); host = u.hostname; file = u.pathname.split('/').pop().slice(0, 60); params = [...u.searchParams.keys()]; } catch {}
    try { playlistParams = [...new URL(resource.playlistUrl).searchParams.keys()]; } catch {}
    const parts = [`host ${host}`, `arquivo ${file || '?'}`, `parâmetros da URL: ${params.length ? params.join(', ') : 'nenhum'}`];
    try { const playlistHost = new URL(resource.playlistUrl).hostname; if (playlistHost !== host) parts.push(`a playlist veio de ${playlistHost} e o segmento de ${host}`); } catch {}
    if (!params.length && playlistParams.length) parts.push(`a playlist tinha parâmetros (${playlistParams.join(', ')}) que o segmento não repetiu`);
    const left = tokenSecondsLeft(resource.url) ?? tokenSecondsLeft(resource.playlistUrl);
    if (left !== null) parts.push(left < 0 ? `token vencido há ${Math.max(1, Math.round(-left / 60))} min` : `token ainda válido por ${Math.round(left / 60)} min`);
    if (tried?.inherited) parts.push('repetir os parâmetros da playlist no segmento também foi recusado');
    return parts.join(' · ');
  }

  const RANGE_REFUSALS = Object.freeze([403, 404, 410, 416]);
  async function readPrefix(url, { context, maxBytes, timeout = 15000, kind = 'verificação de segmento', headers = {}, range = '' }) {
    const base = { context, prefix: true, kind, timeout };
    let rangeError = null;
    try { return { result: await mediaRequest(url, { ...base, maxBytes, headers: { ...headers, Range: range || `bytes=0-${maxBytes - 1}` } }), via: 'range', rangeError }; }
    catch (error) {
      if (error.code === 'MEDIA_LIMIT') return { result: null, via: 'range', limited: true, rangeError };
      if (!RANGE_REFUSALS.includes(Number(error.status))) throw error;
      rangeError = error;
    }
    try { return { result: await mediaRequest(url, { ...base, maxBytes: Math.max(maxBytes, 65536), headers }), via: 'plain', rangeError }; }
    catch (error) {
      if (error.code === 'MEDIA_LIMIT') return { result: null, via: 'plain', limited: true, rangeError };
      error.rangeError = rangeError; error.probedPlain = true;
      throw error;
    }
  }

  async function probeSegmentExists(url, context, range = null) {
    const wanted = range ? `bytes=${range.start}-${range.start + 15}` : '';
    const probe = await readPrefix(url, { context, maxBytes: 16, range: wanted });
    if (probe.result) {
      const problem = describeBodyProblem(probe.result.bytes, probe.result.contentType);
      if (problem) throw mediaError(`A fonte devolveu ${problem} em vez do segmento.`, 'MEDIA_RESPONSE');
    }
    return { via: probe.via, rangeRejected: probe.via === 'plain' && Boolean(probe.rangeError) };
  }

  function hlsTraceOf(context, resource, error) {
    const hostOf = value => { try { return new URL(value).hostname; } catch { return '?'; } };
    const lines = [];
    const chain = (context.hlsChain || []).slice(-3);
    chain.forEach(item => {
      const same = (() => { try { const a = new URL(item.url), b = new URL(item.finalUrl); return a.origin === b.origin && a.pathname === b.pathname; } catch { return true; } })();
      lines.push(`• Playlist ${item.kind === 'master' ? 'principal' : 'de mídia'}: pedida a ${hostOf(item.url)}, respondida por ${hostOf(item.finalUrl)} (${same ? 'sem redirecionamento' : 'COM redirecionamento'}) · ${item.type || 'sem content-type'} · ${item.bytes} B${item.segments ? ` · ${item.segments} segmentos` : ''}`);
    });
    let segUrl, playlistUrl = resource.playlistUrl || chain.filter(item => item.kind === 'media').slice(-1)[0]?.finalUrl || '';
    try { segUrl = new URL(resource.url); } catch {}
    if (segUrl) {
      const segParams = [...segUrl.searchParams.entries()];
      let shared = 'sem playlist para comparar';
      try {
        const pl = new URL(playlistUrl).searchParams, names = segParams.map(([k]) => k).filter(k => pl.has(k));
        shared = names.length ? `${names.filter(k => pl.get(k) === segUrl.searchParams.get(k)).length}/${names.length} parâmetros em comum têm o mesmo valor da playlist` : 'nenhum parâmetro em comum com a playlist';
      } catch {}
      lines.push(`• Segmento: host ${segUrl.hostname} · arquivo ${segUrl.pathname.split('/').pop().replace(/\d+/g, 'N').slice(0, 40)} · parâmetros: ${segParams.length ? segParams.map(([k, v]) => `${k}(${v.length})`).join(' ') : 'nenhum'}${segParams.some(([, v]) => v.length <= 3) ? ` · valores curtos: ${segParams.filter(([, v]) => v.length <= 3).map(([k, v]) => `${k}=${v}`).join(' ')}` : ''} · caminho com ${segUrl.pathname.split('/').filter(Boolean).length} níveis · ${shared}`);
      if (playlistUrl) { try { lines.push(`• Host da playlist de mídia: ${new URL(playlistUrl).hostname}${new URL(playlistUrl).hostname === segUrl.hostname ? ' (igual ao do segmento)' : ' (DIFERENTE do segmento)'}`); } catch {} }
      const now = Date.now() / 1000, from = Number(segUrl.searchParams.get('validfrom')), to = Number(segUrl.searchParams.get('validto'));
      if (from > 1e9 && to > 1e9) lines.push(`• Janela do token: começou há ${Math.round((now - from) / 60)} min${from > now ? ' (NO FUTURO: relógio do aparelho x servidor?)' : ''}; termina em ${Math.round((to - now) / 60)} min`);
    }
    const panelOrigin = location.origin, videoOrigin = originOf(context.referrer || '');
    if (videoOrigin) lines.push(`• Painel aberto em ${hostOf(panelOrigin)} · página do vídeo em ${hostOf(videoOrigin)} (${panelOrigin === videoOrigin ? 'MESMA origem: o fetch da página pode usar a sessão do site' : 'origem DIFERENTE: Origin/cookies reais do site só existem em “Nesta página”'})`);
    const anonymous = isAnonymousContext(context);
    lines.push(`• Pedido: Referer ${context.referrer ? `enviado (site ${hostOf(context.referrer)})` : 'não enviado'} · cookies do navegador: ${anonymous ? 'NÃO enviados (modo anônimo do link)' : 'enviados quando o gerenciador permite'} · Origin só no perfil “origin”`);
    const attempts = error?.attempts || [];
    if (attempts.length) lines.push(`• Tentativas: ${attempts.map(a => `${a.mode}→${a.status || a.code || 'sem status'}${a.info?.['content-type'] ? ` ${String(a.info['content-type']).split(';')[0]}` : ''} [${a.via === 'gm' ? (a.anonymous ? 'gerenciador, anônimo' : 'gerenciador, com cookies') : `fetch da página, credenciais ${a.credentials}`}]`).join(' · ')}`);
    const info = attempts.map(a => a.info).find(Boolean) || error?.respInfo;
    if (info) lines.push(`• Resposta da origem: ${Object.entries(info).filter(([k]) => k !== 'sample').map(([k, v]) => `${k}=${v}`).join(' · ') || 'sem cabeçalhos úteis'}${info.sample ? ` · amostra: “${info.sample}”` : ''}`);
    if (chain.length) lines.push(`• Playlist lida há ${Math.round((Date.now() - chain[chain.length - 1].at) / 1000)} s`);
    return `Rastro técnico (sem tokens, cookies ou URLs completas):\n${lines.join('\n')}`;
  }

  async function requestHlsResource(resource, context, isMap = false, probe = false) {
    const origin = originOf(resource.url);
    const inherited = inheritedQueryUrl(resource);
    const preferInherited = Boolean(inherited) && context.hlsInherit?.has(origin);
    const fetcher = target => probe ? probeSegmentExists(target, context, resource.range) : requestBytes(target, resource.range, context);
    const tried = { inherited: false };
    try { return await fetcher(preferInherited ? inherited : resource.url); }
    catch (error) {
      if (![403, 404, 410].includes(error.status)) throw error;
      if (inherited && !preferInherited) {
        tried.inherited = true;
        try { const result = await fetcher(inherited); (context.hlsInherit ||= new Set()).add(origin); return result; }
        catch (second) { if (![403, 404, 410].includes(second.status)) throw second; }
      }
      error.hlsDiagnosis = hlsDiagnosis(resource, tried);
      try { error.hlsTrace = hlsTraceOf(context, resource, error); } catch {}
      error.message = `${error.message} ${isMap ? 'Inicialização' : 'Segmento'} HLS recusado — ${error.hlsDiagnosis}.`;
      throw error;
    }
  }

  async function preflightHlsSegments(resolved, context) {
    const segments = resolved.media.segments;
    if (segments.length < 3) return;
    const last = segments.length - 1;
    const picks = [...new Set([0, Math.floor(segments.length / 2), last])];
    const ok = [], failed = [];
    for (const index of picks) {
      checkMediaAbort(context);
      context.onProgress?.(null, `Verificando os segmentos (${index + 1}/${segments.length})...`);
      try {
        const info = await requestHlsResource(segments[index], context, false, true);
        ok.push(index); if (info?.rangeRejected) context.hlsRangeRejected = true;
      } catch (error) {
        if (![403, 404, 410].includes(error.status)) throw error;
        failed.push({ index, error });
      }
    }
    if (context.hlsRangeRejected) console.info('[VDD] A origem recusa requisições Range para segmentos, mas serve o GET simples: o download usa GET simples.');
    if (!failed.length) return;
    const first = failed[0].error, status = first.status, list = failed.map(item => item.index + 1);
    const numbers = indexes => indexes.map(i => i + 1).join(', ');
    const error = mediaError('', 'MEDIA_SEGMENT_REFUSED', status);
    error.status = status; error.hlsDiagnosis = first.hlsDiagnosis || '';
    error.hlsTrace = `${first.hlsTrace || ''}${first.hlsTrace ? '\n' : ''}• Amostras testadas: ${picks.map(i => `${i + 1}${ok.includes(i) ? ' ok' : ` HTTP ${failed.find(f => f.index === i)?.error.status}`}`).join(' · ')}`;
    if (ok.length) {
      error.code = 'MEDIA_SEGMENT_MISSING';
      error.message = `${list.length === 1 ? `O segmento ${list[0]}` : `Os segmentos ${list.join(', ')}`} de ${segments.length} não ${list.length === 1 ? 'está disponível' : 'estão disponíveis'} na origem (HTTP ${status}), enquanto ${ok.length === 1 ? 'o segmento' : 'os segmentos'} ${numbers(ok)} ${ok.length === 1 ? 'responde' : 'respondem'}. Nada foi baixado, porque o vídeo ficaria incompleto. ${first.hlsDiagnosis ? `Diagnóstico: ${first.hlsDiagnosis}.` : ''}`.trim();
    } else {
      const params = authParamNames(segments[picks[0]].url);
      error.hlsRefusedAll = true;
      error.message = `A origem recusou todos os segmentos testados (${numbers(picks)} de ${segments.length}) com HTTP ${status}${first.probedPlain ? ', inclusive em pedido simples sem Range' : ''}. ` +
        `Isso indica recusa de acesso (e não um segmento ausente): URL assinada${params.length ? ` (${params.join(', ')})` : ''} ` +
        `${params.some(name => /^(?:ipa|ip)$/i.test(name)) ? 'possivelmente vinculada ao endereço IP, ' : ''}sessão, Referer ou região. ` +
        `O script não contorna essa proteção. Nada foi baixado. ${first.hlsDiagnosis ? `Diagnóstico: ${first.hlsDiagnosis}.` : ''}`.trim();
    }
    throw error;
  }

  function compareMediaQuality(a, b) {
    return Number(b.noWatermark === true) - Number(a.noWatermark === true) ||
      Number(b.height || 0) - Number(a.height || 0) || Number(b.width || 0) - Number(a.width || 0) || Number(b.bandwidth || 0) - Number(a.bandwidth || 0) || Number(b.score || 0) - Number(a.score || 0);
  }

  function syncInputClear(input) {
    const button = input?.parentElement?.querySelector?.('.vdd-input-clear');
    if (button) button.hidden = !input.value;
  }

  function setLinkPane(pane) {
    const name = pane === 'site' ? 'site' : 'video';
    APP.linkPane = name;
    const results = document.getElementById('vdd-link-results'), listing = document.getElementById('vdd-link-listing'), seg = document.getElementById('vdd-link-seg');
    if (results) results.hidden = name !== 'video';
    if (listing) listing.hidden = name !== 'site';
    for (const button of seg?.querySelectorAll('button') || []) {
      const on = button.dataset.pane === name;
      button.classList.toggle('on', on); button.setAttribute('aria-selected', String(on));
    }
    const scroller = document.querySelector('#vdd-root .vdd-body'); if (scroller) scroller.scrollTop = 0;
    if (name === 'site') requestAnimationFrame(() => LISTING.state?.onScroll?.());
  }

  function setLinkPanes({ video = 0, site = 0, show = '' } = {}) {
    const seg = document.getElementById('vdd-link-seg'), both = video > 0 && site > 0;
    if (seg) seg.hidden = !both;
    const v = document.getElementById('vdd-seg-video'), t = document.getElementById('vdd-seg-site');
    if (v) v.textContent = video ? `(${video})` : '';
    if (t) t.textContent = site ? `(${site})` : '';
    setLinkPane(both ? (show || 'video') : (site > 0 && video === 0 ? 'site' : 'video'));
  }

  function clearLinkAll() {
    if (APP.working) { toast('Aguarde o download atual terminar para limpar.'); return; }
    if (APP.linkBusy) APP.linkController?.abort();
    const input = document.getElementById('vdd-link-input'), status = document.getElementById('vdd-link-status'), results = document.getElementById('vdd-link-results');
    if (input) { input.value = ''; syncInputClear(input); }
    teardownLinkListing();
    APP.linkResults = [];
    if (results) { results.replaceChildren(); delete results.dataset.signature; }
    if (status) { status.textContent = ''; status.dataset.state = ''; }
    setLinkPanes({ video: 0, site: 0 });
    updateHeaderCount('Baixar por link');
    input?.focus();
  }

  async function handleLinkSearch() {
    const input = document.getElementById('vdd-link-input'), button = document.getElementById('vdd-link-submit'), status = document.getElementById('vdd-link-status');
    const cancel = document.getElementById('vdd-link-cancel');
    if (APP.linkBusy || APP.working) { toast('Aguarde a operação atual.'); return; }
    let url;
    try { url = pastedPublicUrl(input?.value); }
    catch (error) { status.textContent = error.message || 'Cole um link público válido.'; status.dataset.state = 'error'; return; }
    APP.linkBusy = true; button.disabled = true; input.blur();
    APP.linkController = new AbortController(); cancel.hidden = false;
    status.dataset.state = 'loading'; status.textContent = 'Analisando o link público...';
    try {
      const notes = [];
      const outcome = await resolveLinkOrListing(url, { signal: APP.linkController.signal, notes,
        onStage: label => { status.textContent = label; } });
      if (notes.length) console.info('[VDD] Notas da extração:', [...new Set(notes)]);
      checkMediaAbort({ signal: APP.linkController.signal });
      if (outcome.listing) {
        APP.linkResults = [];
        const stale = document.getElementById('vdd-link-results'); if (stale) { stale.replaceChildren(); delete stale.dataset.signature; }
        mountLinkListing(outcome.listing);
        setLinkPanes({ video: 0, site: outcome.listing.entries.length });
        return;
      }
      const related = outcome.related?.entries?.length ? outcome.related : null;
      if (related) mountLinkListing(related, { related: true }); else teardownLinkListing();
      const candidates = outcome.candidates;
      APP.linkResults = candidates.sort(compareMediaQuality).map((item, index) => ({ ...item, order: index + 1, preferred: index === 0, sourceScope: 'link' }));
      const list = document.getElementById('vdd-link-results');
      if (!list.querySelector('[data-prepared="true"]')) delete list.dataset.signature;
      renderLinkResults();
      status.dataset.state = candidates.length ? 'complete' : '';
      const watermarkNote = candidates.some(item => item.platform) && !candidates.some(item => item.noWatermark === true)
        ? ' A fonte não publicou uma versão sem marca d’água; se houver marca incorporada ao vídeo, ela permanece no arquivo.' : '';
      status.textContent = candidates.length ? `${candidates.length} ${candidates.length === 1 ? 'opção' : 'opções'} publicada${candidates.length === 1 ? '' : 's'}. Confira a qualidade e baixe.${watermarkNote}` :
        `Nenhuma mídia baixável foi encontrada. ${[...new Set(notes)].slice(0, 3).join(' ') || 'O HTML não publicou uma mídia acessível. Abra o post, reproduza o vídeo e use “Nesta página”.'}`;
      if (outcome.singleError && !candidates.length) status.textContent = `${outcome.singleError.message || 'Não foi possível ler o vídeo deste link.'}${related ? ' Veja os outros vídeos em “Vídeos da página”.' : ''}`;
      else if (related && candidates.length) status.textContent += ` Esta página também lista ${related.entries.length} vídeo${related.entries.length === 1 ? '' : 's'} em “Vídeos da página”.`;
      setLinkPanes({ video: candidates.length, site: related ? related.entries.length : 0, show: candidates.length ? 'video' : 'site' });
    } catch (error) {
      status.dataset.state = error.code === 'MEDIA_CANCELLED' ? '' : 'error';
      status.textContent = error.code === 'MEDIA_CANCELLED' ? 'Busca cancelada.' : error.message || 'Não foi possível ler o link.';
    } finally { APP.linkBusy = false; APP.linkController = null; button.disabled = false; cancel.hidden = true; }
  }

  const DISCOVERY = Object.freeze({ minListing: 3, maxEntries: 600, firstBatch: 12, batch: 12, frameChunk: 4,
    anchorChunk: 250, maxAnchors: 8000, cacheTtl: 5 * 60 * 1000, cacheSize: 6, loadMargin: '700px 0px', keepMargin: '2600px 0px' });
  const AD_HOST = /(?:^|[.-])(?:doubleclick|googlesyndication|googleadservices|adservice|adnxs|exoclick|exosrv|trafficjunky|juicyads|popads|popcash|propellerads|adsterra|clickadu|hilltopads|taboola|outbrain|mgid|revcontent|criteo|ads?|adv|banners?)(?:[.-]|$)/i;
  const AD_NODE = 'ins, [data-ad], [data-ad-slot], [data-advertisement], [rel~="sponsored"], [class~="ad"], [class~="ads"], [class~="adv"], [class~="advert"], [class*="advert"], [class*="sponsor"], [class*="banner"], [id^="ad-"], [id^="ads-"], [id*="advert"], [id*="sponsor"]';
  const VIDEO_PATH = /(?:^|\/)(?:videos?|watch|view_video(?:\.php)?|viewkey|embed|player|play|clips?|movies?|films?|reels?|shorts?|episodes?|v|vid|e|stream)(?:\/|[.?]|$)/i;
  const VIDEO_ROOT = /^(?:videos?|watch|clips?|movies?|films?|reels?|shorts?|embed|player|play|stream|e|v|vid)$/i;
  const NAV_PATH = /(?:^|\/)(?:categor(?:y|ies)|tags?|search|login|signin|sign-in|signup|register|account|contact|about|dmca|terms|privacy|faq|support|help|rss|sitemap|upload|settings|pornstars?|models?|users?|profiles?|members?|channels?|playlists?|albums?|photos?|gifs?|blogs?|news|forum|page\/\d+)(?:\/|$)/i;
  const ID_PARAM = /^(?:v|vid|video|viewkey|id|watch|key)$/i;
  const BLANK_THUMB = /(?:blank|spacer|pixel|placeholder|transparent|1x1|loading|lazy)[^/]*\.(?:gif|png|svg)(?:$|\?)/i;
  const DURATION_TEXT = /(?:^|[\s(\[])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=$|[\s)\]])/;

  function siteKeyOf(host) {
    const parts = String(host || '').toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const sld = parts[parts.length - 2];
    return (parts[parts.length - 1].length === 2 && sld.length <= 3 ? parts.slice(-3) : parts.slice(-2)).join('.');
  }

  function entryUrlKey(raw) {
    try {
      const url = new URL(raw);
      const keep = [...url.searchParams.entries()].filter(([name]) => ID_PARAM.test(name)).sort(([a], [b]) => a.localeCompare(b));
      return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${keep.length ? `?${keep.map(([k, v]) => `${k}=${v}`).join('&')}` : ''}`;
    } catch { return ''; }
  }

  function stripTrackingParams(raw) {
    try {
      const url = new URL(raw); let changed = false;
      for (const name of [...url.searchParams.keys()]) if (/^(?:utm_[a-z]+|fbclid|gclid|mc_eid|igshid)$/i.test(name)) { url.searchParams.delete(name); changed = true; }
      url.hash = '';
      return changed || raw.includes('#') ? url.href : raw;
    } catch { return raw; }
  }

  function durationFromText(text) {
    const match = String(text || '').match(DURATION_TEXT);
    if (!match) return 0;
    const parts = match[1].split(':').map(Number);
    if (parts.some(part => !Number.isFinite(part))) return 0;
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return seconds > 0 && seconds < 24 * 3600 ? seconds : 0;
  }

  function entryThumbnail(node, base) {
    const media = node.querySelector?.('img, video[poster], picture source');
    if (!media) return '';
    const candidates = ['data-src', 'data-thumb_url', 'data-original', 'data-lazy-src', 'data-mediumthumb', 'data-thumb', 'data-image', 'poster', 'src']
      .map(name => media.getAttribute?.(name));
    const srcset = media.getAttribute?.('data-srcset') || media.getAttribute?.('srcset');
    if (srcset) candidates.push(srcset.split(',')[0].trim().split(/\s+/)[0]);
    for (const raw of candidates) {
      const value = String(raw || '').trim();
      if (!value || /^data:/i.test(value) || BLANK_THUMB.test(value)) continue;
      const url = safeHttpUrl(value, base);
      if (!url || isPrivateNetworkUrl(url)) continue;
      try { if (AD_HOST.test(new URL(url).hostname)) continue; } catch { continue; }
      return url;
    }
    return '';
  }

  function classifyVideoAnchor(anchor, base, pageSite) {
    const href = anchor.getAttribute('href') || '';
    if (!href || /^(?:#|javascript:|mailto:|tel:|data:)/i.test(href.trim())) return null;
    const url = safeHttpUrl(href, base);
    if (!url || isPrivateNetworkUrl(url) || restrictedPlatformNotice(url)) return null;
    let parsed; try { parsed = new URL(url); } catch { return null; }
    if (siteKeyOf(parsed.hostname) !== pageSite || AD_HOST.test(parsed.hostname)) return null;
    if (/\.(?:jpe?g|png|gif|webp|svg|css|js|json|xml|txt|zip|pdf)(?:$|\?)/i.test(parsed.pathname)) return null;
    if (anchor.closest?.(AD_NODE) || /sponsored|nofollow\s+sponsored/i.test(anchor.getAttribute('rel') || '')) return null;
    if (parsed.searchParams.has('utm_source') && /(?:^|\.)adclick|click/i.test(parsed.hostname)) return null;
    const hasId = [...parsed.searchParams.keys()].some(name => ID_PARAM.test(name));
    const segments = parsed.pathname.split('/').filter(Boolean);
    const videoPath = VIDEO_PATH.test(parsed.pathname) || hasId;
    if (!segments.length && !hasId) return null;
    if (segments.length === 1 && VIDEO_ROOT.test(segments[0]) && !hasId) return null;
    if (!videoPath && NAV_PATH.test(parsed.pathname)) return null;
    if (/(?:^|\/)page\/\d+|[?&](?:page|p|pg)=\d+(?:&|$)/i.test(parsed.pathname + parsed.search) && !hasId) return null;

    const thumbnail = entryThumbnail(anchor, base);
    const card = anchor.closest?.('article, li, [class*="video"], [class*="thumb"], [class*="item"], [class*="card"]') || anchor.parentElement;
    const schema = Boolean(anchor.closest?.('[itemtype*="VideoObject"]') || card?.matches?.('[itemtype*="VideoObject"]'));
    const nearText = cleanDisplayText(`${anchor.textContent || ''} ${card && card !== anchor ? card.textContent || '' : ''}`, 400);
    const duration = Number(anchor.getAttribute('data-duration') || card?.getAttribute?.('data-duration') || 0) ||
      parseIsoDuration(anchor.querySelector('time[datetime]')?.getAttribute('datetime') || card?.querySelector?.('time[datetime]')?.getAttribute('datetime') || '') ||
      durationFromText(nearText);
    const media = anchor.querySelector('img');
    const titleRaw = anchor.getAttribute('title') || media?.getAttribute('alt') || anchor.getAttribute('aria-label') ||
      cleanDisplayText(anchor.textContent, 200).replace(DURATION_TEXT, ' ');
    const title = cleanDisplayText(titleRaw, 140);
    const usableTitle = title.length >= 4 && !/^[\d:\s]+$/.test(title) ? title : '';

    let score = 0;
    if (videoPath) score += 3;
    if (thumbnail) score += 2;
    if (duration) score += 1;
    if (usableTitle.length >= 8) score += 1;
    if (schema) score += 2;
    if (score < 4 || (!thumbnail && !schema)) return null;
    return { url: stripTrackingParams(url), key: entryUrlKey(url), title: usableTitle || cleanName(mediaTitleFromUrl(url) || ''), thumbnail, duration, score };
  }

  function jsonLdVideoEntries(doc, base, pageSite) {
    const out = [];
    let visited = 0;
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 9 || visited++ > 6000) return;
      if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
      const types = [].concat(value['@type'] || []).map(String);
      if (types.includes('VideoObject')) {
        const page = safeHttpUrl(value.url || value['@id'] || '', base), thumb = Array.isArray(value.thumbnailUrl) ? value.thumbnailUrl[0] : value.thumbnailUrl;
        const direct = safeHttpUrl(value.contentUrl || '', base);
        const target = page || '';
        let sameSite = false; try { sameSite = Boolean(target) && siteKeyOf(new URL(target).hostname) === pageSite; } catch {}
        if (sameSite || (direct && !isPrivateNetworkUrl(direct) && (isHls(direct) || knownDirectFormatHint(direct)))) {
          out.push({ url: target || direct, key: entryUrlKey(target || direct), title: cleanDisplayText(value.name || value.headline || '', 140),
            thumbnail: safeHttpUrl(typeof thumb === 'string' ? thumb : thumb?.url || '', base), duration: parseIsoDuration(value.duration), score: 9,
            direct: !sameSite && direct ? { kind: isHls(direct) ? 'HLS' : (knownDirectFormatHint(direct)?.label || 'VÍDEO'), url: direct, type: isHls(direct) ? 'application/vnd.apple.mpegurl' : (knownDirectFormatHint(direct)?.mime || ''), trusted: true, verified: false } : null });
        }
      }
      Object.values(value).forEach(child => visit(child, depth + 1));
    };
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(script => { try { visit(JSON.parse(script.textContent || '')); } catch {} });
    return out;
  }

  async function extractPageVideoEntries(doc, base, { onProgress, signal } = {}) {
    let pageSite = '', pageKey = '';
    try { pageSite = siteKeyOf(new URL(base).hostname); pageKey = entryUrlKey(base); } catch { return { entries: [], truncated: false, anchors: 0 }; }
    const byKey = new Map();
    let truncated = false;
    const add = entry => {
      if (!entry.key || entry.key === pageKey) return;
      const previous = byKey.get(entry.key);
      if (previous) {
        previous.title = previous.title && previous.title.length >= (entry.title || '').length ? previous.title : entry.title || previous.title;
        previous.thumbnail ||= entry.thumbnail; previous.duration ||= entry.duration; previous.direct ||= entry.direct;
        return;
      }
      if (byKey.size >= DISCOVERY.maxEntries) { truncated = true; return; }
      byKey.set(entry.key, { ...entry });
    };
    jsonLdVideoEntries(doc, base, pageSite).forEach(add);
    const anchors = [...doc.querySelectorAll('a[href]')].slice(0, DISCOVERY.maxAnchors);
    for (let i = 0; i < anchors.length; i++) {
      if (i && i % DISCOVERY.anchorChunk === 0) {
        checkMediaAbort({ signal });
        onProgress?.(i, anchors.length, byKey.size);
        await yieldUi(0);
      }
      let entry = null;
      try { entry = classifyVideoAnchor(anchors[i], base, pageSite); } catch {}
      if (entry) add(entry);
    }
    return { entries: [...byKey.values()], truncated, anchors: anchors.length };
  }

  const listingCache = new Map();
  function listingCacheGet(url) {
    const hit = listingCache.get(url);
    if (!hit) return null;
    if (Date.now() - hit.at > DISCOVERY.cacheTtl) { listingCache.delete(url); return null; }
    return hit;
  }
  function listingCacheSet(url, listing) {
    listingCache.delete(url);
    while (listingCache.size >= DISCOVERY.cacheSize) listingCache.delete(listingCache.keys().next().value);
    listingCache.set(url, listing);
  }

  async function resolveLinkOrListing(url, operation = {}) {
    const op = { ...operation, pageCache: true };
    const single = async () => ({ candidates: await resolvePublicLink(url, new Set(), 0, op) });
    if (publicPlatform(url) || beegVideoId(url)) return single();
    const context = { ...op, referrer: url, publicOnly: true, sessionLink: true };
    checkMediaAbort(context);
    const cached = listingCacheGet(url);
    if (cached) return { listing: cached, cached: true };
    let probed = null;
    try { probed = await probeLinkTarget(url, context); } catch (error) { if (error.code === 'MEDIA_CANCELLED') throw error; }
    if (!probed || !probed.page || publicPlatform(probed.url)) return single();
    operation.onStage?.('Lendo a página e procurando vídeos...');
    const response = await requestLinkPage(probed.url || url, context);
    if (/^\s*#EXTM3U(?:\s|$)/.test(response.text) || /<MPD\b/.test(response.text) || /^\s*[\[{]/.test(response.text)) return single();
    const doc = new DOMParser().parseFromString(response.text, 'text/html');
    const base = safeHttpUrl(doc.querySelector('base[href]')?.getAttribute('href') || '', response.finalUrl) || response.finalUrl;
    const found = await extractPageVideoEntries(doc, base, { signal: op.signal, onProgress: (done, total, count) =>
      operation.onStage?.(`Analisando a página… ${count} vídeo${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'} (${done}/${total} links)`) });
    const buildListing = () => ({ url, finalUrl: response.finalUrl, title: cleanDisplayText(doc.title, 120), entries: found.entries, truncated: found.truncated, anchors: found.anchors, at: Date.now() });
    const withRelated = async () => {
      try { const out = await single(); return found.entries.length ? { ...out, related: buildListing() } : out; }
      catch (error) { if (error?.code === 'MEDIA_CANCELLED' || !found.entries.length) throw error; return { candidates: [], related: buildListing(), singleError: error }; }
    };
    if (found.entries.length < DISCOVERY.minListing) return withRelated();
    const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content') || '';
    if (/^(?:video|movie)(?:[.:]|$)/i.test(ogType)) return withRelated();
    const own = extractPublicMediaCandidates(doc, base, { scanRawScripts: true, rawText: response.text }).filter(item => Number(item.score || 0) >= 88 && !item.platform);
    if (own.length) return withRelated();
    const listing = buildListing();
    listingCacheSet(url, listing);
    return { listing };
  }

  async function resolveListingEntry(entry, operation = {}) {
    if (entry.direct) return [{ ...entry.direct, title: entry.title, thumbnail: entry.thumbnail, duration: entry.duration, pageUrl: entry.url, sourceScope: 'link', preferred: true }];
    const found = await resolvePublicLink(entry.url, new Set(), 0, { ...operation, pageCache: true });
    return found.slice(0, 8).map((item, index) => ({ ...item, title: entry.title || item.title, thumbnail: item.thumbnail || entry.thumbnail,
      duration: item.duration || entry.duration, pageUrl: item.pageUrl || entry.url, sourceScope: 'link', preferred: index === 0 }));
  }

  const LISTING = { state: null };

  function teardownLinkListing() {
    const state = LISTING.state;
    if (!state) return;
    LISTING.state = null;
    state.loadIo?.disconnect(); state.keepIo?.disconnect(); state.moreIo?.disconnect();
    state.scroller?.removeEventListener('scroll', state.onScroll);
    state.more?.removeEventListener('click', state.onMore);
    if (state.frame) cancelAnimationFrame(state.frame);
    for (const img of state.container.querySelectorAll('img')) img.removeAttribute('src');
    state.host.replaceChildren();
  }

  function loadEntryThumb(thumb) {
    if (thumb.dataset.state === 'loading' || thumb.dataset.state === 'loaded' || thumb.dataset.state === 'failed' || !thumb.dataset.src) return;
    loadThumbInto(thumb, thumb.dataset.src, thumb.dataset.page || '');
  }

  function unloadEntryThumb(thumb) {
    if (thumb.dataset.state !== 'loaded' && thumb.dataset.state !== 'loading') return;
    resetThumb(thumb);
  }

  function updateListingStatus(state) {
    const status = document.getElementById('vdd-link-status');
    const total = state.entries.length;
    const summary = `${total} vídeo${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}${state.listing.truncated ? ` (limite de ${DISCOVERY.maxEntries}; há mais na página)` : ''} · mostrando ${state.container.children.length}. ` +
        (state.rendered < total ? 'Role para carregar mais. ' : '') + 'Toque em “Buscar vídeo” no que quiser baixar.';
    if (state.related) { if (state.note && LISTING.state === state) state.note.textContent = summary; }
    else if (status && LISTING.state === state && status.dataset.state !== 'error') {
      status.dataset.state = 'complete';
      status.textContent = summary;
    }
    state.host?.classList.toggle('vdd-has-more', state.rendered < total);
    if (state.more) { state.more.hidden = state.rendered >= total; state.more.textContent = `Carregar mais (${total - state.rendered} restantes)`; }
    if (APP.activeTab === 'link' && !state.related) updateHeaderCount(`${total} vídeo${total === 1 ? '' : 's'} na página`);
  }

  function renderListingBatch(state, count = DISCOVERY.batch) {
    if (LISTING.state !== state || state.loading || state.rendered >= state.entries.length) return;
    state.loading = true;
    const end = Math.min(state.entries.length, state.rendered + count);
    const step = () => {
      state.frame = 0;
      if (LISTING.state !== state) return;
      const fragment = document.createDocumentFragment(), stop = Math.min(end, state.rendered + DISCOVERY.frameChunk), thumbs = [];
      while (state.rendered < stop) {
        const entry = state.entries[state.rendered++];
        if (state.keys.has(entry.key)) continue;
        state.keys.add(entry.key);
        const card = createEntryCard(entry, state);
        thumbs.push(card.querySelector('.vdd-thumb'));
        fragment.appendChild(card);
      }
      state.container.appendChild(fragment);
      for (const thumb of thumbs) { state.loadIo?.observe(thumb); state.keepIo?.observe(thumb); }
      if (state.rendered < end) { state.frame = requestAnimationFrame(step); return; }
      state.loading = false;
      updateListingStatus(state);
      if (state.moreIo) { state.moreIo.unobserve(state.sentinel); state.moreIo.observe(state.sentinel); } else state.onScroll();
    };
    state.frame = requestAnimationFrame(step);
  }

  function createEntryCard(entry, state) {
    const card = document.createElement('article');
    card.className = 'vdd-card vdd-entry';
    card.dataset.key = entry.key;
    const title = cleanDisplayText(entry.title) || `Vídeo ${state.rendered}`;
    const duration = formatDuration(entry.duration);
    card.innerHTML = `
      <div class="vdd-card-top">
        <div class="vdd-thumb">
          <div class="vdd-thumb-fallback" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5zm5.2 2.1v6.8a.6.6 0 0 0 .9.5l5.2-3.4a.6.6 0 0 0 0-1l-5.2-3.4a.6.6 0 0 0-.9.5z"/></svg></div>
          ${duration ? `<span class="vdd-duration">${escapeHtml(duration)}</span>` : ''}
        </div>
        <div class="vdd-main">
          <div class="vdd-name">${escapeHtml(title)}</div>
          <div class="vdd-source">${escapeHtml(sourceHost(entry.url) || 'Página de vídeo')}</div>
          <div class="vdd-meta-row"><span class="vdd-badge">${entry.direct ? escapeHtml(entry.direct.kind) : 'PÁGINA'}</span></div>
        </div>
      </div>
      <div class="vdd-actions"><button class="vdd-btn" type="button">Buscar vídeo</button></div>
      <div class="vdd-progress"><div class="vdd-progress-line"><div class="vdd-progress-bar"></div></div><div class="vdd-progress-text"></div></div>
      <div class="vdd-entry-items" hidden></div>`;
    if (entry.thumbnail) { const holder = card.querySelector('.vdd-thumb'); holder.dataset.src = entry.thumbnail; holder.dataset.page = entry.url || ''; }
    card.querySelector('.vdd-btn').addEventListener('click', () => openListingEntry(card, entry));
    return card;
  }

  async function openListingEntry(card, entry) {
    const button = card.querySelector('.vdd-btn'), box = card.querySelector('.vdd-entry-items'), progress = card.querySelector('.vdd-progress');
    const bar = card.querySelector('.vdd-progress-bar'), text = card.querySelector('.vdd-progress-text');
    if (entry.items) {
      box.hidden = !box.hidden; button.textContent = box.hidden ? 'Mostrar opções' : 'Ocultar opções';
      return;
    }
    if (APP.linkBusy || APP.working) { toast('Aguarde a operação atual.'); return; }
    const cancel = document.getElementById('vdd-link-cancel');
    APP.linkBusy = true; button.disabled = true; progress.classList.add('show');
    APP.linkController = new AbortController(); if (cancel) cancel.hidden = false;
    try {
      setProgress(bar, text, null, 'Procurando o vídeo nesta página...');
      const notes = [];
      const items = await resolveListingEntry(entry, { signal: APP.linkController.signal, notes, onStage: label => setProgress(bar, text, null, label) });
      checkMediaAbort({ signal: APP.linkController.signal });
      if (!items.length) {
        setProgress(bar, text, 0, `Nenhuma mídia baixável foi encontrada nesta página. ${[...new Set(notes)].slice(0, 2).join(' ') || 'O site pode exigir login, verificação de idade ou reprodução no navegador: abra a página e use “Nesta página”.'}`);
        appendOpenPageHint(text, entry.url);
        button.textContent = 'Tentar de novo';
        return;
      }
      entry.items = items;
      box.replaceChildren(...items.map((item, index) => createMediaCard(item, index, 'link')));
      box.hidden = false; progress.classList.remove('show');
      button.textContent = 'Ocultar opções';
    } catch (error) {
      const cancelled = error.code === 'MEDIA_CANCELLED';
      setProgress(bar, text, 0, cancelled ? 'Busca cancelada.' : error.message || 'Não foi possível ler esta página.');
      if (!cancelled) appendOpenPageHint(text, entry.url);
      button.textContent = 'Tentar de novo';
    } finally {
      APP.linkBusy = false; APP.linkController = null; button.disabled = false; if (cancel) cancel.hidden = true;
    }
  }

  function showTraceToggle(card, trace) {
    const progress = card.querySelector('.vdd-progress');
    if (!progress) return;
    let button = card.querySelector('.vdd-trace-btn'), pre = card.querySelector('.vdd-trace');
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'vdd-text-btn vdd-trace-btn'; button.textContent = 'Ver rastro técnico';
      pre = document.createElement('pre'); pre.className = 'vdd-trace'; pre.hidden = true;
      button.addEventListener('click', () => { pre.hidden = !pre.hidden; button.textContent = pre.hidden ? 'Ver rastro técnico' : 'Ocultar rastro técnico'; });
      progress.append(button, pre);
    }
    pre.textContent = `Rastro do fluxo que passou na verificação dos segmentos:\n${trace}`;
  }

  const HANDOFF_HASH = 'optdowns-handoff';
  function handoffUrl(pageUrl) {
    try { const url = new URL(pageUrl); if (!url.hash) url.hash = HANDOFF_HASH; return url.href; } catch { return pageUrl; }
  }
  function runHandoff() {
    if (window.top !== window || !new RegExp(`(?:^#|&)${HANDOFF_HASH}(?:&|$)`).test(location.hash)) return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch {}
    APP.panelOpen = true;
    document.getElementById('vdd-panel')?.classList.add('show');
    layoutPanel(); switchTab('page');
    toast('Painel aberto. Aguardando o player; toque em Baixar quando o vídeo aparecer.', 6000);
    let tries = 0;
    const poll = () => { scanAll(); if (pageMediaItems().length || ++tries > 16) return; setTimeout(poll, 1500); };
    poll();
  }

  function appendOpenPageHint(textElement, pageUrl) {
    const open = typeof GM_openInTab === 'function' ? GM_openInTab : globalThis.GM?.openInTab;
    if (!open || !safeHttpUrl(pageUrl) || textElement.parentElement?.querySelector('.vdd-open-page')) return;
    const link = document.createElement('button');
    link.type = 'button'; link.className = 'vdd-text-btn vdd-open-page'; link.textContent = 'Abrir a página e usar “Nesta página”';
    link.addEventListener('click', () => { const target = handoffUrl(pageUrl); try { open(target, { active: true }); } catch { window.open(target, '_blank', 'noopener'); } });
    textElement.after(link);
  }

  function mountLinkListing(listing, opts = {}) {
    teardownLinkListing();
    const host = document.getElementById('vdd-link-listing');
    if (!host) return null;
    host.replaceChildren(); delete host.dataset.signature;
    const container = document.createElement('div'); container.className = 'vdd-entries';
    const sentinel = document.createElement('div'); sentinel.className = 'vdd-sentinel'; sentinel.setAttribute('aria-hidden', 'true');
    const more = document.createElement('button'); more.type = 'button'; more.className = 'vdd-text-btn vdd-more'; more.hidden = true;
    const note = opts.related ? document.createElement('div') : null;
    if (note) { note.className = 'vdd-link-note vdd-listing-note'; note.style.cssText = 'padding:0 16px 10px'; }
    host.append(...(note ? [note] : []), container, sentinel, more);
    const scroller = host.closest('.vdd-body');
    const state = { listing, entries: listing.entries, rendered: 0, keys: new Set(), host, container, sentinel, more, scroller, note, related: Boolean(opts.related),
      loadIo: null, keepIo: null, moreIo: null, frame: 0, loading: false, onScroll: null, onMore: null };
    state.onMore = () => renderListingBatch(state);
    state.onScroll = () => {
      if (state.scrollFrame) return;
      state.scrollFrame = requestAnimationFrame(() => {
        state.scrollFrame = 0;
        if (LISTING.state !== state || !scroller) return;
        const view = scroller.getBoundingClientRect(), margin = 700;
        if (state.rendered < state.entries.length && sentinel.getBoundingClientRect().top < view.bottom + margin) renderListingBatch(state);
        for (const thumb of container.querySelectorAll('.vdd-thumb')) {
          const rect = thumb.getBoundingClientRect();
          if (rect.bottom > view.top - margin && rect.top < view.bottom + margin) loadEntryThumb(thumb);
          else if (rect.bottom < view.top - 2600 || rect.top > view.bottom + 2600) unloadEntryThumb(thumb);
        }
      });
    };
    if (typeof IntersectionObserver === 'function') {
      state.moreIo = new IntersectionObserver(records => { if (records.some(record => record.isIntersecting)) renderListingBatch(state); }, { root: scroller, rootMargin: DISCOVERY.loadMargin });
      state.loadIo = new IntersectionObserver(records => { for (const record of records) if (record.isIntersecting) loadEntryThumb(record.target); }, { root: scroller, rootMargin: DISCOVERY.loadMargin });
      state.keepIo = new IntersectionObserver(records => { for (const record of records) if (!record.isIntersecting) unloadEntryThumb(record.target); }, { root: scroller, rootMargin: DISCOVERY.keepMargin });
      state.moreIo.observe(sentinel);
    } else scroller?.addEventListener('scroll', state.onScroll, { passive: true });
    more.addEventListener('click', state.onMore);
    LISTING.state = state;
    renderListingBatch(state, DISCOVERY.firstBatch);
    return state;
  }

  function reportByteProgress(callback, loaded, total = 0) {
    const measured = total > 0 && loaded <= total;
    callback?.(measured ? loaded / total * 100 : null, `Recebidos ${(loaded / 1048576).toFixed(1)} MB${measured ? ` de ${(total / 1048576).toFixed(1)} MB` : ' · tamanho total não informado'}`,
      { measured, phase: 'transfer', bytes: loaded, totalBytes: total });
  }

  function setProgress(bar, text, percent, label, detail = {}) {
    const line = bar.parentElement;
    const measured = detail.measured && typeof percent === 'number' && Number.isFinite(percent);
    const complete = !detail.phase && percent === 100;
    const failed = !detail.phase && percent === 0;
    const amount = measured ? Math.max(0, Math.min(100, percent)) : complete ? 100 : 0;
    bar.style.width = `${amount}%`;
    line.classList.toggle('indeterminate', !measured && !complete && !failed);
    line.setAttribute('role', 'progressbar'); line.setAttribute('aria-label', 'Transferência de mídia');
    if (measured || complete) line.setAttribute('aria-valuenow', String(Math.round(amount)));
    else line.removeAttribute('aria-valuenow');
    text.textContent = `${measured ? `${Math.floor(amount)}% · ` : ''}${label || ''}`;
    text.dataset.state = failed ? 'error' : complete ? 'complete' : '';
    if (detail.info) showFileInfo(bar.closest?.('.vdd-card'), detail.info, detail.size);
  }

  function makeHttpError(message, status = 0) {
    const error = new Error(message);
    error.status = Number(status || 0);
    return error;
  }

  function isTransientError(error) {
    const status = Number(error?.status || 0);
    if (status) {
      return status === 408 || status === 425 || status === 429 || status >= 500;
    }
    return /network|rede|timeout|tempo esgotado|abort|load failed|failed to fetch|sem status|sem responder/i
      .test(String(error?.message || error || ''));
  }

  async function withNetworkRetries(operation, options = {}) {
    const attempts = Math.max(1, Number(options.attempts || NET.retries));
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !isTransientError(error)) throw error;
        options.onRetry?.(attempt + 1, error);
        await yieldUi(450 * attempt + 250);
      }
    }

    throw lastError || new Error('Falha de rede');
  }

  const HLS_LIMITS = Object.freeze({ manifest: 8 * 1024 * 1024, segment: 96 * 1024 * 1024,
    output: 384 * 1024 * 1024, segments: 30000, depth: 5 });
  const mediaTransportModes = new Map();
  const wantsSession = context => context?.keepSession === true || context?.sessionLink === true;
  const isAnonymousContext = context => context?.publicOnly === true && !wantsSession(context);
  const isSessionLinkItem = item => item?.sourceScope === 'link' && !item.platform;
  function fetchCredentialsFor(url, context) {
    let same = false;
    try { same = new URL(url).origin === location.origin; } catch {}
    if (!context?.publicOnly) return same ? 'include' : 'omit';
    return same && context.sessionLink === true ? 'same-origin' : 'omit';
  }

  function mediaError(message, code = 'MEDIA_INVALID', status = 0) {
    const error = makeHttpError(message, status);
    error.code = code;
    recordIssue(error);
    return error;
  }

  function checkMediaAbort(context = {}) {
    if (context.signal?.aborted) throw mediaError('Download cancelado.', 'MEDIA_CANCELLED');
  }

  function httpErrorWhere(url, kind = '') {
    let host = '';
    try { host = new URL(url).hostname; } catch {}
    return { host, kind };
  }

  const SAFE_RESPONSE_HEADERS = Object.freeze(['content-type', 'content-length', 'content-encoding', 'server', 'via', 'x-cache', 'age', 'cache-control', 'x-served-by']);
  function errorResponseInfo(headers = {}, body = null) {
    const info = {};
    for (const key of SAFE_RESPONSE_HEADERS) if (headers[key]) info[key] = String(headers[key]).slice(0, 80);
    if (headers.location) { try { info.locationHost = new URL(headers.location, 'https://x.invalid').hostname; } catch {} }
    try {
      let bytes = null;
      if (typeof body === 'string') bytes = new TextEncoder().encode(body.slice(0, 400));
      else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body.slice(0, 400));
      else if (ArrayBuffer.isView(body)) bytes = new Uint8Array(body.buffer, body.byteOffset, Math.min(body.byteLength, 400));
      if (bytes?.length) {
        const text = new TextDecoder('utf-8').decode(bytes);
        info.sample = /[\u0000-\u0008\u000e-\u001f]/.test(text) ? '(conteúdo binário)' : sanitizeForMessage(text.replace(/<[^>]+>/g, ' '), 120);
      }
    } catch {}
    return info;
  }

  function mediaHttpError(status, headers = {}, where = null) {
    const descriptions = { 400: 'A fonte não entendeu o pedido', 401: 'A fonte exige autenticação', 403: 'A fonte recusou o acesso ou a URL expirou',
      404: 'O recurso não está mais disponível', 412: 'A fonte recusou o pedido porque uma condição exigida não foi atendida (Precondition Failed: normalmente Referer/Origin ou sessão)',
      451: 'A fonte bloqueou o conteúdo por restrição legal ou regional', 408: 'A fonte demorou demais para responder', 410: 'A URL expirou',
      429: 'A fonte limitou as requisições', 500: 'Erro interno no servidor da fonte',
      502: 'O CDN/proxy recebeu uma resposta inválida da origem', 503: 'O servidor da fonte está indisponível ou sobrecarregado',
      504: 'O CDN/proxy não recebeu resposta da origem a tempo (Gateway Timeout)' };
    const place = where?.host ? ` Origem: ${where.host}${where.kind ? ` (${where.kind})` : ''}.` : '';
    const error = mediaError(`${descriptions[status] || 'A fonte respondeu com erro'} (HTTP ${status || 'sem status'}).${place}`, 'MEDIA_HTTP', status);
    if (where?.host) { error.host = where.host; error.requestKind = where.kind || ''; }
    const raw = headers['retry-after'];
    if (raw) error.retryAfterMs = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Math.max(0, Date.parse(raw) - Date.now());
    return error;
  }

  function originOf(url) {
    try { return new URL(url).origin; } catch { return ''; }
  }

  function mediaHeaders(mode, extra, context) {
    const headers = mode === 'bare' ? {} : { Accept: '*/*' };
    if ((mode === 'session' || mode === 'origin') && context.referrer) headers.Referer = context.referrer;
    if (mode === 'origin') { const origin = originOf(context.referrer); if (origin) headers.Origin = origin; }
    return { ...headers, ...extra };
  }

  function assertMediaUrl(url) {
    if (!isHttp(url) || isPrivateNetworkUrl(url)) throw mediaError('A fonte não publicou uma URL HTTP pública compatível.');
    const restriction = restrictedPlatformNotice(url);
    if (restriction) throw mediaError(restriction, 'MEDIA_UNSUPPORTED');
    return url;
  }

  function mediaRequestKind(options = {}) {
    if (options.text) return 'página/playlist';
    if (options.kind) return options.kind;
    if (options.prefix) return 'sondagem do formato';
    return 'arquivo/segmento';
  }

  async function mediaRequestOnce(url, options, mode) {
    const { context = {}, maxBytes = HLS_LIMITS.segment, prefix = false, text = false,
      headers = {}, timeout = NET.requestTimeout } = options;
    checkMediaAbort(context);
    assertMediaUrl(url);
    let lastProgressAt = 0;
    const report = (loaded, total = 0) => {
      const now = Date.now(); if (now - lastProgressAt < 180) return; lastProgressAt = now;
      options.onBytes?.(loaded, total);
      const transfer = context.transfer;
      if (!text && transfer) context.onProgress?.(100 * transfer.completed / transfer.total,
        `${transfer.completed}/${transfer.total} segmentos · ${transfer.rendition || 'Mídia'}: ${(loaded / 1048576).toFixed(1)} MB recebidos`, { ...transfer, measured: true });
    };
    const gmXhr = getGmXhr();
    if (mode !== 'fetch' && gmXhr) {
      return new Promise((resolve, reject) => {
        let done = false, handle, timer;
        const finish = (fn, value, abort = false) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          context.signal?.removeEventListener('abort', cancel);
          fn(value);
          if (abort) { try { handle?.abort?.(); } catch {} }
        };
        const cancel = () => finish(reject, mediaError('Download cancelado.', 'MEDIA_CANCELLED'), true);
        const arm = () => {
          clearTimeout(timer);
          timer = setTimeout(() => finish(reject, mediaError('Tempo esgotado ao ler a fonte.', 'MEDIA_NETWORK', 408), true), timeout);
        };
        context.signal?.addEventListener('abort', cancel, { once: true });
        arm();
        const receive = async response => {
          if (done) return;
          try {
            const responseHeaders = parseResponseHeaders(response.responseHeaders);
            const status = Number(response.status || 0);
            if (status < 200 || status >= 300) {
              const failure = mediaHttpError(status, responseHeaders, httpErrorWhere(response.finalUrl || url, mediaRequestKind(options)));
              let body = response.responseText || response.response;
              try { if (typeof Blob === 'function' && body instanceof Blob) body = await body.slice(0, 400).arrayBuffer(); } catch { body = null; }
              failure.respInfo = errorResponseInfo(responseHeaders, body);
              throw failure;
            }
            const finalUrl = assertMediaUrl(response.finalUrl || url);
            if (context.publicOnly) {
              const stored = rememberLinkCookies(finalUrl, response.responseHeaders);
              if (stored) console.info(`[VDD] Sessão pública: ${stored} cookie(s) da plataforma guardado(s) para o download.`);
            }
            let bytes;
            if (text) {
              const body = String(response.responseText ?? response.response ?? '');
              bytes = new TextEncoder().encode(body);
            } else bytes = await extractGmResponseBytes(response);
            if (bytes.byteLength > maxBytes && !prefix) throw mediaError('A resposta excedeu o limite de memória desta operação.', 'MEDIA_LIMIT');
            const result = { status, finalUrl, headers: responseHeaders, contentType: responseHeaders['content-type'] || '', bytes: bytes.slice(0, maxBytes) };
            if (text) result.text = new TextDecoder().decode(result.bytes);
            finish(resolve, result);
          } catch (error) { finish(reject, error); }
        };
        try {
          handle = gmXhr({ method: 'GET', url, headers: { ...mediaHeaders(mode, headers, context), ...(text ? {} : platformRequestHeaders(url, mode)) },
            responseType: text ? 'text' : (isAppleMobileBrowser() ? 'blob' : 'arraybuffer'),
            anonymous: isAnonymousContext(context) || mode !== 'session', timeout,
            onload: receive,
            onprogress(event) {
              arm();
              report(Number(event?.loaded || 0), Number(event?.total || 0));
              const loadedNow = Number(event?.loaded || 0);
              if (loadedNow > maxBytes) {
                const progressStatus = Number(event?.status || 0);
                const known2xx = progressStatus >= 200 && progressStatus < 300, knownError = progressStatus > 0 && !known2xx;
                if (!prefix || (!knownError && (known2xx || loadedNow > Math.max(maxBytes * 4, 262144)))) {
                  finish(reject, mediaError(prefix ? 'A fonte ignorou a leitura parcial.' : 'A resposta excedeu o limite de memória.', 'MEDIA_LIMIT'), true);
                }
              }
            },
            onerror: response => finish(reject, Number(response?.status) ? Object.assign(mediaHttpError(Number(response.status), parseResponseHeaders(response.responseHeaders), httpErrorWhere(url, mediaRequestKind(options))), { respInfo: errorResponseInfo(parseResponseHeaders(response.responseHeaders), response.responseText) }) : mediaError('Falha de rede ao acessar a fonte.', 'MEDIA_NETWORK')),
            ontimeout: () => finish(reject, mediaError('Tempo esgotado ao ler a fonte.', 'MEDIA_NETWORK', 408)),
            onabort: () => finish(reject, mediaError('Leitura interrompida.', 'MEDIA_NETWORK')) });
          if (handle?.then) handle.then(receive, error => finish(reject, error));
        } catch (error) { finish(reject, error); }
      });
    }
    const controller = new AbortController();
    let timer;
    const cancel = () => controller.abort();
    const arm = () => { clearTimeout(timer); timer = setTimeout(cancel, timeout); };
    context.signal?.addEventListener('abort', cancel, { once: true });
    arm();
    try {
      const referrer = context.referrer && new URL(context.referrer).origin === location.origin ? context.referrer : undefined;
      const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal,
        credentials: fetchCredentialsFor(url, context),
        ...(referrer ? { referrer } : {}) });
      const responseHeaders = Object.fromEntries(response.headers.entries());
      if (!response.ok) {
        const failure = mediaHttpError(response.status, responseHeaders, httpErrorWhere(response.url || url, mediaRequestKind(options)));
        let body = ''; try { body = (await response.text()).slice(0, 400); } catch {}
        failure.respInfo = errorResponseInfo(responseHeaders, body);
        throw failure;
      }
      const finalUrl = assertMediaUrl(response.url || url);
      const chunks = [];
      let count = 0;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            arm();
            if (!value?.byteLength) continue;
            if (!prefix && count + value.byteLength > maxBytes) throw mediaError('A resposta excedeu o limite de memória.', 'MEDIA_LIMIT');
            const part = value.subarray(0, Math.max(0, maxBytes - count));
            chunks.push(part); count += part.byteLength;
            report(count, Number(responseHeaders['content-length'] || 0));
            if (prefix && count >= maxBytes) break;
          }
        } finally { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} }
      } else {
        if (Number(response.headers.get('content-length')) > maxBytes) throw mediaError('A fonte não permite uma leitura limitada neste navegador.', 'MEDIA_LIMIT');
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!prefix && bytes.byteLength > maxBytes) throw mediaError('A resposta excedeu o limite de memória.', 'MEDIA_LIMIT');
        chunks.push(bytes.subarray(0, maxBytes)); count = chunks[0].byteLength;
      }
      const bytes = new Uint8Array(count);
      let offset = 0;
      for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
      return { status: response.status, finalUrl, headers: responseHeaders,
        contentType: response.headers.get('content-type') || '', bytes,
        ...(text ? { text: new TextDecoder().decode(bytes) } : {}) };
    } catch (error) {
      checkMediaAbort(context);
      if (error.name === 'AbortError') throw mediaError('Tempo esgotado ao ler a fonte.', 'MEDIA_NETWORK', 408);
      throw error;
    } finally { clearTimeout(timer); context.signal?.removeEventListener('abort', cancel); }
  }

  async function mediaRequest(url, options = {}) {
    const context = options.context || APP.hlsJob || { referrer: currentRequestReferrer() };
    const cacheKey = `${new URL(url).origin}|${Boolean(context.publicOnly)}|${wantsSession(context)}|${sourceHost(context.referrer || '')}`;
    const cached = mediaTransportModes.get(cacheKey);
    const modes = [...new Set([cached, ...(getGmXhr() ? ['session', 'origin', 'minimal', 'bare'] : []), 'fetch'].filter(Boolean))];
    let lastError;
    const attempts = [];
    for (let attempt = 1; attempt <= NET.retries; attempt++) {
      checkMediaAbort(context);
      for (const mode of modes) {
        try {
          const result = await mediaRequestOnce(url, { ...options, context }, mode);
          if (options.validate) options.validate(result);
          if (mediaTransportModes.size >= 80) mediaTransportModes.delete(mediaTransportModes.keys().next().value);
          mediaTransportModes.set(cacheKey, mode);
          return result;
        } catch (error) {
          checkMediaAbort(context);
          if (error.code === 'MEDIA_UNSUPPORTED' || error.code === 'MEDIA_CANCELLED') throw error;
          if (options.prefix && error.code === 'MEDIA_LIMIT') throw error;
          const viaGm = mode !== 'fetch' && Boolean(getGmXhr());
          attempts.push({ mode, status: Number(error.status || 0), code: error.code || '', info: error.respInfo || null, via: viaGm ? 'gm' : 'fetch',
            ...(viaGm ? { anonymous: isAnonymousContext(context) || mode !== 'session' } : { credentials: fetchCredentialsFor(url, context) }) });
          if (!lastError || error.status || !lastError.status || ['MEDIA_TRUNCATED', 'MEDIA_RESPONSE', 'MEDIA_LIMIT'].includes(error.code)) lastError = error;
          if (error.status === 404 || error.status === 410) continue;
          if (isTransientError(error) && error.status) break;
        }
      }
      if ([404, 410].includes(lastError?.status)) break;
      if (attempt === NET.retries || !(isTransientError(lastError) || lastError?.code === 'MEDIA_NETWORK' || lastError?.code === 'MEDIA_TRUNCATED')) break;
      const delay = Math.max(Number(lastError.retryAfterMs || 0), 600 * 2 ** (attempt - 1) + Math.random() * 250);
      if (delay > 30000) { lastError.message += ' Aguarde o prazo indicado pela fonte e tente novamente.'; break; }
      options.onRetry?.(attempt + 1, lastError);
      context.onProgress?.(null, `Nova tentativa ${attempt + 1}/${NET.retries}${lastError.status ? ` · HTTP ${lastError.status}` : ''}. Aguardando a fonte...`, { phase: 'retry' });
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(mediaError('Download cancelado.', 'MEDIA_CANCELLED')); };
        const timer = setTimeout(() => { context.signal?.removeEventListener('abort', abort); resolve(); }, delay);
        context.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (lastError) lastError.attempts = attempts;
    throw lastError || mediaError('A fonte não pôde ser lida.', 'MEDIA_NETWORK');
  }

  function normalizeRangedBytes(result, range) {
    const bytes = result.bytes;
    const cr = parseContentRange(result.headers?.['content-range']);
    const fail = () => { throw mediaError('A fonte entregou um segmento incompleto ou um intervalo diferente do solicitado.', 'MEDIA_TRUNCATED'); };
    if (!bytes?.byteLength) return fail();
    const length = Number(result.headers?.['content-length'] || 0);
    if (!result.headers?.['content-encoding'] && length > 0 && bytes.byteLength !== length) return fail();
    if (!range) {
      if (result.status === 206 && (!cr || cr.start !== 0 || !cr.total || cr.end + 1 !== cr.total || bytes.length !== cr.total)) return fail();
      return bytes;
    }
    const wanted = range.end - range.start + 1;
    if (result.status === 206) {
      if (!cr || cr.start > range.start || cr.end < range.end || bytes.length !== cr.end - cr.start + 1) return fail();
      return bytes.slice(range.start - cr.start, range.start - cr.start + wanted);
    }
    if (result.status !== 200 || bytes.length < range.end + 1) return fail();
    return bytes.slice(range.start, range.end + 1);
  }

  function requestTextDetailed(url, onRetry = null, context = null) {
    return mediaRequest(url, { text: true, maxBytes: HLS_LIMITS.manifest, onRetry,
      ...(context ? { context } : {}),
      validate(result) {
        if (!/^\s*#EXTM3U(?:\s|$)/.test(result.text)) {
          const problem = describeBodyProblem(result.bytes, result.contentType);
          throw mediaError(problem ? `A fonte devolveu ${problem} em vez da playlist.` : 'A resposta não é uma playlist HLS válida.', 'MEDIA_RESPONSE');
        }
        rememberHlsMaster(result.text, result.finalUrl, context?.referrer || currentRequestReferrer());
      } });
  }

  async function requestBytes(url, range = null, context = null) {
    let normalized;
    await mediaRequest(url, { ...(context ? { context } : {}), headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {},
      validate(result) {
        const problem = describeBodyProblem(result.bytes, result.contentType);
        if (problem) throw mediaError(`A fonte devolveu ${problem} em vez do segmento.`, 'MEDIA_RESPONSE');
        normalized = normalizeRangedBytes(result, range);
      } });
    return normalized;
  }

  function resolveHlsUri(uri, baseUrl) {
    if (/\{\$/.test(uri)) throw mediaError('Esta playlist usa variáveis HLS que ainda não são compatíveis.', 'MEDIA_UNSUPPORTED');
    return assertMediaUrl(new URL(uri, baseUrl).href);
  }

  function parseMaster(text, baseUrl) {
    const lines = String(text).split(/\r?\n/).map(line => line.trim());
    const audioGroups = new Map(), variants = [];
    for (const line of lines) {
      if (!line.startsWith('#EXT-X-MEDIA:')) continue;
      const a = parseAttrs(line);
      if (a.TYPE !== 'AUDIO' || !a['GROUP-ID']) continue;
      const group = audioGroups.get(a['GROUP-ID']) || [];
      group.push({ ...a, url: a.URI ? resolveHlsUri(a.URI, baseUrl) : '' });
      audioGroups.set(a['GROUP-ID'], group);
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
      const a = parseAttrs(lines[i]);
      let uri = '';
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('#EXT-X-STREAM-INF:')) break;
        if (lines[j] && !lines[j].startsWith('#')) { uri = lines[j]; break; }
      }
      if (!uri) throw mediaError('A playlist publicou uma qualidade sem URL.');
      const [width, height] = (a.RESOLUTION || '').split('x').map(Number);
      variants.push({ url: resolveHlsUri(uri, baseUrl), width: width || 0, height: height || 0,
        bandwidth: Number(a['AVERAGE-BANDWIDTH'] || a.BANDWIDTH || 0), codecs: a.CODECS || '',
        frameRate: Number(a['FRAME-RATE'] || 0), audioGroup: a.AUDIO || '', audioGroups,
        masterUrl: baseUrl });
    }
    return variants;
  }

  function rankVariants(variants) {
    return [...variants].sort((a, b) => (b.width * b.height - a.width * a.height) || (b.height - a.height) || (b.bandwidth - a.bandwidth));
  }

  function parseByteRange(value, previousEnd = -1) {
    if (!value) return null;
    const match = String(value).match(/^(\d+)(?:@(\d+))?$/);
    if (!match) throw mediaError('A playlist publicou um intervalo inválido.');
    const length = Number(match[1]), start = match[2] === undefined ? previousEnd + 1 : Number(match[2]);
    if (!Number.isSafeInteger(length) || length <= 0 || !Number.isSafeInteger(start) || start < 0 ||
        (match[2] === undefined && previousEnd < 0) || !Number.isSafeInteger(start + length)) throw mediaError('O intervalo HLS não tem um offset válido.');
    return { start, end: start + length - 1 };
  }

  function parseMediaPlaylist(text, baseUrl) {
    const segments = [];
    let map = null, key = null, pendingRange = '', previous = null, duration = null, gap = false;
    let sequence = 0, discontinuity = 0, start = 0, endList = false, programTime = null;
    let encrypted = false, keyMethod = '', targetDuration = 0;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) sequence = Number(line.split(':')[1]);
      else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')) discontinuity = Number(line.split(':')[1]);
      else if (line === '#EXT-X-DISCONTINUITY') discontinuity++;
      else if (line.startsWith('#EXT-X-TARGETDURATION:')) targetDuration = Number(line.split(':')[1]);
      else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
      else if (line.startsWith('#EXT-X-BYTERANGE:')) pendingRange = line.slice(17);
      else if (line === '#EXT-X-GAP') gap = true;
      else if (line === '#EXT-X-ENDLIST') endList = true;
      else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) programTime = Date.parse(line.slice(25));
      else if (line.startsWith('#EXT-X-KEY:')) {
        const a = parseAttrs(line), method = String(a.METHOD || '').toUpperCase();
        key = method === 'NONE' ? null : { method, url: a.URI ? resolveHlsUri(a.URI, baseUrl) : '', iv: a.IV || '', keyFormat: a.KEYFORMAT || 'identity' };
        if (key) { encrypted = true; keyMethod = method; }
      } else if (line.startsWith('#EXT-X-MAP:')) {
        const a = parseAttrs(line);
        if (!a.URI) throw mediaError('A inicialização HLS não tem URL.');
        const url = resolveHlsUri(a.URI, baseUrl);
        map = { url, range: parseByteRange(a.BYTERANGE, map?.url === url ? (map.range?.end ?? -1) : -1), key, playlistUrl: baseUrl };
      } else if (line.startsWith('#EXT-X-SKIP:') || line === '#EXT-X-I-FRAMES-ONLY') {
        throw mediaError('A fonte publicou apenas uma playlist parcial, sem o vídeo completo.', 'MEDIA_UNSUPPORTED');
      } else if (!line.startsWith('#')) {
        if (!Number.isFinite(duration) || duration < 0) throw mediaError('Um segmento HLS não tem duração válida.');
        if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isSafeInteger(discontinuity)) throw mediaError('A sequência HLS é inválida.');
        const url = resolveHlsUri(line, baseUrl);
        const range = parseByteRange(pendingRange, previous?.url === url ? (previous.range?.end ?? -1) : -1);
        const segment = { url, range, map, key, gap, duration, sequence: sequence++, discontinuity, start, playlistUrl: baseUrl,
          programTime: Number.isFinite(programTime) ? programTime : null };
        segments.push(segment); previous = segment; start += duration;
        if (Number.isFinite(programTime)) programTime += duration * 1000;
        duration = null; pendingRange = ''; gap = false;
        if (segments.length > HLS_LIMITS.segments) throw mediaError('A playlist excedeu o limite de segmentos.', 'MEDIA_LIMIT');
      }
    }
    return { segments, map: segments[0]?.map || null, encrypted, keyMethod, endList, duration: start, targetDuration, url: baseUrl };
  }

  function parseAttrs(line) {
    const result = {};
    const raw = line.slice(line.indexOf(':') + 1);
    const re = /([A-Z0-9-]+)=((?:"[^"]*")|[^,]*)/gi;
    let m;
    while ((m = re.exec(raw))) {
      result[m[1].toUpperCase()] = m[2].replace(/^"|"$/g, '');
    }
    return result;
  }

  function looksLikeTs(bytes) {
    if (!bytes || bytes.byteLength < 188) return false;
    const limit = Math.min(bytes.byteLength - 188 * 2, 4096);
    for (let i = 0; i <= limit; i++) {
      if (bytes[i] === 0x47 && bytes[i + 188] === 0x47 && bytes[i + 376] === 0x47) return true;
    }
    return false;
  }

  function isManualSaveRequired(error) {
    return error?.code === 'VDD_MANUAL_SAVE_REQUIRED' && error.blob instanceof Blob;
  }

  function forceMp4Mime(blob) {
    return ensureBlobMime(blob, 'video/mp4');
  }

  function createMp4File(blob, filename) {
    const safeFilename = forceMp4Filename(filename);
    const typedBlob = ensureBlobMime(blob, 'video/mp4');
    if (typeof File === 'function') {
      try {
        return new File([typedBlob], safeFilename, {
          type: 'video/mp4',
          lastModified: Date.now(),
        });
      } catch {}
    }
    return typedBlob;
  }

  function createNamedMediaFile(blob, filename) {
    const safeFilename = cleanName(filename || 'video');
    const mime = mediaContentType(blob?.type) || 'application/octet-stream';
    const typedBlob = ensureBlobMime(blob, mime);
    if (typeof File === 'function') {
      try {
        return new File([typedBlob], safeFilename, { type: mime, lastModified: Date.now() });
      } catch {}
    }
    return typedBlob;
  }

  function manualSaveRequired(blob, filename, cause = null) {
    const error = new Error('O navegador exige um novo toque para salvar o arquivo');
    error.code = 'VDD_MANUAL_SAVE_REQUIRED';
    error.blob = blob;
    error.filename = cleanName(filename || 'video');
    error.cause = cause;
    return error;
  }

  function gmSaveErrorMessage(details) {
    const reason = String(details?.error || details?.message || details || 'not_succeeded');
    const labels = {
      not_enabled: 'Downloads do gerenciador de scripts estão desativados',
      not_whitelisted: 'A extensão do vídeo não está liberada no gerenciador de scripts',
      not_permitted: 'O gerenciador de scripts não recebeu permissão para downloads',
      not_supported: 'Este navegador não suporta o salvamento pelo gerenciador de scripts',
      not_succeeded: 'O gerenciador de scripts não iniciou o salvamento',
    };
    return labels[reason] || reason;
  }

  function isManualOpenRequired(error) {
    return error?.code === 'VDD_MANUAL_OPEN_REQUIRED' && isHttp(error.url);
  }

  function manualOpenRequired(url, filename, cause = null) {
    const error = new Error('A fonte deve ser aberta pelo navegador');
    error.code = 'VDD_MANUAL_OPEN_REQUIRED';
    error.url = url;
    error.filename = filename;
    error.cause = cause;
    return error;
  }

  function formatFromKindHint(kind = '') {
    const value = String(kind || '').trim().toUpperCase();
    if (value === 'MP4') return { ext: 'mp4', mime: 'video/mp4', label: 'MP4' };
    if (value === 'MOV') return { ext: 'mov', mime: 'video/quicktime', label: 'MOV' };
    if (value === 'WEBM') return { ext: 'webm', mime: 'video/webm', label: 'WEBM' };
    if (value === 'OGV' || value === 'OGG') return { ext: 'ogv', mime: 'video/ogg', label: 'OGV' };
    if (value === 'TS') return { ext: 'ts', mime: 'video/mp2t', label: 'TS' };
    return null;
  }

  async function resolveNativeDirectFormat(url, typeHint = '', kindHint = '') {
    try {
      const probe = await probeLinkTarget(url, { referrer: currentRequestReferrer(), publicOnly: false });
      if (probe?.page) return null;
      if (probe?.kind === 'HLS') return { hls: true, finalUrl: probe.url };
      const format = knownDirectFormatHint(probe?.url, probe?.contentType);
      if (format && format.ext !== 'ts') return { format, finalUrl: probe.url, headers: {} };
    } catch (error) {
      if (error.status === 401 || error.status === 403 || error.status === 404 || error.status === 410) return null;
    }
    const hint = knownDirectFormatHint(url, typeHint) || formatFromKindHint(kindHint);
    return hint && hint.ext !== 'ts' ? { format: hint, finalUrl: url, headers: {} } : null;
  }

  function nativeDownloadHeaderModes() {
    return [
      {
        Referer: currentRequestReferrer(),
        Accept: 'video/mp4,video/webm,video/quicktime,video/*;q=0.9,*/*;q=0.6',
      },
      { Accept: 'video/*;q=0.9,*/*;q=0.6' },
      {},
    ];
  }

  async function downloadDirectUrlNatively(url, filename, onProgress = null) {
    const gmDownload = getGmDownload();
    if (!gmDownload) throw new Error('Download nativo indisponível');

    const modes = nativeDownloadHeaderModes();
    let lastError = null;

    for (let modeIndex = 0; modeIndex < modes.length; modeIndex++) {
      const headers = { ...modes[modeIndex], ...(modeIndex < 2 ? platformRequestHeaders(url, modeIndex === 0 ? 'session' : 'minimal') : {}) };
      try {
        await new Promise((resolve, reject) => {
          let settled = false;
          let handle = null;
          let timer = null;
          const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn(value);
          };

          const details = {
            url,
            name: filename,
            saveAs: true,
            timeout: NET.fullRequestTimeout,
            onprogress(event) {
              const loaded = Number(event?.loaded || 0);
              const total = Number(event?.total || 0);
              if (loaded <= 0) return;
              if (total > 0) {
                reportByteProgress(onProgress, loaded, total);
              } else {
                reportByteProgress(onProgress, loaded);
              }
            },
            onload(event) {
              const status = Number(event?.status || 0);
              if (status >= 400) return finish(reject, mediaHttpError(status, {}, httpErrorWhere(url, 'download nativo')));
              finish(resolve, event || true);
            },
            onerror(error) {
              const status = Number(error?.status || 0);
              finish(reject, makeHttpError(gmSaveErrorMessage(error), status));
            },
            ontimeout() { finish(reject, makeHttpError('O download nativo demorou demais', 408)); },
          };
          if (Object.keys(headers).length) details.headers = headers;

          timer = setTimeout(() => {
            try { handle?.abort?.(); } catch {}
            finish(reject, makeHttpError('O navegador não confirmou o download nativo', 408));
          }, NET.fullRequestTimeout + 5000);

          try {
            handle = gmDownload(details);
            if (handle && typeof handle.then === 'function') {
              handle.then(event => details.onload(event), error => details.onerror(error));
            }
          } catch (error) {
            finish(reject, error);
          }
        });
        return true;
      } catch (error) {
        lastError = error;
        if (Number(error?.status || 0) === 408 || /demorou|não confirmou/i.test(String(error?.message || ''))) break;
        if (error.status === 429 || error.status >= 500) throw error;
        console.info(`[VDD] Download nativo modo ${modeIndex + 1}/${modes.length} recusado:`, error);
      }
    }
    throw lastError || new Error('O download nativo foi recusado');
  }

  function openDirectUrlFromGesture(job) {
    if (!job || !isHttp(job.url)) throw new Error('URL direta inválida');
    if (typeof GM_openInTab === 'function') {
      try {
        const tab = GM_openInTab(job.url, { active: true, insert: true, setParent: true });
        if (tab) return 'tab';
      } catch (error) {
        console.info('[VDD] GM_openInTab indisponível; usando link direto:', error);
      }
    }

    const a = document.createElement('a');
    a.href = job.url;
    if (job.filename) a.download = job.filename;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
    return 'link';
  }

  function saveBlobWithManager(blob, filename, onProgress = null) {
    const gmDownload = getGmDownload();
    if (!gmDownload) {
      return Promise.reject(new Error('Gerenciador de downloads do userscript indisponível'));
    }

    filename = cleanName(filename || 'video');
    const payload = createNamedMediaFile(blob, filename);

    return new Promise((resolve, reject) => {
      let settled = false;
      let handle = null;
      let timer = null;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };

      const details = {
        url: payload,
        name: filename,
        saveAs: false,
        conflictAction: 'uniquify',
        onprogress(event) {
          const loaded = Number(event?.loaded || 0);
          const total = Number(event?.total || payload.size || 0);
          if (loaded > 0 && total > 0) {
            onProgress?.(null, `Salvando ${(loaded / 1048576).toFixed(1)} MB...`, { phase: 'save' });
          }
        },
        onload() {
          finish(resolve, 'manager');
        },
        onerror(error) {
          finish(reject, new Error(gmSaveErrorMessage(error)));
        },
        ontimeout() {
          finish(reject, new Error('O salvamento demorou demais'));
        },
      };

      timer = setTimeout(() => {
        try { handle?.abort?.(); } catch {}
        finish(reject, new Error('O gerenciador não confirmou o salvamento'));
      }, NET.saveTimeout);

      try {
        handle = gmDownload(details);
        if (handle && typeof handle.then === 'function') {
          handle.then(
            () => finish(resolve, 'manager'),
            error => finish(reject, new Error(gmSaveErrorMessage(error)))
          );
        }
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  function triggerManualBlobDownload(job) {
    if (!job?.blob?.size) throw new Error('O vídeo preparado está vazio');
    job.filename = cleanName(job.filename || 'video');
    if (!job.objectUrl) {
      job.blob = createNamedMediaFile(job.blob, job.filename);
      job.objectUrl = URL.createObjectURL(job.blob);
    }

    const a = document.createElement('a');
    a.href = job.objectUrl;
    a.download = job.filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
  }

  async function saveManualBlobFromGesture(job) {
    job.filename = cleanName(job.filename || 'video');
    job.blob = createNamedMediaFile(job.blob, job.filename);
    const mime = mediaContentType(job.blob.type) || 'application/octet-stream';
    const ext = `.${String(job.filename).split('.').pop().toLowerCase()}`;

    if (isAppleMobileBrowser() && typeof File === 'function' && typeof navigator?.share === 'function') {
      const file = job.blob instanceof File
        ? job.blob
        : new File([job.blob], job.filename, { type: mime, lastModified: Date.now() });
      let canShare = true;
      try {
        if (typeof navigator.canShare === 'function') canShare = navigator.canShare({ files: [file] });
      } catch {
        canShare = false;
      }
      if (canShare) {
        try {
          await navigator.share({ files: [file], title: job.filename });
          return 'share';
        } catch (error) {
          if (error?.name === 'AbortError') throw new Error('Salvamento cancelado');
          console.info('[VDD] Compartilhamento de arquivo indisponível:', error);
        }
      }
    }

    if (typeof window.showSaveFilePicker === 'function' && window.isSecureContext) {
      let writable = null;
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: job.filename,
          types: [{
            description: 'Arquivo de vídeo',
            accept: { [mime]: [ext] },
          }],
        });
        writable = await handle.createWritable();
        await writable.write(job.blob);
        await writable.close();
        return 'picker';
      } catch (error) {
        try { await writable?.abort?.(); } catch {}
        if (error?.name === 'AbortError') throw new Error('Salvamento cancelado');
        console.info('[VDD] Seletor nativo indisponível; usando link de download:', error);
      }
    }

    triggerManualBlobDownload(job);
    return 'anchor';
  }

  function isAppleMobileBrowser() {
    if (typeof navigator === 'undefined') return false;
    const ua = String(navigator.userAgent || '');
    const platform = String(navigator.platform || '');
    return /iPhone|iPad|iPod/i.test(ua) ||
      (/Mac/i.test(platform) && Number(navigator.maxTouchPoints || 0) > 1);
  }

  function readUint32BE(bytes, offset = 0) {
    return bytes[offset] * 0x1000000 +
      bytes[offset + 1] * 0x10000 +
      bytes[offset + 2] * 0x100 +
      bytes[offset + 3];
  }

  function readUint64BE(bytes, offset = 0) {
    const high = readUint32BE(bytes, offset);
    const low = readUint32BE(bytes, offset + 4);
    const value = high * 0x100000000 + low;
    return Number.isSafeInteger(value) ? value : 0;
  }

  function fourCc(bytes, offset = 0) {
    return String.fromCharCode(
      bytes[offset] || 0,
      bytes[offset + 1] || 0,
      bytes[offset + 2] || 0,
      bytes[offset + 3] || 0
    );
  }

  function containsFourCc(bytes, expected) {
    const target = [...expected].map(char => char.charCodeAt(0));
    for (let i = 0; i <= bytes.byteLength - 4; i++) {
      if (bytes[i] === target[0] && bytes[i + 1] === target[1] &&
          bytes[i + 2] === target[2] && bytes[i + 3] === target[3]) return true;
    }
    return false;
  }

  function invalidMp4(message) {
    const error = new Error(message);
    error.code = 'VDD_INVALID_MP4';
    return error;
  }

  function readMp4Descriptors(bytes, start, end) {
    const out = [];
    for (let o = start; o < end;) {
      const tag = bytes[o++]; let length = 0, n = 0, b;
      do { b = bytes[o++]; length = (length << 7) | (b & 0x7f); n++; } while ((b & 0x80) && n < 4 && o < end);
      out.push({ tag, start: o, end: Math.min(end, o + length) });
      o += length;
    }
    return out;
  }
  function describeEsdsAudio(bytes, esds) {
    try {
      const es = readMp4Descriptors(bytes, esds.data + 4, esds.end).find(d => d.tag === 3); if (!es) return null;
      let o = es.start + 3; const flags = bytes[es.start + 2];
      if (flags & 0x80) o += 2; if (flags & 0x40) o += 1 + bytes[o]; if (flags & 0x20) o += 2;
      const dec = readMp4Descriptors(bytes, o, es.end).find(d => d.tag === 4); if (!dec) return null;
      const objectType = bytes[dec.start];
      if (objectType === 0x6b || objectType === 0x69) return { id: 'mp3', codec: 'MP3' };
      if (![0x40, 0x66, 0x67, 0x68].includes(objectType)) return null;
      const spec = readMp4Descriptors(bytes, dec.start + 13, dec.end).find(d => d.tag === 5), aot = spec ? bytes[spec.start] >> 3 : 0;
      return { id: 'aac', codec: aot === 2 ? 'AAC-LC' : aot === 5 ? 'HE-AAC' : aot === 29 ? 'HE-AAC v2' : 'AAC' };
    } catch { return null; }
  }
  function describeSampleEntry(bytes, entry, handler) {
    const u16 = o => (bytes[o] << 8) | bytes[o + 1], type = entry.type;
    if (handler === 'vide') {
      const info = { fourcc: type, width: u16(entry.data + 24), height: u16(entry.data + 26) };
      const kids = (() => { try { return isoBoxes(bytes, entry.data + 78, entry.end); } catch { return []; } })();
      const avcC = kids.find(b => b.type === 'avcC');
      if (/^avc[13]$/.test(type) && avcC) { const d = describeVideoCodec(`avc1.${[1, 2, 3].map(k => bytes[avcC.data + k].toString(16).padStart(2, '0')).join('')}`); if (d) Object.assign(info, { codec: d.codec, profile: d.profile, level: d.level }); }
      else if (/^(?:hvc1|hev1)$/.test(type)) { const hvcC = kids.find(b => b.type === 'hvcC'); Object.assign(info, describeVideoCodec(`hvc1.${hvcC ? bytes[hvcC.data + 1] & 0x1f : 0}`) || { codec: 'H.265 (HEVC)' }); }
      else if (type === 'av01') info.codec = 'AV1'; else if (type === 'vp09') info.codec = 'VP9'; else if (type === 'mp4v') info.codec = 'MPEG-4 Visual';
      return info;
    }
    const info = { fourcc: type, channels: u16(entry.data + 16), sampleRate: ((bytes[entry.data + 24] << 8) | bytes[entry.data + 25]) };
    const kids = (() => { try { return isoBoxes(bytes, entry.data + 28, entry.end); } catch { return []; } })();
    if (type === 'mp4a') { const esds = kids.find(b => b.type === 'esds'); info.codec = (esds && describeEsdsAudio(bytes, esds)?.codec) || 'AAC'; }
    else info.codec = { 'ac-3': 'Dolby Digital (AC-3)', 'ec-3': 'Dolby Digital Plus (E-AC-3)', Opus: 'Opus', fLaC: 'FLAC', '.mp3': 'MP3' }[type] || '';
    return info;
  }
  function describeMp4Moov(bytes) {
    try {
      const moov = isoBoxes(bytes).find(b => b.type === 'moov'); if (!moov) return null;
      const info = { video: null, audio: null, duration: 0 };
      const mvhd = isoBoxes(bytes, moov.data, moov.end).find(b => b.type === 'mvhd');
      if (mvhd) { const v1 = bytes[mvhd.data] === 1, scale = readUint32BE(bytes, mvhd.data + (v1 ? 20 : 12)); info.duration = scale ? (v1 ? readUint64BE(bytes, mvhd.data + 24) : readUint32BE(bytes, mvhd.data + 16)) / scale : 0; }
      for (const trak of isoBoxes(bytes, moov.data, moov.end).filter(b => b.type === 'trak')) {
        const mdia = isoChild(bytes, trak, 'mdia'), hdlr = isoChild(bytes, mdia, 'hdlr'), mdhd = isoChild(bytes, mdia, 'mdhd');
        const handler = fourCc(bytes, hdlr.data + 8); if (handler !== 'vide' && handler !== 'soun') continue;
        const stbl = isoChild(bytes, isoChild(bytes, mdia, 'minf'), 'stbl'), stsd = isoChild(bytes, stbl, 'stsd');
        const entry = isoBoxes(bytes, stsd.data + 8, stsd.end)[0]; if (!entry) continue;
        const detail = describeSampleEntry(bytes, entry, handler);
        if (handler === 'vide' && !info.video) {
          const v1 = bytes[mdhd.data] === 1, scale = readUint32BE(bytes, mdhd.data + (v1 ? 20 : 12));
          const stts = isoChild(bytes, stbl, 'stts', false); let samples = 0, ticks = 0;
          if (stts) for (let k = 0, n = readUint32BE(bytes, stts.data + 4); k < n && stts.data + 8 + k * 8 + 8 <= stts.end; k++) { const c = readUint32BE(bytes, stts.data + 8 + k * 8), d = readUint32BE(bytes, stts.data + 12 + k * 8); samples += c; ticks += c * d; }
          info.video = { ...detail, fps: samples > 0 && ticks > 0 && scale ? samples / (ticks / scale) : 0 };
        } else if (handler === 'soun' && !info.audio) info.audio = detail;
      }
      return info.video || info.audio ? info : null;
    } catch { return null; }
  }
  function formatFileInfo(info, size = 0) {
    if (!info) return '';
    const v = info.video, a = info.audio, parts = ['MP4'];
    if (v?.width && v?.height) parts.push(`${v.width}×${v.height}`);
    if (v?.fps) parts.push(`${formatFps(v.fps)} fps`);
    if (v?.codec) parts.push([v.codec, v.profile, v.level].filter(Boolean).join(' '));
    if (a) parts.push(`${a.codec || 'áudio'}${a.channels ? ` ${a.channels === 1 ? 'mono' : a.channels === 2 ? 'estéreo' : `${a.channels} canais`}` : ''}${a.sampleRate ? ` ${Math.round(a.sampleRate / 100) / 10} kHz` : ''}`);
    else if (v) parts.push('sem áudio');
    const duration = formatDuration(info.duration); if (duration) parts.push(duration);
    if (size > 0) parts.push(`${(size / 1048576).toFixed(1)} MB`);
    return parts.join(' · ');
  }
  function mergeOutputStats(info, stats) {
    if (!info || !stats) return info;
    if (info.video && !info.video.fps && stats.fps > 0) info.video.fps = stats.fps;
    if (!info.duration && stats.duration > 0) info.duration = stats.duration;
    return info;
  }
  function showFileInfo(card, info, size = 0) {
    const text = formatFileInfo(info, size); if (!card || !text) return;
    let line = card.querySelector('.vdd-fileinfo');
    if (!line) { line = document.createElement('div'); line.className = 'vdd-fileinfo'; card.querySelector('.vdd-progress')?.insertAdjacentElement('afterend', line); }
    line.textContent = text;
  }

  async function inspectMp4Blob(blob) {
    const summary = {
      ftyp: false,
      moov: false,
      mdat: false,
      moof: false,
      videoTrack: false,
      boxes: 0,
    };

    let offset = 0;
    let moovStart = 0;
    let moovSize = 0;

    while (offset < blob.size) {
      if (summary.boxes >= 100000) throw invalidMp4('O MP4 contém blocos demais para ser validado');
      if (blob.size - offset < 8) throw invalidMp4('O final do MP4 chegou incompleto');

      const header = new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + 16)).arrayBuffer());
      const size32 = readUint32BE(header, 0);
      const type = fourCc(header, 4);
      if (!/^[\x20-\x7e]{4}$/.test(type)) throw invalidMp4('A estrutura interna do MP4 está corrompida');

      let headerSize = 8;
      let boxSize = size32;
      if (size32 === 1) {
        if (header.byteLength < 16) throw invalidMp4(`O bloco ${type} chegou incompleto`);
        headerSize = 16;
        boxSize = readUint64BE(header, 8);
      } else if (size32 === 0) {
        boxSize = blob.size - offset;
      }

      if (!boxSize || boxSize < headerSize) throw invalidMp4(`O bloco ${type} possui tamanho inválido`);
      if (boxSize > blob.size - offset) throw invalidMp4(`O vídeo terminou antes de completar o bloco ${type}`);

      summary.boxes++;
      if (type === 'ftyp') summary.ftyp = true;
      if (type === 'mdat') summary.mdat = true;
      if (type === 'moof') summary.moof = true;
      if (type === 'moov') {
        summary.moov = true;
        moovStart = offset;
        moovSize = boxSize;
      }

      offset += boxSize;
      if (size32 === 0) break;
    }

    if (offset !== blob.size) throw invalidMp4('O MP4 possui dados incompletos no final');
    if (!summary.ftyp || !summary.moov || !summary.mdat) {
      throw invalidMp4('O arquivo recebido não contém um vídeo MP4 completo');
    }

    const metadataLimit = Math.min(moovSize, 8 * 1024 * 1024);
    const moovBytes = new Uint8Array(await blob.slice(moovStart, moovStart + metadataLimit).arrayBuffer());
    summary.videoTrack = containsFourCc(moovBytes, 'vide');
    if (moovSize <= metadataLimit) summary.info = describeMp4Moov(moovBytes);
    if (!summary.videoTrack && moovSize <= metadataLimit) {
      throw invalidMp4('O MP4 recebido não possui uma faixa de vídeo');
    }

    return summary;
  }

  async function probeMp4WithBrowser(blob) {
    if (typeof document?.createElement !== 'function' || typeof URL?.createObjectURL !== 'function') return;

    const video = document.createElement('video');
    if (!video || typeof video.load !== 'function') return;

    const objectUrl = URL.createObjectURL(ensureBlobMime(blob, 'video/mp4'));
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          video.onloadedmetadata = null;
          video.onloadeddata = null;
          video.onerror = null;
          fn(value);
        };
        const timer = setTimeout(
          () => finish(reject, invalidMp4('O navegador não confirmou a reprodução do MP4')),
          12000
        );

        const verify = () => {
          if (Number(video.videoWidth || 0) <= 0 || Number(video.videoHeight || 0) <= 0) {
            finish(reject, invalidMp4('O navegador não encontrou imagem dentro do MP4'));
            return;
          }
          if (Number(video.readyState || 0) >= 2) finish(resolve);
        };

        video.onloadedmetadata = verify;
        video.onloadeddata = () => {
          verify();
          if (!settled) finish(resolve);
        };
        video.onerror = () => finish(reject, invalidMp4('O navegador não conseguiu abrir o MP4 preparado'));
        video.src = objectUrl;
        video.load();
      });
    } finally {
      try {
        video.removeAttribute('src');
        video.load();
      } catch {}
      URL.revokeObjectURL(objectUrl);
    }
  }

  function findMp4Start(bytes) {
    if (!bytes?.byteLength || bytes.byteLength < 12) return -1;
    const limit = Math.min(bytes.byteLength - 4, 1024 * 1024);
    for (let typeOffset = 4; typeOffset <= limit; typeOffset++) {
      if (bytes[typeOffset] !== 0x66 || bytes[typeOffset + 1] !== 0x74 ||
          bytes[typeOffset + 2] !== 0x79 || bytes[typeOffset + 3] !== 0x70) continue;
      const start = typeOffset - 4;
      const boxSize = readUint32BE(bytes, start);
      if (boxSize >= 8 && boxSize <= bytes.byteLength - start) return start;
    }
    return -1;
  }

  function collapseAlternatingBytes(bytes, dataIndex) {
    const length = Math.floor((bytes.byteLength - dataIndex + 1) / 2);
    const out = new Uint8Array(Math.max(0, length));
    let write = 0;
    for (let read = dataIndex; read < bytes.byteLength; read += 2) out[write++] = bytes[read];
    return write === out.byteLength ? out : out.slice(0, write);
  }

  function decodeBase64Bytes(text) {
    const cleaned = String(text || '')
      .replace(/^data:[^;,]+;base64,/i, '')
      .replace(/\s+/g, '');
    if (!cleaned || cleaned.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null;
    try {
      const binary = atob(cleaned);
      return binaryStringToBytes(binary);
    } catch {
      return null;
    }
  }

  async function validatedRecoveryCandidate(bytes, type = 'video/mp4') {
    if (!bytes?.byteLength) return null;
    let candidate = bytes;
    const start = findMp4Start(candidate.subarray(0, Math.min(candidate.byteLength, 1024 * 1024)));
    if (start > 0) candidate = candidate.slice(start);
    if (findMp4Start(candidate.subarray(0, Math.min(candidate.byteLength, 1024 * 1024))) !== 0) return null;

    const blob = new Blob([candidate], { type });
    try {
      await inspectMp4Blob(blob);
      return blob;
    } catch {
      return null;
    }
  }

  async function recoverAlteredMp4Blob(blob, onProgress = null) {
    onProgress?.(null, 'Corrigindo a leitura binária do navegador...');

    const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1024 * 1024)).arrayBuffer());
    const directStart = findMp4Start(head);
    if (directStart > 0) {
      const trimmed = new Blob([blob.slice(directStart)], { type: 'video/mp4' });
      try {
        await inspectMp4Blob(trimmed);
        return trimmed;
      } catch {}
    }

    if (blob.size > 96 * 1024 * 1024) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());

    for (const dataIndex of [0, 1]) {
      const recovered = await validatedRecoveryCandidate(collapseAlternatingBytes(bytes, dataIndex));
      if (recovered) return recovered;
    }

    try {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      const recovered = await validatedRecoveryCandidate(binaryStringToBytes(decoded));
      if (recovered) return recovered;

      if (decoded.length <= 64 * 1024 * 1024) {
        const base64 = decodeBase64Bytes(decoded);
        const base64Recovered = await validatedRecoveryCandidate(base64);
        if (base64Recovered) return base64Recovered;
      }

      if (decoded.length <= 32 * 1024 * 1024 && /^\s*\[/.test(decoded)) {
        try {
          const values = JSON.parse(decoded);
          if (Array.isArray(values)) {
            const jsonRecovered = await validatedRecoveryCandidate(Uint8Array.from(values));
            if (jsonRecovered) return jsonRecovered;
          }
        } catch {}
      }
    } catch {}

    return null;
  }

  async function probeVideoBlobWithBrowser(blob, format) {
    if (typeof document?.createElement !== 'function' || typeof URL?.createObjectURL !== 'function') return;

    const video = document.createElement('video');
    if (!video || typeof video.load !== 'function') return;

    const objectUrl = URL.createObjectURL(ensureBlobMime(blob, format?.mime || blob.type || 'application/octet-stream'));
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          video.onloadedmetadata = null;
          video.onloadeddata = null;
          video.onerror = null;
          fn(value);
        };
        const timer = setTimeout(() => finish(reject, new Error('O navegador não confirmou que este arquivo de vídeo pode ser reproduzido')), 12000);
        const verify = () => {
          if (Number(video.videoWidth || 0) <= 0 || Number(video.videoHeight || 0) <= 0) {
            finish(reject, new Error('O arquivo não contém uma faixa de vídeo reproduzível'));
            return;
          }
          if (Number(video.readyState || 0) >= 2) finish(resolve);
        };
        video.onloadedmetadata = verify;
        video.onloadeddata = () => {
          verify();
          if (!settled) finish(resolve);
        };
        video.onerror = () => finish(reject, new Error('O navegador não conseguiu reproduzir o arquivo preparado'));
        video.src = objectUrl;
        video.load();
      });
    } finally {
      try {
        video.removeAttribute('src');
        video.load();
      } catch {}
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function validatePreparedMp4(blob, onProgress = null) {
    onProgress?.(null, 'Validando a estrutura MP4...');
    let validated = blob;
    let structuralError = null;
    let structuralOk = false;

    let fileInfo = null;
    try {
      fileInfo = (await inspectMp4Blob(validated)).info || null;
      structuralOk = true;
    } catch (error) {
      if (error?.code !== 'VDD_INVALID_MP4') throw error;
      structuralError = error;
      const recovered = await recoverAlteredMp4Blob(validated, onProgress);
      if (recovered) {
        validated = recovered;
        structuralError = null;
        try {
          fileInfo = (await inspectMp4Blob(validated)).info || null;
          structuralOk = true;
        } catch (recoveredError) {
          structuralError = recoveredError;
        }
        console.info('[VDD] Transporte binário móvel corrigido antes do salvamento.');
      }
    }

    try {
      const metaBytes = new Uint8Array(await validated.slice(0, Math.min(validated.size, 8 * 1024 * 1024)).arrayBuffer());
      if (containsFourCc(metaBytes, 'pssh') || containsFourCc(metaBytes, 'encv') || containsFourCc(metaBytes, 'enca')) {
        throw invalidMp4('O MP4 usa uma faixa protegida/criptografada e não pode ser baixado diretamente');
      }
    } catch (error) {
      if (error?.code === 'VDD_INVALID_MP4') throw error;
    }

    if (structuralOk) {
      if (fileInfo) onProgress?.(null, `Arquivo conferido · ${formatFileInfo(fileInfo, validated.size)}`, { phase: 'validate', info: fileInfo, size: validated.size });
      return validated;
    }

    try {
      await probeMp4WithBrowser(validated);
      return validated;
    } catch (browserError) {
      throw structuralError || browserError;
    }
  }

  async function saveBlob(blob, filename, onProgress = null, source = {}) {
    if (!blob?.size) throw new Error('O vídeo preparado está vazio');

    const sourceUrl = String(source?.url || '');
    const sourceType = mediaContentType(source?.contentType || blob.type || '');
    const probeSize = Math.min(blob.size, 1024 * 1024);
    const probeBytes = new Uint8Array(await blob.slice(0, probeSize).arrayBuffer());

    let format = detectMediaFormatFromBytes(probeBytes, sourceType || blob.type, sourceUrl || filename);
    if (!format || format.hls) {
      const hint = knownDirectFormatHint(sourceUrl, sourceType || blob.type);
      if (hint && !looksLikeHtmlBytes(probeBytes)) {
        format = { ...hint, confirmed: false };
      }
    }
    if (!format || format.hls) {
      throw new Error('O conteúdo recebido não é um arquivo de vídeo direto reconhecido');
    }

    if (format.ext === 'mp4') {
      blob = ensureBlobMime(blob, 'video/mp4');
      blob = await validatePreparedMp4(blob, onProgress);
      format = { ext: 'mp4', mime: 'video/mp4', label: 'MP4', confirmed: true };
    } else {
      onProgress?.(null, `Validando ${format.label || 'vídeo'}...`);
      blob = ensureBlobMime(blob, format.mime);
      if (!format.confirmed) await probeVideoBlobWithBrowser(blob, format);
    }

    filename = filenameForFormat(filename, format);
    blob = ensureBlobMime(blob, format.mime);

    if (isAppleMobileBrowser()) {
      throw manualSaveRequired(blob, filename, new Error('Salvamento binário seguro exigido no iPhone'));
    }

    try {
      return await saveBlobWithManager(blob, filename, onProgress);
    } catch (managerError) {
      console.info('[VDD] Gerenciador de downloads indisponível; restaurando fallback por Blob validado:', managerError);
      const job = { blob, filename, objectUrl: '', attempts: 0, cleanupTimer: null };
      try {
        triggerManualBlobDownload(job);
        if (job.objectUrl) {
          setTimeout(() => {
            try { URL.revokeObjectURL(job.objectUrl); } catch {}
          }, 60000);
        }
        return 'anchor';
      } catch (anchorError) {
        console.info('[VDD] Fallback por Blob também falhou:', anchorError);
        throw manualSaveRequired(blob, filename, managerError);
      }
    }
  }

  function saveBlobParts(parts, filename, onProgress = null) {
    return saveBlob(
      new Blob(parts, { type: 'video/mp4' }),
      filename,
      onProgress,
      { contentType: 'video/mp4', url: `${cleanFilenameBase(filename)}.mp4` }
    );
  }

  function mediaContentType(value) {
    const type = String(value || '').toLowerCase();
    if (!type) return '';
    return type.split(';', 1)[0].trim();
  }

  function responseLooksLikeMedia(contentType, url = '') {
    const type = mediaContentType(contentType);
    if (type.startsWith('video/')) return true;
    if (type === 'application/mp4') return true;
    if (type === 'application/octet-stream' || type === 'binary/octet-stream') return true;
    if (isHls(url, type)) return true;
    if (knownDirectFormatHint(url, type)) return true;
    return false;
  }

  function responseLooksLikeHtml(contentType) {
    const type = mediaContentType(contentType);
    return type === 'text/html' || type === 'application/xhtml+xml';
  }

  function looksLikeMp4Bytes(bytes) {
    return findMp4Start(bytes) >= 0;
  }

  function looksLikeHtmlBytes(bytes) {
    if (!bytes?.byteLength) return false;
    const sample = bytes.slice(0, Math.min(bytes.byteLength, 512));
    let text = '';
    try {
      text = new TextDecoder('utf-8').decode(sample);
    } catch {
      text = String.fromCharCode(...sample.slice(0, 160));
    }
    return /^\s*(?:<!doctype\s+html|<html|<head|<body|<\?xml)/i.test(text);
  }

  function htmlPageHint(bytes) {
    try {
      const text = new TextDecoder('utf-8').decode(bytes.slice(0, Math.min(bytes.byteLength, 4096)));
      const title = text.match(/<title[^>]*>([\s\S]{1,120}?)<\/title>/i)?.[1];
      return title ? ` (título da página: “${cleanDisplayText(title).slice(0, 80)}”)` : '';
    } catch { return ''; }
  }

  function validateDirectBytes(bytes, contentType, url, status = 0) {
    if (status >= 300) throw makeHttpError(`Servidor respondeu HTTP ${status}`, status);
    if (!bytes?.byteLength) throw makeHttpError('O servidor retornou um arquivo vazio', status);
    if (responseLooksLikeHtml(contentType) || looksLikeHtmlBytes(bytes)) {
      throw makeHttpError(`O servidor devolveu uma página HTML (login, bloqueio ou erro) em vez do vídeo${htmlPageHint(bytes)}`, status);
    }

    const format = detectMediaFormatFromBytes(bytes, contentType, url);
    if (!format && (/json/i.test(String(contentType)) || /^\s*[\[{]/.test(new TextDecoder().decode(bytes.subarray(0, 32))))) {
      const error = makeHttpError(`A fonte devolveu dados JSON, não vídeo (${summarizeJsonBody(bytes)}). Nada foi salvo.`, status);
      error.code = 'MEDIA_JSON';
      try { error.jsonCandidates = jsonMediaCandidates(JSON.parse(new TextDecoder().decode(bytes)), url); } catch { error.jsonCandidates = []; }
      throw error;
    }
    if (format?.hls) {
      throw makeHttpError('A fonte direta respondeu uma playlist HLS; use a opção HLS detectada', status);
    }
    if (!format && !responseLooksLikeMedia(contentType, url)) {
      const type = mediaContentType(contentType);
      if (type && type !== 'application/octet-stream' && type !== 'binary/octet-stream') {
        throw makeHttpError(`A fonte respondeu um tipo que não é vídeo: ${type}`, status);
      }
    }
    return format;
  }

  function latestPerformanceUrls(test) {
    try {
      return performance.getEntriesByType('resource')
        .map((entry, index) => ({ url: entry.name, index, time: Number(entry.startTime || 0) }))
        .filter(entry => isHttp(entry.url) && test(entry.url))
        .sort((a, b) => (b.time - a.time) || (b.index - a.index))
        .map(entry => entry.url);
    } catch {
      return [];
    }
  }

  function sameMediaPath(a, b) {
    try {
      const ua = new URL(a);
      const ub = new URL(b);
      if (ua.hostname !== ub.hostname) return false;
      return mediaIdentityKey(a) === mediaIdentityKey(b);
    } catch {
      return false;
    }
  }

  function getFreshDirectUrl(originalUrl, allowAlternate = true) {
    if (isBlobUrl(originalUrl) || !allowAlternate) return originalUrl;

    const domUrls = [];
    document.querySelectorAll('video').forEach(video => {
      const candidates = [video.currentSrc, video.src];
      video.querySelectorAll('source').forEach(source => candidates.push(source.src || source.getAttribute('src')));
      candidates.forEach(raw => {
        if (!raw) return;
        const url = absUrl(raw);
        if (isUsableDirectUrl(url) && !isHls(url) && (isLikelyDirectVideoUrl(url) || APP.directUrls.has(url))) domUrls.push(url);
      });
    });

    const exact = domUrls.find(url => sameMediaPath(url, originalUrl));
    if (exact) return exact;

    const perf = latestPerformanceUrls(url => isLikelyDirectVideoUrl(url) && !isHls(url));
    const perfExact = perf.find(url => sameMediaPath(url, originalUrl));
    if (perfExact) return perfExact;

    return originalUrl;
  }

  function recentUnderlyingDirectUrls() {
    const seen = new Set();
    const out = [];
    const push = url => {
      const full = absUrl(url);
      if (!isHttp(full) || isHls(full) || seen.has(full)) return;
      seen.add(full);
      out.push(full);
    };

    [...APP.recentNetworkMedia]
      .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
      .forEach(item => {
        if (item.kind !== 'HLS' && (item.trusted || knownDirectFormatHint(item.url, item.type))) push(item.url);
      });

    [...APP.recentBinaryCandidates]
      .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
      .forEach(item => push(item.url));

    latestPerformanceUrls(url => isLikelyDirectVideoUrl(url) && !isHls(url)).forEach(push);
    [...APP.directUrls].reverse().forEach(url => {
      if (!isBlobUrl(url)) push(url);
    });
    return out;
  }

  function recentUnderlyingHlsUrls() {
    const seen = new Set();
    const out = [];
    const push = url => {
      const full = absUrl(url);
      if (!isHttp(full) || seen.has(full)) return;
      seen.add(full);
      out.push(full);
    };

    [...APP.recentNetworkMedia]
      .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
      .forEach(item => {
        if (item.kind === 'HLS' || isHls(item.url, item.type)) push(item.url);
      });

    latestPerformanceUrls(url => isHls(url)).forEach(push);
    [...APP.hlsUrls].reverse().forEach(push);
    return out;
  }

  function getFreshHlsFallback() {
    collectFromDom();
    collectFromPerformance();
    const recent = recentUnderlyingHlsUrls();
    return recent[0] || '';
  }

  function networkCandidateScore(item) {
    const raw = String(item?.url || '').toLowerCase();
    const type = mediaContentType(item?.type || '');
    let score = Number(item?.time || 0) / 1e13;
    if (/mpegurl|dash\+xml|video\//i.test(type)) score += 100;
    if (/\.(?:m3u8|mpd|mp4|m4v|webm|mov)(?:$|[?#&])/i.test(raw)) score += 90;
    if (/(?:master|manifest|playlist|stream|playback|video|media|hls|source|file)/i.test(raw)) score += 45;
    if (/\.(?:ts|m4s)(?:$|[?#&])/i.test(raw) || /(?:segment|chunk|frag)[-_]?\d/i.test(raw)) score -= 80;
    return score;
  }

  async function resolveObservedNetworkSource(onProgress = null) {
    const direct = recentUnderlyingDirectUrls();
    const hls = recentUnderlyingHlsUrls();
    if (direct.length || hls.length) return { direct, hls };

    const candidates = [...APP.recentNetworkRequests]
      .filter(item => isHttp(item.url))
      .sort((a, b) => networkCandidateScore(b) - networkCandidateScore(a))
      .slice(0, 12);

    const foundDirect = [];
    const foundHls = [];
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      if (/(?:\.ts|\.m4s)(?:$|[?#&])/i.test(item.url)) continue;
      onProgress?.(null, `Verificando fonte observada ${i + 1}/${candidates.length}...`);
      try {
        const probe = await probeLinkTarget(item.url);
        if (!probe || probe.page || !probe.url) continue;
        if (probe.kind === 'HLS' || isHls(probe.url, probe.contentType)) {
          if (!foundHls.includes(probe.url)) foundHls.push(probe.url);
        } else if (knownDirectFormatHint(probe.url, probe.contentType) || mediaContentType(probe.contentType).startsWith('video/')) {
          if (!foundDirect.includes(probe.url)) foundDirect.push(probe.url);
        }
        if (foundDirect.length || foundHls.length) break;
      } catch {}
      await yieldUi(0);
    }
    return { direct: foundDirect, hls: foundHls };
  }

  function getFreshHlsUrl(originalUrl, allowAlternate = true) {
    collectFromDom();
    collectFromPerformance();

    const recent = latestPerformanceUrls(url => isHls(url));
    const exact = recent.find(url => sameMediaPath(url, originalUrl));
    if (exact) return exact;

    const stored = [...APP.hlsUrls].reverse();
    const storedExact = stored.find(url => sameMediaPath(url, originalUrl));
    return storedExact || originalUrl;
  }

  async function fetchBlobInPage(url, onProgress) {
    const controller = new AbortController();
    let idleTimer = null;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), NET.pageIdleTimeout);
    };
    resetIdleTimer();

    try {
      const requestInit = isBlobUrl(url)
        ? { method: 'GET', cache: 'no-store', signal: controller.signal }
        : {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            redirect: 'follow',
            referrer: currentRequestReferrer(),
            referrerPolicy: 'strict-origin-when-cross-origin',
            signal: controller.signal,
          };
      const response = await fetch(url, requestInit);

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        const err = new Error(`Servidor respondeu ${response.status}`);
        err.status = response.status;
        err.contentType = contentType;
        throw err;
      }

      if (responseLooksLikeHtml(contentType)) {
        const err = new Error('O servidor devolveu uma página HTML em vez do vídeo');
        err.status = response.status;
        err.contentType = contentType;
        throw err;
      }

      const contentRange = parseContentRange(response.headers.get('content-range'));
      const total = response.status === 206
        ? Number(contentRange?.total || 0)
        : Number(response.headers.get('content-length') || 0);

      if (!response.body || typeof response.body.getReader !== 'function') {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), NET.fullRequestTimeout);
        const blob = await response.blob();
        const probe = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
        validateDirectBytes(probe, contentType, response.url || url, response.status);
        if (response.status === 206 && !(contentRange?.start === 0 && contentRange.total > 0 && blob.size >= contentRange.total)) {
          throw makeHttpError('O servidor entregou apenas uma parte do vídeo', 206);
        }
        return blob;
      }

      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      let lastUi = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        chunks.push(value);
        received += value.byteLength;
        resetIdleTimer();

        const now = performance.now();
        if (now - lastUi > 250) {
          if (total > 0) {
            reportByteProgress(onProgress, received, total);
          } else {
            const mb = received / 1024 / 1024;
            reportByteProgress(onProgress, mb * 1048576);
          }
          lastUi = now;
          await yieldUi(0);
        }
      }

      if (!received) throw new Error('O servidor retornou um arquivo vazio');
      const blob = new Blob(chunks, { type: mediaContentType(contentType) || 'application/octet-stream' });
      const probe = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
      validateDirectBytes(probe, contentType, response.url || url, response.status);

      if (response.status === 206 && !(contentRange?.start === 0 && contentRange.total > 0 && received >= contentRange.total)) {
        throw makeHttpError('O servidor entregou apenas uma parte do vídeo', 206);
      }

      return blob;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw makeHttpError('A fonte ficou sem responder. Tentando outro modo...');
      }
      throw error;
    } finally {
      clearTimeout(idleTimer);
    }
  }

  async function fetchBlobInPageWorld(url, onProgress = null) {
    if (!isBlobUrl(url)) throw new Error('Fallback do contexto da página só é usado para Blob');

    let pageWindow = window;
    try {
      if (typeof unsafeWindow === 'object' && unsafeWindow) pageWindow = unsafeWindow;
    } catch {}

    const pageFetch = pageWindow?.fetch;
    if (typeof pageFetch !== 'function') throw new Error('Fetch do contexto da página indisponível');

    onProgress?.(null, 'Tentando ler o Blob no contexto real da página...');
    let response;
    try {
      response = await Reflect.apply(pageFetch, pageWindow, [url, { method: 'GET', cache: 'no-store' }]);
    } catch (error) {
      throw makeHttpError(`O Blob da página não pôde ser lido: ${error?.message || 'falha do navegador'}`);
    }

    const contentType = response?.headers?.get?.('content-type') || '';
    if (!response?.ok) {
      const error = makeHttpError(`O Blob respondeu ${response?.status || 'sem status'}`, Number(response?.status || 0));
      error.contentType = contentType;
      throw error;
    }

    let pageBlob;
    try {
      pageBlob = await response.blob();
    } catch (error) {
      throw new Error(`O navegador não liberou os bytes do Blob: ${error?.message || 'falha de leitura'}`);
    }
    if (!pageBlob?.size) throw new Error('O Blob temporário está vazio');

    const bytes = await binaryValueToBytes(pageBlob);
    if (!bytes.byteLength) throw new Error('O Blob foi aberto, mas os bytes não puderam ser transferidos para o userscript');
    validateDirectBytes(bytes.slice(0, Math.min(bytes.byteLength, 1024 * 1024)), contentType || pageBlob.type, url, 200);
    return new Blob([bytes], { type: mediaContentType(contentType || pageBlob.type) || 'application/octet-stream' });
  }

  function parseResponseHeaders(raw) {
    const out = {};
    String(raw || '').split(/\r?\n/).forEach(line => {
      const i = line.indexOf(':');
      if (i <= 0) return;
      out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    return out;
  }

  const PLATFORM_HOSTS = [
    { re: /(?:^|\.)(?:tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokv\.com|tiktokv\.us|byteoversea\.com)$/i, referer: 'https://www.tiktok.com/' },
    { re: /(?:^|\.)(?:instagram\.com|cdninstagram\.com|fbcdn\.net)$/i, referer: 'https://www.instagram.com/' },
  ];
  const linkCookieJar = new Map();

  function platformHostInfo(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const platform = PLATFORM_HOSTS.find(item => item.re.test(host));
      return platform ? { host, referer: platform.referer } : null;
    } catch { return null; }
  }

  function rememberLinkCookies(url, rawHeaders) {
    const info = platformHostInfo(url);
    if (!info) return 0;
    let stored = 0;
    for (const line of String(rawHeaders || '').split(/\r?\n/).filter(item => /^set-cookie\s*:/i.test(item))) {
      for (const cookie of line.slice(line.indexOf(':') + 1).trim().split(/,(?=\s*[^;,\s=]+=)/)) {
        const parts = cookie.split(';').map(part => part.trim());
        const eq = parts[0].indexOf('=');
        if (eq <= 0) continue;
        const attrs = Object.fromEntries(parts.slice(1).map(part => { const i = part.indexOf('='); return i < 0 ? [part.toLowerCase(), ''] : [part.slice(0, i).toLowerCase(), part.slice(i + 1)]; }));
        const jar = linkCookieJar.get(info.referer) || new Map();
        linkCookieJar.set(info.referer, jar);
        const name = parts[0].slice(0, eq);
        if (attrs['max-age'] === '0' || (attrs.expires && Date.parse(attrs.expires) < Date.now())) jar.delete(name);
        else { jar.set(name, parts[0].slice(eq + 1)); stored++; }
      }
    }
    return stored;
  }

  function platformRequestHeaders(url, mode = 'session') {
    const info = platformHostInfo(url);
    if (!info || mode === 'bare') return {};
    const cookies = [];
    for (const [name, value] of linkCookieJar.get(info.referer) || []) cookies.push(`${name}=${value}`);
    return { ...(mode === 'session' ? { Referer: info.referer } : {}), ...(cookies.length ? { Cookie: cookies.join('; ') } : {}) };
  }

  function binaryStringToBytes(value) {
    const text = String(value || '');
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    return bytes;
  }

  async function binaryValueToBytes(value) {
    if (value == null) return new Uint8Array(0);

    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    }

    const tag = Object.prototype.toString.call(value);
    if (tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
      try { return new Uint8Array(value).slice(); } catch {}
    }

    if (typeof value?.arrayBuffer === 'function') {
      try {
        const buffer = await value.arrayBuffer();
        return new Uint8Array(buffer).slice();
      } catch {}
    }

    if (tag === '[object Blob]' && typeof FileReader === 'function') {
      try {
        const buffer = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('Falha ao ler Blob'));
          reader.readAsArrayBuffer(value);
        });
        return new Uint8Array(buffer).slice();
      } catch {}
    }

    if (value?.data != null && value.data !== value) {
      const nested = await binaryValueToBytes(value.data);
      if (nested.byteLength) return nested;
    }

    if (Array.isArray(value)) {
      try { return Uint8Array.from(value); } catch {}
    }

    if (typeof value === 'string') return binaryStringToBytes(value);

    if (Number.isFinite(Number(value?.byteLength)) && Number(value.byteLength) > 0) {
      try { return new Uint8Array(value).slice(); } catch {}
    }

    return new Uint8Array(0);
  }

  async function extractGmResponseBytes(response) {
    let value;
    try { value = response?.response; } catch { value = null; }
    let bytes = await binaryValueToBytes(value);
    if (bytes.byteLength) return bytes;

    try {
      if (typeof response?.responseText === 'string' && response.responseText.length) {
        bytes = binaryStringToBytes(response.responseText);
      }
    } catch {}
    return bytes;
  }

  function sameSessionHeaders() {
    return {
      Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.7',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      Referer: currentRequestReferrer(),
    };
  }

  function gmHeadersForMode(extraHeaders = {}, mode = 'session') {
    const extra = { ...extraHeaders };
    if (mode === 'bare') return extra;
    if (mode === 'minimal') {
      return {
        Accept: 'video/*,application/octet-stream;q=0.9,*/*;q=0.7',
        ...extra,
      };
    }
    if (mode === 'origin') {
      const origin = originOf(currentRequestReferrer());
      return { ...sameSessionHeaders(), ...(origin ? { Origin: origin } : {}), ...extra };
    }
    return { ...sameSessionHeaders(), ...extra };
  }

  function gmArrayBufferRequest(url, extraHeaders = {}, timeout = NET.requestTimeout, onProgress = null, responseType = 'arraybuffer', headerMode = 'session') {
    const gmXhr = getGmXhr();
    if (!gmXhr) {
      return Promise.reject(new Error('Modo de compatibilidade indisponível'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let idleTimer = null;
      let requestHandle = null;

      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(idleTimer);
        fn(value);
      };

      const armIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          try { requestHandle?.abort?.(); } catch {}
          settle(reject, makeHttpError('A fonte ficou sem responder'));
        }, Math.min(Number(timeout || NET.requestTimeout), NET.pageIdleTimeout));
      };

      armIdleTimer();
      try {
        requestHandle = gmXhr({
          method: 'GET',
          url,
          headers: gmHeadersForMode({ ...platformRequestHeaders(url, headerMode), ...extraHeaders }, headerMode),
          responseType,
          timeout,
          anonymous: false,
          onprogress: event => {
            armIdleTimer();
            onProgress?.(event);
          },
          onload: async response => {
            try {
              const headers = parseResponseHeaders(response.responseHeaders);
              const bytes = await extractGmResponseBytes(response);

              settle(resolve, {
                status: Number(response.status || 0),
                finalUrl: response.finalUrl || url,
                headers,
                contentType: headers['content-type'] || '',
                bytes,
                responseType,
                headerMode,
              });
            } catch (error) {
              settle(reject, error);
            }
          },
          onerror: details => {
            const error = makeHttpError('A requisição alternativa foi bloqueada pelo navegador ou pelo servidor');
            error.details = details;
            error.headerMode = headerMode;
            settle(reject, error);
          },
          ontimeout: () => settle(reject, makeHttpError('Tempo esgotado ao baixar o arquivo')),
          onabort: () => settle(reject, makeHttpError('Requisição cancelada')),
        });
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  async function gmBinaryRequestCompatible(url, extraHeaders = {}, timeout = NET.requestTimeout, onProgress = null) {
    const range = String(extraHeaders?.Range || extraHeaders?.range || '');
    const expectsMp4Header = isMp4(url) && (!range || /^bytes=0-/i.test(range));
    const preferredType = isAppleMobileBrowser() ? 'blob' : 'arraybuffer';
    const responseTypes = [preferredType, preferredType === 'blob' ? 'arraybuffer' : 'blob'];
    const headerModes = originOf(url) !== originOf(currentRequestReferrer()) ? ['session', 'origin', 'minimal', 'bare'] : ['session', 'minimal', 'bare'];

    let best = null;
    let firstError = null;

    const usable = result => {
      if (!result || (result.status !== 200 && result.status !== 206)) return false;
      if (!result.bytes.byteLength) return false;
      if (expectsMp4Header && !looksLikeMp4Bytes(result.bytes.slice(0, 1024 * 1024))) {
        const type = mediaContentType(result.contentType);
        if (!(type.startsWith('video/') || type === 'application/mp4')) return false;
      }
      return true;
    };

    for (const headerMode of headerModes) {
      for (const responseType of responseTypes) {
        try {
          const result = await gmArrayBufferRequest(
            url, extraHeaders, timeout, onProgress, responseType, headerMode
          );
          if (result.status === 429 || result.status >= 500) throw mediaHttpError(result.status, result.headers);
          if (!best || (result.status >= 200 && result.status < 300)) best = result;
          if (usable(result)) return result;
        } catch (error) {
          if (error.status === 429 || error.status >= 500) throw error;
          if (!firstError) firstError = error;
          console.info(`[VDD] GM ${responseType}/${headerMode} falhou:`, error);
        }
      }
    }

    if (best) return best;
    throw firstError || new Error('A requisição alternativa não pôde ser concluída');
  }

  async function requestBlobWithManager(url, onProgress) {
    const result = await withNetworkRetries(async () => {
      const response = await gmBinaryRequestCompatible(url, {}, NET.fullRequestTimeout, event => {
        if (event.lengthComputable && event.total > 0) {
          reportByteProgress(onProgress, event.loaded, event.total);
        } else if (event.loaded > 0) {
          const mb = event.loaded / 1024 / 1024;
          reportByteProgress(onProgress, mb * 1048576);
        }
      });
      if ((response.status === 200 || response.status === 206) && !response.bytes.byteLength) {
        throw makeHttpError('O servidor enviou uma resposta vazia temporária', 503);
      }
      return response;
    }, {
      attempts: 2,
      onRetry(attempt, error) {
        onProgress?.(null, error?.status >= 500 && error.status !== 503
          ? `Servidor respondeu HTTP ${error.status}. Tentando novamente (${attempt}/2)...`
          : 'Resposta vazia ou conexão interrompida. Tentando novamente...');
      }
    });

    if (result.status < 200 || result.status >= 400) {
      const err = new Error(`Servidor respondeu ${result.status}`);
      err.status = result.status;
      err.contentType = result.contentType;
      throw err;
    }

    if (result.status === 206) {
      const range = parseContentRange(result.headers['content-range']);
      const isComplete = range?.start === 0 && range.total > 0 && result.bytes.byteLength >= range.total;
      if (!isComplete) {
        throw makeHttpError('O servidor entregou apenas uma parte do vídeo', 206);
      }
    }

    validateDirectBytes(result.bytes.slice(0, 4096), result.contentType, result.finalUrl || url, result.status);

    return new Blob([result.bytes], {
      type: mediaContentType(result.contentType) || 'application/octet-stream'
    });
  }

  function parseContentRange(value) {
    const match = String(value || '').match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i);
    if (!match) return null;
    return {
      start: Number(match[1]),
      end: Number(match[2]),
      total: match[3] === '*' ? 0 : Number(match[3]),
    };
  }

  function parseUnsatisfiedRangeTotal(value) {
    const match = String(value || '').match(/bytes\s+\*\/(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  async function gmHeadRequest(url, timeout = 12000) {
    const gmXhr = getGmXhr();
    if (!gmXhr) throw new Error('Modo HEAD indisponível');

    const modes = ['session', 'minimal', 'bare'];
    let firstError = null;

    for (const mode of modes) {
      try {
        const result = await new Promise((resolve, reject) => {
          let handle = null;
          try {
            handle = gmXhr({
              method: 'HEAD',
              url,
              headers: gmHeadersForMode({}, mode),
              timeout,
              anonymous: false,
              onload: response => resolve({
                status: Number(response.status || 0),
                finalUrl: response.finalUrl || url,
                headers: parseResponseHeaders(response.responseHeaders),
                headerMode: mode,
              }),
              onerror: () => reject(makeHttpError('A consulta HEAD foi bloqueada')),
              ontimeout: () => reject(makeHttpError('A consulta HEAD demorou demais')),
              onabort: () => reject(makeHttpError('A consulta HEAD foi cancelada')),
            });
          } catch (error) {
            reject(error);
          }
        });
        if (result.status) return result;
      } catch (error) {
        if (!firstError) firstError = error;
      }
    }

    throw firstError || new Error('A consulta HEAD falhou');
  }

  async function probeDirectMetadata(url) {
    try {
      const head = await gmHeadRequest(url);
      const size = Number(head.headers['content-length'] || 0);
      if (head.status >= 200 && head.status < 400 && !responseLooksLikeHtml(head.headers['content-type']) && Number.isFinite(size) && size > 0) {
        return { size, finalUrl: head.finalUrl || url, headers: head.headers };
      }
    } catch (error) {
      console.info('[VDD] HEAD alternativo indisponível:', error);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        referrer: currentRequestReferrer(),
        referrerPolicy: 'strict-origin-when-cross-origin',
        signal: controller.signal,
      });
      const size = Number(response.headers.get('content-length') || 0);
      if (response.ok && !responseLooksLikeHtml(response.headers.get('content-type')) && Number.isFinite(size) && size > 0) {
        return {
          size,
          finalUrl: response.url || url,
          headers: Object.fromEntries(response.headers.entries()),
        };
      }
    } catch (error) {
      console.info('[VDD] HEAD da página indisponível:', error);
    } finally {
      clearTimeout(timer);
    }

    return { size: 0, finalUrl: url, headers: {} };
  }

  function gmArrayBufferRequestWithRetry(url, headers, timeout, onProgress = null, onRetry = null) {
    return withNetworkRetries(async () => {
      const result = await gmBinaryRequestCompatible(url, headers, timeout, onProgress);
      if (!result.status) {
        throw makeHttpError('Falha de rede: servidor sem status');
      }
      if ((result.status === 200 || result.status === 206) && !result.bytes.byteLength) {
        throw makeHttpError('O servidor enviou um bloco vazio temporário', 503);
      }
      if (isTransientError({ status: result.status })) {
        throw makeHttpError(`Servidor respondeu ${result.status}`, result.status);
      }
      return result;
    }, { onRetry });
  }

  async function finishDirectParts(parts, filename, contentType, onProgress, sourceUrl = '') {
    onProgress?.(null, 'Montando arquivo...');
    const blob = new Blob(parts, { type: mediaContentType(contentType) || 'application/octet-stream' });
    await saveBlob(blob, filename, onProgress, { url: sourceUrl, contentType });
    onProgress?.(100, 'Arquivo salvo');
    toast('Arquivo enviado para Downloads');
    return true;
  }

  async function downloadDirectByRanges(url, filename, onProgress) {
    const CHUNK = NET.rangeChunkSize;
    onProgress?.(null, 'Tentando modo por blocos...');

    const first = await gmArrayBufferRequestWithRetry(
      url,
      { Range: `bytes=0-${CHUNK - 1}` },
      NET.requestTimeout,
      null,
      (attempt, error) => onProgress?.(null, `${error?.status ? `HTTP ${error.status}. ` : ''}Repetindo primeiro bloco (${attempt}/${NET.retries})...`)
    );

    if (first.status === 200) {
      validateDirectBytes(first.bytes.slice(0, 4096), first.contentType, first.finalUrl || url, first.status);
      const probe = await probeDirectMetadata(first.finalUrl || url);
      if (probe.size > first.bytes.byteLength) {
        throw makeHttpError('O servidor ignorou os blocos e devolveu um arquivo incompleto', 200);
      }
      await saveBlob(
        new Blob([first.bytes], { type: mediaContentType(first.contentType) || 'application/octet-stream' }),
        filename,
        onProgress,
        { url: first.finalUrl || url, contentType: first.contentType }
      );
      onProgress?.(100, 'Arquivo salvo');
      toast('Arquivo enviado para Downloads');
      return true;
    }

    if (first.status !== 206) {
      throw makeHttpError(`Servidor respondeu ${first.status || 'sem status'}`, first.status);
    }

    validateDirectBytes(first.bytes.slice(0, 4096), first.contentType, first.finalUrl || url, first.status);

    const firstRange = parseContentRange(first.headers['content-range']);
    if (firstRange && firstRange.start !== 0) {
      throw makeHttpError('O servidor iniciou o vídeo em um ponto incorreto', 206);
    }

    let firstBytes = first.bytes;
    if (firstRange) {
      const announced = firstRange.end - firstRange.start + 1;
      if (firstBytes.byteLength < announced) {
        throw makeHttpError('O primeiro bloco chegou incompleto', 206);
      }
      if (firstBytes.byteLength > announced) firstBytes = firstBytes.slice(0, announced);
    }

    let activeUrl = first.finalUrl || url;
    let total = Number(firstRange?.total || 0);
    let metadata = { size: 0, finalUrl: activeUrl, headers: {} };
    if (!total) {
      metadata = await probeDirectMetadata(activeUrl);
      if (metadata.size >= firstBytes.byteLength) total = metadata.size;
      if (metadata.finalUrl) activeUrl = metadata.finalUrl;
    }

    if (total > 0 && total <= firstBytes.byteLength) {
      return finishDirectParts([firstBytes.slice(0, total)], filename, first.contentType, onProgress, activeUrl || url);
    }

    const parts = [firstBytes];
    let received = firstBytes.byteLength;
    let start = firstRange ? firstRange.end + 1 : firstBytes.byteLength;
    let chunkCount = 1;
    const rawEtag = first.headers.etag || metadata.headers?.etag || '';
    const etag = /^W\//i.test(rawEtag) ? '' : rawEtag;
    const lastModified = first.headers['last-modified'] || metadata.headers?.['last-modified'] || '';
    const ifRange = etag || lastModified;

    while (!total || start < total) {
      if (chunkCount >= NET.maxUnknownRangeChunks) {
        throw new Error('O download excedeu o limite de segurança do modo por blocos');
      }

      const end = total ? Math.min(total - 1, start + CHUNK - 1) : start + CHUNK - 1;
      const requestHeaders = { Range: `bytes=${start}-${end}` };
      if (ifRange) requestHeaders['If-Range'] = ifRange;

      const part = await gmArrayBufferRequestWithRetry(
        activeUrl,
        requestHeaders,
        NET.requestTimeout,
        null,
        attempt => onProgress?.(
          total ? Math.min(94, 18 + Math.round((received / total) * 76)) : 35,
          `Conexão interrompida. Repetindo bloco (${attempt}/${NET.retries})...`
        )
      );

      if (part.status === 416) {
        const reportedTotal = parseUnsatisfiedRangeTotal(part.headers['content-range']);
        if (total && start < total && (!reportedTotal || start < reportedTotal)) {
          throw makeHttpError('O servidor encerrou o vídeo antes do tamanho informado', 416);
        }
        if (reportedTotal && received < reportedTotal) {
          throw makeHttpError('Faltou uma parte do vídeo antes do fim do arquivo', 416);
        }
        break;
      }

      if (part.status === 200) {
        validateDirectBytes(part.bytes.slice(0, 4096), part.contentType, part.finalUrl || activeUrl, part.status);
        const probe = await probeDirectMetadata(part.finalUrl || activeUrl);
        if (probe.size && part.bytes.byteLength < probe.size) {
          throw makeHttpError('O servidor deixou de respeitar os blocos durante o download', 200);
        }
        return finishDirectParts([part.bytes], filename, part.contentType || first.contentType, onProgress, part.finalUrl || activeUrl || url);
      }

      if (part.status !== 206) {
        throw makeHttpError(`Bloco respondeu ${part.status || 'sem status'}`, part.status);
      }
      if (!part.bytes.byteLength) {
        if (!total) break;
        throw new Error('Um bloco do vídeo veio vazio');
      }
      if (responseLooksLikeHtml(part.contentType) || looksLikeHtmlBytes(part.bytes)) {
        throw makeHttpError('Um bloco devolveu HTML em vez do vídeo', part.status);
      }

      if (etag && part.headers.etag && part.headers.etag !== etag) {
        throw new Error('A fonte do vídeo mudou durante o download. Atualize a lista e tente novamente.');
      }

      const partRange = parseContentRange(part.headers['content-range']);
      let bytes = part.bytes;
      if (partRange) {
        if (partRange.total > 0) total = partRange.total;
        if (partRange.start > start) {
          throw new Error('O servidor deixou uma lacuna entre os blocos do vídeo');
        }
        if (partRange.start < start) {
          const skip = start - partRange.start;
          if (skip >= bytes.byteLength) throw new Error('O servidor repetiu um bloco sem avançar');
          bytes = bytes.slice(skip);
        }
        const availableThroughHeader = Math.max(0, partRange.end - start + 1);
        const maxUsable = Math.min(end - start + 1, availableThroughHeader || end - start + 1);
        if (bytes.byteLength > maxUsable) {
          bytes = bytes.slice(0, maxUsable);
        }
      } else if (bytes.byteLength > end - start + 1) {
        bytes = bytes.slice(0, end - start + 1);
      }

      if (!bytes.byteLength) throw new Error('O servidor repetiu um bloco vazio');

      parts.push(bytes);
      received += bytes.byteLength;
      chunkCount++;

      const previousStart = start;
      start += bytes.byteLength;
      if (start <= previousStart) throw new Error('O modo por blocos não conseguiu avançar');

      if (total) {
        reportByteProgress(onProgress, received, total);
      } else {
        const mb = received / 1024 / 1024;
        reportByteProgress(onProgress, mb * 1048576);
      }

      await yieldUi(8);
    }

    return finishDirectParts(parts, filename, first.contentType, onProgress, activeUrl || url);
  }

  function friendlyDirectError(error, host = '') {
    const status = Number(error?.status || 0);
    const at = host ? ` em ${host}` : '';
    if (status === 401 || status === 403) {
      return `A fonte recusou o acesso direto${at} (HTTP ${status}). Reproduza o vídeo por alguns segundos e toque em atualizar.`;
    }
    if (status === 404 || status === 410) {
      return `O servidor${at} respondeu HTTP ${status}: o arquivo não existe mais nesse endereço ou o endereço temporário expirou. Reproduza o vídeo novamente, toque em atualizar e tente de novo.`;
    }
    if (status === 412) {
      return `O servidor${at} recusou o pedido (HTTP 412 Precondition Failed). Ele exige uma condição que o navegador não enviou, normalmente o Referer/Origin do próprio site ou uma sessão válida. O script já testou os perfis de cabeçalhos; abra o vídeo no site, reproduza e use “Nesta página”.`;
    }
    if (status === 408 || status === 425 || status === 429 || status >= 500) {
      const causes = { 408: 'A fonte demorou demais para responder (HTTP 408).', 429: 'A fonte limitou as requisições (HTTP 429).',
        500: 'Erro interno no servidor da fonte (HTTP 500).', 502: 'O CDN/proxy recebeu uma resposta inválida da origem (HTTP 502 Bad Gateway).',
        503: 'O servidor da fonte está indisponível ou sobrecarregado (HTTP 503).',
        504: 'O CDN/proxy não recebeu resposta da origem a tempo (HTTP 504 Gateway Timeout).' };
      return `${causes[status] || `O servidor da fonte respondeu com erro (HTTP ${status}).`} O problema está no servidor, não no script, e as novas tentativas automáticas não resolveram. Tente de novo mais tarde.`;
    }
    const raw = String(error?.message || '');
    if (/requisição alternativa foi bloqueada|modo de compatibilidade indisponível/i.test(raw)) {
      return 'A fonte foi localizada, mas o navegador/servidor recusou a leitura binária direta. O script já tentou o contexto da página, o gerenciador e pedidos Range.';
    }
    if (/load failed|failed to fetch|networkerror|network request failed/i.test(raw)) {
      return 'O navegador bloqueou a leitura direta dessa fonte. Tente novamente após iniciar o vídeo.';
    }
    return raw || 'Não foi possível baixar esta fonte';
  }

  const DIRECT_RETRY = Object.freeze({ attempts: 3, baseDelay: 2500, maxDelay: 30000 });

  function directErrorStatus(error) { return Number(error?.status || error?.cause?.status || 0); }

  function isNetworkFailure(error, depth = 0) {
    if (!error || depth > 3 || error.code === 'MEDIA_CANCELLED' || directErrorStatus(error)) return false;
    if (error.code === 'MEDIA_NETWORK') return true;
    if (/tempo esgotado|timeout|falha de rede|network error|failed to fetch|load failed|sem status/i.test(String(error.message || ''))) return true;
    return error.cause ? isNetworkFailure(error.cause, depth + 1) : false;
  }

  function isRetryableDirectError(error) {
    const status = directErrorStatus(error);
    if (status) return status === 408 || status === 425 || status === 429 || status >= 500;
    return error?.code === 'MEDIA_NETWORK' || /tempo esgotado|timeout|falha de rede|network error|sem status/i.test(String(error?.message || ''));
  }

  function waitWithCountdown(ms, signal, onTick) {
    return new Promise((resolve, reject) => {
      const end = Date.now() + ms;
      let timer;
      const stop = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
      const onAbort = () => { stop(); reject(mediaError('Download cancelado.', 'MEDIA_CANCELLED')); };
      const tick = () => {
        const left = end - Date.now();
        if (left <= 0) { stop(); resolve(); return; }
        onTick?.(Math.ceil(left / 1000));
        timer = setTimeout(tick, Math.min(1000, left));
      };
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener('abort', onAbort, { once: true });
      tick();
    });
  }

  async function downloadDirectSmart(originalUrl, filename, opts = {}) {
    const progress = opts.onProgress || (() => {});
    const signal = opts.signal;
    const maxAttempts = Math.max(1, Number(opts.retryAttempts || DIRECT_RETRY.attempts));
    const guarded = (...args) => { checkMediaAbort({ signal }); return progress(...args); };
    let renewed = false;
    for (let attempt = 1; ; attempt++) {
      checkMediaAbort({ signal });
      const usedUrl = getFreshDirectUrl(originalUrl, opts.allowPageFallback !== false);
      try {
        return await downloadDirectSmartOnce(originalUrl, filename, { ...opts, onProgress: guarded });
      } catch (error) {
        if (signal?.aborted || error?.code === 'MEDIA_CANCELLED') throw mediaError('Download cancelado.', 'MEDIA_CANCELLED');
        if (isManualSaveRequired(error) || isManualOpenRequired(error)) throw error;
        const status = directErrorStatus(error);
        if ([401, 403, 410].includes(status) && !renewed && opts.allowPageFallback !== false) {
          collectFromDom(); collectFromPerformance();
          const renewedUrl = getFreshDirectUrl(originalUrl, true);
          if (renewedUrl && renewedUrl !== usedUrl) {
            renewed = true;
            progress(null, 'A URL expirou. Usando a URL renovada pelo player...', { phase: 'retry' });
            continue;
          }
        }
        if (attempt >= maxAttempts || !isRetryableDirectError(error)) throw error;
        const retryAfter = Number(error.retryAfterMs || error.cause?.retryAfterMs || 0);
        if (retryAfter > DIRECT_RETRY.maxDelay) {
          error.message += ` Aguarde cerca de ${Math.ceil(retryAfter / 1000)} s antes de tentar novamente.`;
          throw error;
        }
        const delay = Math.max(retryAfter, Math.min(DIRECT_RETRY.baseDelay * 2 ** (attempt - 1), DIRECT_RETRY.maxDelay) + Math.random() * 600);
        const reason = status ? `HTTP ${status}` : 'falha de rede';
        await waitWithCountdown(delay, signal, seconds => progress(null,
          `Falha temporária (${reason}). Nova tentativa ${attempt + 1}/${maxAttempts} em ${seconds} s...`, { phase: 'retry' }));
      }
    }
  }

  async function downloadDirectSmartOnce(originalUrl, filename, opts = {}) {
    const progress = opts.onProgress || (() => {});
    const allowPageFallback = opts.allowPageFallback !== false;
    collectFromDom();
    collectFromPerformance();

    let freshUrl = getFreshDirectUrl(originalUrl, allowPageFallback);
    const startedAsBlob = isBlobUrl(freshUrl);
    progress(null, freshUrl !== originalUrl ? 'URL renovada. Iniciando...' : 'Usando a sessão da página...');

    let nativeRefusal = null;
    if ((isAppleMobileBrowser() || getGmDownload()) && isHttp(freshUrl)) {
      const nativeTarget = await resolveNativeDirectFormat(
        freshUrl,
        opts.typeHint || '',
        opts.kindHint || ''
      );
      if (nativeTarget?.hls) return downloadHlsAsMp4(nativeTarget.finalUrl, { ...opts, filenameBase: filename });
      if (nativeTarget?.format && nativeTarget.format.ext !== 'ts') {
        const nativeFilename = filenameForFormat(filename, nativeTarget.format);
        try {
          freshUrl = nativeTarget.finalUrl || freshUrl;
          progress(null, `Iniciando download ${nativeTarget.format.label} pelo navegador...`);
          await downloadDirectUrlNatively(freshUrl, nativeFilename, progress);
          progress(100, 'Download concluído pelo navegador');
          toast('Download concluído pelo navegador', 3600);
          return;
        } catch (error) {
          console.info('[VDD] Download nativo recusado; seguindo para baixar o arquivo e salvá-lo:', error);
          if (error.status === 429) throw error;
          nativeRefusal = { error, url: freshUrl, filename: nativeFilename };
        }
      }
    }

    let firstError = null;
    let managerError = null;
    let rangeError = null;

    try {
      const blob = await fetchBlobInPage(freshUrl, progress);
      progress(null, 'Validando o arquivo recebido...');
      await saveBlob(blob, filename, progress, { url: freshUrl, contentType: blob.type });
      progress(100, 'Arquivo salvo');
      toast('Arquivo enviado para Downloads');
      return;
    } catch (error) {
      if (isManualSaveRequired(error)) throw error;
      firstError = error;
      console.info('[VDD] Download no contexto do userscript falhou:', error);
    }

    if (startedAsBlob) {
      try {
        const blob = await fetchBlobInPageWorld(freshUrl, progress);
        progress(null, 'Validando o Blob da página...');
        await saveBlob(blob, filename, progress, { url: freshUrl, contentType: blob.type });
        progress(100, 'Arquivo salvo');
        toast('Arquivo enviado para Downloads');
        return;
      } catch (error) {
        if (isManualSaveRequired(error)) throw error;
        firstError = error;
        console.info('[VDD] Blob também não pôde ser lido no contexto real da página:', error);
      }

      collectFromDom();
      collectFromPerformance();

      let underlyingDirect = recentUnderlyingDirectUrls().slice(0, 4);
      let underlyingHls = recentUnderlyingHlsUrls();

      if (!underlyingDirect.length && !underlyingHls.length) {
        const resolved = await resolveObservedNetworkSource(progress);
        underlyingDirect = resolved.direct.slice(0, 4);
        underlyingHls = resolved.hls;
      }

      if (!underlyingDirect.length && allowPageFallback && underlyingHls.length) {
        progress(null, 'Blob é um player temporário. Usando a playlist real encontrada...');
        await downloadHlsAsMp4(underlyingHls[0], {
          filenameBase: cleanFilenameBase(filename),
          onProgress: progress,
        });
        return;
      }

      if (!underlyingDirect.length) {
        const dash = [...APP.dashUrls].reverse()[0] || '';
        if (dash) {
          throw new Error(
            'O player usa DASH segmentado. O manifesto foi detectado, mas não expôs um MP4 completo que possa ser salvo com segurança. ' +
            'O script não concatena faixas DASH separadas nem contorna DRM.'
          );
        }
        throw new Error(
          'O player usa um Blob/MediaSource temporário e a página ainda não expôs a URL real. ' +
          'Inicie o vídeo por alguns segundos, toque em atualizar e tente novamente.'
        );
      }

      freshUrl = underlyingDirect[0];
      progress(null, 'Blob resolvido para uma fonte HTTP observada no player...');
    }

    const directCandidates = startedAsBlob
      ? [...new Set([freshUrl, ...recentUnderlyingDirectUrls()].filter(isHttp))].slice(0, 4)
      : [getFreshDirectUrl(originalUrl, allowPageFallback)];

    for (let i = 0; i < directCandidates.length; i++) {
      const candidate = directCandidates[i];
      if (!isHttp(candidate)) continue;

      try {
        progress(null, directCandidates.length > 1
          ? `Tentando fonte real ${i + 1}/${directCandidates.length}...`
          : 'Tentando modo compatibilidade...');
        const blob = await requestBlobWithManager(candidate, progress);
        progress(null, 'Validando o arquivo recebido...');
        await saveBlob(blob, filename, progress, { url: candidate, contentType: blob.type });
        progress(100, 'Arquivo salvo');
        toast('Arquivo enviado para Downloads');
        return;
      } catch (error) {
        if (isManualSaveRequired(error)) throw error;
        managerError = error;
        console.info('[VDD] Download alternativo falhou:', candidate, error);
      }

      try {
        await downloadDirectByRanges(candidate, filename, progress);
        return;
      } catch (error) {
        if (isManualSaveRequired(error)) throw error;
        rangeError = error;
        console.info('[VDD] Download por blocos falhou:', candidate, error);
      }
    }

    const hls = allowPageFallback ? getFreshHlsFallback() : '';
    if (hls) {
      progress(null, 'Fonte direta recusada. Tentando HLS disponível...');
      await downloadHlsAsMp4(hls, {
        filenameBase: cleanFilenameBase(filename),
        onProgress: progress,
      });
      return;
    }

    const bestError = rangeError || managerError || firstError;
    if (nativeRefusal && isAppleMobileBrowser() && !directErrorStatus(bestError) && !directErrorStatus(nativeRefusal.error)) {
      throw manualOpenRequired(nativeRefusal.url, nativeRefusal.filename, bestError || nativeRefusal.error);
    }
    const finalError = new Error(friendlyDirectError(bestError, sourceHost(freshUrl)));
    finalError.status = Number(bestError?.status || bestError?.cause?.status || 0);
    finalError.retryAfterMs = Number(bestError?.retryAfterMs || 0);
    finalError.cause = bestError;
    throw finalError;
  }

  function yieldUi(ms = 12) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function looksLikeSelfInitializingFmp4(bytes) {
    if (findMp4Start(bytes) < 0) return false;
    try {
      const boxes = isoBoxes(bytes);
      return boxes.some(box => box.type === 'moov') && boxes.some(box => box.type === 'moof');
    } catch { return false; }
  }

  const AVC_PROFILES = Object.freeze({ 44: 'CAVLC 4:4:4', 66: 'Baseline', 77: 'Main', 88: 'Extended', 100: 'High', 110: 'High 10', 122: 'High 4:2:2', 244: 'High 4:4:4' });
  function formatFps(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? String(Number(n.toFixed(2))) : '';
  }
  function describeVideoCodec(token) {
    const raw = String(token || '').trim(), t = raw.toLowerCase();
    let m;
    if ((m = t.match(/^avc[13]\.([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/))) {
      const profile = AVC_PROFILES[parseInt(m[1], 16)] || '', level = parseInt(m[3], 16);
      return { id: 'h264', codec: 'H.264', profile, level: level ? (level / 10).toFixed(1) : '', label: `H.264${profile ? ` ${profile}` : ''}${level ? ` ${(level / 10).toFixed(1)}` : ''}` };
    }
    if (/^(?:avc[13]|mp4v)/.test(t)) return t.startsWith('mp4v') ? { id: 'mpeg4', codec: 'MPEG-4 Visual', label: 'MPEG-4 Visual' } : { id: 'h264', codec: 'H.264', label: 'H.264' };
    if ((m = t.match(/^(?:hvc1|hev1)\.(\d+)/))) { const p = { 1: 'Main', 2: 'Main 10' }[m[1]] || ''; return { id: 'h265', codec: 'H.265 (HEVC)', profile: p, label: `H.265 (HEVC)${p ? ` ${p}` : ''}` }; }
    if (/^(?:dvh1|dvhe)/.test(t)) return { id: 'dolby-vision', codec: 'Dolby Vision', label: 'Dolby Vision' };
    if (t.startsWith('av01')) return { id: 'av1', codec: 'AV1', label: 'AV1' };
    if (/^vp0?9/.test(t)) return { id: 'vp9', codec: 'VP9', label: 'VP9' };
    if (/^vp0?8/.test(t)) return { id: 'vp8', codec: 'VP8', label: 'VP8' };
    return null;
  }
  function describeAudioCodec(token) {
    const t = String(token || '').trim().toLowerCase();
    if (t === 'mp4a.40.2') return { id: 'aac', codec: 'AAC-LC', label: 'AAC-LC' };
    if (t === 'mp4a.40.5') return { id: 'aac', codec: 'HE-AAC', label: 'HE-AAC' };
    if (t === 'mp4a.40.29') return { id: 'aac', codec: 'HE-AAC v2', label: 'HE-AAC v2' };
    if (/^mp4a\.40\.(?:34)$|^mp4a\.(?:69|6b)$|^mp3$/.test(t)) return { id: 'mp3', codec: 'MP3', label: 'MP3' };
    if (t.startsWith('mp4a.40.')) return { id: 'aac', codec: 'AAC', label: 'AAC' };
    if (t === 'ac-3' || t === 'mp4a.a5') return { id: 'ac3', codec: 'Dolby Digital (AC-3)', label: 'Dolby Digital (AC-3)' };
    if (t === 'ec-3' || t === 'mp4a.a6') return { id: 'eac3', codec: 'Dolby Digital Plus (E-AC-3)', label: 'Dolby Digital Plus (E-AC-3)' };
    if (t === 'opus') return { id: 'opus', codec: 'Opus', label: 'Opus' };
    if (t === 'flac') return { id: 'flac', codec: 'FLAC', label: 'FLAC' };
    return null;
  }
  function describeCodecs(codecs) {
    const result = { video: null, audio: null, others: [] };
    for (const token of String(codecs || '').split(',').map(x => x.trim()).filter(Boolean)) {
      const v = !result.video && describeVideoCodec(token), a = !result.audio && describeAudioCodec(token);
      if (v) result.video = v; else if (a) result.audio = a; else result.others.push(token);
    }
    return result;
  }
  function hlsCodecNote(choice) {
    const c = describeCodecs(choice?.codecs);
    if (c.audio && (c.audio.id === 'ac3' || c.audio.id === 'eac3')) return `áudio ${c.audio.label}: o conversor local não suporta este áudio (suporta AAC e MP3).`;
    if (c.video && ['h265', 'av1', 'vp9', 'dolby-vision'].includes(c.video.id)) return `vídeo ${c.video.codec}: só é convertido se os segmentos forem fMP4; em MPEG-TS o conversor local aceita apenas H.264.`;
    return '';
  }
  function hlsChoiceLabel(choice) {
    const resolution = choice.height ? `${choice.height}p${choice.width ? ` (${choice.width}×${choice.height})` : ''}` : 'Resolução não informada';
    const rate = choice.bandwidth ? ` · ${(choice.bandwidth / 1000000).toFixed(2)} Mb/s` : '';
    const c = describeCodecs(choice.codecs);
    const codecs = [c.video?.label, c.audio?.label, ...c.others].filter(Boolean).join(' + ');
    return `${resolution}${choice.frameRate ? ` · ${formatFps(choice.frameRate)} fps` : ''}${rate}${codecs ? ` · ${codecs}` : ''}`;
  }

  async function inspectHlsChoices(url, context = {}) {
    let response = await requestTextDetailed(url, null, context);
    let variants = rankVariants(parseMaster(response.text, response.finalUrl));
    let selectedUrl = '';
    if (!variants.length) {
      const parent = await recoverHlsParent(response.finalUrl, context);
      if (parent) {
        selectedUrl = response.finalUrl;
        response = await requestTextDetailed(parent.url, null, context);
        variants = rankVariants(parseMaster(response.text, response.finalUrl));
      }
    }
    const media = variants.length ? null : parseMediaPlaylist(response.text, response.finalUrl);
    return { url, finalUrl: response.finalUrl, variants, media, selectedUrl, time: Date.now() };
  }

  function assertHlsKeys(text) {
    for (const line of String(text).split(/\r?\n/)) {
      if (!/^#EXT-X-(?:SESSION-)?KEY:/.test(line.trim())) continue;
      const a = parseAttrs(line);
      if (a.METHOD === 'NONE') continue;
      if (a.METHOD !== 'AES-128' || (a.KEYFORMAT && a.KEYFORMAT !== 'identity')) {
        throw mediaError('Esta fonte usa DRM ou uma criptografia não compatível. Nenhuma proteção será contornada.', 'MEDIA_UNSUPPORTED');
      }
    }
  }

  async function resolveHlsPlaylist(url, context, selection = null, depth = 0, visited = new Set()) {
    if (depth >= HLS_LIMITS.depth || visited.has(url)) throw mediaError('A playlist contém um ciclo ou níveis demais.', 'MEDIA_UNSUPPORTED');
    visited.add(url);
    const response = await requestTextDetailed(url, null, context);
    assertHlsKeys(response.text);
    const variants = rankVariants(parseMaster(response.text, response.finalUrl));
    (context.hlsChain ||= []).push({ level: depth, kind: variants.length ? 'master' : 'media', url, finalUrl: response.finalUrl, type: response.contentType || '',
      bytes: response.bytes?.length || 0, at: Date.now(), segments: variants.length ? 0 : (response.text.match(/^#EXTINF:/gm) || []).length });
    if (!variants.length) {
      const media = parseMediaPlaylist(response.text, response.finalUrl);
      if (!media.segments.length) throw mediaError('A playlist não contém segmentos completos disponíveis.');
      if (media.segments.some(segment => segment.gap)) throw mediaError('A própria playlist declara segmentos ausentes (EXT-X-GAP). Não é possível montar um arquivo completo.');
      return { media, choice: selection, root: url };
    }
    let candidates = variants;
    const selected = Array.isArray(selection) ? selection[0] : selection;
    if (selected) {
      const exact = variants.find(v => mediaIdentityKey(v.url, 'HLS') === mediaIdentityKey(selected.url, 'HLS'));
      candidates = exact ? [exact] : variants.filter(v => v.height === selected.height && v.width === selected.width && v.codecs === selected.codecs && v.bandwidth === selected.bandwidth);
      if (!candidates.length) throw mediaError('A qualidade escolhida mudou na fonte. Toque em “Atualizar qualidades”.');
    }
    let last;
    for (const candidate of candidates) {
      try {
        const nextSelection = Array.isArray(selection) && selection.length > 1 ? selection.slice(1) : null;
        const result = await resolveHlsPlaylist(candidate.url, context, nextSelection, depth + 1, new Set(visited));
        return { ...result, choice: result.choice || candidate, root: url, path: [candidate, ...(result.path || [])],
          audioChoices: result.audioChoices?.length ? result.audioChoices : candidate.audioGroups.get(candidate.audioGroup) || [] };
      } catch (error) {
        checkMediaAbort(context);
        last = error;
        if (selection || error.code === 'MEDIA_UNSUPPORTED' || error.status === 429) throw error;
        context.onProgress?.(null, 'Qualidade indisponível; verificando a próxima opção publicada...');
      }
    }
    throw last || mediaError('Nenhuma qualidade pôde ser aberta.');
  }

  function isoBoxes(bytes, start = 0, end = bytes.length) {
    const result = [];
    while (start < end) {
      if (end - start < 8) throw mediaError('Um bloco MP4 chegou incompleto.', 'MEDIA_TRUNCATED');
      let size = readUint32BE(bytes, start), header = 8;
      if (size === 1) { if (end - start < 16) throw mediaError('Cabeçalho MP4 incompleto.'); size = readUint64BE(bytes, start + 8); header = 16; }
      else if (size === 0) size = end - start;
      if (!Number.isSafeInteger(size) || size < header || start + size > end) throw mediaError('Tamanho de bloco MP4 inválido.', 'MEDIA_TRUNCATED');
      result.push({ type: fourCc(bytes, start + 4), start, end: start + size, data: start + header });
      start += size;
    }
    return result;
  }

  function isoChild(bytes, parent, type, required = true) {
    const child = isoBoxes(bytes, parent.data, parent.end).find(box => box.type === type);
    if (!child && required) throw mediaError(`A fonte não publicou o bloco MP4 ${type}.`, 'MEDIA_UNSUPPORTED');
    return child;
  }

  function write32(bytes, offset, value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff || offset + 4 > bytes.length) throw mediaError('Valor MP4 fora do intervalo compatível.', 'MEDIA_UNSUPPORTED');
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
  }

  function writeTime(bytes, offset, version, value) {
    value = Math.round(value);
    if (version === 1) { write32(bytes, offset, Math.floor(value / 0x100000000)); write32(bytes, offset + 4, value % 0x100000000); }
    else write32(bytes, offset, value);
  }

  function joinBytes(parts) {
    const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { output.set(part, offset); offset += part.length; }
    return output;
  }

  function isoBox(type, parts) {
    const body = joinBytes(parts), result = new Uint8Array(body.length + 8);
    write32(result, 0, result.length);
    result.set([...type].map(char => char.charCodeAt(0)), 4); result.set(body, 8);
    return result;
  }

  function inspectHlsInit(bytes) {
    const top = isoBoxes(bytes), moov = top.find(box => box.type === 'moov'), ftyp = top.find(box => box.type === 'ftyp');
    if (!moov || !ftyp) throw mediaError('O segmento de inicialização não contém ftyp/moov.', 'MEDIA_UNSUPPORTED');
    const tracks = [];
    const mvex = isoChild(bytes, moov, 'mvex');
    for (const trak of isoBoxes(bytes, moov.data, moov.end).filter(box => box.type === 'trak')) {
      const tkhd = isoChild(bytes, trak, 'tkhd'), mdia = isoChild(bytes, trak, 'mdia');
      const mdhd = isoChild(bytes, mdia, 'mdhd'), hdlr = isoChild(bytes, mdia, 'hdlr');
      const stsd = isoChild(bytes, isoChild(bytes, isoChild(bytes, mdia, 'minf'), 'stbl'), 'stsd');
      const id = readUint32BE(bytes, tkhd.data + (bytes[tkhd.data] === 1 ? 20 : 12));
      const timescale = readUint32BE(bytes, mdhd.data + (bytes[mdhd.data] === 1 ? 20 : 12));
      const trex = isoBoxes(bytes, mvex.data, mvex.end).find(box => box.type === 'trex' && readUint32BE(bytes, box.data + 4) === id);
      const handler = fourCc(bytes, hdlr.data + 8);
      if (!timescale || !trex || !['vide', 'soun'].includes(handler)) throw mediaError('Esta faixa MP4 ainda não é compatível com a montagem local.', 'MEDIA_UNSUPPORTED');
      const config = bytes.slice(stsd.start, stsd.end);
      if (containsFourCc(config, 'encv') || containsFourCc(config, 'enca') || containsFourCc(config, 'sinf')) throw mediaError('A fonte publicou uma faixa protegida por DRM.', 'MEDIA_UNSUPPORTED');
      tracks.push({ id, timescale, handler, config, trak: bytes.slice(trak.start, trak.end), trex: bytes.slice(trex.start, trex.end),
        defaultDuration: readUint32BE(bytes, trex.data + 12), defaultSize: readUint32BE(bytes, trex.data + 16) });
    }
    if (!tracks.length) throw mediaError('A inicialização MP4 não contém faixas.');
    const mvhd = isoChild(bytes, moov, 'mvhd');
    return { tracks, ftyp: bytes.slice(ftyp.start, ftyp.end), mvhd: bytes.slice(mvhd.start, mvhd.end) };
  }

  function matchingTrack(a, b) {
    return a.handler === b.handler && a.timescale === b.timescale && a.config.length === b.config.length && a.config.every((value, i) => value === b.config[i]);
  }

  function fragmentRecords(bytes, init, convertedDuration = 0) {
    const top = isoBoxes(bytes), records = [];
    for (let i = 0; i < top.length; i++) {
      const moof = top[i];
      if (moof.type !== 'moof') continue;
      let endIndex = i + 1;
      while (endIndex < top.length && top[endIndex].type !== 'moof' && !['sidx', 'mfra', 'ftyp', 'moov'].includes(top[endIndex].type)) endIndex++;
      const mdats = top.slice(i + 1, endIndex).filter(box => box.type === 'mdat');
      if (!mdats.length) throw mediaError('Fragmento MP4 sem dados de mídia.', 'MEDIA_TRUNCATED');
      const buffer = bytes.slice(moof.start, top[endIndex - 1].end);
      const localMoof = isoBoxes(buffer)[0];
      const tracks = [];
      for (const traf of isoBoxes(buffer, localMoof.data, localMoof.end).filter(box => box.type === 'traf')) {
        const tfhd = isoChild(buffer, traf, 'tfhd'), tfdt = isoChild(buffer, traf, 'tfdt');
        const flags = readUint32BE(buffer, tfhd.data) & 0xffffff;
        if (flags & 1) throw mediaError('O fragmento usa offsets absolutos não compatíveis.', 'MEDIA_UNSUPPORTED');
        const track = init.tracks.find(item => item.id === readUint32BE(buffer, tfhd.data + 4));
        if (!track) throw mediaError('Um fragmento referencia uma faixa ausente.');
        let pos = tfhd.data + 8;
        if (flags & 2) pos += 4;
        let defaultDuration = track.defaultDuration, defaultSize = track.defaultSize;
        if (flags & 8) { defaultDuration = readUint32BE(buffer, pos); pos += 4; }
        if (flags & 16) { defaultSize = readUint32BE(buffer, pos); pos += 4; }
        if (flags & 32) pos += 4;
        if (pos > tfhd.end) throw mediaError('Cabeçalho de faixa incompleto.', 'MEDIA_TRUNCATED');
        const version = buffer[tfdt.data];
        if (version > 1 || tfdt.end - tfdt.data < (version === 1 ? 12 : 8)) throw mediaError('Timestamp MP4 inválido.');
        const time = version === 1 ? readUint64BE(buffer, tfdt.data + 4) : readUint32BE(buffer, tfdt.data + 4);
        let duration = 0, totalSampleCount = 0, totalSampleBytes = 0;
        for (const trun of isoBoxes(buffer, traf.data, traf.end).filter(box => box.type === 'trun')) {
          const trunFlags = readUint32BE(buffer, trun.data) & 0xffffff, count = readUint32BE(buffer, trun.data + 4);
          if (count > 1000000) throw mediaError('Número de amostras MP4 inválido.');
          let at = trun.data + 8, dataOffset = null, sampleBytes = 0;
          if (trunFlags & 1) { dataOffset = new DataView(buffer.buffer).getInt32(at); at += 4; }
          if (trunFlags & 4) at += 4;
          for (let sample = 0; sample < count; sample++) {
            let d = trunFlags & 0x100 ? readUint32BE(buffer, at) : defaultDuration;
            if (!d && count === 1 && track.handler === 'vide' && convertedDuration > 0 && (trunFlags & 0x100)) {
              d = Math.round(convertedDuration * track.timescale);
              write32(buffer, at, d);
            }
            if (trunFlags & 0x100) at += 4;
            const size = trunFlags & 0x200 ? readUint32BE(buffer, at) : defaultSize;
            if (trunFlags & 0x200) at += 4;
            if (trunFlags & 0x400) at += 4;
            if (trunFlags & 0x800) at += 4;
            if (at > trun.end || !d || !size) throw mediaError('Amostras MP4 incompletas.', 'MEDIA_TRUNCATED');
            duration += d; sampleBytes += size;
          }
          totalSampleCount += count; totalSampleBytes += sampleBytes;
          if (dataOffset === null || !mdats.some(mdat => dataOffset >= mdat.data - moof.start && dataOffset + sampleBytes <= mdat.end - moof.start)) {
            throw mediaError('Os offsets MP4 não apontam para amostras completas.', 'MEDIA_UNSUPPORTED');
          }
        }
        tracks.push({ track, tfhd, tfdt, time, duration, version, sampleCount: totalSampleCount, sampleBytes: totalSampleBytes });
      }
      if (!tracks.length) throw mediaError('Fragmento MP4 sem faixas.');
      records.push({ bytes: buffer, tracks });
    }
    if (!records.length) throw mediaError('O segmento não contém fragmentos MP4 completos.');
    return records;
  }

  function buildHlsInit(init, tracks) {
    const mvhd = init.mvhd.slice(), mvhdBox = isoBoxes(mvhd)[0];
    const version = mvhd[mvhdBox.data], scalePos = mvhdBox.data + (version === 1 ? 20 : 12);
    const scale = readUint32BE(mvhd, scalePos);
    const duration = Math.max(...tracks.map(track => track.end / track.timescale));
    writeTime(mvhd, scalePos + 4, version, duration * scale);
    write32(mvhd, mvhd.length - 4, tracks.length + 1);
    const traks = [], trexs = [];
    for (const track of tracks) {
      const rawTrak = track.trak.slice(), root = isoBoxes(rawTrak)[0];
      const trak = isoBox('trak', isoBoxes(rawTrak, root.data, root.end).filter(box => box.type !== 'edts').map(box => rawTrak.slice(box.start, box.end)));
      const tr = isoBoxes(trak)[0], tkhd = isoChild(trak, tr, 'tkhd');
      const mdhd = isoChild(trak, isoChild(trak, tr, 'mdia'), 'mdhd');
      const tkVersion = trak[tkhd.data], mdVersion = trak[mdhd.data];
      write32(trak, tkhd.data + (tkVersion === 1 ? 20 : 12), track.outputId);
      writeTime(trak, tkhd.data + (tkVersion === 1 ? 28 : 20), tkVersion, track.end / track.timescale * scale);
      writeTime(trak, mdhd.data + (mdVersion === 1 ? 24 : 16), mdVersion, track.end);
      const trex = track.trex.slice(); write32(trex, isoBoxes(trex)[0].data + 4, track.outputId);
      traks.push(trak); trexs.push(trex);
    }
    return joinBytes([init.ftyp, isoBox('moov', [mvhd, ...traks, isoBox('mvex', trexs)])]);
  }

  const MP3_BR_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const MP3_BR_V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
  const MP3_BR_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const MP3_RATES = [[11025, 12000, 8000], null, [22050, 24000, 16000], [44100, 48000, 32000]];
  const mpU32 = n => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n >>> 0); return a; };
  const mpU16 = n => Uint8Array.of((n >> 8) & 255, n & 255);
  const mpZero = n => new Uint8Array(n);
  const mpAscii = text => Uint8Array.from([...text].map(char => char.charCodeAt(0)));
  const mpFull = (type, version, flags, parts) => isoBox(type, [Uint8Array.of(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...parts]);
  const mpMatrix = () => joinBytes([mpU32(0x10000), mpU32(0), mpU32(0), mpU32(0), mpU32(0x10000), mpU32(0), mpU32(0), mpU32(0), mpU32(0x40000000)]);

  function mp3FrameInfo(b, i) {
    if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, br = (b[i + 2] >> 4) & 15, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || (layer !== 1 && layer !== 2) || !br || br === 15 || sri === 3) return null;
    const v1 = ver === 3, kbps = (v1 ? (layer === 1 ? MP3_BR_V1_L3 : MP3_BR_V1_L2) : MP3_BR_V2)[br];
    const sampleRate = MP3_RATES[ver][sri], samples = layer === 1 && !v1 ? 576 : 1152;
    const length = Math.floor((samples / 8) * kbps * 1000 / sampleRate) + pad;
    if (length < 24) return null;
    return { length, sampleRate, samples, kbps, channels: ((b[i + 3] >> 6) & 3) === 3 ? 1 : 2 };
  }

  function extractTsMp3(b) {
    try {
      if (!b || b.length < 400) return null;
      let start = -1;
      for (let i = 0; i < 188 && i + 376 < b.length; i++) if (b[i] === 0x47 && b[i + 188] === 0x47 && b[i + 376] === 0x47) { start = i; break; }
      if (start < 0) return null;
      let pmtPid = -1, audioPid = -1, pmtDone = false, current = null;
      const pes = [];
      for (let p = start; p + 188 <= b.length; p += 188) {
        if (b[p] !== 0x47) break;
        const pusi = (b[p + 1] & 0x40) !== 0, pid = ((b[p + 1] & 0x1f) << 8) | b[p + 2], afc = (b[p + 3] >> 4) & 3;
        if (!(afc & 1)) continue;
        let o = p + 4; if (afc & 2) o += 1 + b[o];
        if (o >= p + 188) continue;
        if (pid === 0 && pmtPid < 0 && pusi) {
          o += 1 + b[o];
          const len = ((b[o + 1] & 0x0f) << 8) | b[o + 2], end = Math.min(o + 3 + len - 4, p + 188);
          for (let q = o + 8; q + 4 <= end; q += 4) if (((b[q] << 8) | b[q + 1]) !== 0) { pmtPid = ((b[q + 2] & 0x1f) << 8) | b[q + 3]; break; }
        } else if (pid === pmtPid && pusi && !pmtDone) {
          o += 1 + b[o];
          if (b[o] !== 2) continue;
          const len = ((b[o + 1] & 0x0f) << 8) | b[o + 2], end = Math.min(o + 3 + len - 4, p + 188);
          const info = ((b[o + 10] & 0x0f) << 8) | b[o + 11];
          for (let q = o + 12 + info; q + 5 <= end;) {
            if ((b[q] === 0x03 || b[q] === 0x04) && audioPid < 0) audioPid = ((b[q + 1] & 0x1f) << 8) | b[q + 2];
            q += 5 + (((b[q + 3] & 0x0f) << 8) | b[q + 4]);
          }
          pmtDone = true;
        } else if (audioPid >= 0 && pid === audioPid) {
          const payload = b.subarray(o, p + 188);
          if (pusi) {
            current = null;
            if (payload.length < 9 || payload[0] !== 0 || payload[1] !== 0 || payload[2] !== 1) continue;
            let pts = NaN;
            if ((payload[7] & 0x80) && payload.length >= 14) {
              pts = (payload[9] & 0x0e) * 536870912 + payload[10] * 4194304 + (payload[11] & 0xfe) * 16384 + payload[12] * 128 + (payload[13] >> 1);
            }
            current = { pts, chunks: [payload.subarray(9 + payload[8])] };
            pes.push(current);
          } else if (current) current.chunks.push(payload);
        }
      }
      if (!pes.length) return null;
      const data = joinBytes(pes.flatMap(item => item.chunks));
      const frames = []; let first = null, i = 0;
      while (i + 4 <= data.length) {
        const f = mp3FrameInfo(data, i);
        if (f && i + f.length > data.length) break;
        if (f) {
          const next = i + f.length;
          const nextOk = next + 4 > data.length || Boolean(mp3FrameInfo(data, next));
          if (nextOk && (!first || (f.sampleRate === first.sampleRate && f.channels === first.channels && f.samples === first.samples))) {
            first ||= f; frames.push({ off: i, len: f.length }); i = next; continue;
          }
        }
        i++;
      }
      if (!frames.length) return null;
      const pts = (pes.find(item => Number.isFinite(item.pts)) || {}).pts;
      return { data, frames, pts: pts === undefined ? NaN : pts, sampleRate: first.sampleRate, channels: first.channels, samples: first.samples };
    } catch { return null; }
  }

  function buildMp3Init(mp3, baseInit) {
    const sr = mp3.sampleRate;
    let ftyp, mvhd, traks = [], trexs = [], maxId = 0;
    if (baseInit?.length) {
      const top = isoBoxes(baseInit), moov = top.find(box => box.type === 'moov'), ftypBox = top.find(box => box.type === 'ftyp');
      const cut = box => baseInit.slice(box.start, box.end);
      ftyp = cut(ftypBox); mvhd = cut(isoChild(baseInit, moov, 'mvhd'));
      traks = isoBoxes(baseInit, moov.data, moov.end).filter(box => box.type === 'trak').map(cut);
      const mvex = isoChild(baseInit, moov, 'mvex');
      trexs = isoBoxes(baseInit, mvex.data, mvex.end).filter(box => box.type === 'trex').map(cut);
      maxId = Math.max(0, ...inspectHlsInit(baseInit).tracks.map(track => track.id));
    } else {
      ftyp = isoBox('ftyp', [mpAscii('isom'), mpU32(512), mpAscii('isom'), mpAscii('iso6'), mpAscii('mp41')]);
      mvhd = mpFull('mvhd', 0, 0, [mpU32(0), mpU32(0), mpU32(1000), mpU32(0), mpU32(0x10000), mpU16(0x0100), mpZero(10), mpMatrix(), mpZero(24), mpU32(2)]);
    }
    const id = maxId + 1;
    const esds = mpFull('esds', 0, 0, [Uint8Array.of(0x03, 21, 0, 0, 0, 0x04, 15, 0x6b, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x06, 1, 0x02)]);
    const mp4a = isoBox('mp4a', [mpZero(6), mpU16(1), mpZero(8), mpU16(mp3.channels), mpU16(16), mpU16(0), mpU16(0), mpU32(sr * 65536), esds]);
    const stbl = isoBox('stbl', [mpFull('stsd', 0, 0, [mpU32(1), mp4a]), mpFull('stts', 0, 0, [mpU32(0)]), mpFull('stsc', 0, 0, [mpU32(0)]), mpFull('stsz', 0, 0, [mpU32(0), mpU32(0)]), mpFull('stco', 0, 0, [mpU32(0)])]);
    const minf = isoBox('minf', [mpFull('smhd', 0, 0, [mpU16(0), mpU16(0)]), isoBox('dinf', [mpFull('dref', 0, 0, [mpU32(1), mpFull('url ', 0, 1, [])])]), stbl]);
    const tkhd = mpFull('tkhd', 0, 7, [mpU32(0), mpU32(0), mpU32(id), mpU32(0), mpU32(0), mpZero(8), mpU16(0), mpU16(0), mpU16(0x0100), mpU16(0), mpMatrix(), mpU32(0), mpU32(0)]);
    const mdhd = mpFull('mdhd', 0, 0, [mpU32(0), mpU32(0), mpU32(sr), mpU32(0), mpU16(0x55c4), mpU16(0)]);
    const hdlr = mpFull('hdlr', 0, 0, [mpU32(0), mpAscii('soun'), mpZero(12), mpAscii('SoundHandler\0')]);
    const trak = isoBox('trak', [tkhd, isoBox('mdia', [mdhd, hdlr, minf])]);
    const trex = mpFull('trex', 0, 0, [mpU32(id), mpU32(1), mpU32(mp3.samples), mpU32(0), mpU32(0)]);
    return { id, init: joinBytes([ftyp, isoBox('moov', [mvhd, ...traks, trak, isoBox('mvex', [...trexs, trex])])]) };
  }

  function buildMp3Fragment(mp3, trackId, baseTime) {
    const n = mp3.frames.length, table = new Uint8Array(n * 8), view = new DataView(table.buffer);
    let total = 0;
    mp3.frames.forEach((frame, i) => { view.setUint32(i * 8, mp3.samples); view.setUint32(i * 8 + 4, frame.len); total += frame.len; });
    const payload = new Uint8Array(total); let at = 0;
    for (const frame of mp3.frames) { payload.set(mp3.data.subarray(frame.off, frame.off + frame.len), at); at += frame.len; }
    const moofFor = offset => isoBox('moof', [mpFull('mfhd', 0, 0, [mpU32(1)]), isoBox('traf', [
      mpFull('tfhd', 0, 0x020000, [mpU32(trackId)]),
      mpFull('tfdt', 1, 0, [mpU32(Math.floor(baseTime / 4294967296)), mpU32(baseTime % 4294967296)]),
      mpFull('trun', 0, 0x301, [mpU32(n), mpU32(offset), table])])]);
    const moof = moofFor(moofFor(0).length + 8);
    return joinBytes([moof, isoBox('mdat', [payload])]);
  }

  async function createHlsTransmuxer(context) {
    const workerSource = `let muxer; self.onmessage = e => { const m = e.data; try {
      if (m.type === 'start') { importScripts('https://unpkg.com/mux.js@6.3.0/dist/mux.js'); }
      if (m.type === 'start' || m.type === 'reset') { if (muxer) muxer.dispose(); muxer = new muxjs.mp4.Transmuxer({keepOriginalTimestamps:true, remux:true}); }
      const out = []; const data = s => out.push({init:s.initSegment.slice(), data:s.data.slice()});
      if (m.bytes) { muxer.on('data', data); muxer.push(new Uint8Array(m.bytes)); muxer.flush(); muxer.off('data', data); }
      self.postMessage({out}, out.flatMap(s => [s.init.buffer,s.data.buffer]));
    } catch (error) { self.postMessage({error:error.message}); } };`;
    let worker, objectUrl, pending;
    const call = (type, bytes) => new Promise((resolve, reject) => {
      checkMediaAbort(context);
      const timer = setTimeout(() => finish(mediaError('O conversor local demorou demais.', 'MEDIA_CONVERSION')), 20000);
      const abort = () => finish(mediaError('Download cancelado.', 'MEDIA_CANCELLED'));
      const finish = (error, value) => { clearTimeout(timer); context.signal?.removeEventListener('abort', abort); pending = null; error ? reject(error) : resolve(value); };
      pending = finish; context.signal?.addEventListener('abort', abort, { once: true });
      const copy = bytes?.slice().buffer;
      try { worker.postMessage({ type, bytes: copy }, copy ? [copy] : []); } catch (error) { finish(error); }
    });
    try {
      if (typeof Worker !== 'function') throw new Error('Worker indisponível');
      objectUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      worker = new Worker(objectUrl);
      worker.onmessage = event => pending?.(event.data.error ? mediaError(event.data.error, 'MEDIA_CONVERSION') : null, event.data.out);
      worker.onerror = () => pending?.(mediaError('O conversor local não pôde iniciar.', 'MEDIA_CONVERSION'));
      await call('start');
      return { push: (bytes, reset) => call(reset ? 'reset' : 'push', bytes), dispose() { worker.terminate(); URL.revokeObjectURL(objectUrl); } };
    } catch (error) {
      worker?.terminate(); if (objectUrl) URL.revokeObjectURL(objectUrl); checkMediaAbort(context);
    }
    const mux = globalThis.muxjs || window.muxjs;
    if (!mux?.mp4?.Transmuxer) throw mediaError('O conversor local mux.js não carregou. Recarregue a página e tente novamente.', 'MEDIA_CONVERSION');
    let transmuxer;
    return { async push(bytes, reset) {
      checkMediaAbort(context); await yieldUi(12);
      if (!transmuxer || reset) { transmuxer?.dispose(); transmuxer = new mux.mp4.Transmuxer({ keepOriginalTimestamps: true, remux: true }); }
      const out = [], data = segment => out.push({ init: segment.initSegment.slice(), data: segment.data.slice() });
      transmuxer.on('data', data);
      try { transmuxer.push(bytes); transmuxer.flush(); } finally { transmuxer.off('data', data); }
      await yieldUi(12); return out;
    }, dispose() { transmuxer?.dispose(); } };
  }

  function hlsIv(raw, sequence) {
    const bytes = new Uint8Array(16);
    if (raw) {
      if (!/^0x[\da-f]{1,32}$/i.test(raw)) throw mediaError('IV AES-128 inválido.');
      const hex = raw.slice(2).padStart(32, '0');
      for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    } else { write32(bytes, 8, Math.floor(sequence / 0x100000000)); write32(bytes, 12, sequence % 0x100000000); }
    return bytes;
  }

  async function readHlsResource(resource, sequence, context, isMap = false) {
    const bytes = await requestHlsResource(resource, context, isMap);
    if (!resource.key) return bytes;
    const key = resource.key;
    if (key.method !== 'AES-128' || key.keyFormat !== 'identity' || !key.url) throw mediaError('Criptografia HLS não compatível.', 'MEDIA_UNSUPPORTED');
    if (isMap && !key.iv) throw mediaError('A inicialização criptografada não publicou IV.');
    if (!globalThis.crypto?.subtle) throw mediaError('Este navegador não oferece AES-128 local nesta página.', 'MEDIA_UNSUPPORTED');
    context.keys ||= new Map();
    let imported = context.keys.get(key.url);
    if (!imported) {
      const response = await mediaRequest(key.url, { context: { ...context, publicOnly: true }, maxBytes: 16 });
      if (response.bytes.length !== 16) throw mediaError('A chave pública AES-128 não tem 16 bytes.');
      imported = await crypto.subtle.importKey('raw', response.bytes, 'AES-CBC', false, ['decrypt']);
      if (context.keys.size >= 64) context.keys.delete(context.keys.keys().next().value);
      context.keys.set(key.url, imported);
    }
    try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: hlsIv(key.iv, sequence) }, imported, bytes)); }
    catch { throw mediaError('Não foi possível validar o segmento AES-128 com a chave publicada.'); }
  }

  const HLS_PREFETCH = Object.freeze({ ahead: 4, aheadMobile: 2, budget: 48 * 1024 * 1024, budgetMobile: 24 * 1024 * 1024 });
  function hlsPrefetchWindow(rendition) {
    const mobile = isAppleMobileBrowser();
    const cap = mobile ? HLS_PREFETCH.aheadMobile : HLS_PREFETCH.ahead, budget = mobile ? HLS_PREFETCH.budgetMobile : HLS_PREFETCH.budget;
    const size = Number(rendition.lastSegmentBytes || 0);
    return size > 0 ? Math.max(1, Math.min(cap, Math.floor(budget / size))) : 1;
  }
  function scheduleHlsPrefetch(rendition, index, context) {
    if (rendition.prefetchOff || context.signal?.aborted) return;
    const pending = rendition.prefetch ||= new Map();
    const last = Math.min(rendition.media.segments.length - 1, index + hlsPrefetchWindow(rendition));
    for (let i = index + 1; i <= last; i++) {
      const next = rendition.media.segments[i];
      if (pending.has(i) || !next || next.gap) continue;
      pending.set(i, readHlsResource(next, next.sequence, context).then(bytes => ({ bytes }), error => ({ error })));
    }
  }
  async function readSegmentBytesPrefetched(rendition, index, segment, context) {
    let bytes = null;
    const ahead = rendition.prefetch?.get(index);
    if (ahead) {
      rendition.prefetch.delete(index);
      const result = await ahead;
      if (result.bytes) bytes = result.bytes;
      else { rendition.prefetchOff = true; rendition.prefetch.clear(); }
    }
    if (!bytes) bytes = await readHlsResource(segment, segment.sequence, context);
    rendition.lastSegmentBytes = Number(bytes.byteLength ?? bytes.length ?? 0);
    scheduleHlsPrefetch(rendition, index, context);
    return bytes;
  }

  async function readRenditionSegment(rendition, index, context) {
    let segment = rendition.media.segments[index];
    try { return { bytes: await readSegmentBytesPrefetched(rendition, index, segment, context), segment }; }
    catch (error) {
      if (![401, 403, 404, 410].includes(error.status)) throw error;
      context.onProgress?.(null, `Atualizando a URL do segmento ${index + 1}...`);
      const fresh = await resolveHlsPlaylist(rendition.root, context, rendition.path || rendition.choice);
      const bySequence = new Map(fresh.media.segments.map(s => [`${s.sequence}:${s.discontinuity}`, s]));
      const replacement = bySequence.get(`${segment.sequence}:${segment.discontinuity}`);
      if (replacement && replacement.url === segment.url) { error.message += ' A playlist, lida de novo, publica exatamente o mesmo endereço: renovar não resolve, o servidor recusa este acesso.'; throw error; }
      if (!replacement || replacement.gap || Math.abs(replacement.duration - segment.duration) >= 0.001) throw mediaError('O segmento expirou e a fonte não o publica mais. Atualize as qualidades e tente novamente.');
      for (let i = index; i < rendition.media.segments.length; i++) {
        const old = rendition.media.segments[i];
        const updated = bySequence.get(`${old.sequence}:${old.discontinuity}`);
        if (updated && !updated.gap && Math.abs(updated.duration - old.duration) < 0.001) rendition.media.segments[i] = { ...updated, start: old.start };
      }
      segment = rendition.media.segments[index];
      rendition.prefetch?.clear();
      return { bytes: await readSegmentBytesPrefetched(rendition, index, segment, context), segment };
    }
  }

  async function prepareRenditionChunk(rendition, index, context) {
    const { bytes, segment } = await readRenditionSegment(rendition, index, context);
    let initBytes, data = bytes, convertedDuration = 0;
    if (segment.map) {
      const mapKey = JSON.stringify(segment.map);
      if (rendition.mapKey !== mapKey) {
        try { rendition.mapBytes = await readHlsResource(segment.map, segment.sequence, context, true); }
        catch (error) {
          if (![401, 403, 404, 410].includes(error.status)) throw error;
          const refreshed = await resolveHlsPlaylist(rendition.root, context, rendition.path || rendition.choice);
          const same = refreshed.media.segments.find(s => s.sequence === segment.sequence && s.discontinuity === segment.discontinuity && Math.abs(s.duration - segment.duration) < 0.001);
          if (!same?.map || same.gap) throw mediaError('A inicialização expirou e a fonte não publicou uma substituição compatível.');
          rendition.mapBytes = await readHlsResource(same.map, segment.sequence, context, true);
        }
        rendition.mapKey = mapKey;
      }
      initBytes = rendition.mapBytes;
    } else if (looksLikeSelfInitializingFmp4(bytes)) initBytes = bytes;
    else {
      if (!rendition.tsInfo) rendition.tsInfo = describeTsStreams(bytes);
      rendition.converter ||= await createHlsTransmuxer(context);
      const discontinuity = rendition.period !== undefined && rendition.period !== segment.discontinuity;
      const converted = await rendition.converter.push(bytes, discontinuity);
      const wantMp3 = /áudio MP3/.test(rendition.tsInfo) && !/áudio AAC(?!-)/.test(rendition.tsInfo);
      const mp3 = wantMp3 ? extractTsMp3(bytes) : null;
      if (converted.some(part => !part.init?.length || !part.data?.length) || (!converted.length && !mp3)) throw mediaError(`O conversor não gerou todas as faixas do segmento ${index + 1}. O codec pode não ser compatível.`, 'MEDIA_CONVERSION');
      initBytes = converted.length ? converted[0].init : null;
      data = joinBytes(converted.map(part => part.data));
      if (mp3) {
        if (discontinuity) rendition.mp3Next = null;
        let base = Number.isFinite(mp3.pts) ? Math.round(mp3.pts * mp3.sampleRate / 90000) : (rendition.mp3Next ?? 0);
        if (rendition.mp3Next != null && Math.abs(base - rendition.mp3Next) <= mp3.sampleRate * 0.03) base = rendition.mp3Next;
        rendition.mp3Next = base + mp3.frames.length * mp3.samples;
        const audioInit = buildMp3Init(mp3, initBytes);
        initBytes = audioInit.init;
        data = joinBytes([data, buildMp3Fragment(mp3, audioInit.id, base)]);
      }
      convertedDuration = segment.duration;
    }
    rendition.period = segment.discontinuity;
    const init = inspectHlsInit(initBytes);
    reconcileHlsTracks(rendition, init);
    return { records: fragmentRecords(data, init, convertedDuration), segment };
  }

  function rememberHlsMaster(text, url, referrer = location.href) {
    if (!/^\s*#EXTM3U/.test(text) || !isHttp(url)) return;
    try {
      const variants = parseMaster(text, url);
      if (!variants.length) {
        const media = parseMediaPlaylist(text, url);
        for (const segment of media.segments) {
          if (!segment.range) rememberHlsResource(segment.url);
          if (segment.map && !segment.map.range) rememberHlsResource(segment.map.url);
        }
        return;
      }
      const key = mediaIdentityKey(url, 'HLS');
      if (APP.hlsMasters.size >= 48) APP.hlsMasters.delete(APP.hlsMasters.keys().next().value);
      APP.hlsMasters.set(key, { url, variants, referrer, time: Date.now() });
    } catch {}
  }

  function rememberHlsResource(url) {
    const key = mediaIdentityKey(url, 'DIRECT');
    if (APP.hlsResources.size >= 6000) APP.hlsResources.delete(APP.hlsResources.values().next().value);
    APP.hlsResources.add(key);
    const previous = APP.mediaIdentityUrls.get(key);
    if (previous) {
      APP.directUrls.delete(previous); APP.mediaInfo.delete(previous); APP.mediaIdentityUrls.delete(key);
    }
  }

  function knownHlsParent(url) {
    const identity = mediaIdentityKey(url, 'HLS');
    for (const master of [...APP.hlsMasters.values()].reverse()) {
      const variant = master.variants.find(item => mediaIdentityKey(item.url, 'HLS') === identity);
      if (variant && Date.now() - master.time < 30 * 60 * 1000) return { ...master, variant };
    }
    return null;
  }

  async function recoverHlsParent(url, context) {
    const known = knownHlsParent(url); if (known) return known;
    if (context.publicOnly) return null;
    for (const candidate of [...APP.hlsUrls].reverse().filter(value => value !== url).slice(0, 6)) {
      checkMediaAbort(context);
      try { await requestTextDetailed(candidate, null, context); } catch {}
      const found = knownHlsParent(url); if (found) return found;
    }
    return null;
  }

  function audioChoiceKey(audio) { return [audio['GROUP-ID'], audio.NAME, audio.LANGUAGE || '', audio.url ? mediaIdentityKey(audio.url) : 'inband'].join('|'); }
  function audioChoiceLabel(audio) {
    return `${audio.NAME || audio.LANGUAGE || 'Áudio'}${audio.LANGUAGE && audio.NAME !== audio.LANGUAGE ? ` · ${audio.LANGUAGE}` : ''}${audio.CHANNELS ? ` · ${audio.CHANNELS} canais` : ''}${audio.DEFAULT === 'YES' ? ' · padrão' : ''}`;
  }
  function orderedAudioChoices(choices) {
    return [...choices].sort((a, b) => Number(b.DEFAULT === 'YES') - Number(a.DEFAULT === 'YES') || Number(b.AUTOSELECT === 'YES') - Number(a.AUTOSELECT === 'YES'));
  }

  function describeTsStreams(b) {
    try {
      if (!b || b.length < 400) return '';
      if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'segmento de áudio empacotado (ID3/ADTS), não é MPEG-TS';
      let start = -1;
      for (let i = 0; i < 188 && i + 376 < b.length; i++) if (b[i] === 0x47 && b[i + 188] === 0x47 && b[i + 376] === 0x47) { start = i; break; }
      if (start < 0) return 'formato do segmento não reconhecido como MPEG-TS';
      let pmtPid = -1; const types = [];
      for (let p = start; p + 188 <= b.length && p < start + 188 * 600; p += 188) {
        if (b[p] !== 0x47) break;
        const pusi = (b[p + 1] & 0x40) !== 0, pid = ((b[p + 1] & 0x1f) << 8) | b[p + 2], afc = (b[p + 3] >> 4) & 3;
        if (!pusi || !(afc & 1) || (pid !== 0 && pid !== pmtPid)) continue;
        let o = p + 4; if (afc & 2) o += 1 + b[o];
        o += 1 + b[o];
        const tid = b[o], len = ((b[o + 1] & 0x0f) << 8) | b[o + 2], end = Math.min(o + 3 + len - 4, p + 188);
        if (pid === 0 && tid === 0 && pmtPid < 0) {
          for (let q = o + 8; q + 4 <= end; q += 4) if (((b[q] << 8) | b[q + 1]) !== 0) { pmtPid = ((b[q + 2] & 0x1f) << 8) | b[q + 3]; break; }
        } else if (pid === pmtPid && tid === 2) {
          const info = ((b[o + 10] & 0x0f) << 8) | b[o + 11];
          for (let q = o + 12 + info; q + 5 <= end;) { types.push(b[q]); q += 5 + (((b[q + 3] & 0x0f) << 8) | b[q + 4]); }
          break;
        }
      }
      if (!types.length) return 'tabela de programas (PMT) não encontrada no segmento';
      const names = { 0x1b: 'vídeo H.264', 0x24: 'vídeo HEVC', 0x02: 'vídeo MPEG-2', 0x0f: 'áudio AAC', 0x11: 'áudio AAC-LATM', 0x03: 'áudio MP3', 0x04: 'áudio MP3', 0x81: 'áudio AC-3', 0x87: 'áudio E-AC-3', 0x06: 'dados privados (pode ser AC-3/Opus)', 0x15: 'metadados' };
      return types.map(t => `${names[t] || `tipo 0x${t.toString(16)}`}`).join(' + ');
    } catch { return ''; }
  }

  function audioMissingDetail(resolved) {
    const parts = [];
    if (resolved?.tsInfo) parts.push(`o stream contém: ${resolved.tsInfo}`);
    const declared = resolved?.audioChoices?.length || 0;
    if (declared) parts.push(`a playlist declara ${declared} faixa(s) de áudio separada(s)`);
    const info = resolved?.tsInfo || '';
    let hint = '';
    if (/AC-3|E-AC-3|LATM|privados/.test(info) && !/áudio (?:AAC(?!-)|MP3)/.test(info)) hint = ' O áudio está num codec que o conversor local não sabe extrair; só AAC e MP3 são suportados.';
    else if (/áudio MP3/.test(info)) hint = ' O stream tem áudio MP3, então a falha parece de conversão; use “Copiar relatório” na aba Diagnóstico.';
    else if (/áudio AAC(?!-)/.test(info)) hint = ' O stream tem áudio AAC, então a falha parece de conversão; use “Copiar relatório” na aba Diagnóstico.';
    else if (info && !/áudio/.test(info)) hint = ' O próprio stream não traz áudio: ele deve vir de outra playlist (outra qualidade ou a playlist principal).';
    return parts.length ? ` Detalhe técnico: ${parts.join('; ')}.${hint}` : '';
  }

  function hasActualAudio(chunk) {
    return Boolean(chunk?.records.some(record => record.tracks.some(t => t.track.handler === 'soun' && t.sampleCount > 0 && t.sampleBytes > 0)));
  }

  function filterFragmentTracks(bytes, allowedIds) {
    const boxes = isoBoxes(bytes), moof = boxes.find(box => box.type === 'moof');
    if (!moof) throw mediaError('Fragmento de mídia sem moof.');
    const children = isoBoxes(bytes, moof.data, moof.end);
    const kept = children.filter(box => box.type !== 'traf' || allowedIds.has(readUint32BE(bytes, isoChild(bytes, box, 'tfhd').data + 4)));
    if (!kept.some(box => box.type === 'traf')) return null;
    if (kept.length === children.length) return bytes;
    const newMoof = isoBox('moof', kept.map(box => bytes.slice(box.start, box.end)));
    const delta = newMoof.length - (moof.end - moof.start), root = isoBoxes(newMoof)[0];
    for (const traf of isoBoxes(newMoof, root.data, root.end).filter(box => box.type === 'traf')) {
      for (const trun of isoBoxes(newMoof, traf.data, traf.end).filter(box => box.type === 'trun')) {
        if (!(readUint32BE(newMoof, trun.data) & 1)) throw mediaError('O fragmento não permite trocar a faixa de áudio com segurança.', 'MEDIA_UNSUPPORTED');
        const view = new DataView(newMoof.buffer);
        view.setInt32(trun.data + 8, view.getInt32(trun.data + 8) + delta);
      }
    }
    return joinBytes([newMoof, bytes.slice(moof.end)]);
  }

  function keepVideoOnly(chunk, rendition) {
    const allowed = new Set(rendition.currentInit.tracks.filter(track => track.handler === 'vide').map(track => track.id));
    const records = [];
    for (const record of chunk.records) {
      const bytes = filterFragmentTracks(record.bytes, allowed);
      if (bytes) records.push(...fragmentRecords(bytes, rendition.currentInit));
    }
    return { ...chunk, records };
  }

  function reconcileHlsTracks(rendition, incoming) {
    if (!rendition.init) rendition.init = { ...incoming, tracks: [...incoming.tracks] };
    for (const track of incoming.tracks) {
      let existing = rendition.init.tracks.find(previous => previous.id === track.id && matchingTrack(previous, track));
      existing ||= rendition.init.tracks.find(previous => matchingTrack(previous, track));
      if (!existing) {
        if (rendition.init.tracks.some(previous => previous.id === track.id || previous.handler === track.handler)) {
          throw mediaError('A fonte mudou o codec de uma faixa durante o vídeo.', 'MEDIA_UNSUPPORTED');
        }
        rendition.init.tracks.push(track); existing = track;
      }
      track.output = existing;
    }
    rendition.currentInit = incoming;
  }

  async function chooseHlsAudio(resolved, context) {
    const choices = orderedAudioChoices(resolved.audioChoices || []);
    const selected = context.audioSelection;
    const selectedChoice = selected ? choices.find(audio => audioChoiceKey(audio) === audioChoiceKey(selected) ||
      audio.NAME === selected.NAME && audio.LANGUAGE === selected.LANGUAGE && audio['GROUP-ID'] === selected['GROUP-ID']) : null;
    if (selected && !selectedChoice) throw mediaError('A faixa de áudio escolhida não está disponível nessa qualidade. Atualize as opções.', 'MEDIA_AUDIO_MISSING');
    const queue = selectedChoice ? [selectedChoice] : choices;
    const present = hasActualAudio(resolved.pending);
    if (!queue.length) return null;
    let failure;
    for (const audio of queue) {
      if (!audio.url) {
        if (present) return null;
        if (selectedChoice) throw mediaError('A faixa escolhida indica áudio no vídeo, mas não forneceu amostras. Escolha outra faixa.', 'MEDIA_AUDIO_MISSING');
        continue;
      }
      let companion;
      try {
        context.onProgress?.(null, `Preparando áudio: ${audio.NAME || audio.LANGUAGE || 'padrão'}...`, { phase: 'prepare' });
        companion = await resolveHlsPlaylist(audio.url, context);
        companion.pending = await prepareRenditionChunk(companion, 0, context);
        if (!hasActualAudio(companion.pending) || companion.init.tracks.some(track => track.handler !== 'soun')) throw mediaError('A faixa publicada não contém amostras de áudio compatíveis.', 'MEDIA_AUDIO_MISSING');
        const a = companion.media, v = resolved.media;
        if (Math.abs(a.duration - v.duration) > Math.max(0.75, Math.min(a.targetDuration, v.targetDuration, 2))) throw mediaError('Áudio e vídeo publicados têm durações incompatíveis. Atualize as qualidades.', 'MEDIA_AUDIO_SYNC');
        const at = a.segments[0].programTime, vt = v.segments[0].programTime;
        if (Number.isFinite(at) && Number.isFinite(vt) && Math.abs(at - vt) > 750) throw mediaError('As janelas de áudio e vídeo não começam juntas. Atualize a playlist.', 'MEDIA_AUDIO_SYNC');
        resolved.externalAudio = true; companion.audioName = audio.NAME || audio.LANGUAGE || '';
        return companion;
      } catch (error) {
        companion?.converter?.dispose(); checkMediaAbort(context); failure = error;
        if (selectedChoice || error.status === 429 || error.code === 'MEDIA_UNSUPPORTED') throw error;
      }
    }
    if (present && !selectedChoice) return null;
    throw failure || mediaError('A playlist declarou áudio, mas nenhuma faixa forneceu amostras. Tente outra qualidade.', 'MEDIA_AUDIO_MISSING');
  }

  async function assembleHlsMp4(resolved, context) {
    const renditions = [resolved], tracks = [], parts = [];
    let size = 0, sequence = 1;
    try {
      resolved.pending = await prepareRenditionChunk(resolved, 0, context);
      if (!resolved.init.tracks.some(track => track.handler === 'vide')) throw mediaError('A opção selecionada é apenas áudio. Escolha a playlist principal.', 'MEDIA_VIDEO_MISSING');
      const companion = await chooseHlsAudio(resolved, context);
      if (companion) renditions.push(companion);
      for (const r of renditions) r.index = 0;
      const rawOrigin = Math.min(...renditions.flatMap(r => r.pending.records.flatMap(record => record.tracks.map(t => t.time / t.track.timescale))));
      const useDates = renditions.length > 1 && renditions.every(r => Number.isFinite(r.media.segments[0].programTime));
      const dateOrigin = useDates ? Math.min(...renditions.map(r => r.media.segments[0].programTime)) : 0;
      const total = renditions.reduce((sum, r) => sum + r.media.segments.length, 0);
      let completed = 0;
      for (const r of renditions) r.timelineOrigin = Math.min(...r.pending.records.flatMap(record => record.tracks.map(t => t.time / t.track.timescale)));
      while (true) {
        checkMediaAbort(context);
        const r = renditions.filter(r => r.index < r.media.segments.length).sort((a, b) => a.media.segments[a.index].start - b.media.segments[b.index].start)[0];
        if (!r) break;
        context.transfer = { completed, total, bytes: size, phase: 'transfer', rendition: r === resolved ? 'Vídeo' : 'Áudio' };
        let chunk = r.pending || await prepareRenditionChunk(r, r.index, context);
        r.pending = null;
        if (r === resolved && r.externalAudio) chunk = keepVideoOnly(chunk, r);
        for (const record of chunk.records) {
          const moof = isoBoxes(record.bytes)[0], mfhd = isoChild(record.bytes, moof, 'mfhd');
          write32(record.bytes, mfhd.data + 4, sequence++);
          for (const t of record.tracks) {
            const output = t.track.output;
            if (!output.outputId) { output.outputId = tracks.length + 1; output.end = 0; output.first = Infinity; output.sampleBytes = 0; output.samples = 0; output.maxGap = 0; tracks.push(output); }
            if (output.period === undefined) {
              output.offset = useDates ? ((r.media.segments[0].programTime - dateOrigin) / 1000 - r.timelineOrigin) * output.timescale : -rawOrigin * output.timescale;
              output.period = chunk.segment.discontinuity;
            } else if (output.period !== chunk.segment.discontinuity) {
              output.offset = Math.max(output.end, chunk.segment.start * output.timescale) - t.time;
              output.period = chunk.segment.discontinuity;
            }
            const timestamp = Math.round(t.time + output.offset);
            if (timestamp < 0 || timestamp + 2 < output.end || !Number.isSafeInteger(timestamp + t.duration)) throw mediaError('Os timestamps da fonte são inconsistentes; o arquivo não foi salvo.', 'MEDIA_AUDIO_SYNC');
            if (output.samples > 0 && t.sampleCount > 0) output.maxGap = Math.max(output.maxGap, (timestamp - output.end) / output.timescale);
            write32(record.bytes, t.tfhd.data + 4, output.outputId);
            writeTime(record.bytes, t.tfdt.data + 4, t.version, timestamp);
            output.end = timestamp + t.duration;
            if (t.sampleCount > 0) output.first = Math.min(output.first, timestamp);
            output.sampleBytes += t.sampleBytes; output.samples += t.sampleCount;
          }
          size += record.bytes.length;
          if (size > HLS_LIMITS.output) throw mediaError('O vídeo excedeu 384 MB de montagem local. Escolha uma qualidade menor ou arquivo direto.', 'MEDIA_LIMIT');
          parts.push(new Blob([record.bytes]));
        }
        r.index++; completed++;
        context.transfer = { phase: 'transfer', completed, total, bytes: size };
        context.onProgress?.(100 * completed / total, `${completed}/${total} segmentos · ${(size / 1048576).toFixed(1)} MB`, { ...context.transfer, measured: true });
        await yieldUi(4);
      }
      const audible = tracks.filter(t => t.handler === 'soun' && t.samples > 0 && t.sampleBytes > 0);
      if (!audible.length && !context.allowSilent) throw mediaError(`Nenhuma amostra de áudio foi encontrada.${audioMissingDetail(resolved)} Use a playlist principal ou outra qualidade. Se a fonte for muda, marque “Permitir vídeo sem áudio”.`, 'MEDIA_AUDIO_MISSING');
      const video = tracks.find(t => t.handler === 'vide' && t.samples > 0 && t.sampleBytes > 0);
      if (!video) throw mediaError('A playlist não entregou amostras de vídeo.', 'MEDIA_VIDEO_MISSING');
      if (audible.length) {
        const good = audible.some(audio => audio.maxGap <= 0.75 && Math.abs(audio.first / audio.timescale - video.first / video.timescale) <= 0.75 && Math.abs(audio.end / audio.timescale - video.end / video.timescale) <= 0.75);
        if (!good) throw mediaError('A faixa de áudio não cobre o vídeo completo ou está fora de sincronia. Tente outra faixa ou qualidade.', 'MEDIA_AUDIO_SYNC');
      }
      context.transfer = null;
      { const span = (video.end - video.first) / video.timescale; context.outputStats = span > 0 ? { fps: video.samples / span, duration: span } : null; }
      context.onProgress?.(null, audible.length ? 'Conferindo vídeo e áudio...' : 'Conferindo vídeo sem áudio...', { phase: 'validate' });
      return new Blob([buildHlsInit(resolved.init, tracks), ...parts], { type: 'video/mp4' });
    } finally { context.transfer = null; for (const r of renditions) r.converter?.dispose(); }
  }

  async function downloadHlsAsMp4(masterUrl, opts = {}) {
    const controller = new AbortController();
    const context = { referrer: opts.pageUrl || currentRequestReferrer(), publicOnly: opts.allowPageFallback === false,
      sessionLink: opts.sessionLink === true, signal: controller.signal, audioSelection: opts.audioSelection || null, allowSilent: opts.allowSilent === true,
      onProgress: opts.onProgress || (() => {}) };
    APP.hlsJob = context; APP.hlsController = controller;
    try {
      context.onProgress(null, 'Lendo as URLs atuais da playlist...');
      let source = opts.allowPageFallback === false ? masterUrl : getFreshHlsUrl(masterUrl, false);
      let selection = opts.selection || null;
      const parent = await recoverHlsParent(source, context);
      if (parent) { source = parent.url; selection ||= parent.variant; }
      const resolved = await resolveHlsPlaylist(source, context, selection);
      await preflightHlsSegments(resolved, context);
      try { opts.onTrace?.(hlsTraceOf(context, resolved.media.segments[0], null)); } catch {}
      const suffix = resolved.choice?.height ? `-${resolved.choice.height}p` : '';
      const live = !resolved.media.endList;
      context.onProgress(null, `${resolved.media.segments.length} segmentos${live ? ' · trecho ao vivo disponível' : ''}${suffix ? ` · ${resolved.choice.height}p` : ''}`);
      const blob = await assembleHlsMp4(resolved, context);
      checkMediaAbort(context);
      const filename = `${cleanDisplayText(opts.filenameBase) || pageTitle()}${suffix}${live ? '-trecho' : ''}`;
      await inspectMp4Blob(blob);
      const progress = (percent, label, detail) => { if (detail?.info) mergeOutputStats(detail.info, context.outputStats); context.onProgress?.(percent, label, detail); };
      await saveBlob(blob, filename, progress, { contentType: 'video/mp4', url: `${filename}.mp4` });
      context.onProgress(100, 'Arquivo enviado para o salvamento.');
    } finally { context.keys?.clear(); APP.hlsJob = null; APP.hlsController = null; }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function networkMetadata() {
    return {
      title: pageTitle(),
      titlePriority: 1,
      thumbnail: pageThumbnail(),
      thumbnailPriority: 1,
    };
  }

  function rememberDashManifest(url) {
    const full = safeHttpUrl(url || '');
    if (!full) return false;
    const before = APP.dashUrls.size;
    APP.dashUrls.add(full);
    return APP.dashUrls.size !== before;
  }

  function extractDashDirectCandidates(text, manifestUrl) {
    const raw = String(text || '').slice(0, 2 * 1024 * 1024);
    if (!raw || !/<MPD\b/i.test(raw)) return [];
    const out = [];
    const seen = new Set();
    const push = (value, type = '') => {
      const full = safeHttpUrl(decodeEmbeddedUrl(value), manifestUrl || location.href);
      if (!full || seen.has(full)) return;
      const hint = knownDirectFormatHint(full, type);
      if (!hint || hint.ext !== 'mp4') return;
      seen.add(full);
      out.push({ url: full, type: hint.mime, kind: hint.label });
    };

    try {
      const xml = new DOMParser().parseFromString(raw, 'application/xml');
      if (!xml.querySelector('parsererror')) {
        xml.querySelectorAll('Representation, AdaptationSet').forEach(node => {
          const rep = node.matches?.('Representation') ? node : null;
          const adapt = rep?.closest?.('AdaptationSet') || (node.matches?.('AdaptationSet') ? node : null);
          const mime = rep?.getAttribute?.('mimeType') || adapt?.getAttribute?.('mimeType') || '';
          const contentType = rep?.getAttribute?.('contentType') || adapt?.getAttribute?.('contentType') || '';
          if (contentType && contentType !== 'video' && !/video\/mp4/i.test(mime)) return;
          if (mime && !/video\/mp4|application\/mp4/i.test(mime)) return;

          const segmented = Boolean(rep?.querySelector?.(':scope > SegmentTemplate, :scope > SegmentList')) ||
            Boolean(adapt?.querySelector?.(':scope > SegmentTemplate, :scope > SegmentList'));
          if (segmented) return;

          const base = rep?.querySelector?.(':scope > BaseURL') || adapt?.querySelector?.(':scope > BaseURL');
          if (base?.textContent) push(base.textContent.trim(), mime || 'video/mp4');
        });
      }
    } catch {}

    if (!out.length && !/<Segment(?:Template|List)\b/i.test(raw)) {
      const basePattern = /<BaseURL(?:\s[^>]*)?>([^<]+)<\/BaseURL>/gi;
      let match;
      while ((match = basePattern.exec(raw))) push(match[1], '');
    }
    return out;
  }

  function scanNetworkTextForMedia(text, responseUrl = '') {
    const raw = String(text || '').slice(0, 2 * 1024 * 1024);
    if (!raw) return false;
    let changed = false;

    if (isDash(responseUrl) || /<MPD\b/i.test(raw)) {
      changed = rememberDashManifest(responseUrl) || changed;
      for (const candidate of extractDashDirectCandidates(raw, responseUrl)) {
        changed = rememberNetworkMedia(candidate.url, candidate.type, {
          trusted: true,
          label: 'MP4 publicado pelo manifesto DASH',
        }) || changed;
      }
    }

    if (/^\s*#EXTM3U/i.test(raw)) {
      rememberHlsMaster(raw, responseUrl);
      changed = rememberNetworkMedia(responseUrl, 'application/vnd.apple.mpegurl', {
        trusted: true,
        label: 'Playlist observada na rede',
      }) || changed;
    }

    if (publicPlatform(location.href) && /^\s*[\[{]/.test(raw)) {
      const doc = new DOMParser().parseFromString('<html></html>', 'text/html');
      for (const candidate of extractSocialCandidates(doc, location.href, raw)) changed = registerMedia(candidate.url, candidate.type, true, candidate) || changed;
      return changed;
    }
    const keyPattern = /["'](?:download(?:Addr|_addr|Url|_url)|video(?:Url|_url|Src|_src)|content(?:Url|_url)|playback(?:Url|_url)|play(?:Addr|_addr)|media(?:Url|_url)|stream(?:Url|_url)|hls(?:Url|_url)|manifest(?:Url|_url)|file(?:Url|_url)?)["']\s*[:=]\s*["']((?:\\.|[^"'\\])*)["']/gi;
    let match;
    while ((match = keyPattern.exec(raw))) {
      const url = safeHttpUrl(decodeEmbeddedUrl(match[1]), responseUrl || location.href);
      if (!url) continue;
      if (isDash(url)) {
        changed = rememberDashManifest(url) || changed;
        continue;
      }
      const type = isHls(url) ? 'application/vnd.apple.mpegurl' : '';
      changed = rememberNetworkMedia(url, type, { trusted: true, label: 'Fonte publicada por API' }) || changed;
    }

    const urlPattern = /(?:https?(?::|\\u003a)(?:\/|\\\/|\\u002f){2}|\/\/)[^"'<>\\\s]+?(?:\.m3u8|\.mpd|\.mp4|\.m4v|\.webm|\.mov|\.ogv|\.mkv|\.ts)(?:[^"'<>\\\s]*)/gi;
    while ((match = urlPattern.exec(raw))) {
      const url = safeHttpUrl(decodeEmbeddedUrl(match[0]), responseUrl || location.href);
      if (!url) continue;
      if (isDash(url)) {
        changed = rememberDashManifest(url) || changed;
        continue;
      }
      changed = rememberNetworkMedia(url, isHls(url) ? 'application/vnd.apple.mpegurl' : '', {
        trusted: true,
        label: 'URL observada em resposta da API',
      }) || changed;
    }

    return changed;
  }

  function mainWorldNetworkBridgeBootstrap(eventName) {
    try {
      if (window.__VDD_MAIN_WORLD_NETWORK_BRIDGE__) return;
      Object.defineProperty(window, '__VDD_MAIN_WORLD_NETWORK_BRIDGE__', {
        value: true,
        configurable: true,
      });

      const emit = detail => {
        try {
          document.dispatchEvent(new CustomEvent(eventName, { detail }));
        } catch {}
      };
      const normalizedType = value => String(value || '').toLowerCase().split(';', 1)[0].trim();
      const shouldReadText = (type, length, url) => {
        const mime = normalizedType(type);
        if (/mpegurl|dash\+xml|json|javascript|text\//i.test(mime)) return true;
        if (/\.(?:m3u8|mpd)(?:$|[?#&])/i.test(String(url || ''))) return true;
        const size = Number(length || 0);
        return size > 0 && size <= 2 * 1024 * 1024 &&
          !mime.startsWith('video/') && !mime.startsWith('audio/') && mime !== 'application/mp4';
      };

      const readPrefix = async (response, maxBytes = 131072) => {
        try {
          const copy = response?.clone?.();
          const reader = copy?.body?.getReader?.();
          if (!reader) return '';
          const chunks = [];
          let total = 0;
          while (total < maxBytes) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value?.byteLength) continue;
            const remaining = maxBytes - total;
            const part = value.byteLength > remaining ? value.slice(0, remaining) : value;
            chunks.push(part);
            total += part.byteLength;
          }
          try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return new TextDecoder('utf-8').decode(bytes);
        } catch {
          return '';
        }
      };

      try {
        const nativeFetch = window.fetch;
        if (typeof nativeFetch === 'function') {
          const wrappedFetch = function(...args) {
            const pending = Reflect.apply(nativeFetch, this, args);
            Promise.resolve(pending).then(response => {
              try {
                const type = response?.headers?.get?.('content-type') || '';
                const length = response?.headers?.get?.('content-length') || '';
                const contentRange = response?.headers?.get?.('content-range') || '';
                const status = Number(response?.status || 0);
                const url = response?.url || String(args?.[0]?.url || args?.[0] || '');
                emit({ url, type, status, contentRange, source: 'fetch' });
                const mime = normalizedType(type);
                if (response?.clone && shouldReadText(type, length, url)) {
                  readPrefix(response, 2 * 1024 * 1024).then(text => {
                    if (text && text.length <= 2 * 1024 * 1024) emit({ url, type, status, contentRange, text, source: 'fetch-text' });
                  }).catch(() => {});
                } else if (response?.clone && !length && !mime.startsWith('video/') && !mime.startsWith('audio/') && mime !== 'application/mp4') {
                  readPrefix(response).then(text => {
                    if (text) emit({ url, type, status, contentRange, text, source: 'fetch-prefix' });
                  }).catch(() => {});
                }
              } catch {}
            }, () => {});
            return pending;
          };
          window.fetch = typeof Proxy === 'function'
            ? new Proxy(nativeFetch, { apply: (target, thisArg, args) => Reflect.apply(wrappedFetch, thisArg, args) })
            : wrappedFetch;
        }
      } catch {}

      try {
        const proto = window.XMLHttpRequest?.prototype;
        const nativeOpen = proto?.open;
        const nativeSend = proto?.send;
        if (typeof nativeOpen === 'function') {
          proto.open = typeof Proxy === 'function'
            ? new Proxy(nativeOpen, { apply(target, thisArg, args) {
                try { thisArg.__vddRequestUrl = String(args?.[1] || ''); } catch {}
                return Reflect.apply(target, thisArg, args);
              } })
            : function(...args) {
                try { this.__vddRequestUrl = String(args?.[1] || ''); } catch {}
                return Reflect.apply(nativeOpen, this, args);
              };
        }
        if (typeof nativeSend === 'function') {
          const wrappedSend = function(...args) {
            try {
              this.addEventListener('loadend', () => {
                try {
                  const type = this.getResponseHeader?.('content-type') || '';
                  const length = this.getResponseHeader?.('content-length') || '';
                  const contentRange = this.getResponseHeader?.('content-range') || '';
                  const status = Number(this.status || 0);
                  const url = this.responseURL || this.__vddRequestUrl || '';
                  const detail = { url, type, status, contentRange, source: 'xhr' };
                  const responseType = String(this.responseType || '');
                  if ((!responseType || responseType === 'text') && shouldReadText(type, length, url)) {
                    try {
                      const text = String(this.responseText || '');
                      if (text && text.length <= 2 * 1024 * 1024) detail.text = text;
                    } catch {}
                  }
                  emit(detail);
                } catch {}
              }, { once: true });
            } catch {}
            return Reflect.apply(nativeSend, this, args);
          };
          proto.send = typeof Proxy === 'function'
            ? new Proxy(nativeSend, { apply: (target, thisArg, args) => Reflect.apply(wrappedSend, thisArg, args) })
            : wrappedSend;
        }
      } catch {}

      emit({ ready: true, source: 'bridge' });
    } catch {}
  }

  function installMainWorldNetworkBridge() {
    const eventName = 'vdd-network-bridge-2-7-4';
    if (APP.mainWorldBridgeInstalled) return;
    APP.mainWorldBridgeInstalled = true;

    document.addEventListener(eventName, event => {
      try {
        const detail = event?.detail || {};
        if (detail.ready) { APP.mainWorldBridgeReady = true; return; }
        const url = safeHttpUrl(detail.url || '');
        const type = mediaContentType(detail.type || '');
        let changed = false;
        if (url) rememberNetworkRequest(url, type, { status: detail.status, source: detail.source });
        if (url && (Number(detail.status || 0) === 206 || detail.contentRange)) rememberBinaryCandidate(url, type);
        if (url && (isHls(url, type) || knownDirectFormatHint(url, type) || type.startsWith('video/') || type === 'application/mp4')) {
          changed = rememberNetworkMedia(url, type, {
            trusted: true,
            label: 'Fonte observada no contexto da página',
          }) || changed;
        }
        if (detail.text && scanNetworkTextForMedia(String(detail.text), url || location.href)) changed = true;
        if (changed) queueRender();
      } catch {}
    }, true);

    const inject = () => {
      const root = document.documentElement || document.head;
      if (!root) return false;
      try {
        const script = document.createElement('script');
        script.textContent = `;(${mainWorldNetworkBridgeBootstrap.toString()})(${JSON.stringify(eventName)});`;
        root.appendChild(script);
        script.remove();
        return true;
      } catch (error) {
        console.info('[VDD] Ponte de rede do contexto principal indisponível:', error);
        return false;
      }
    };

    if (!inject()) {
      let attempts = 0;
      const retry = () => {
        if (APP.mainWorldBridgeReady || attempts++ >= 40) return;
        if (!inject()) setTimeout(retry, 25);
      };
      setTimeout(retry, 0);
      document.addEventListener('DOMContentLoaded', inject, { once: true, capture: true });
    }
  }

  async function readResponsePrefixText(response, maxBytes = 131072) {
    if (!response?.clone) return '';
    const copy = response.clone();
    try {
      if (copy.body?.getReader) {
        const reader = copy.body.getReader();
        const chunks = [];
        let total = 0;
        while (total < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value?.byteLength) continue;
          const remaining = maxBytes - total;
          const part = value.byteLength > remaining ? value.slice(0, remaining) : value;
          chunks.push(part);
          total += part.byteLength;
        }
        try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {}
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        try { return new TextDecoder('utf-8').decode(bytes); } catch { return ''; }
      }
      const text = await copy.text();
      return String(text || '').slice(0, maxBytes);
    } catch {
      return '';
    }
  }

  function installNetworkHooks() {
    if (APP.networkHooksInstalled) return;
    APP.networkHooksInstalled = true;
    let pageWindow = window;
    try {
      if (typeof unsafeWindow === 'object' && unsafeWindow) pageWindow = unsafeWindow;
    } catch {}

    try {
      const nativeFetch = pageWindow.fetch;
      if (typeof nativeFetch === 'function') {
        const monitoredFetch = function(target, thisArg, args) {
          const request = Reflect.apply(target, thisArg, args);
          Promise.resolve(request).then(response => {
            try {
              const type = response?.headers?.get?.('content-type') || '';
              const url = response?.url || '';
              const contentRange = response?.headers?.get?.('content-range') || '';
              const statusCode = Number(response?.status || 0);
              let changed = false;
              if (url) rememberNetworkRequest(url, type, { status: statusCode, source: 'fetch' });
              if (url && (statusCode === 206 || contentRange)) rememberBinaryCandidate(url, type);
              if (url && (isHls(url, type) || knownDirectFormatHint(url, type) || mediaContentType(type).startsWith('video/'))) {
                changed = rememberNetworkMedia(url, type, {
                  trusted: true,
                  label: 'Resposta observada no player',
                }) || changed;
              }

              const length = Number(response?.headers?.get?.('content-length') || 0);
              const normalized = mediaContentType(type);
              const textLike = /mpegurl|dash\+xml|json|javascript|text\//i.test(normalized);
              const smallUnknown = length > 0 && length <= 2 * 1024 * 1024 &&
                !normalized.startsWith('video/') && normalized !== 'application/mp4';

              const unknownPrefix = !length && !normalized.startsWith('video/') && !normalized.startsWith('audio/') && normalized !== 'application/mp4';
              if (response?.clone && (textLike || smallUnknown || unknownPrefix || isHls(url, type) || isDash(url, type))) {
                const task = textLike || smallUnknown || isHls(url, type) || isDash(url, type)
                  ? readResponsePrefixText(response, 2 * 1024 * 1024)
                  : readResponsePrefixText(response, 131072);
                task.then(text => {
                  if (text && scanNetworkTextForMedia(text, url)) queueRender();
                }).catch(() => {});
              }

              if (changed) queueRender();
            } catch {}
          }, () => {});
          return request;
        };
        pageWindow.fetch = typeof Proxy === 'function'
          ? new Proxy(nativeFetch, { apply: monitoredFetch })
          : function(...args) { return monitoredFetch(nativeFetch, this, args); };
      }
    } catch (error) {
      console.info('[VDD] Monitoramento de fetch indisponível:', error);
    }

    try {
      const proto = pageWindow.XMLHttpRequest?.prototype;
      const nativeOpen = proto?.open;
      const nativeSend = proto?.send;
      if (typeof nativeOpen === 'function' && !proto.__vddOpenWrapped) {
        try { Object.defineProperty(proto, '__vddOpenWrapped', { value: true, configurable: true }); } catch {}
        proto.open = typeof Proxy === 'function'
          ? new Proxy(nativeOpen, { apply(target, thisArg, args) {
              try { thisArg.__vddRequestUrl = String(args?.[1] || ''); } catch {}
              return Reflect.apply(target, thisArg, args);
            } })
          : function(...args) {
              try { this.__vddRequestUrl = String(args?.[1] || ''); } catch {}
              return Reflect.apply(nativeOpen, this, args);
            };
      }
      if (typeof nativeSend === 'function') {
        const monitoredSend = function(target, thisArg, args) {
          thisArg.addEventListener('loadend', () => {
            try {
              const type = thisArg.getResponseHeader?.('content-type') || '';
              const url = thisArg.responseURL || thisArg.__vddRequestUrl || '';
              const contentRange = thisArg.getResponseHeader?.('content-range') || '';
              const statusCode = Number(thisArg.status || 0);
              let changed = false;
              if (url) rememberNetworkRequest(url, type, { status: statusCode, source: 'xhr' });
              if (url && (statusCode === 206 || contentRange)) rememberBinaryCandidate(url, type);

              if (url && (isHls(url, type) || knownDirectFormatHint(url, type) || mediaContentType(type).startsWith('video/'))) {
                changed = rememberNetworkMedia(url, type, {
                  trusted: true,
                  label: 'Resposta observada no player',
                }) || changed;
              }

              let text = '';
              try {
                const responseType = String(thisArg.responseType || '');
                if (!responseType || responseType === 'text') text = String(thisArg.responseText || '');
              } catch {}
              if (text && scanNetworkTextForMedia(text, url)) changed = true;

              if (changed) queueRender();
            } catch {}
          }, { once: true });
          return Reflect.apply(target, thisArg, args);
        };
        proto.send = typeof Proxy === 'function'
          ? new Proxy(nativeSend, { apply: monitoredSend })
          : function(...args) { return monitoredSend(nativeSend, this, args); };
      }
    } catch (error) {
      console.info('[VDD] Monitoramento de XHR indisponível:', error);
    }
  }

  function installPerformanceObserver() {
    if (!('PerformanceObserver' in window)) return;
    try {
      const po = new PerformanceObserver(list => {
        let changed = false;
        for (const entry of list.getEntries()) {
          if (APP.navAt && entry.startTime < APP.navAt) continue;
          const initiator = String(entry?.initiatorType || '').toLowerCase();
          if (/^(?:fetch|xmlhttprequest|video|audio|media)$/.test(initiator)) {
            rememberNetworkRequest(entry.name, '', { source: `observer:${initiator}` });
            if (/^(?:video|audio|media)$/.test(initiator) || Number(entry?.transferSize || 0) >= 256 * 1024) {
              rememberBinaryCandidate(entry.name, '');
            }
          }
          if (/^(?:video|audio|media)$/.test(initiator)) {
            if (rememberNetworkMedia(entry.name, '', { ...networkMetadata(), trusted: true, label: 'Recurso carregado pelo player' })) changed = true;
          } else if (registerMedia(entry.name, '', false, networkMetadata())) changed = true;
        }
        if (changed) queueRender();
      });
      po.observe({ type: 'resource', buffered: true });
    } catch {}
  }

  function installDomObserver() {
    APP.observer = new MutationObserver(mutations => {
      if (mutations.every(mutation => mutation.target?.closest?.('#vdd-root'))) return;
      clearTimeout(APP.scanTimer);
      APP.scanTimer = setTimeout(() => {
        if (collectFromDom()) queueRender();
      }, 350);
    });
    APP.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'poster'],
    });
  }

  const ICON_PATHS = Object.freeze({
    download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4.5v4.2h-4.2"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    expand: '<path d="M9 4H6a2 2 0 0 0-2 2v3"/><path d="M15 4h3a2 2 0 0 1 2 2v3"/><path d="M9 20H6a2 2 0 0 1-2-2v-3"/><path d="M15 20h3a2 2 0 0 0 2-2v-3"/>',
    collapse: '<path d="M4 9h3a2 2 0 0 0 2-2V4"/><path d="M20 9h-3a2 2 0 0 1-2-2V4"/><path d="M4 15h3a2 2 0 0 1 2 2v3"/><path d="M20 15h-3a2 2 0 0 0-2 2v3"/>',
    page: '<rect x="3" y="4.5" width="18" height="12.5" rx="3.5"/><path d="M9.5 20.2h5"/><path d="M10.6 8.6v4.3l3.6-2.15z" fill="currentColor"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
    sites: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.5 2.3 3.8 5.1 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.1-3.8-8.5S9.5 5.8 12 3.5z"/>',
    pulse: '<path d="M3 12h4l2.4-6 4.2 12 2.4-6H21"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.6"/><path d="M5 15V7a3 3 0 0 1 3-3h8"/>',
    trash: '<path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="m7 7 .8 12h8.4L17 7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.2"/><path d="M12 16.9v.1"/>',
    x: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6"/><path d="m15 9-6 6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    paste: '<rect x="5" y="5" width="14" height="16" rx="3"/><path d="M9 5.5V4h6v1.5"/><path d="M9 12h6"/><path d="M9 16h4"/>',
    film: '<rect x="3.5" y="6.5" width="12" height="11" rx="3"/><path d="m15.5 11 5-3v8l-5-3"/>',
    stream: '<path d="M4 7.5h7"/><path d="M13.5 7.5H20"/><path d="M4 12h4.5"/><path d="M11 12h9"/><path d="M4 16.5h9"/><path d="M15.5 16.5H20"/>',
    doc: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5z"/><path d="M13.5 3.5v4.5H18"/><path d="M9 13h6"/><path d="M9 16.5h4"/>',
    spark: '<path d="M12 3.5c.6 3.8 1.7 4.9 5.5 5.5-3.8.6-4.9 1.7-5.5 5.5-.6-3.8-1.7-4.9-5.5-5.5 3.8-.6 4.9-1.7 5.5-5.5z"/><path d="M18 15.5c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5z"/>',
    broom: '<path d="m14.5 4.5 5 5"/><path d="M17 7 9.5 14.5"/><path d="M9.5 14.5c-1 2.6-2.8 4.4-5.5 5 .6-2.7 2.4-4.5 5-5.5z"/>',
  });
  function ic(name, cls = '') { return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ''}</svg>`; }

  const USER_SITE_ICONS = Object.freeze({ });
  const SITE_STYLES = Object.freeze({ 'tiktok.com': { bg: '#1c1c22', fg: '#fff', ch: 'T', ring: '#3cc3c6' }, 'instagram.com': { bg: '#b83a78', fg: '#fff', ch: 'I', ring: '#e0687e' } });
  function siteKey(url) {
    const host = sourceHost(url) || '';
    return host.replace(/^(www|m|vm|vt|mobile)\./i, '').toLowerCase();
  }
  function siteIcon(url, extraClass = '') {
    const key = siteKey(url) || 'link';
    const rule = Object.keys(USER_SITE_ICONS).find(domain => key === domain || key.endsWith(`.${domain}`));
    if (rule) return `<span class="vdd-site ${extraClass}" style="display:inline-block">${USER_SITE_ICONS[rule]}</span>`;
    const known = Object.keys(SITE_STYLES).find(domain => key === domain || key.endsWith(`.${domain}`));
    const style = known ? SITE_STYLES[known] : null;
    let hash = 0; for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const bg = style?.bg || `hsl(${hash % 360} 48% 38%)`, letter = style?.ch || (key.match(/[a-z0-9]/i)?.[0] || '?').toUpperCase();
    return `<svg class="vdd-site ${extraClass}" data-vdd-logo="${escapeHtml(key)}" viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(key)}"><rect width="24" height="24" rx="7" fill="${bg}"/>${style?.ring ? `<rect x="1" y="1" width="22" height="22" rx="6" fill="none" stroke="${style.ring}" stroke-opacity=".7" stroke-width="1.5"/>` : ''}<text x="12" y="16.6" text-anchor="middle" font-size="12.5" font-weight="750" fill="${style?.fg || '#fff'}" font-family="-apple-system,Helvetica,Arial,sans-serif">${escapeHtml(letter)}</text></svg>`;
  }

  const LOGO = { mem: new Map(), pending: new Map(), observer: null, ttl: 14 * 24 * 3600 * 1000, prefix: 'optdowns.logo.v2:' };
  const IMG_NET = { active: 0, max: 4, queue: [], cache: new Map() };

  function gmImageRequest(url, headers = {}, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const gmXhr = getGmXhr();
      if (!gmXhr) return reject(new Error('GM_xmlhttpRequest indisponível'));
      try {
        gmXhr({
          method: 'GET', url, headers, timeout, responseType: 'arraybuffer', anonymous: true,
          onload: response => resolve(response),
          onerror: error => reject(error instanceof Error ? error : new Error('Falha de rede')),
          ontimeout: () => reject(new Error('Tempo esgotado')),
          onabort: () => reject(new Error('Cancelado')),
        });
      } catch (error) { reject(error); }
    });
  }

  function sniffImageMime(bytes, declared = '') {
    if (!bytes || bytes.length < 4) return '';
    const b = bytes;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
      if (/^avi[fs]$/.test(brand)) return 'image/avif';
      if (/^(heic|heix|mif1|msf1)$/.test(brand)) return 'image/heic';
    }
    if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon';
    if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
    const head = String.fromCharCode(...b.slice(0, 256)).toLowerCase();
    if (/<svg[\s>]/.test(head) || (/<\?xml/.test(head) && /<svg/.test(head))) return 'image/svg+xml';
    if (/^image\//i.test(declared) && !/html|text/i.test(declared)) return declared.toLowerCase();
    return '';
  }

  function responseToImageBlob(response) {
    const status = Number(response?.status || 0);
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
    let raw = response.response;
    if (raw == null) throw new Error('Resposta vazia');
    const bytes = raw instanceof Blob ? null : new Uint8Array(raw.buffer ? raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) : raw);
    if (!bytes) return Promise.resolve(raw).then(async blob => {
      const head = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
      const mime = sniffImageMime(head, blob.type);
      if (!mime) throw new Error('Não é imagem');
      return new Blob([blob], { type: mime });
    });
    if (!bytes.byteLength) throw new Error('Resposta vazia');
    const declared = (String(response.responseHeaders || '').match(/content-type:\s*([^\r\n;]+)/i) || [])[1] || '';
    const mime = sniffImageMime(bytes, declared);
    if (!mime) throw new Error('Não é imagem');
    return new Blob([bytes], { type: mime });
  }

  async function blobToBitmapCanvas(blob, maxSide, className) {
    let bitmap = null;
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(blob); } catch { bitmap = null; }
    }
    if (!bitmap) {
      const url = URL.createObjectURL(blob);
      try {
        bitmap = await new Promise((resolve, reject) => {
          const img = new Image(); img.decoding = 'async';
          img.onload = () => resolve(img); img.onerror = () => reject(new Error('Imagem não decodificou'));
          img.src = url;
        });
      } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
    }
    const sw = bitmap.width || bitmap.naturalWidth, sh = bitmap.height || bitmap.naturalHeight;
    if (!sw || !sh) throw new Error('Imagem sem dimensões');
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
    canvas.className = className;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    try { bitmap.close?.(); } catch {}
    return canvas;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler a imagem'));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/i.exec(String(dataUrl || ''));
    if (!match) throw new Error('data URL inválida');
    const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  }

  function logoSources(key) {
    const host = encodeURIComponent(key);
    return [
      `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${key}`)}&size=128`,
      `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `https://${key}/apple-touch-icon.png`,
      `https://${key}/favicon.ico`,
    ];
  }

  function readLogoCache(key) {
    try {
      const raw = localStorage.getItem(LOGO.prefix + key); if (!raw) return '';
      const { t, d } = JSON.parse(raw);
      if (!d || Date.now() - Number(t || 0) > LOGO.ttl) { localStorage.removeItem(LOGO.prefix + key); return ''; }
      return d;
    } catch { return ''; }
  }

  function writeLogoCache(key, dataUrl) {
    if (dataUrl.length > 90000) return;
    try { localStorage.setItem(LOGO.prefix + key, JSON.stringify({ t: Date.now(), d: dataUrl })); } catch {}
  }

  async function fetchSiteLogo(key) {
    if (LOGO.mem.has(key)) return LOGO.mem.get(key);
    const cached = readLogoCache(key);
    if (cached) { LOGO.mem.set(key, cached); return cached; }
    if (LOGO.pending.has(key)) return LOGO.pending.get(key);
    const job = (async () => {
      for (const url of logoSources(key)) {
        try {
          const response = await gmImageRequest(url, { Accept: 'image/png,image/*;q=0.8,*/*;q=0.5' }, 12000);
          const blob = await responseToImageBlob(response);
          if (blob.size < 80 || blob.size > 200000) continue;
          const dataUrl = await blobToDataUrl(blob);
          LOGO.mem.set(key, dataUrl); writeLogoCache(key, dataUrl);
          return dataUrl;
        } catch (error) { }
      }
      LOGO.mem.set(key, '');
      return '';
    })();
    LOGO.pending.set(key, job);
    try { return await job; } finally { LOGO.pending.delete(key); }
  }

  async function paintSiteLogo(el) {
    const key = el.getAttribute('data-vdd-logo'); if (!key || el.dataset.vddLogoState) return;
    el.dataset.vddLogoState = 'loading';
    try {
      const dataUrl = await fetchSiteLogo(key);
      if (!dataUrl || !el.isConnected) { el.dataset.vddLogoState = dataUrl ? '' : 'failed'; return; }
      const canvas = await blobToBitmapCanvas(dataUrlToBlob(dataUrl), 96, `${el.getAttribute('class') || 'vdd-site'} vdd-site-logo`.replace(/\s+/g, ' '));
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', key); canvas.dataset.vddLogoState = 'done';
      if (el.isConnected) el.replaceWith(canvas);
    } catch (error) { el.dataset.vddLogoState = 'failed'; }
  }

  function hydrateSiteLogos(scope) {
    const root = scope && scope.querySelectorAll ? scope : document.getElementById('vdd-root'); if (!root) return;
    const nodes = [];
    if (root.matches?.('[data-vdd-logo]')) nodes.push(root);
    nodes.push(...root.querySelectorAll('[data-vdd-logo]'));
    for (const node of nodes) if (!node.dataset.vddLogoState) paintSiteLogo(node);
  }

  function installLogoObserver() {
    if (LOGO.observer) return;
    const root = document.getElementById('vdd-root'); if (!root) return;
    let queued = false;
    LOGO.observer = new MutationObserver(() => {
      if (queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; hydrateSiteLogos(root); });
    });
    LOGO.observer.observe(root, { childList: true, subtree: true });
    hydrateSiteLogos(root);
  }

  function runImageSlot(task) {
    return new Promise((resolve, reject) => {
      const run = () => { IMG_NET.active++; task().then(resolve, reject).finally(() => { IMG_NET.active--; const next = IMG_NET.queue.shift(); if (next) next(); }); };
      if (IMG_NET.active < IMG_NET.max) run(); else IMG_NET.queue.push(run);
    });
  }

  function thumbRefererCandidates(url, pageUrl) {
    const list = [];
    const platform = (() => { try { return platformHostInfo(url)?.referer || ''; } catch { return ''; } })();
    if (platform) list.push(platform);
    const page = safeHttpUrl(pageUrl || '');
    if (page) list.push(page);
    const own = originOf(url); if (own) list.push(`${own}/`);
    list.push('');
    return [...new Set(list)];
  }

  async function loadThumbBlob(url, pageUrl) {
    if (/^data:image\//i.test(url)) return dataUrlToBlob(url);
    let lastError = null;
    for (const referer of thumbRefererCandidates(url, pageUrl)) {
      try {
        const headers = { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5' };
        if (referer) headers.Referer = referer;
        const response = await gmImageRequest(url, headers, 20000);
        return await responseToImageBlob(response);
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Miniatura indisponível');
  }

  function plainImageFallback(thumb, url, policy) {
    return new Promise(resolve => {
      const img = document.createElement('img');
      img.alt = ''; img.decoding = 'async'; img.referrerPolicy = policy;
      img.addEventListener('load', () => { thumb.classList.add('has-image'); thumb.dataset.state = 'loaded'; resolve(true); }, { once: true });
      img.addEventListener('error', () => { img.remove(); resolve(false); }, { once: true });
      img.src = url;
      thumb.prepend(img);
    });
  }

  function normalizeThumbUrl(value) {
    const text = String(value || '').trim().replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (/^data:image\//i.test(text)) return text;
    return safeHttpUrl(text) || '';
  }

  async function loadThumbInto(thumb, rawUrl, pageUrl = '') {
    const url = normalizeThumbUrl(rawUrl); if (!url) { thumb.dataset.state = 'failed'; return false; }
    if (thumb.dataset.state === 'loading' || thumb.dataset.state === 'loaded') return thumb.dataset.state === 'loaded';
    thumb.dataset.state = 'loading';
    const token = String(Date.now() + Math.random()); thumb.dataset.token = token;
    const stale = () => thumb.dataset.token !== token || !thumb.isConnected;
    try {
      const blob = await (IMG_NET.cache.get(url) || (() => { const p = runImageSlot(() => loadThumbBlob(url, pageUrl)); IMG_NET.cache.set(url, p); p.catch(() => IMG_NET.cache.delete(url)); if (IMG_NET.cache.size > 80) IMG_NET.cache.delete(IMG_NET.cache.keys().next().value); return p; })());
      if (stale()) { thumb.dataset.state = ''; return false; }
      const canvas = await blobToBitmapCanvas(blob, 480, 'vdd-thumb-canvas');
      if (stale()) { thumb.dataset.state = ''; return false; }
      thumb.prepend(canvas); thumb.classList.add('has-image'); thumb.dataset.state = 'loaded';
      return true;
    } catch (error) {
      if (stale()) { thumb.dataset.state = ''; return false; }
      console.info('[VDD] Miniatura via gerenciador falhou; tentando <img> direto:', scrubText(url), error?.message || error);
    }
    if (await plainImageFallback(thumb, url, 'no-referrer')) return true;
    if (stale()) { thumb.dataset.state = ''; return false; }
    if (await plainImageFallback(thumb, url, 'strict-origin-when-cross-origin')) return true;
    thumb.dataset.state = 'failed';
    return false;
  }

  function resetThumb(thumb) {
    for (const node of thumb.querySelectorAll('img, canvas.vdd-thumb-canvas')) { if (node.tagName === 'IMG') node.removeAttribute('src'); node.remove(); }
    thumb.classList.remove('has-image'); thumb.dataset.state = ''; delete thumb.dataset.token;
  }

  const ERRLOG = { items: [], max: 25 };
  function scrubText(text) { return String(text || '').replace(/(https?:\/\/[^\s"'<>?#]+)[?#]\S*/g, '$1?…').slice(0, 320); }
  function recordIssue(error) {
    try {
      const code = String(error?.code || ''); if (!code || code === 'MEDIA_CANCELLED') return;
      const last = ERRLOG.items[ERRLOG.items.length - 1], message = scrubText(error?.message);
      if (last && last.code === code && last.message === message && Date.now() - last.at < 4000) return;
      ERRLOG.items.push({ at: Date.now(), code, status: Number(error?.status || error?.cause?.status || 0), message });
      if (ERRLOG.items.length > ERRLOG.max) ERRLOG.items.shift();
    } catch {}
  }
  const DIAG_TIPS = [
    [/SEGMENT_REFUSED|RENEW_SAME|RENEW_FAILED/, 'O servidor entrega a playlist, mas recusa os segmentos fora do player.', ['Abra a página do vídeo, toque em “Abrir a página e usar Nesta página”.', 'Se tiver o Worker v3 com o site em ALLOWED_HOSTS, ele é tentado automaticamente.', 'Se o Worker também for recusado, o site só libera dentro do player; não há correção segura.']],
    [/RENEW_GONE|FILE_GONE/, 'O arquivo expirou ou foi removido.', ['Faça uma nova busca pelo link para obter uma URL nova.', 'Se continuar, o vídeo pode ter sido apagado.']],
    [/AUDIO_MISSING/, 'O vídeo foi lido, mas o script não conseguiu extrair o áudio dele.', ['Leia o “Detalhe técnico” na mensagem: ele diz quais codecs o stream tem.', 'Se o áudio vem em outra playlist, escolha “Playlist principal” ou outra qualidade.', 'Se o codec for AC-3/E-AC-3, o conversor local não suporta (AAC e MP3 são suportados); tente baixar por outro arquivo (MP4) se a página oferecer.', 'Copie o relatório e envie para análise.']],
    [/HTML/, 'A opção apontava para uma página HTML, não para vídeo.', ['Cole o link da página em “Por link” para o script achar o vídeo.']],
    [/JSON/, 'A fonte devolveu dados em vez de vídeo.', ['Cole o link da página do vídeo, não o de uma API.']],
    [/PROXY_|WORKER/, 'O Worker respondeu com erro.', ['Use “Testar Worker” abaixo.', 'Confira LINK_PROXY, ALLOWED_HOSTS e TOKEN_KEY.', 'Se definiu SECRET, ponha a mesma senha em LINK_PROXY_KEY.']],
    [/MANUAL|SAVE/, 'O navegador não permitiu salvar automaticamente.', ['Use o botão para abrir/salvar manualmente.', 'No iPhone, salve pelo menu Compartilhar do Safari.']],
  ];
  function tipsFor(issue) {
    const hit = DIAG_TIPS.find(([rx]) => rx.test(issue.code));
    if (hit) return { why: hit[1], steps: hit[2] };
    const s = issue.status;
    if (s === 429) return { why: 'O servidor limitou as requisições.', steps: ['Espere alguns minutos e tente de novo.'] };
    if (s === 401 || s === 403) return { why: 'O servidor recusou o acesso (login, região, sessão ou proteção contra download direto).', steps: ['Entre no site e reproduza o vídeo, depois use “Nesta página”.', 'Respeite os termos do site: o OPTDOWNS não contorna login nem proteção.'] };
    if (s === 404 || s === 410) return { why: 'O endereço expirou ou não existe mais.', steps: ['Busque o link de novo para renovar o endereço.'] };
    if (s >= 500) return { why: 'O servidor de origem falhou.', steps: ['Tente novamente mais tarde.'] };
    return { why: 'Falha sem causa específica registrada.', steps: ['Copie o relatório e envie para análise.'] };
  }
  async function workerProbe() {
    const base = String(LINK_PROXY || '').replace(/\/+$/, '');
    if (!base) return { s: 'warn', label: 'Worker', detail: 'LINK_PROXY está vazio: o fallback por servidor está desligado.', fix: 'Opcional. Preencha LINK_PROXY para usar o TikTok e o modo multi-site.' };
    const started = Date.now();
    try {
      const response = await fetch(`${base}/info`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(9000) });
      let body = null; try { body = await response.json(); } catch {}
      const ms = Date.now() - started;
      if (body?.code === 'BAD_URL') return { s: 'ok', label: 'Worker', detail: `Worker v3 (multi-site) respondeu em ${ms} ms.${LINK_PROXY_GENERIC ? '' : ' LINK_PROXY_GENERIC está desligado no script.'}` };
      if (body?.code === 'BAD_KEY') return { s: 'warn', label: 'Worker', detail: 'O Worker está no ar, mas exige a chave.', fix: 'Defina LINK_PROXY_KEY com o mesmo valor de SECRET.' };
      if (body?.code === 'NO_ROUTE' || response.status === 404) return { s: 'warn', label: 'Worker', detail: `Worker antigo (só TikTok) respondeu em ${ms} ms.`, fix: 'Publique worker_3.js para habilitar outros sites.' };
      return { s: 'warn', label: 'Worker', detail: `Resposta inesperada (HTTP ${response.status}).`, fix: 'Confira se LINK_PROXY aponta para o seu Worker.' };
    } catch (error) {
      return { s: 'bad', label: 'Worker', detail: error?.name === 'TimeoutError' ? 'Sem resposta em 9 s.' : 'Não foi possível falar com o Worker (rede ou CORS).', fix: 'Confira a URL em LINK_PROXY e se o Worker está publicado.' };
    }
  }
  async function collectDiagnostics({ withWorker = true } = {}) {
    const checks = [];
    const add = (s, label, detail, fix) => checks.push({ s, label, detail, fix });
    add(getGmXhr() ? 'ok' : 'bad', 'Gerenciador de scripts', getGmXhr() ? 'GM_xmlhttpRequest disponível: downloads entre sites funcionam.' : 'GM_xmlhttpRequest ausente: só há acesso às origens que a página permite (CORS).', getGmXhr() ? '' : 'Instale pelo Tampermonkey/Userscripts e permita a conexão com todos os domínios (@connect *).');
    const mux = Boolean(globalThis.muxjs || window.muxjs);
    add(mux ? 'ok' : 'bad', 'mux.js (HLS → MP4)', mux ? 'Biblioteca carregada.' : 'mux.js não carregou: downloads HLS não podem ser convertidos.', mux ? '' : 'Reinstale o script com internet ligada e confirme que unpkg.com não está bloqueado.');
    add(typeof IntersectionObserver === 'function' ? 'ok' : 'warn', 'Rolagem progressiva', typeof IntersectionObserver === 'function' ? 'IntersectionObserver ativo.' : 'Sem IntersectionObserver: usando verificação por rolagem (mais lenta).');
    let ls = false; try { localStorage.setItem('optdowns.t', '1'); localStorage.removeItem('optdowns.t'); ls = true; } catch {}
    add(ls ? 'ok' : 'warn', 'Armazenamento local', ls ? 'Recentes e preferências podem ser salvos.' : 'Bloqueado (modo privado?). “Recentes” não será salvo.');
    add(getGmDownload() || isAppleMobileBrowser() ? 'ok' : 'warn', 'Salvamento', isAppleMobileBrowser() ? 'Safari/iOS: o arquivo vai para Downloads/Compartilhar.' : (getGmDownload() ? 'GM_download disponível.' : 'Sem GM_download: salvamento via navegador.'));
    const found = new Set([...APP.hlsUrls, ...APP.directUrls]).size;
    add('ok', 'Esta página', `${found} endereço(s) de mídia detectado(s).${found ? '' : ' Inicie a reprodução e toque em atualizar.'}`);
    if (withWorker) { const w = await workerProbe(); add(w.s, w.label, w.detail, w.fix); }
    const issues = ERRLOG.items.slice().reverse();
    add(issues.length ? 'warn' : 'ok', 'Erros desta sessão', issues.length ? `${issues.length} registrado(s). Veja abaixo as causas e sugestões.` : 'Nenhum erro de download registrado.');
    return { checks, issues };
  }
  function diagnosticsReport(data) {
    const lines = [`OPTDOWNS ${SCRIPT_VERSION} · ${new Date().toLocaleString('pt-BR')}`, `Página: ${location.origin}${location.pathname}`, ''];
    for (const c of data.checks) lines.push(`[${c.s.toUpperCase()}] ${c.label}: ${c.detail}${c.fix ? ` → ${c.fix}` : ''}`);
    if (data.issues.length) { lines.push('', 'Erros:'); for (const i of data.issues) lines.push(`- ${new Date(i.at).toLocaleTimeString('pt-BR')} ${i.code}${i.status ? ` (HTTP ${i.status})` : ''}: ${i.message}`); }
    return lines.join('\n');
  }
  function renderDiagnostics(data) {
    const host = document.getElementById('vdd-diag-out'); if (!host) return;
    const icon = { ok: 'check', warn: 'alert', bad: 'x' };
    const parts = data.checks.map(c => `<div class="vdd-check" data-s="${c.s}">${ic(icon[c.s])}<div><b>${escapeHtml(c.label)}</b><p>${escapeHtml(c.detail)}</p>${c.fix ? `<p class="fix">${escapeHtml(c.fix)}</p>` : ''}</div></div>`);
    if (data.issues.length) {
      parts.push('<div class="vdd-section">Erros e sugestões</div>');
      for (const issue of data.issues.slice(0, 8)) {
        const tip = tipsFor(issue);
        parts.push(`<div class="vdd-check" data-s="bad">${ic('alert')}<div><b>${escapeHtml(issue.code)}${issue.status ? ` · HTTP ${issue.status}` : ''}</b><p>${escapeHtml(issue.message)}</p><p>${escapeHtml(tip.why)}</p>${tip.steps.map(step => `<p class="fix">• ${escapeHtml(step)}</p>`).join('')}</div></div>`);
      }
    }
    host.innerHTML = parts.join('');
    APP.lastDiag = data;
  }
  async function runDiagnostics() {
    const button = document.getElementById('vdd-diag-run'), out = document.getElementById('vdd-diag-out');
    if (!button || button.disabled) return;
    button.disabled = true; out.innerHTML = '<div class="vdd-check" data-s="warn">' + ic('pulse') + '<div><b>Verificando…</b><p>Testando o ambiente e o Worker.</p></div></div>';
    try { renderDiagnostics(await collectDiagnostics()); }
    catch (error) { out.innerHTML = `<div class="vdd-check" data-s="bad">${ic('x')}<div><b>O diagnóstico falhou</b><p>${escapeHtml(scrubText(error?.message))}</p></div></div>`; }
    finally { button.disabled = false; }
  }
  function applySafeFixes() {
    let cleared = 0;
    for (const cache of [typeof listingCache !== 'undefined' ? listingCache : null, typeof linkPageCache !== 'undefined' ? linkPageCache : null]) if (cache?.clear) { cleared += cache.size || 0; cache.clear(); }
    try { APP.dropped?.clear?.(); } catch {}
    ERRLOG.items.length = 0;
    try { scanAll(); } catch {}
    toast(cleared ? `Caches limpos (${cleared}). Varredura refeita.` : 'Estado limpo. Varredura refeita.', 3200);
    runDiagnostics();
  }
  async function copyDiagnostics() {
    const data = APP.lastDiag || await collectDiagnostics({ withWorker: false });
    const text = diagnosticsReport(data);
    try { await navigator.clipboard.writeText(text); toast('Relatório copiado'); }
    catch { const area = document.createElement('textarea'); area.value = text; area.style.cssText = 'position:fixed;opacity:0;font-size:16px'; document.body.appendChild(area); area.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} area.remove(); toast(ok ? 'Relatório copiado' : 'Não consegui copiar; selecione o texto manualmente.'); }
  }

  const SOURCE_TILES = Object.freeze([
    { id: 'tiktok', title: 'TikTok', hint: 'Link público de um vídeo', example: 'https://www.tiktok.com/@usuario/video/…', icon: () => siteIcon('https://www.tiktok.com/', 'big') },
    { id: 'instagram', title: 'Instagram', hint: 'Reels e posts públicos', example: 'https://www.instagram.com/reel/…', icon: () => siteIcon('https://www.instagram.com/', 'big') },
    { id: 'file', title: 'Arquivo de vídeo', hint: 'Link direto .mp4, .webm, .mov', example: 'https://site.com/video.mp4', icon: () => `<span class="vdd-glyph">${ic('film')}</span>` },
    { id: 'hls', title: 'Playlist HLS', hint: 'Endereço .m3u8 sem DRM', example: 'https://site.com/video/index.m3u8', icon: () => `<span class="vdd-glyph">${ic('stream')}</span>` },
    { id: 'page', title: 'Página com vídeos', hint: 'Lista os vídeos em cards', example: 'https://site.com/categoria/videos', icon: () => `<span class="vdd-glyph">${ic('doc')}</span>` },
    { id: 'any', title: 'Qualquer link', hint: 'O script identifica o tipo', example: 'Cole um link de vídeo ou de página', icon: () => `<span class="vdd-glyph">${ic('sites')}</span>` },
  ]);
  const RECENT_KEY = 'optdowns.recent.v1';
  function readRecents() { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 8) : []; } catch { return []; } }
  function rememberLink(url) {
    const clean = String(url || '').trim(); if (!/^https?:\/\//i.test(clean)) return;
    let list = readRecents().filter(x => x !== clean); list.unshift(clean); list = list.slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
    renderRecents();
  }
  function renderRecents() {
    const host = document.getElementById('vdd-recents'); if (!host) return;
    const list = readRecents();
    host.hidden = !list.length;
    host.innerHTML = list.length ? `<div class="vdd-row-head"><div class="vdd-section">Recentes</div><button type="button" class="vdd-text-btn" id="vdd-recents-clear">Limpar</button></div>${list.map((url, i) => `<button type="button" class="vdd-recent" data-i="${i}">${siteIcon(url)}<span>${escapeHtml(scrubText(url).replace(/^https?:\/\/(www\.)?/, ''))}</span></button>`).join('')}` : '';
  }
  function searchFromSites(url) {
    const input = document.getElementById('vdd-link-input'); if (!input) return;
    input.value = url; syncInputClear(input); switchTab('link'); handleLinkSearch();
  }

  const BOOT = { done: false };
  function runBootScreen() {
    if (BOOT.done) return; BOOT.done = true;
    const boot = document.getElementById('vdd-boot'); if (!boot) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let first = false; const flag = `optdowns.installed.${SCRIPT_VERSION}`;
    try { first = !localStorage.getItem(flag); localStorage.setItem(flag, '1'); } catch {}
    const title = boot.querySelector('h2'), line = boot.querySelector('p'), bar = boot.querySelector('.vdd-boot-bar i');
    title.textContent = first ? 'Instalação concluída' : 'Iniciando OPTDOWNS';
    boot.hidden = false;
    const steps = [
      ['Verificando o gerenciador de scripts…', () => (getGmXhr() ? 'Gerenciador pronto' : 'Sem GM_xmlhttpRequest: modo limitado')],
      ['Carregando o conversor de vídeo…', () => ((globalThis.muxjs || window.muxjs) ? 'Conversor HLS pronto' : 'mux.js ausente: HLS indisponível')],
      ['Procurando vídeos na página…', () => { try { scanAll(); } catch {} return 'Pronto'; }],
    ];
    const total = reduced ? 0 : (first ? 520 : 300);
    let i = 0;
    const next = () => {
      if (i >= steps.length) { bar.style.width = '100%'; setTimeout(() => { boot.hidden = true; }, reduced ? 0 : 280); return; }
      const [text, run] = steps[i++]; line.textContent = text; bar.style.width = `${Math.round((i / (steps.length + 1)) * 100)}%`;
      setTimeout(() => { try { line.textContent = run(); } catch {} setTimeout(next, total / 2); }, total / 2);
    };
    next();
  }

  function installInteractionFx(root) {
    root.addEventListener('pointerdown', event => {
      const target = event.target.closest?.('.vdd-btn, .vdd-link-btn, .vdd-primary, .vdd-tile, .vdd-chip, .vdd-quality-refresh');
      if (!target || target.disabled || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      const rect = target.getBoundingClientRect(), size = Math.max(rect.width, rect.height) * 2;
      const dot = document.createElement('span'); dot.className = 'vdd-ripple';
      dot.style.cssText = `width:${size}px;height:${size}px;left:${event.clientX - rect.left - size / 2}px;top:${event.clientY - rect.top - size / 2}px`;
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
      target.style.overflow = 'hidden'; target.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
    }, { passive: true });
    document.addEventListener('visibilitychange', () => root.classList.toggle('vdd-paused', document.hidden), { passive: true });
  }

  function setResolutionChips(card, heights, selected = null, onPick = null) {
    const host = card.querySelector('.vdd-res'); if (!host) return;
    const list = [...new Set(heights.filter(h => Number(h) > 0).map(Number))].sort((a, b) => b - a);
    host.hidden = !list.length; host.replaceChildren();
    for (const h of list) {
      const el = document.createElement(onPick ? 'button' : 'span'); if (onPick) el.type = 'button';
      el.className = `vdd-chip${h === selected ? ' on' : ''}`; el.textContent = `${h}p`; el.dataset.h = String(h);
      if (onPick) { el.setAttribute('aria-label', `Escolher ${h}p`); el.addEventListener('click', () => onPick(h)); }
      host.appendChild(el);
    }
  }

  function start() {
    buildUi();
    installLogoObserver();
    installPerformanceObserver();
    installDomObserver();
    scanAll();
    document.addEventListener('loadedmetadata', onVideoEvent, true);
    document.addEventListener('play', onVideoEvent, true);
    watchNavigation();
    runHandoff();
  }

  installMainWorldNetworkBridge();
  installNetworkHooks();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  if (typeof globalThis.__OPTDOWNS_TEST_HOOK__ === 'function') {
    globalThis.__OPTDOWNS_TEST_HOOK__({ APP, DISCOVERY, LISTING, mediaRequest, mediaTransportModes, isAnonymousContext, wantsSession, isSessionLinkItem,
      classifyVideoAnchor, extractPageVideoEntries, resolveLinkOrListing, resolveListingEntry, mountLinkListing, teardownLinkListing, listingCache,
      resolvePublicLink, inspectHlsChoices, resolveHlsPlaylist, preflightHlsSegments, entryUrlKey, siteKeyOf, linkPageCache, handleLinkSearch,
      renderLinkResults, openListingEntry, downloadHlsAsMp4, createMediaCard, fetchCredentialsFor, hlsTraceOf, handoffUrl, runHandoff, showTraceToggle,
      downloadPublicItem, canTryLinkWorker, fetchWorkerInfo,
      describeCodecs, describeVideoCodec, describeAudioCodec, hlsCodecNote, hlsChoiceLabel, formatFps, describeMp4Moov, formatFileInfo, mergeOutputStats,
      HLS_PREFETCH, hlsPrefetchWindow, scheduleHlsPrefetch, readSegmentBytesPrefetched, DL_QUEUE, dlQueuePush, dlQueueRemove, dlQueueNext, dlQueueRefresh, isoBoxes,
      ic, siteIcon, ICON_PATHS, ERRLOG, recordIssue, tipsFor, collectDiagnostics, runDiagnostics, applySafeFixes, setResolutionChips, SOURCE_TILES, switchTab, runBootScreen, rememberLink, readRecents });
  }
})();
