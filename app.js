(() => {
"use strict";
const CFG = Object.assign({
  supabaseUrl: "",
  supabaseAnonKey: "",
  mapStyle: "https://tiles.openfreemap.org/styles/dark",
  fallbackStyle: "https://tiles.openfreemap.org/styles/positron",
  shareEverySeconds: 3,
  homeRadiusMeters: 500,
}, window.STREETMAPS_CONFIG || {});

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("sm:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("sm:" + k, JSON.stringify(v)); } catch {} },
};
const CREW_COLORS = ["#3fd0ff","#ff5ac8","#9d7bff","#7ee0a0","#4f8cff","#e0e6f2","#ff4d5e","#ffc23d"];
function crewColor(crew) { if (!crew) return "#e0e6f2"; let h = 0; for (const c of crew) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CREW_COLORS[h % CREW_COLORS.length]; }
function distM(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const toR = Math.PI / 180, y = Math.sin((b.lng - a.lng) * toR) * Math.cos(b.lat * toR);
  const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lng - a.lng) * toR);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + " m" : (m / 1000).toFixed(1) + " km"; }
function fmtWhen(iso) { const d = new Date(iso); return isNaN(d) ? "Data por marcar" : d.toLocaleString("pt-PT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
let toastT; function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2800); }

// ---------------- state ----------------
const LISBOA = { lat: 38.7223, lng: -9.1393 };
const S = {
  uid: null,
  me: null,            // {lat,lng}
  heading: null,
  speedKmh: 0,
  follow: true,
  ghost: store.get("ghost", false),
  home: store.get("home", null),
  profile: store.get("profile", null),
  drivers: new Map(),  // id -> {id,nick,car,crew,hp,mods,lat,lng,heading,seen}
  profiles: [],
  events: [],
  reports: [],
  filter: "all",
  pick: false,
  pickPos: null,
};

// ---------------- backend: Supabase or demo ----------------
function supabaseBackend() {
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  let posChannel = null;
  const api = {
    mode: "online",
    async init() {
      let { data: { session } } = await sb.auth.getSession();
      if (!session) {
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      return session.user.id;
    },
    async getProfiles() { const { data, error } = await sb.from("profiles").select("*"); if (error) throw error; return data; },
    async saveProfile(p) { const { error } = await sb.from("profiles").upsert({ id: S.uid, ...p, updated_at: new Date().toISOString() }); if (error) throw error; },
    async getEvents() {
      const since = new Date(Date.now() - 6 * 3600e3).toISOString();
      const { data, error } = await sb.from("events").select("*, rsvps(user_id)").gte("starts_at", since).order("starts_at");
      if (error) throw error;
      return data.map(e => ({ ...e, going: (e.rsvps || []).map(r => r.user_id) }));
    },
    async createEvent(e) { const { error } = await sb.from("events").insert({ ...e, created_by: S.uid }); if (error) throw error; },
    async deleteEvent(id) { const { error } = await sb.from("events").delete().eq("id", id); if (error) throw error; },
    async setRsvp(eventId, on) {
      const q = on ? sb.from("rsvps").insert({ event_id: eventId, user_id: S.uid }) : sb.from("rsvps").delete().eq("event_id", eventId).eq("user_id", S.uid);
      const { error } = await q; if (error) throw error;
    },
    async getReports() {
      const since = new Date(Date.now() - 2 * 3600e3).toISOString();
      const { data, error } = await sb.from("reports").select("*").gte("created_at", since);
      if (error) throw error; return data;
    },
    async createReport(r) { const { error } = await sb.from("reports").insert({ ...r, created_by: S.uid }); if (error) throw error; },
    onChanges(cb) {
      sb.channel("db-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => cb("events"))
        .on("postgres_changes", { event: "*", schema: "public", table: "rsvps" }, () => cb("events"))
        .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => cb("reports"))
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => cb("profiles"))
        .subscribe();
    },
    onDriver(cb) {
      posChannel = sb.channel("drivers", { config: { broadcast: { self: false } } });
      posChannel.on("broadcast", { event: "pos" }, ({ payload }) => cb(payload)).subscribe();
    },
    sendPosition(payload) { posChannel?.send({ type: "broadcast", event: "pos", payload }); },
  };
  return api;
}

function demoBackend() {
  const BOTS = [
    ["Rui_EK9","Honda Civic Type R EK9","Margem Sul Tuners",185,["B16B","Coilovers BC"]],
    ["Inês.MX5","Mazda MX-5 NA","Stance Lisboa",130,["Rebaixada","Enkei 15\""]],
    ["TiagoE36","BMW 328i E36","Drift Lab PT",230,["Diferencial soldado","Bucket Bride"]],
    ["Marta_S14","Nissan Silvia S14","Drift Lab PT",310,["SR20DET","Turbo GT28"]],
    ["Zé205","Peugeot 205 GTI 1.9","Clássicos da Linha",128,["Escape Devil","Bilstein"]],
    ["Gonçalo_GC8","Subaru Impreza WRX GC8","Rally Spirit",280,["Stage 2","Intercooler frontal"]],
    ["Ana86","Toyota GT86","Stance Lisboa",220,["Air lift","Rocket Bunny"]],
    ["CupraNuno","Seat Leon Cupra R","VAG Nation PT",330,["Stage 2+","Downpipe"]],
    ["Kika_Supra","Toyota Supra MK4","JDM Porto",450,["2JZ single turbo","Volk TE37"]],
    ["Pedro_Mk2","VW Golf GTI Mk2","VAG Nation PT",140,["16V","BBS RS"]],
  ];
  let bots = [], cbDriver = null;
  function seedBots(center) {
    bots = BOTS.map((b, i) => ({ id: "demo-" + i, nick: b[0], car: b[1], crew: b[2], hp: b[3], mods: b[4],
      lat: center.lat + (Math.random() - .5) * .04, lng: center.lng + (Math.random() - .5) * .05,
      heading: Math.random() * 360, v: 8 + Math.random() * 6 }));
  }
  setInterval(() => {
    if (!bots.length && S.me) seedBots(S.me);
    if (!bots.length) seedBots(LISBOA);
    for (const b of bots) {
      b.heading = (b.heading + (Math.random() - .5) * 40 + 360) % 360;
      const d = b.v * 2, r = b.heading * Math.PI / 180;
      b.lat += Math.cos(r) * d / 111320;
      b.lng += Math.sin(r) * d / (111320 * Math.cos(b.lat * Math.PI / 180));
      cbDriver?.({ ...b });
    }
  }, 2000);
  const key = k => "demo:" + k;
  return {
    mode: "demo",
    async init() { let id = store.get("demo:uid"); if (!id) { id = "me-" + Math.random().toString(36).slice(2); store.set("demo:uid", id); } return id; },
    async getProfiles() { const mine = store.get(key("profile")); return [...BOTS.map((b, i) => ({ id: "demo-" + i, nick: b[0], car: b[1], crew: b[2], hp: b[3], mods: b[4] })), ...(mine ? [mine] : [])]; },
    async saveProfile(p) { store.set(key("profile"), { id: S.uid, ...p }); },
    async getEvents() { return store.get(key("events"), []); },
    async createEvent(e) { const all = store.get(key("events"), []); all.push({ id: "e" + Date.now(), ...e, created_by: S.uid, going: [] }); all.sort((a, b) => a.starts_at.localeCompare(b.starts_at)); store.set(key("events"), all); },
    async deleteEvent(id) { store.set(key("events"), store.get(key("events"), []).filter(e => e.id !== id)); },
    async setRsvp(id, on) { const all = store.get(key("events"), []); const e = all.find(x => x.id === id); if (e) { e.going = (e.going || []).filter(u => u !== S.uid); if (on) e.going.push(S.uid); } store.set(key("events"), all); },
    async getReports() { return store.get(key("reports"), []).filter(r => Date.now() - new Date(r.created_at) < 2 * 3600e3); },
    async createReport(r) { const all = store.get(key("reports"), []); all.push({ id: "r" + Date.now(), ...r, created_at: new Date().toISOString(), created_by: S.uid }); store.set(key("reports"), all); },
    onChanges() {},
    onDriver(cb) { cbDriver = cb; },
    sendPosition() {},
  };
}

const B = (CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase) ? supabaseBackend() : demoBackend();
$("modeTag").textContent = B.mode === "demo" ? "MODO DEMO" : "AO VIVO";

// ---------------- map ----------------
const map = new maplibregl.Map({
  container: "map",
  style: CFG.mapStyle,
  center: [LISBOA.lng, LISBOA.lat],
  zoom: 13,
  pitch: 50,
  maxPitch: 70,
  attributionControl: { compact: true },
});
let triedFallback = false;
map.on("error", e => {
  if (!map.isStyleLoaded() && !triedFallback && CFG.fallbackStyle) { triedFallback = true; map.setStyle(CFG.fallbackStyle); }
  else console.warn(e?.error || e);
});
map.on("style.load", neonify);
map.on("dragstart", () => { S.follow = false; });

function neonify() {
  const layers = map.getStyle()?.layers || [];
  const set = (id, prop, val) => { try { map.setPaintProperty(id, prop, val); } catch {} };
  for (const l of layers) {
    const id = l.id.toLowerCase();
    if (l.type === "background") set(l.id, "background-color", "#07090f");
    else if (l.type === "fill") {
      if (/water|ocean|sea|river|lake/.test(id)) set(l.id, "fill-color", "#08162a");
      else if (/park|wood|forest|grass|landcover|green/.test(id)) set(l.id, "fill-color", "#0c1c19");
      else if (/building/.test(id)) { set(l.id, "fill-color", "#111a2b"); set(l.id, "fill-outline-color", "#1b2a44"); }
      else set(l.id, "fill-color", "#0b111d");
    }
    else if (l.type === "fill-extrusion") { set(l.id, "fill-extrusion-color", "#121c2f"); set(l.id, "fill-extrusion-opacity", 0.8); }
    else if (l.type === "line") {
      if (/water|river|stream|canal/.test(id)) set(l.id, "line-color", "#0d2340");
      else if (/boundary|admin/.test(id)) set(l.id, "line-color", "#2a3550");
      else if (/rail/.test(id)) set(l.id, "line-color", "#232c40");
      else if (/casing|outline/.test(id)) set(l.id, "line-color", "#1b2a44");
      else if (/motorway|trunk|primary|highway/.test(id)) set(l.id, "line-color", "#ff8a3d");
      else if (/road|street|secondary|tertiary|minor|service|transport|path|track|bridge|tunnel/.test(id)) set(l.id, "line-color", "#3fd0ff");
    }
    else if (l.type === "symbol") { set(l.id, "text-color", "#aab8d0"); set(l.id, "text-halo-color", "#07090f"); set(l.id, "text-halo-width", 1.2); }
  }
  // privacy zone layer
  if (!map.getSource("home")) {
    map.addSource("home", { type: "geojson", data: homeGeo() });
    map.addLayer({ id: "home-fill", type: "fill", source: "home", paint: { "fill-color": "#ff6a1a", "fill-opacity": 0.08 } });
    map.addLayer({ id: "home-line", type: "line", source: "home", paint: { "line-color": "#ff6a1a", "line-width": 1.5, "line-dasharray": [2, 2] } });
  }
}
function homeGeo() {
  if (!S.home) return { type: "FeatureCollection", features: [] };
  const pts = [], r = CFG.homeRadiusMeters;
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * 2 * Math.PI;
    pts.push([S.home.lng + Math.sin(a) * r / (111320 * Math.cos(S.home.lat * Math.PI / 180)), S.home.lat + Math.cos(a) * r / 111320]);
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [pts] }, properties: {} }] };
}

const CAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="var(--c)"/></svg>';
function carEl(color, label, isMe) {
  const el = document.createElement("div");
  el.className = "car-mk" + (isMe ? " me" : "");
  el.style.setProperty("--c", color);
  el.innerHTML = CAR_SVG + `<span class="lbl"></span>`;
  el.querySelector(".lbl").textContent = label;
  return el;
}
const meEl = carEl("#ff6a1a", "TU", true);
const meMarker = new maplibregl.Marker({ element: meEl });
// rotate only the arrow (not the name label), relative to the map's current bearing
function setHeading(el, heading) { el.dataset.h = heading || 0; el.querySelector("svg").style.transform = `rotate(${(heading || 0) - map.getBearing()}deg)`; }
map.on("rotate", () => document.querySelectorAll(".car-mk").forEach(el => setHeading(el, +el.dataset.h)));
const driverMarkers = new Map();
const eventMarkers = new Map();
const reportMarkers = new Map();
let pickMarker = null;

// ---------------- GPS ----------------
let lastFix = null, watchId = null;
function startGps() {
  if (!("geolocation" in navigator)) { gpsMsg("Este dispositivo não dá acesso à localização."); return; }
  watchId = navigator.geolocation.watchPosition(onFix, err => {
    gpsMsg(err.code === 1 ? "Localização bloqueada. Ativa-a nas definições do browser para apareceres no mapa." : "A procurar sinal de GPS…");
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function gpsMsg(t) { const b = $("gpsBadge"); b.textContent = t; b.hidden = !t; }
function onFix(p) {
  gpsMsg("");
  const fix = { lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp };
  let speed = p.coords.speed, head = p.coords.heading;
  if (lastFix) {
    const d = distM(lastFix, fix), dt = (fix.t - lastFix.t) / 1000;
    if ((speed == null || isNaN(speed)) && dt > 0) speed = d / dt;
    if ((head == null || isNaN(head)) && d > 4) head = bearing(lastFix, fix);
  }
  const first = !S.me;
  lastFix = fix;
  S.me = { lat: fix.lat, lng: fix.lng };
  S.speedKmh = Math.max(0, (speed || 0) * 3.6);
  if (head != null && !isNaN(head) && S.speedKmh > 3) S.heading = head;
  meMarker.setLngLat([fix.lng, fix.lat]); setHeading(meEl, S.heading);
  if (first) { meMarker.addTo(map); map.jumpTo({ center: [fix.lng, fix.lat], zoom: 15.5 }); }
  else if (S.follow) map.easeTo({ center: [fix.lng, fix.lat], bearing: S.speedKmh > 8 && S.heading != null ? S.heading : map.getBearing(), duration: 900 });
  renderList();
}

// ---------------- sharing my position ----------------
function insideHome() { return S.home && S.me && distM(S.home, S.me) < CFG.homeRadiusMeters; }
setInterval(() => {
  if (!S.me || !S.uid) return;
  if (S.ghost || insideHome()) { B.sendPosition({ id: S.uid, gone: true }); return; }
  const p = S.profile || {};
  // speed is deliberately not shared
  B.sendPosition({ id: S.uid, nick: p.nick || "Anónimo", car: p.car || "", crew: p.crew || "", lat: +S.me.lat.toFixed(5), lng: +S.me.lng.toFixed(5), heading: Math.round(S.heading || 0) });
}, CFG.shareEverySeconds * 1000);

function onDriver(d) {
  if (!d || !d.id || d.id === S.uid) return;
  if (d.gone) { S.drivers.delete(d.id); removeDriverMarker(d.id); renderList(); return; }
  S.drivers.set(d.id, { ...S.drivers.get(d.id), ...d, seen: Date.now() });
  renderDriver(S.drivers.get(d.id));
}
setInterval(() => { // drop drivers not heard from in 30 s
  const now = Date.now();
  for (const [id, d] of S.drivers) if (now - d.seen > 30000) { S.drivers.delete(id); removeDriverMarker(id); }
  renderList();
}, 5000);
function visible(d) { return S.filter !== "crew" || (S.profile?.crew && d.crew === S.profile.crew); }
function renderDriver(d) {
  let m = driverMarkers.get(d.id);
  if (!visible(d)) { removeDriverMarker(d.id); return; }
  if (!m) {
    const el = carEl(crewColor(d.crew), d.nick || "Anónimo");
    el.addEventListener("click", e => { e.stopPropagation(); showDriverCard(d.id); });
    m = new maplibregl.Marker({ element: el }).setLngLat([d.lng, d.lat]).addTo(map);
    driverMarkers.set(d.id, m);
  }
  m.setLngLat([d.lng, d.lat]); setHeading(m.getElement(), d.heading);
  m.getElement().querySelector(".lbl").textContent = d.nick || "Anónimo";
}
function removeDriverMarker(id) { driverMarkers.get(id)?.remove(); driverMarkers.delete(id); }

function renderList() {
  const el = $("list");
  const ref = S.me || LISBOA;
  const vis = [...S.drivers.values()].filter(visible).map(d => ({ d, m: distM(ref, d) })).sort((a, b) => a.m - b.m);
  $("onlineCount").textContent = vis.length;
  if (!vis.length) { el.innerHTML = `<div class="empty">${B.mode === "demo" ? "A carregar condutores de demonstração…" : "Ainda não há ninguém da comunidade a partilhar por perto."}</div>`; return; }
  el.innerHTML = vis.map(({ d, m }) => `<button class="row" data-id="${esc(d.id)}"><span class="dot" style="background:${crewColor(d.crew)};box-shadow:0 0 8px ${crewColor(d.crew)}"></span><span class="nm">${esc(d.nick || "Anónimo")}<span>${esc(d.car || d.crew || "")}</span></span><span class="km">${fmtDist(m)}</span></button>`).join("");
  sheetH();
}
$("list").addEventListener("click", e => {
  const b = e.target.closest(".row"); if (!b) return;
  const d = S.drivers.get(b.dataset.id); if (!d) return;
  S.follow = false; map.easeTo({ center: [d.lng, d.lat], zoom: Math.max(map.getZoom(), 15) });
  showDriverCard(d.id);
});

function showDriverCard(id) {
  const d = S.drivers.get(id); if (!d) return;
  const p = S.profiles.find(x => x.id === id) || d;
  const card = $("card"); card.className = "card"; card.hidden = false;
  card.innerHTML = `<button class="x" aria-label="Fechar">×</button>
    <div><div class="crew" style="color:${crewColor(p.crew)}">${esc(p.crew || "Sem crew")}</div><h3>${esc(p.nick || "Anónimo")}</h3><div class="car">${esc(p.car || "Carro por definir")}${p.hp ? " · " + esc(p.hp) + " cv" : ""}</div></div>
    ${(p.mods || []).length ? `<div class="mods">${p.mods.map(m => `<span>${esc(m)}</span>`).join("")}</div>` : ""}
    <div class="hint">A ${fmtDist(distM(S.me || LISBOA, d))} de ti</div>`;
  card.querySelector(".x").onclick = () => card.hidden = true;
}

// ---------------- speedometer ----------------
const sctx = $("speedo").getContext("2d"); let shown = 0;
function drawSpeedo() {
  shown += (S.speedKmh - shown) * 0.15;
  const c = sctx, Z = 340, cx = Z / 2, cy = Z / 2, r = 140, a0 = Math.PI * .75, a1 = Math.PI * 2.25, max = 160;
  c.clearRect(0, 0, Z, Z);
  c.lineWidth = 16; c.strokeStyle = "rgba(9,13,22,.85)"; c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
  c.strokeStyle = "rgba(63,208,255,.18)"; c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
  const g = c.createLinearGradient(0, Z, Z, 0); g.addColorStop(0, "#3fd0ff"); g.addColorStop(1, "#ff6a1a");
  c.strokeStyle = g; c.shadowColor = "#ff6a1a"; c.shadowBlur = 18; c.beginPath(); c.arc(cx, cy, r, a0, a0 + (a1 - a0) * Math.min(shown, max) / max); c.stroke(); c.shadowBlur = 0;
  c.strokeStyle = "rgba(233,238,248,.6)"; c.lineWidth = 3; c.fillStyle = "rgba(233,238,248,.55)"; c.font = "600 20px 'Share Tech Mono',monospace"; c.textAlign = "center"; c.textBaseline = "middle";
  for (let k = 0; k <= max; k += 20) { const a = a0 + (a1 - a0) * k / max; c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - 24), cy + Math.sin(a) * (r - 24)); c.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); c.stroke(); if (k % 40 === 0) c.fillText(k, cx + Math.cos(a) * (r - 44), cy + Math.sin(a) * (r - 44)); }
  $("spd").textContent = Math.round(shown);
  requestAnimationFrame(drawSpeedo);
}
requestAnimationFrame(drawSpeedo);

// ---------------- events ----------------
async function loadEvents() {
  try { S.events = await B.getEvents(); } catch (e) { console.warn(e); }
  renderEvents(); renderEventMarkers();
}
function renderEvents() {
  const list = $("evList");
  if (!S.events.length) { list.innerHTML = `<div class="empty">Ainda não há eventos. Cria o primeiro aqui em baixo e ele aparece no mapa com uma estrela.</div>`; return; }
  list.innerHTML = S.events.map(ev => {
    const going = ev.going || [], mine = going.includes(S.uid);
    return `<div class="ev"><span class="when">${esc(fmtWhen(ev.starts_at))}${ev.place ? " · " + esc(ev.place) : ""}</span><h4>${esc(ev.title)}</h4>${ev.description ? `<p>${esc(ev.description)}</p>` : ""}
    <div class="meta"><span class="going">${going.length} vão</span><span class="formrow">
    <button class="btn small" data-see="${esc(ev.id)}">Ver no mapa</button>
    <button class="btn small${mine ? " on" : ""}" data-go="${esc(ev.id)}">${mine ? "Vou ✓" : "Vou"}</button>
    ${ev.created_by === S.uid ? `<button class="btn small" data-del="${esc(ev.id)}">Apagar</button>` : ""}</span></div></div>`;
  }).join("");
}
function renderEventMarkers() {
  for (const [id, m] of eventMarkers) if (!S.events.find(e => e.id === id)) { m.remove(); eventMarkers.delete(id); }
  for (const ev of S.events) {
    if (eventMarkers.has(ev.id)) { eventMarkers.get(ev.id).setLngLat([ev.lng, ev.lat]); continue; }
    const el = document.createElement("div"); el.className = "ev-mk"; el.textContent = "★"; el.title = ev.title;
    el.addEventListener("click", e => { e.stopPropagation(); showEventCard(ev.id); });
    eventMarkers.set(ev.id, new maplibregl.Marker({ element: el }).setLngLat([ev.lng, ev.lat]).addTo(map));
  }
}
function showEventCard(id) {
  const ev = S.events.find(e => e.id === id); if (!ev) return;
  const card = $("card"); card.className = "card ev"; card.hidden = false;
  const going = ev.going || [], mine = going.includes(S.uid);
  card.innerHTML = `<button class="x" aria-label="Fechar">×</button><span class="when">${esc(fmtWhen(ev.starts_at))}</span><h3>${esc(ev.title)}</h3>
    ${ev.place ? `<div class="crew">${esc(ev.place)}</div>` : ""}${ev.description ? `<p class="hint">${esc(ev.description)}</p>` : ""}
    <div class="formrow"><span class="going">${going.length} vão</span><button class="btn small${mine ? " on" : ""}" data-go="${esc(ev.id)}">${mine ? "Vou ✓" : "Vou"}</button></div>`;
  card.querySelector(".x").onclick = () => card.hidden = true;
}
async function eventAction(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.see) { const ev = S.events.find(x => x.id === b.dataset.see); if (ev) { S.follow = false; $("events").hidden = true; map.easeTo({ center: [ev.lng, ev.lat], zoom: 15 }); showEventCard(ev.id); } }
  if (b.dataset.go) {
    const ev = S.events.find(x => x.id === b.dataset.go); if (!ev) return;
    const on = !(ev.going || []).includes(S.uid); b.disabled = true;
    try { await B.setRsvp(ev.id, on); toast(on ? "Presença confirmada" : "Presença cancelada"); await loadEvents(); if (!$("card").hidden && $("card").classList.contains("ev")) showEventCard(ev.id); }
    catch (err) { console.warn(err); toast("Não foi possível guardar. Tenta outra vez."); }
    b.disabled = false;
  }
  if (b.dataset.del) {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Confirmar apagar"; return; }
    try { await B.deleteEvent(b.dataset.del); toast("Evento apagado"); await loadEvents(); } catch { toast("Não foi possível apagar o evento."); }
  }
}
$("evList").addEventListener("click", eventAction);
$("card").addEventListener("click", eventAction);
$("evPick").onclick = () => { S.pick = true; $("events").hidden = true; toast("Toca no mapa onde vai ser o encontro"); };
map.on("click", e => {
  if (S.pick) {
    S.pick = false; S.pickPos = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    pickMarker?.remove();
    const el = document.createElement("div"); el.className = "ev-mk pick"; el.textContent = "★";
    pickMarker = new maplibregl.Marker({ element: el }).setLngLat(e.lngLat).addTo(map);
    $("evPickHint").textContent = "Local escolhido no mapa."; $("evPickHint").classList.add("ok");
    $("events").hidden = false; return;
  }
  $("card").hidden = true; $("menu").hidden = true;
});
$("evForm").addEventListener("submit", async e => {
  e.preventDefault(); const msg = $("evMsg");
  const title = $("evName").value.trim(), when = $("evWhen").value;
  if (!title) { msg.textContent = "Dá um nome ao evento."; $("evName").focus(); return; }
  if (!when) { msg.textContent = "Escolhe a data e a hora."; $("evWhen").focus(); return; }
  const c = S.pickPos || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  $("evSubmit").disabled = true; msg.textContent = "A criar…";
  try {
    await B.createEvent({ title, starts_at: new Date(when).toISOString(), place: $("evPlace").value.trim(), description: $("evDesc").value.trim(), lat: c.lat, lng: c.lng });
    $("evForm").reset(); S.pickPos = null; pickMarker?.remove(); pickMarker = null;
    $("evPickHint").textContent = "Sem local escolhido: usa o centro do mapa."; $("evPickHint").classList.remove("ok");
    msg.textContent = ""; toast("Evento criado e marcado no mapa"); await loadEvents();
  } catch (err) { console.warn(err); msg.textContent = "Não foi possível criar o evento. Tenta outra vez."; }
  $("evSubmit").disabled = false;
});

// ---------------- reports ----------------
const RNAME = { police: "Polícia", crash: "Acidente", works: "Obras", road: "Piso mau" };
const RLAB = { police: "P", crash: "!", works: "W", road: "~" };
async function loadReports() {
  try { S.reports = await B.getReports(); } catch (e) { console.warn(e); }
  for (const [id, m] of reportMarkers) if (!S.reports.find(r => r.id === id)) { m.remove(); reportMarkers.delete(id); }
  for (const r of S.reports) {
    if (reportMarkers.has(r.id) || !RNAME[r.type]) continue;
    const el = document.createElement("div"); el.className = "rmark r-" + r.type; el.innerHTML = `<span>${RLAB[r.type]}</span>`;
    el.title = RNAME[r.type] + " · " + new Date(r.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    reportMarkers.set(r.id, new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(map));
  }
}
$("reportBtn").onclick = () => { $("menu").hidden = !$("menu").hidden; };
$("menu").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  $("menu").hidden = true;
  const at = S.me || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  try { await B.createReport({ type: b.dataset.r, lat: at.lat, lng: at.lng }); toast(RNAME[b.dataset.r] + " reportado aqui"); await loadReports(); }
  catch (err) { console.warn(err); toast("Não foi possível enviar o alerta."); }
});

// ---------------- profile ----------------
function fillProfile() {
  const p = S.profile || {};
  $("pNick").value = p.nick || ""; $("pCrew").value = p.crew || ""; $("pCar").value = p.car || ""; $("pHp").value = p.hp || ""; $("pMods").value = (p.mods || []).join(", ");
  meEl.querySelector(".lbl").textContent = (p.nick || "Tu").toUpperCase();
}
async function loadProfiles() {
  try { S.profiles = await B.getProfiles(); } catch (e) { console.warn(e); }
  const mine = S.profiles.find(p => p.id === S.uid);
  if (mine) { S.profile = mine; store.set("profile", mine); fillProfile(); }
  renderPeople();
}
function renderPeople() {
  const el = $("people");
  if (!S.profiles.length) { el.innerHTML = `<div class="empty">Ainda ninguém criou perfil. Sê o primeiro.</div>`; return; }
  el.innerHTML = S.profiles.map(p => `<div class="person${p.id === S.uid ? " me" : ""}"><b>${esc(p.nick)}</b><span>${esc(p.car || "Carro por definir")}${p.hp ? " · " + esc(p.hp) + " cv" : ""}</span><span>${esc(p.crew || "Sem crew")}</span></div>`).join("");
}
$("pForm").addEventListener("submit", async e => {
  e.preventDefault(); const msg = $("pMsg");
  const nick = $("pNick").value.trim(); if (!nick) { msg.textContent = "Escolhe uma alcunha."; $("pNick").focus(); return; }
  const p = { nick, crew: $("pCrew").value.trim(), car: $("pCar").value.trim(), hp: Number($("pHp").value) || null, mods: $("pMods").value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 12) };
  $("pSave").disabled = true; msg.textContent = "A guardar…";
  try { await B.saveProfile(p); S.profile = { id: S.uid, ...p }; store.set("profile", S.profile); fillProfile(); msg.textContent = "Perfil guardado."; await loadProfiles(); }
  catch (err) { console.warn(err); msg.textContent = err?.code === "23505" ? "Essa alcunha já está em uso. Escolhe outra." : "Não foi possível guardar. Tenta outra vez."; }
  $("pSave").disabled = false;
});

// ---------------- controls ----------------
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).hidden = true);
["events", "profile"].forEach(id => $(id).addEventListener("click", e => { if (e.target.id === id) $(id).hidden = true; }));
$("openEvents").onclick = () => { $("events").hidden = false; loadEvents(); };
$("openProfile").onclick = () => { $("profile").hidden = false; fillProfile(); loadProfiles(); };
$("recenter").onclick = () => { S.follow = true; if (S.me) map.easeTo({ center: [S.me.lng, S.me.lat], zoom: Math.max(map.getZoom(), 15), pitch: 50 }); else toast("Ainda sem localização"); };
document.querySelectorAll("[data-filter]").forEach(b => b.onclick = () => {
  S.filter = b.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach(c => c.setAttribute("aria-pressed", c === b));
  if (S.filter === "crew" && !S.profile?.crew) toast("Define a tua crew no perfil para usar este filtro");
  for (const d of S.drivers.values()) renderDriver(d);
  renderList();
});
function setGhost(on) {
  S.ghost = on; store.set("ghost", on);
  $("ghost").setAttribute("aria-checked", on); $("ghostBadge").hidden = !on; meEl.classList.toggle("ghost", on);
}
$("ghost").onclick = () => { setGhost(!S.ghost); toast(S.ghost ? "Modo fantasma ligado" : "Voltaste a partilhar a tua posição"); };
function renderHome() {
  $("homeBtn").textContent = S.home ? "Remover" : "Definir aqui";
  $("homeHint").textContent = S.home ? "Ativa: ninguém te vê dentro do círculo" : "Esconde-te perto de casa (500 m)";
  map.getSource("home")?.setData(homeGeo());
}
$("homeBtn").onclick = () => {
  if (S.home) { S.home = null; }
  else if (S.me) { S.home = { ...S.me }; toast("Zona privada definida. Dentro dela não és mostrado a ninguém."); }
  else { toast("Ainda sem localização"); return; }
  store.set("home", S.home); renderHome();
};
const panel = $("panel");
function sheetH() { document.documentElement.style.setProperty("--sheet", (innerWidth < 760 ? panel.offsetHeight : 0) + "px"); }
$("sheetHandle").onclick = () => { panel.classList.toggle("collapsed"); sheetH(); };
addEventListener("resize", sheetH);
if (innerWidth >= 760) panel.classList.remove("collapsed");
document.addEventListener("keydown", e => { if (e.key === "Escape") { ["events", "profile", "menu"].forEach(i => $(i).hidden = true); $("card").hidden = true; S.pick = false; } });

$("start").onclick = () => { $("welcome").hidden = true; store.set("welcomed", true); startGps(); };
$("startNoGps").onclick = () => { $("welcome").hidden = true; gpsMsg("Sem localização: estás só a ver o mapa."); };

// ---------------- boot ----------------
(async () => {
  setGhost(S.ghost); fillProfile(); renderHome(); renderList(); sheetH();
  if (store.get("welcomed", false)) { $("welcome").hidden = true; startGps(); }
  try { S.uid = await B.init(); }
  catch (e) { console.warn(e); toast("Não foi possível ligar ao servidor. A funcionar só no teu telemóvel."); return; }
  B.onDriver(onDriver);
  B.onChanges(kind => { if (kind === "events") loadEvents(); if (kind === "reports") loadReports(); if (kind === "profiles") loadProfiles(); });
  map.once("load", () => { loadEvents(); loadReports(); });
  if (map.loaded()) { loadEvents(); loadReports(); }
  loadProfiles();
  setInterval(loadReports, 60000);
})();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
