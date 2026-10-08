// StreetMaps: barra de música (Spotify com controlo, Apple Music por atalho)
(() => {
"use strict";
const CFG = window.STREETMAPS_CONFIG || {};
const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("sm:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { v == null ? localStorage.removeItem("sm:" + k) : localStorage.setItem("sm:" + k, JSON.stringify(v)); } catch {} },
};
function say(t) { const el = $("toast"); if (!el) return; el.textContent = t; el.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => el.hidden = true, 2800); }

const CLIENT_ID = CFG.spotifyClientId || "";
const REDIRECT = location.origin + location.pathname;
const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing";
let tok = store.get("spotify", null); // {access, refresh, exp}
let state = null;                     // last /me/player answer

// ---------- Spotify login (PKCE, no server needed) ----------
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function login() {
  if (!CLIENT_ID) { say("Falta configurar o Spotify na app (Client ID)."); return; }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  sessionStorage.setItem("sm:pkce", verifier);
  const q = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT, scope: SCOPES, code_challenge_method: "S256", code_challenge: challenge });
  location.href = "https://accounts.spotify.com/authorize?" + q;
}
async function tokenRequest(body) {
  const res = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, ...body }) });
  if (!res.ok) throw new Error("spotify token " + res.status);
  const j = await res.json();
  tok = { access: j.access_token, refresh: j.refresh_token || tok?.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 };
  store.set("spotify", tok);
}
async function finishLogin() {
  const p = new URLSearchParams(location.search);
  if (!p.has("code") && !p.has("error")) return;
  const code = p.get("code"), verifier = sessionStorage.getItem("sm:pkce");
  history.replaceState(null, "", REDIRECT);
  if (!code || !verifier) { say("Ligação ao Spotify cancelada."); return; }
  try { await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier }); say("Spotify ligado"); }
  catch (e) { console.warn(e); say("Não foi possível ligar ao Spotify. Tenta outra vez."); }
  sessionStorage.removeItem("sm:pkce");
}
async function api(method, path, body) {
  if (!tok) return null;
  if (Date.now() > tok.exp) { try { await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh }); } catch { logout(); return null; } }
  const res = await fetch("https://api.spotify.com/v1" + path, { method, headers: { Authorization: "Bearer " + tok.access, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { logout(); return null; }
  if (res.status === 403) { say("Controlar a música precisa de Spotify Premium."); return null; }
  if (res.status === 404) { say("Abre o Spotify no telemóvel e põe uma música a tocar."); return null; }
  return res.status === 204 || res.headers.get("content-length") === "0" ? {} : res.json().catch(() => ({}));
}
function logout() { tok = null; state = null; store.set("spotify", null); render(); }

async function poll() {
  if (!tok || document.hidden) return;
  try { state = await api("GET", "/me/player") || null; } catch (e) { console.warn(e); }
  render();
}
async function control(action) {
  const map = { play: ["PUT", "/me/player/play"], pause: ["PUT", "/me/player/pause"], next: ["POST", "/me/player/next"], prev: ["POST", "/me/player/previous"] };
  const [m, p] = map[action]; await api(m, p); setTimeout(poll, 400);
}

// ---------- UI ----------
function render() {
  const chip = $("musicChip"), panel = $("musicPanel");
  const item = state?.item, playing = !!state?.is_playing;
  const art = item?.album?.images?.slice(-1)[0]?.url;
  chip.classList.toggle("on", !!item);
  chip.innerHTML = item
    ? `${art ? `<img src="${esc(art)}" alt="">` : ""}<span class="mt">${esc(item.name)}</span><span class="ma">${esc((item.artists || []).map(a => a.name).join(", "))}</span><span class="eq${playing ? " go" : ""}"><i></i><i></i><i></i></span>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg><span class="mt">Música</span>`;
  if (panel.hidden) return;
  if (tok) {
    panel.innerHTML = `<div class="mnow">${item ? `${art ? `<img src="${esc(item.album.images[0].url)}" alt="">` : ""}<div><b>${esc(item.name)}</b><span>${esc((item.artists || []).map(a => a.name).join(", "))}</span></div>` : `<div><b>Nada a tocar</b><span>Põe uma música a tocar no Spotify</span></div>`}</div>
      <div class="mctl"><button data-m="prev" aria-label="Anterior">⏮</button><button data-m="${playing ? "pause" : "play"}" class="pp" aria-label="${playing ? "Pausa" : "Tocar"}">${playing ? "⏸" : "▶"}</button><button data-m="next" aria-label="Seguinte">⏭</button></div>
      <div class="formrow"><a class="pill small" href="spotify:" >Abrir Spotify</a><button class="pill small" data-m="logout">Desligar</button></div>`;
  } else {
    panel.innerHTML = `<p class="hint">Liga a tua conta para veres o que está a tocar e mudares de música sem sair do mapa.</p>
      <button class="mbtn spotify" data-m="login"><span class="dot"></span>Ligar Spotify</button>
      <a class="mbtn apple" href="music://"><span class="dot"></span>Abrir Apple Music</a>
      <p class="hint small">Os controlos do Spotify precisam de Premium. O Apple Music abre a app (a Apple não deixa controlar a música a partir de sites).</p>`;
  }
}
document.addEventListener("click", e => {
  const chip = e.target.closest("#musicChip"), panel = $("musicPanel");
  if (chip) { panel.hidden = !panel.hidden; render(); if (!panel.hidden) poll(); return; }
  const b = e.target.closest("#musicPanel [data-m]");
  if (b) {
    const m = b.dataset.m;
    if (m === "login") login(); else if (m === "logout") logout(); else control(m);
    return;
  }
  if (!e.target.closest("#musicPanel")) panel.hidden = true;
});

finishLogin().then(() => { render(); poll(); });
setInterval(poll, 5000);
document.addEventListener("visibilitychange", poll);
})();
