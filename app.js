(() => {
"use strict";
const CFG = Object.assign({
  supabaseUrl: "",
  supabaseAnonKey: "",
  mapStyle: "https://tiles.openfreemap.org/styles/dark",
  fallbackStyle: "https://tiles.openfreemap.org/styles/positron",
  shareEverySeconds: 3,
  homeRadiusMeters: 500,
  geocoderUrl: "https://photon.komoot.io/api/",
  routerUrl: "https://router.project-osrm.org/route/v1/driving/",
  tomtomKey: "",
  showTraffic: false,   // false: traffic is only used to pick the fastest route, never drawn
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

// Fan badges: original text emblems in StreetMaps colours (not the manufacturers' official logos)
const BADGES = [
  { id: "amg", label: "AMG", bg: "linear-gradient(135deg,#d9dde3,#6b717c)" },
  { id: "m", label: "M", bg: "linear-gradient(135deg,#2f86ff,#13306b)" },
  { id: "rs", label: "RS", bg: "linear-gradient(135deg,#ff3b3b,#7a0f0f)" },
  { id: "gti", label: "GTI", bg: "linear-gradient(135deg,#ff3b5c,#1b1b1f)" },
  { id: "typer", label: "TYPE R", bg: "linear-gradient(135deg,#ff2d2d,#ffffff 160%)" },
  { id: "sti", label: "STI", bg: "linear-gradient(135deg,#ff5ac8,#3a1a6b)" },
  { id: "nismo", label: "NISMO", bg: "linear-gradient(135deg,#e0e6f2,#c0102a)" },
  { id: "trd", label: "TRD", bg: "linear-gradient(135deg,#ff6a1a,#5a1c00)" },
  { id: "cupra", label: "CUPRA", bg: "linear-gradient(135deg,#c9864a,#2a2a2a)" },
  { id: "st", label: "ST", bg: "linear-gradient(135deg,#4f8cff,#0b1a3a)" },
  { id: "mugen", label: "MUGEN", bg: "linear-gradient(135deg,#ffd23d,#a10f0f)" },
  { id: "evo", label: "EVO", bg: "linear-gradient(135deg,#ff4d5e,#2b2b2b)" },
  { id: "jdm", label: "JDM", bg: "linear-gradient(135deg,#ffffff,#d6001c 70%)" },
  { id: "stance", label: "STANCE", bg: "linear-gradient(135deg,#9d7bff,#ff5ac8)" },
  { id: "drift", label: "DRIFT", bg: "linear-gradient(135deg,#7ee0a0,#0b4325)" },
  { id: "classic", label: "CLÁSSICO", bg: "linear-gradient(135deg,#ffc23d,#5a3d00)" },
];
function badgesHtml(ids) {
  const list = (ids || []).map(id => BADGES.find(b => b.id === id)).filter(Boolean);
  return list.length ? `<div class="badges">${list.map(b => `<span class="bdg" style="background:${b.bg}">${b.label}</span>`).join("")}</div>` : "";
}

// ---------------- themes ----------------
// Road colours keep their meaning in every theme (autoestrada azul, nacional amarelo, municipal verde).
const THEMES = {
  street: { bg: "#131b2c", water: "#102a52", park: "#15332c", building: "#1d2a42", buildingLine: "#2c3d5c", land: "#162034",
    extr: "#22304b", building3d: "#26344f", waterLine: "#1a3a6a", boundary: "#3b4868", rail: "#36415a", text: "#c9d5ea", halo: "#131b2c",
    motorway: "#2f86ff", national: "#ffd23d", municipal: "#2fe07a", minor: "#55658a", other: "#414f6e",
    speedo: ["#2f86ff", "#ffd23d", "#ff3b3b"], route: "#ff8a3d", routeGlow: "#ff6a1a" },
  vice: { bg: "#241238", water: "#0e4f63", park: "#1c4136", building: "#33204d", buildingLine: "#4a2d6b", land: "#2a1642",
    extr: "#3d2560", building3d: "#4a2a6e", waterLine: "#1f7a8c", boundary: "#6b3d8a", rail: "#4d3366", text: "#ffd9ef", halo: "#241238",
    motorway: "#39c8ff", national: "#ffcf4a", municipal: "#3cf2a6", minor: "#8a5fb0", other: "#6c4a8f",
    speedo: ["#2de2e6", "#ff8a3d", "#ff2e88"], route: "#ff2e88", routeGlow: "#ff8a3d" },
};
const T = () => THEMES[S.theme] || THEMES.street;
function roadColor() {
  const t = T();
  return ["match", ["get", "class"], "motorway", t.motorway, ["trunk", "primary"], t.national, ["secondary", "tertiary"], t.municipal, ["minor", "service"], t.minor, t.other];
}
function applyTheme() {
  document.documentElement.dataset.theme = S.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", T().bg);
  document.querySelectorAll("[data-theme-pick]").forEach(b => b.setAttribute("aria-pressed", b.dataset.themePick === S.theme));
  if (map.isStyleLoaded()) neonify();
  if (map.getLayer("route-line")) { map.setPaintProperty("route-line", "line-color", T().route); map.setPaintProperty("route-glow", "line-color", T().routeGlow); }
}

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
  theme: store.get("theme", "street"),
  sat: store.get("sat", false),
  north: store.get("north", false), // true: north stays up; false: the map turns with the driver
  traffic: store.get("traffic", true),
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
    ["Rui_EK9","Honda Civic Type R EK9","Margem Sul Tuners",185,["B16B","Coilovers BC"],["typer","mugen","jdm"]],
    ["Inês.MX5","Mazda MX-5 NA","Stance Lisboa",130,["Rebaixada","Enkei 15\""]],
    ["TiagoE36","BMW 328i E36","Drift Lab PT",230,["Diferencial soldado","Bucket Bride"],["m","drift"]],
    ["Marta_S14","Nissan Silvia S14","Drift Lab PT",310,["SR20DET","Turbo GT28"]],
    ["Zé205","Peugeot 205 GTI 1.9","Clássicos da Linha",128,["Escape Devil","Bilstein"]],
    ["Gonçalo_GC8","Subaru Impreza WRX GC8","Rally Spirit",280,["Stage 2","Intercooler frontal"],["sti"]],
    ["Ana86","Toyota GT86","Stance Lisboa",220,["Air lift","Rocket Bunny"]],
    ["CupraNuno","Seat Leon Cupra R","VAG Nation PT",330,["Stage 2+","Downpipe"],["cupra"]],
    ["Kika_Supra","Toyota Supra MK4","JDM Porto",450,["2JZ single turbo","Volk TE37"]],
    ["Pedro_Mk2","VW Golf GTI Mk2","VAG Nation PT",140,["16V","BBS RS"],["gti","classic"]],
  ];
  let bots = [], cbDriver = null;
  function seedBots(center) {
    bots = BOTS.map((b, i) => ({ id: "demo-" + i, nick: b[0], car: b[1], crew: b[2], hp: b[3], mods: b[4], badges: b[5] || [],
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
  // a simulated driver reports something every so often, so live alerts can be seen in demo mode
  let cbChange = null;
  setInterval(() => {
    if (!bots.length) return;
    const b = bots[Math.floor(Math.random() * bots.length)], types = ["police", "crash", "works", "road"];
    const all = store.get(key("reports"), []);
    all.push({ id: "r" + Date.now(), type: types[Math.floor(Math.random() * 4)], lat: b.lat, lng: b.lng, created_at: new Date().toISOString(), created_by: b.id, by: b.nick });
    store.set(key("reports"), all.slice(-40));
    cbChange?.("reports");
  }, 45000);
  return {
    mode: "demo",
    async init() { let id = store.get("demo:uid"); if (!id) { id = "me-" + Math.random().toString(36).slice(2); store.set("demo:uid", id); } return id; },
    async getProfiles() { const mine = store.get(key("profile")); return [...BOTS.map((b, i) => ({ id: "demo-" + i, nick: b[0], car: b[1], crew: b[2], hp: b[3], mods: b[4], badges: b[5] || [] })), ...(mine ? [mine] : [])]; },
    async saveProfile(p) { store.set(key("profile"), { id: S.uid, ...p }); },
    async getEvents() {
      let all = store.get(key("events"), []);
      if (!store.get(key("seeded")) && bots.length) {
        // example meets near you so the highlights have something to show in demo mode
        const c = S.me || LISBOA, h = 3600e3, ids = bots.map(b => b.id);
        const ex = [
          { title: "Night Meet JDM (exemplo)", dt: -0.5 * h, d: [0.012, 0.01], n: 9 },
          { title: "Cars & Coffee VAG (exemplo)", dt: 2 * h, d: [-0.015, 0.02], n: 6 },
          { title: "Cruise pela Marginal (exemplo)", dt: 5 * h, d: [0.02, -0.025], n: 4 },
        ];
        all = all.concat(ex.map((x, i) => ({ id: "demo-ev-" + i, title: x.title, starts_at: new Date(Date.now() + x.dt).toISOString(), place: "Simulado",
          description: "Evento de demonstração.", lat: c.lat + x.d[0], lng: c.lng + x.d[1], created_by: ids[i], going: ids.slice(0, x.n) })));
        store.set(key("events"), all); store.set(key("seeded"), true);
      }
      return all;
    },
    async createEvent(e) { const all = store.get(key("events"), []); all.push({ id: "e" + Date.now(), ...e, created_by: S.uid, going: [] }); all.sort((a, b) => a.starts_at.localeCompare(b.starts_at)); store.set(key("events"), all); },
    async deleteEvent(id) { store.set(key("events"), store.get(key("events"), []).filter(e => e.id !== id)); },
    async setRsvp(id, on) { const all = store.get(key("events"), []); const e = all.find(x => x.id === id); if (e) { e.going = (e.going || []).filter(u => u !== S.uid); if (on) e.going.push(S.uid); } store.set(key("events"), all); },
    async getReports() { return store.get(key("reports"), []).filter(r => Date.now() - new Date(r.created_at) < 2 * 3600e3); },
    async createReport(r) { const all = store.get(key("reports"), []); all.push({ id: "r" + Date.now(), ...r, created_at: new Date().toISOString(), created_by: S.uid }); store.set(key("reports"), all); },
    onChanges(cb) { cbChange = cb; },
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
map.on("click", "fuel-dot", e => {
  const f = e.features?.[0]; if (!f) return;
  e.originalEvent.stopPropagation(); fuelClick = true;
  showPlaceCard(f.properties.name || "Bomba de gasolina", "Combustível", { lat: e.lngLat.lat, lng: e.lngLat.lng });
});
map.on("mouseenter", "fuel-dot", () => map.getCanvas().style.cursor = "pointer");
map.on("mouseleave", "fuel-dot", () => map.getCanvas().style.cursor = "");
let fuelClick = false;

// OpenMapTiles road classes: motorway = autoestrada (A), trunk/primary = nacional (IP, IC, EN), secondary/tertiary = municipal (ER, EM)
const ROAD_CASING = ["match", ["get", "class"],
  "motorway", "#0b2a5c",
  ["trunk", "primary"], "#4d3a07",
  ["secondary", "tertiary"], "#0b4325",
  "#1a2438"];
function neonify() {
  const layers = map.getStyle()?.layers || [], t = T();
  const set = (id, prop, val) => { try { map.setPaintProperty(id, prop, val); } catch {} };
  for (const l of layers) {
    const id = l.id.toLowerCase();
    if (l.type === "background") set(l.id, "background-color", t.bg);
    else if (l.type === "fill") {
      if (/water|ocean|sea|river|lake/.test(id)) set(l.id, "fill-color", t.water);
      else if (/park|wood|forest|grass|landcover|green/.test(id)) set(l.id, "fill-color", t.park);
      else if (/building/.test(id)) { set(l.id, "fill-color", t.building); set(l.id, "fill-outline-color", t.buildingLine); }
      else set(l.id, "fill-color", t.land);
    }
    else if (l.type === "fill-extrusion") { set(l.id, "fill-extrusion-color", t.extr); set(l.id, "fill-extrusion-opacity", 0.8); }
    else if (l.type === "line") {
      if (/water|river|stream|canal/.test(id)) set(l.id, "line-color", t.waterLine);
      else if (/boundary|admin/.test(id)) set(l.id, "line-color", t.boundary);
      else if (/rail/.test(id)) set(l.id, "line-color", t.rail);
      else if (l["source-layer"] === "transportation" || /road|street|highway|motorway|trunk|primary|secondary|tertiary|minor|service|path|track|bridge|tunnel/.test(id)) {
        // autoestradas azul, nacionais amarelo, municipais verde
        if (/casing|outline/.test(id)) set(l.id, "line-color", ROAD_CASING);
        else set(l.id, "line-color", roadColor());
      }
    }
    else if (l.type === "symbol") { set(l.id, "text-color", t.text); set(l.id, "text-halo-color", t.halo); set(l.id, "text-halo-width", 1.2); }
  }
  // live traffic flow overlay (TomTom), drawn under the labels
  if (CFG.tomtomKey && CFG.showTraffic && !map.getSource("traffic")) {
    const firstSymbol = (map.getStyle().layers || []).find(l => l.type === "symbol")?.id;
    map.addSource("traffic", { type: "raster", tileSize: 256, attribution: "Trânsito © TomTom",
      tiles: [`https://api.tomtom.com/traffic/map/4/tile/flow/relative0-dark/{z}/{x}/{y}.png?key=${CFG.tomtomKey}&tileSize=256`] });
    map.addLayer({ id: "traffic", type: "raster", source: "traffic", paint: { "raster-opacity": 0.85 }, layout: { visibility: S.traffic === false ? "none" : "visible" } }, firstSymbol);
  }
  // race tracks (OSM highway=raceway) and fuel stations (OSM amenity=fuel), shown when zooming in
  const vsrc = Object.entries(map.getStyle().sources || {}).find(([, src]) => src.type === "vector")?.[0];
  const font = (map.getStyle().layers || []).find(l => l.type === "symbol" && l.layout?.["text-font"])?.layout["text-font"];
  if (vsrc && !map.getLayer("raceway")) {
    const before = (map.getStyle().layers || []).find(l => l.type === "symbol")?.id;
    try {
      map.addLayer({ id: "raceway", type: "line", source: vsrc, "source-layer": "transportation", minzoom: 9, filter: ["==", ["get", "class"], "raceway"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ff2e5a", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 7, 17, 16], "line-blur": 0.5 } }, before);
      map.addLayer({ id: "raceway-check", type: "line", source: vsrc, "source-layer": "transportation", minzoom: 13, filter: ["==", ["get", "class"], "raceway"],
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.5, 17, 6], "line-dasharray": [1, 1] } }, before);
      map.addLayer({ id: "fuel-dot", type: "circle", source: vsrc, "source-layer": "poi", minzoom: 13, filter: ["==", ["get", "class"], "fuel"],
        paint: { "circle-color": "#ffb020", "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 4, 17, 8], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
      if (font) map.addLayer({ id: "fuel-label", type: "symbol", source: vsrc, "source-layer": "poi", minzoom: 15, filter: ["==", ["get", "class"], "fuel"],
        layout: { "text-field": ["coalesce", ["get", "name"], "Combustível"], "text-font": font, "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top" },
        paint: { "text-color": "#ffd27a", "text-halo-color": T().halo, "text-halo-width": 1.2 } });
    } catch (e) { console.warn(e); }
  }
  // satellite imagery (TomTom with the key, otherwise Esri World Imagery), drawn under roads and labels
  if (!map.getSource("sat")) {
    const firstLine = (map.getStyle().layers || []).find(l => l.type === "line" || l.type === "symbol")?.id;
    const tiles = CFG.tomtomKey
      ? [`https://api.tomtom.com/map/1/tile/sat/main/{z}/{x}/{y}.jpg?key=${CFG.tomtomKey}`]
      : ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"];
    map.addSource("sat", { type: "raster", tiles, tileSize: 256, maxzoom: 19, attribution: CFG.tomtomKey ? "Satélite © TomTom" : "Satélite © Esri, Maxar, Earthstar Geographics" });
    map.addLayer({ id: "sat", type: "raster", source: "sat", layout: { visibility: S.sat ? "visible" : "none" }, paint: { "raster-saturation": -0.1, "raster-brightness-max": 0.85 } }, firstLine);
  }
  // 3D buildings (OpenMapTiles "building" layer)
  const vec = Object.entries(map.getStyle().sources || {}).find(([, src]) => src.type === "vector")?.[0];
  if (vec && !map.getLayer("buildings-3d")) {
    const firstSymbol = (map.getStyle().layers || []).find(l => l.type === "symbol")?.id;
    try {
      map.addLayer({ id: "buildings-3d", type: "fill-extrusion", source: vec, "source-layer": "building", minzoom: 15,
        paint: { "fill-extrusion-color": T().building3d, "fill-extrusion-opacity": 0.85,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0] } }, firstSymbol);
    } catch (e) { console.warn(e); }
  } else if (map.getLayer("buildings-3d")) map.setPaintProperty("buildings-3d", "fill-extrusion-color", T().building3d);
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
const meEl = carEl("var(--heat)", "TU", true);
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
  else if (S.follow && R.nav) chaseCam(900);
  else if (S.follow) map.easeTo({ center: [fix.lng, fix.lat], bearing: followBearing(), duration: 900 });
  renderList();
  navTick();
}

// ---------------- sharing my position ----------------
function insideHome() { return S.home && S.me && distM(S.home, S.me) < CFG.homeRadiusMeters; }
setInterval(() => {
  if (!S.me || !S.uid) return;
  if (S.ghost || insideHome()) { B.sendPosition({ id: S.uid, gone: true }); return; }
  const p = S.profile || {};
  // speed is deliberately not shared
  B.sendPosition({ id: S.uid, nick: p.nick || "Anónimo", car: p.car || "", crew: p.crew || "", badges: p.badges || [], lat: +S.me.lat.toFixed(5), lng: +S.me.lng.toFixed(5), heading: Math.round(S.heading || 0) });
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
    ${badgesHtml(p.badges)}
    ${(p.mods || []).length ? `<div class="mods">${p.mods.map(m => `<span>${esc(m)}</span>`).join("")}</div>` : ""}
    <div class="hint">A ${fmtDist(distM(S.me || LISBOA, d))} de ti</div>`;
  card.querySelector(".x").onclick = () => card.hidden = true;
}

// ---------------- speedometer ----------------
const sctx = $("speedo").getContext("2d"); let shown = 0;
const DIRS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
function drawSpeedo() {
  shown += (S.speedKmh - shown) * 0.15;
  const c = sctx, Z = 340, cx = Z / 2, cy = Z / 2, max = 200, SEG = 36;
  const a0 = Math.PI * .72, a1 = Math.PI * 2.28, lit = Math.min(shown, max) / max * SEG;
  c.clearRect(0, 0, Z, Z);
  // dark disc
  const bg = c.createRadialGradient(cx, cy, 20, cx, cy, 168); bg.addColorStop(0, "rgba(16,20,30,.92)"); bg.addColorStop(1, "rgba(5,7,12,.92)");
  c.fillStyle = bg; c.beginPath(); c.arc(cx, cy, 166, 0, 7); c.fill();
  c.strokeStyle = "rgba(255,255,255,.08)"; c.lineWidth = 2; c.stroke();
  // segmented rev-style arc: blue -> yellow -> red
  for (let i = 0; i < SEG; i++) {
    const a = a0 + (a1 - a0) * (i + .1) / SEG, b = a0 + (a1 - a0) * (i + .85) / SEG, f = i / SEG;
    const sc = T().speedo, col = f < .55 ? sc[0] : f < .8 ? sc[1] : sc[2];
    c.strokeStyle = i < lit ? col : "rgba(255,255,255,.08)";
    c.lineWidth = i < lit ? 20 : 14; c.shadowColor = col; c.shadowBlur = i < lit ? 14 : 0;
    c.beginPath(); c.arc(cx, cy, 138, a, b); c.stroke();
  }
  c.shadowBlur = 0;
  // scale numbers
  c.fillStyle = "rgba(233,238,248,.5)"; c.font = "italic 700 19px 'Saira Condensed',sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  for (let k = 0; k <= max; k += 40) { const a = a0 + (a1 - a0) * k / max; c.fillText(k, cx + Math.cos(a) * 104, cy + Math.sin(a) * 104); }
  $("spd").textContent = Math.round(shown);
  const h = S.heading;
  $("hdg").textContent = h == null ? "—" : DIRS[Math.round(h / 45) % 8] + " " + Math.round(h) + "°";
  requestAnimationFrame(drawSpeedo);
}
requestAnimationFrame(drawSpeedo);

// ---------------- events ----------------
async function loadEvents() {
  try { S.events = await B.getEvents(); } catch (e) { console.warn(e); }
  renderEvents(); renderEventMarkers(); renderHighlights();
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
  if (fuelClick) { fuelClick = false; return; }
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
const seenReports = new Set(); let reportsPrimed = false;
async function loadReports() {
  try { S.reports = await B.getReports(); } catch (e) { console.warn(e); }
  for (const r of S.reports) {
    if (seenReports.has(r.id)) continue;
    seenReports.add(r.id);
    if (!reportsPrimed || r.created_by === S.uid || !RNAME[r.type]) continue;
    const ref = S.me || { lat: map.getCenter().lat, lng: map.getCenter().lng };
    const onRoute = R.route && distToRoute(r) < 120, d = distM(ref, r);
    if (onRoute || d < 5000) toast(`Novo alerta${onRoute ? " no teu percurso" : ""}: ${RNAME[r.type]} a ${fmtDist(d)}`);
  }
  reportsPrimed = true;
  renderRouteAlerts();
  for (const [id, m] of reportMarkers) if (!S.reports.find(r => r.id === id)) { m.remove(); reportMarkers.delete(id); }
  for (const r of S.reports) {
    if (reportMarkers.has(r.id) || !RNAME[r.type]) continue;
    const el = document.createElement("div"); el.className = "rmark r-" + r.type; el.innerHTML = `<span>${RLAB[r.type]}</span>`;
    el.title = RNAME[r.type] + " · " + new Date(r.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }) + (r.by ? " · " + r.by : "");
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
let pickedBadges = [];
function renderBadgePick() {
  $("badgePick").innerHTML = BADGES.map(b => `<button type="button" data-b="${b.id}" aria-pressed="${pickedBadges.includes(b.id)}" aria-label="${b.label}"><span class="bdg" style="background:${b.bg}">${b.label}</span></button>`).join("");
}
$("badgePick").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.b;
  if (pickedBadges.includes(id)) pickedBadges = pickedBadges.filter(x => x !== id);
  else if (pickedBadges.length >= 4) { toast("Podes escolher até 4 badges"); return; }
  else pickedBadges.push(id);
  renderBadgePick();
});
function fillProfile() {
  const p = S.profile || {};
  pickedBadges = [...(p.badges || [])]; renderBadgePick();
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
  el.innerHTML = S.profiles.map(p => `<div class="person${p.id === S.uid ? " me" : ""}"><b>${esc(p.nick)}</b><span>${esc(p.car || "Carro por definir")}${p.hp ? " · " + esc(p.hp) + " cv" : ""}</span><span>${esc(p.crew || "Sem crew")}</span>${badgesHtml(p.badges)}</div>`).join("");
}
$("pForm").addEventListener("submit", async e => {
  e.preventDefault(); const msg = $("pMsg");
  const nick = $("pNick").value.trim(); if (!nick) { msg.textContent = "Escolhe uma alcunha."; $("pNick").focus(); return; }
  const p = { nick, crew: $("pCrew").value.trim(), car: $("pCar").value.trim(), hp: Number($("pHp").value) || null, mods: $("pMods").value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 12), badges: pickedBadges.slice(0, 4) };
  $("pSave").disabled = true; msg.textContent = "A guardar…";
  try { await B.saveProfile(p); S.profile = { id: S.uid, ...p }; store.set("profile", S.profile); fillProfile(); msg.textContent = "Perfil guardado."; await loadProfiles(); }
  catch (err) { console.warn(err); msg.textContent = err?.code === "23505" ? "Essa alcunha já está em uso. Escolhe outra." : "Não foi possível guardar. Tenta outra vez."; }
  $("pSave").disabled = false;
});

// ---------------- highlights: popular meets + known tracks ----------------
// Approximate positions of well-known Portuguese tracks (open the map to see the exact layout)
const TRACKS = [
  { id: "estoril", name: "Autódromo do Estoril", kind: "Circuito · 4,2 km", lat: 38.7506, lng: -9.3942 },
  { id: "aia", name: "Autódromo Internacional do Algarve", kind: "Circuito · 4,7 km", lat: 37.2272, lng: -8.6267 },
  { id: "braga", name: "Circuito Vasco Sameiro, Braga", kind: "Circuito · 3,0 km", lat: 41.5853, lng: -8.4460 },
  { id: "vilareal", name: "Circuito Internacional de Vila Real", kind: "Citadino · 4,8 km", lat: 41.2967, lng: -7.7486 },
  { id: "montalegre", name: "Pista Automóvel de Montalegre", kind: "Rallycross", lat: 41.8228, lng: -7.7948 },
];
const trackMarkers = TRACKS.map(t => {
  const el = document.createElement("div"); el.className = "track-mk"; el.innerHTML = "<i></i>"; el.title = t.name;
  el.addEventListener("click", e => { e.stopPropagation(); showPlaceCard(t.name, t.kind, t); });
  return new maplibregl.Marker({ element: el }).setLngLat([t.lng, t.lat]).addTo(map);
});
function showPlaceCard(title, sub, at) {
  const card = $("card"); card.className = "card"; card.hidden = false;
  card.innerHTML = `<button class="x" aria-label="Fechar">×</button><div><div class="crew">${esc(sub)}</div><h3>${esc(title)}</h3></div>
    <div class="hint">A ${fmtDist(distM(S.me || LISBOA, at))} de ti</div><div class="formrow"><button class="btn hot small" id="cardGo">Ir para aqui</button></div>`;
  card.querySelector(".x").onclick = () => card.hidden = true;
  $("cardGo").onclick = () => { card.hidden = true; planRoute({ title, lat: at.lat, lng: at.lng }); };
}
function popularMeets() {
  const now = Date.now();
  return S.events
    .filter(e => { const t = new Date(e.starts_at).getTime(); return t > now - 4 * 3600e3 && t < now + 24 * 3600e3; })
    .sort((a, b) => (b.going || []).length - (a.going || []).length)
    .slice(0, 6);
}
function renderHighlights() {
  const ref = S.me || LISBOA, now = Date.now();
  const meets = popularMeets();
  $("hlMeets").innerHTML = meets.length ? meets.map(e => {
    const live = new Date(e.starts_at).getTime() <= now;
    return `<button class="hlcard" data-ev="${esc(e.id)}"><span class="big">${(e.going || []).length} vão</span><b>${esc(e.title)}</b>
      <span>${live ? '<em class="live">● A decorrer</em>' : esc(fmtWhen(e.starts_at))}</span><span>${fmtDist(distM(ref, e))}</span></button>`;
  }).join("") : `<p class="hlempty">Não há meets nas próximas 24 horas. Cria um em Eventos.</p>`;
  $("hlTracks").innerHTML = [...TRACKS].sort((a, b) => distM(ref, a) - distM(ref, b)).map(t =>
    `<button class="hlcard track" data-track="${t.id}"><span class="flag"></span><b>${esc(t.name)}</b><span>${esc(t.kind)}</span><span>${fmtDist(distM(ref, t))}</span></button>`).join("");
}
$("hlMeets").addEventListener("click", e => {
  const b = e.target.closest("[data-ev]"); if (!b) return;
  const ev = S.events.find(x => x.id === b.dataset.ev); if (!ev) return;
  S.follow = false; if (innerWidth < 760) setSheet(false);
  map.easeTo({ center: [ev.lng, ev.lat], zoom: 15 }); showEventCard(ev.id);
});
$("hlTracks").addEventListener("click", e => {
  const b = e.target.closest("[data-track]"); if (!b) return;
  const t = TRACKS.find(x => x.id === b.dataset.track);
  S.follow = false; if (innerWidth < 760) setSheet(false);
  map.easeTo({ center: [t.lng, t.lat], zoom: 14.5, pitch: 45 }); showPlaceCard(t.name, t.kind, t);
});

// ---------------- search & routing ----------------
const R = { options: [], sel: 0, route: null, steps: [], step: 1, dest: null, nav: false, offCount: 0, lastReroute: 0 };
let searchAbort = null, searchT = null;
async function geocode(q) {
  searchAbort?.abort(); searchAbort = new AbortController();
  const ref = S.me || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  const url = `${CFG.geocoderUrl}?q=${encodeURIComponent(q)}&limit=7&lat=${ref.lat.toFixed(4)}&lon=${ref.lng.toFixed(4)}`;
  const res = await fetch(url, { signal: searchAbort.signal });
  if (!res.ok) throw new Error("geocoder " + res.status);
  const j = await res.json();
  return (j.features || []).map(f => {
    const p = f.properties || {};
    const title = p.name || [p.street, p.housenumber].filter(Boolean).join(" ") || p.city || "Local sem nome";
    const sub = [p.name && p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : "", p.city || p.county, p.country].filter(Boolean).join(", ");
    return { title, sub, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
  });
}
function renderResults(list, msg) {
  const el = $("sResults");
  if (msg) { el.innerHTML = `<div class="empty">${esc(msg)}</div>`; return; }
  const ref = S.me || null;
  el.innerHTML = list.map((r, i) => `<button data-i="${i}"><b>${esc(r.title)}</b><span>${esc(r.sub)}${ref ? " · " + fmtDist(distM(ref, r)) : ""}</span></button>`).join("");
  el._list = list;
}
$("sInput").addEventListener("input", () => {
  clearTimeout(searchT);
  const q = $("sInput").value.trim();
  if (q.length < 3) { $("sResults").innerHTML = ""; return; }
  searchT = setTimeout(async () => {
    try { const list = await geocode(q); renderResults(list, list.length ? "" : "Não encontrei nada com esse nome."); }
    catch (e) { if (e.name !== "AbortError") renderResults([], "A pesquisa não respondeu. Verifica a ligação e tenta outra vez."); }
  }, 450);
});
$("sForm").addEventListener("submit", e => { e.preventDefault(); $("sInput").dispatchEvent(new Event("input")); });
$("sResults").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const d = $("sResults")._list[+b.dataset.i];
  $("search").hidden = true;
  planRoute(d);
});
// fuel stations within 100 km, nearest first
async function fuelNearby(ref) {
  if (TT === "tomtom") {
    try {
      const url = `https://api.tomtom.com/search/2/categorySearch/posto%20de%20combust%C3%ADvel.json?key=${CFG.tomtomKey}` +
        `&lat=${ref.lat.toFixed(5)}&lon=${ref.lng.toFixed(5)}&radius=100000&limit=100&categorySet=7311&language=pt-PT`;
      const res = await fetch(url); if (!res.ok) throw new Error("tomtom " + res.status);
      const j = await res.json();
      return (j.results || []).map(r => ({
        title: r.poi?.brands?.[0]?.name && !(r.poi.name || "").toLowerCase().includes(r.poi.brands[0].name.toLowerCase()) ? `${r.poi.brands[0].name} · ${r.poi.name}` : (r.poi?.name || "Bomba de gasolina"),
        sub: r.address?.freeformAddress || "", lat: r.position.lat, lng: r.position.lon }));
    } catch (e) { console.warn("TomTom falhou, a usar o OpenStreetMap", e); }
  }
  const res = await fetch(`${CFG.geocoderUrl}?q=fuel&osm_tag=amenity:fuel&limit=50&lat=${ref.lat.toFixed(4)}&lon=${ref.lng.toFixed(4)}`);
  if (!res.ok) throw new Error("geocoder " + res.status);
  const j = await res.json();
  return (j.features || []).map(f => { const p = f.properties || {};
    return { title: p.name || p.brand || "Bomba de gasolina", sub: [[p.street, p.housenumber].filter(Boolean).join(" "), p.city].filter(Boolean).join(", "), lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }; });
}
$("fuelBtn").onclick = async () => {
  const ref = S.me || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  $("sInput").value = ""; renderResults([], "A procurar bombas de gasolina perto de ti…");
  try {
    const list = (await fuelNearby(ref)).filter(r => distM(ref, r) <= 100000).sort((a, b) => distM(ref, a) - distM(ref, b));
    renderResults(list, list.length ? "" : "Não encontrei bombas de gasolina num raio de 100 km.");
  } catch { renderResults([], "A pesquisa não respondeu. Verifica a ligação e tenta outra vez."); }
};
$("searchBtn").onclick = () => { $("search").hidden = false; setTimeout(() => $("sInput").focus(), 50); };

// Every router is normalised to {distance, duration, noTraffic, delay, geometry, steps, jams}
const TT = CFG.tomtomKey ? "tomtom" : "osrm";
function ttArrow(m = "") {
  if (m === "ARRIVE" || m.startsWith("ARRIVE")) return "◎";
  if (m.includes("ROUNDABOUT")) return "↻";
  if (m.includes("UTURN")) return "↶";
  if (m.includes("SHARP_LEFT")) return "↙";
  if (m.includes("SHARP_RIGHT")) return "↘";
  if (/BEAR_LEFT|KEEP_LEFT|SLIGHT_LEFT|EXIT_LEFT/.test(m)) return "↖";
  if (/BEAR_RIGHT|KEEP_RIGHT|SLIGHT_RIGHT|EXIT_RIGHT|MOTORWAY_EXIT/.test(m)) return "↗";
  if (m.includes("LEFT")) return "←";
  if (m.includes("RIGHT")) return "→";
  return "↑";
}
async function fetchRoutes(from, to) {
  if (TT === "tomtom") {
    try { const r = await fetchTomTom(from, to); R.src = "tomtom"; return r; }
    catch (e) { console.warn("TomTom falhou, a usar rotas sem trânsito", e); }
  }
  R.src = "osrm";
  return fetchOsrm(from, to);
}
async function fetchTomTom(from, to) {
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json?key=${CFG.tomtomKey}` +
    `&traffic=true&maxAlternatives=2&alternativeType=betterRoute&routeType=fastest&travelMode=car&computeTravelTimeFor=all` +
    `&sectionType=traffic&instructionsType=text&language=pt-PT`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("tomtom " + res.status);
  const j = await res.json();
  if (!j.routes?.length) throw new Error("no route");
  return j.routes.map(r => {
    const coords = r.legs.flatMap(l => l.points).map(p => [p.longitude, p.latitude]);
    const ins = r.guidance?.instructions || [], sum = r.summary;
    return {
      distance: sum.lengthInMeters, duration: sum.travelTimeInSeconds,
      noTraffic: sum.noTrafficTravelTimeInSeconds ?? null, delay: sum.trafficDelayInSeconds ?? 0,
      geometry: { type: "LineString", coordinates: coords },
      steps: ins.map((x, i) => ({
        maneuver: { type: x.maneuver === "ARRIVE" ? "arrive" : x.maneuver === "DEPART" ? "depart" : "tomtom", location: [x.point.longitude, x.point.latitude] },
        name: x.street || "", distance: (ins[i + 1]?.routeOffsetInMeters ?? sum.lengthInMeters) - x.routeOffsetInMeters,
        text: x.message, arrow: ttArrow(x.maneuver),
      })),
      jams: (r.sections || []).filter(x => x.sectionType === "TRAFFIC").map(x => ({ from: x.startPointIndex, to: x.endPointIndex, cat: x.simpleCategory || "JAM", delay: x.effectiveSpeedInKmh })),
    };
  });
}
async function fetchOsrm(from, to) {
  const url = `${CFG.routerUrl}${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("router " + res.status);
  const j = await res.json();
  if (j.code !== "Ok" || !j.routes?.length) throw new Error("no route");
  return j.routes.map(r => ({ distance: r.distance, duration: r.duration, noTraffic: null, delay: null, geometry: r.geometry, steps: r.legs?.[0]?.steps || [], jams: [] }));
}
async function planRoute(dest) {
  const from = S.me || { lat: map.getCenter().lat, lng: map.getCenter().lng };
  R.dest = dest;
  $("route").hidden = false; $("route").classList.remove("nav"); $("navLine").hidden = true;
  $("rTime").textContent = "A calcular…"; $("rMeta").textContent = ""; $("rDest").textContent = dest.title; $("rAlerts").innerHTML = ""; $("rOpts").innerHTML = "";
  try {
    R.options = await fetchRoutes(from, dest);
    tagOptions();
    selectRoute(0);
    fitRoute();
  } catch (e) { console.warn(e); $("rTime").textContent = "Sem rota"; $("rMeta").textContent = "Não consegui calcular o caminho até aí."; }
}
// label the options: fastest, and the one with least traffic (often a longer way round)
function tagOptions() {
  const o = R.options; if (!o.length) return;
  const fastest = o.reduce((a, b) => b.duration < a.duration ? b : a);
  o.forEach(r => r.tags = []);
  fastest.tags.push("Mais rápida");
  if (CFG.showTraffic && o.some(r => r.delay != null)) {
    const calm = o.reduce((a, b) => (b.delay ?? 1e9) < (a.delay ?? 1e9) ? b : a);
    if (calm !== fastest && (fastest.delay - calm.delay) >= 60) calm.tags.push("Menos trânsito");
    else if (calm === fastest && o.length > 1) fastest.tags.push("Menos trânsito");
  }
  // put the fastest first
  R.options.sort((a, b) => a.duration - b.duration);
}
function renderOptions() {
  const el = $("rOpts"), o = R.options || [];
  $("rPowered").hidden = R.src !== "tomtom";
  const base = o[0];
  el.innerHTML = o.map((r, i) => {
    const extraKm = r.distance - base.distance;
    const traffic = r.delay == null || !CFG.showTraffic ? "" : r.delay < 60 ? `<span class="tr ok">Trânsito fluido</span>` : `<span class="tr ${r.delay > 600 ? "bad" : "mid"}">+${fmtDur(r.delay)} de trânsito</span>`;
    return `<button class="opt${i === R.sel ? " sel" : ""}" data-i="${i}"><b>${fmtDur(r.duration)}</b><span>${fmtDist(r.distance)}${i && extraKm > 200 ? " (+" + fmtDist(extraKm) + ")" : ""}</span>${traffic}${(r.tags || []).map(t => `<em>${t}</em>`).join("")}</button>`;
  }).join("");
}
$("rOpts").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) selectRoute(+b.dataset.i); });
function selectRoute(i) { R.sel = i; setRoute(R.options[i]); renderOptions(); }
function drawRoutes() {
  const feats = (R.options || []).map((r, i) => ({ type: "Feature", geometry: r.geometry, properties: { sel: i === R.sel } }));
  if (R.nav) feats.splice(0, feats.length, { type: "Feature", geometry: R.route.geometry, properties: { sel: true } });
  const jams = (CFG.showTraffic ? R.route?.jams || [] : []).map(j => ({ type: "Feature", properties: { cat: j.cat }, geometry: { type: "LineString", coordinates: R.route.geometry.coordinates.slice(j.from, j.to + 1) } })).filter(f => f.geometry.coordinates.length > 1);
  const data = { type: "FeatureCollection", features: feats }, jdata = { type: "FeatureCollection", features: jams };
  if (map.getSource("route")) { map.getSource("route").setData(data); map.getSource("route-jams").setData(jdata); return; }
  map.addSource("route", { type: "geojson", data });
  map.addSource("route-jams", { type: "geojson", data: jdata });
  const lay = { "line-cap": "round", "line-join": "round" };
  map.addLayer({ id: "route-alt", type: "line", source: "route", filter: ["==", ["get", "sel"], false], layout: lay, paint: { "line-color": "#8a97b3", "line-width": 5, "line-opacity": 0.7 } });
  map.addLayer({ id: "route-glow", type: "line", source: "route", filter: ["==", ["get", "sel"], true], layout: lay, paint: { "line-color": T().routeGlow, "line-width": 16, "line-opacity": 0.25, "line-blur": 6 } });
  map.addLayer({ id: "route-line", type: "line", source: "route", filter: ["==", ["get", "sel"], true], layout: lay, paint: { "line-color": T().route, "line-width": 6 } });
  map.addLayer({ id: "route-jams", type: "line", source: "route-jams", layout: lay, paint: { "line-width": 6,
    "line-color": ["match", ["get", "cat"], "JAM", "#ff3b3b", "ROAD_CLOSURE", "#a10f2a", "ROAD_WORK", "#ffb020", "#ff7a3d"] } });
}
function setRoute(route) {
  R.route = route; R.steps = route.steps || []; R.step = Math.min(1, R.steps.length - 1); R.offCount = 0;
  drawRoutes();
  updateEta(route.distance, route.duration);
  renderRouteAlerts();
}
function fitRoute() {
  const c = R.route.geometry.coordinates; const b = new maplibregl.LngLatBounds(c[0], c[0]);
  for (const p of c) b.extend(p);
  S.follow = false;
  map.fitBounds(b, { padding: { top: 220, bottom: 200, left: 40, right: innerWidth >= 760 ? 360 : 40 }, pitch: 0, bearing: 0, duration: 800 });
}
function fmtDur(s) { const m = Math.round(s / 60); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); }
function updateEta(dist, dur) {
  $("rTime").textContent = fmtDur(dur);
  const arrive = new Date(Date.now() + dur * 1000).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  $("rMeta").textContent = `${fmtDist(dist)} · chegada às ${arrive}`;
}
// distance from a point to the route polyline (equirectangular, good enough at city scale)
function distToRoute(p) {
  const c = R.route?.geometry?.coordinates; if (!c) return Infinity;
  const kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110540;
  let best = Infinity;
  for (let i = 1; i < c.length; i++) {
    const ax = (c[i - 1][0] - p.lng) * kx, ay = (c[i - 1][1] - p.lat) * ky, bx = (c[i][0] - p.lng) * kx, by = (c[i][1] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
function renderRouteAlerts() {
  if (!R.route) return;
  const on = S.reports.filter(r => RNAME[r.type] && distToRoute(r) < 120);
  const counts = {}; on.forEach(r => counts[r.type] = (counts[r.type] || 0) + 1);
  $("rAlerts").innerHTML = on.length
    ? Object.entries(counts).map(([t, n]) => `<span><i class="r-${t}"></i>${n} ${RNAME[t].toLowerCase()}</span>`).join("")
    : `<span class="ok">Sem alertas no percurso</span>`;
}
const MOD = { left: "à esquerda", right: "à direita", "slight left": "ligeiramente à esquerda", "slight right": "ligeiramente à direita", "sharp left": "bem à esquerda", "sharp right": "bem à direita", straight: "em frente", uturn: "inverte a marcha" };
const ARROW = { left: "←", right: "→", "slight left": "↖", "slight right": "↗", "sharp left": "↙", "sharp right": "↘", straight: "↑", uturn: "↶" };
function instruction(st) {
  if (st.text) return { arrow: st.arrow || "↑", text: st.text };
  const m = st.maneuver || {}, mod = MOD[m.modifier] || "", name = st.name || st.ref || "";
  const onto = name ? " para " + name : "";
  switch (m.type) {
    case "arrive": return { arrow: "◎", text: "Chegada ao destino" };
    case "roundabout": case "rotary": case "roundabout turn": return { arrow: "↻", text: `Na rotunda, sai na ${m.exit || 1}.ª saída${onto}` };
    case "merge": return { arrow: ARROW[m.modifier] || "↑", text: "Entra" + onto };
    case "on ramp": return { arrow: ARROW[m.modifier] || "↗", text: "Entra na via" + onto };
    case "off ramp": return { arrow: ARROW[m.modifier] || "↗", text: "Sai" + onto };
    case "fork": return { arrow: ARROW[m.modifier] || "↑", text: `Mantém-te ${mod || "em frente"}${onto}` };
    case "end of road": return { arrow: ARROW[m.modifier] || "↑", text: `No fim da estrada, vira ${mod}${onto}` };
    case "continue": case "new name": return { arrow: "↑", text: "Continua" + (name ? " na " + name : "") };
    default: return { arrow: ARROW[m.modifier] || "↑", text: (m.modifier === "uturn" ? "Inverte a marcha" : m.modifier === "straight" ? "Segue em frente" : `Vira ${mod}`) + onto };
  }
}
// third-person view: camera low and behind the car, car in the lower part of the screen, facing the way you drive
function followBearing() { return S.north ? 0 : S.heading != null ? S.heading : map.getBearing(); }
function routeBearing() {
  const st = R.steps[R.step]; if (!st || !S.me) return map.getBearing();
  const loc = st.maneuver.location; return bearing(S.me, { lng: loc[0], lat: loc[1] });
}
function chaseCam(duration) {
  if (!S.me) return;
  const head = S.north ? 0 : S.speedKmh > 5 && S.heading != null ? S.heading : routeBearing();
  map.easeTo({ center: [S.me.lng, S.me.lat], zoom: 18.2, pitch: 55, bearing: head,
    padding: { top: Math.round(innerHeight * 0.38), bottom: 0, left: 0, right: 0 }, duration });
}
// keep the screen on while navigating (Screen Wake Lock: Chrome/Android, Safari 16.4+)
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { console.warn("wake lock", e); }
}
// the lock is dropped when the app goes to the background; take it again on return
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && R.nav) keepAwake(true); });
function startNav() {
  if (!R.route) return;
  if (!S.me) { toast("Ativa a localização para seguires a rota"); return; }
  R.nav = true; S.follow = true; drawRoutes(); document.body.classList.add("navigating"); keepAwake(true);
  $("route").classList.add("nav"); $("navLine").hidden = false;
  chaseCam(800);
  navTick();
}
function endNav() {
  document.body.classList.remove("navigating"); keepAwake(false);
  map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, pitch: 50, duration: 600 });
  R.nav = false; R.route = null; R.steps = []; R.options = []; $("route").hidden = true;
  const empty = { type: "FeatureCollection", features: [] };
  map.getSource("route")?.setData(empty); map.getSource("route-jams")?.setData(empty);
}
async function navTick() {
  if (!R.nav || !R.route || !S.me) return;
  // advance past maneuvers we've reached
  while (R.step < R.steps.length - 1) {
    const loc = R.steps[R.step].maneuver.location;
    if (distM(S.me, { lng: loc[0], lat: loc[1] }) < 25) R.step++; else break;
  }
  const st = R.steps[R.step]; if (!st) return;
  const loc = st.maneuver.location, toNext = distM(S.me, { lng: loc[0], lat: loc[1] });
  if (st.maneuver.type === "arrive" && toNext < 30) { toast("Chegaste ao destino"); endNav(); return; }
  const ins = instruction(st);
  $("navArrow").textContent = ins.arrow; $("navDist").textContent = fmtDist(toNext); $("navStreet").textContent = ins.text;
  const rest = R.steps.slice(R.step).reduce((a, s) => a + s.distance, 0) + toNext;
  updateEta(rest, R.route.duration * rest / Math.max(1, R.route.distance));
  // off route: recalculate (at most every 15 s)
  if (distToRoute(S.me) > 60) R.offCount++; else R.offCount = 0;
  if (R.offCount >= 2 && Date.now() - R.lastReroute > 15000) {
    R.lastReroute = Date.now(); R.offCount = 0; toast("A recalcular a rota…");
    try { const o = await fetchRoutes(S.me, R.dest); R.options = o; setRoute(o.reduce((a, b) => b.duration < a.duration ? b : a)); } catch (e) { console.warn(e); }
  }
}
$("rStart").onclick = startNav;
if (CFG.tomtomKey && CFG.showTraffic) {
  $("trafficBtn").hidden = false;
  const paint = () => $("trafficBtn").classList.toggle("on", S.traffic);
  paint();
  $("trafficBtn").onclick = () => {
    S.traffic = !S.traffic; store.set("traffic", S.traffic); paint();
    if (map.getLayer("traffic")) map.setLayoutProperty("traffic", "visibility", S.traffic ? "visible" : "none");
    toast(S.traffic ? "Trânsito ligado" : "Trânsito desligado");
  };
}
$("rClose").onclick = endNav;

// ---------------- satellite toggle ----------------
function applySat() {
  $("satBtn").classList.toggle("on", S.sat); $("satLbl").textContent = S.sat ? "Mapa" : "Satélite";
  document.body.classList.toggle("sat", S.sat);
  if (!map.getLayer("sat")) return;
  map.setLayoutProperty("sat", "visibility", S.sat ? "visible" : "none");
  // over imagery: only the painted roads stay; buildings, land and other shapes are hidden
  for (const l of map.getStyle().layers || []) {
    if (/^route|^home|^raceway|^sat$/.test(l.id)) continue;
    const shape = l.type === "fill" || l.type === "fill-extrusion" || (l.type === "line" && l["source-layer"] !== "transportation");
    if (!shape) continue;
    if (!(l.id in satHidden)) satHidden[l.id] = map.getLayoutProperty(l.id, "visibility") || "visible";
    try { map.setLayoutProperty(l.id, "visibility", S.sat ? "none" : satHidden[l.id]); } catch {}
  }
}
const satHidden = {};
$("satBtn").onclick = () => { S.sat = !S.sat; store.set("sat", S.sat); applySat(); };
map.on("style.load", () => { for (const k in satHidden) delete satHidden[k]; applySat(); });

// ---------------- controls ----------------
document.querySelectorAll("[data-theme-pick]").forEach(b => b.onclick = () => { S.theme = b.dataset.themePick; store.set("theme", S.theme); applyTheme(); });
document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => $(b.dataset.close).hidden = true);
["events", "profile", "search"].forEach(id => $(id).addEventListener("click", e => { if (e.target.id === id) $(id).hidden = true; }));
$("openEvents").onclick = () => { $("events").hidden = false; loadEvents(); };
$("openProfile").onclick = () => { $("profile").hidden = false; fillProfile(); loadProfiles(); };
$("recenter").onclick = () => { S.follow = true; if (R.nav) { chaseCam(600); return; } if (S.me) map.easeTo({ center: [S.me.lng, S.me.lat], zoom: Math.max(map.getZoom(), 15), pitch: 50, bearing: followBearing() }); else toast("Ainda sem localização"); };
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
function setSheet(open) { panel.classList.toggle("collapsed", !open); sheetH(); }
// swipe up/down on the sheet's top bar (a tap also toggles it)
(() => {
  const head = $("sheetHead"); let y0 = null, moved = 0;
  head.addEventListener("pointerdown", e => { if (innerWidth >= 760 || e.target.closest(".chip")) return; y0 = e.clientY; moved = 0; head.setPointerCapture(e.pointerId); panel.classList.add("dragging"); });
  head.addEventListener("pointermove", e => { if (y0 == null) return; moved = e.clientY - y0; });
  const end = () => {
    if (y0 == null) return; y0 = null; panel.classList.remove("dragging");
    if (moved < -25) setSheet(true); else if (moved > 25) setSheet(false); else setSheet(panel.classList.contains("collapsed"));
  };
  head.addEventListener("pointerup", end); head.addEventListener("pointercancel", end);
  // swipe down from the top of the list closes it
  let ty = null; const body = $("pbody");
  body.addEventListener("touchstart", e => { ty = body.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  body.addEventListener("touchend", e => { if (ty != null && e.changedTouches[0].clientY - ty > 60) setSheet(false); ty = null; }, { passive: true });
})();
addEventListener("resize", sheetH);
if (innerWidth >= 760) panel.classList.remove("collapsed");
document.addEventListener("keydown", e => { if (e.key === "Escape") { ["events", "profile", "menu", "search"].forEach(i => $(i).hidden = true); $("card").hidden = true; S.pick = false; } });

$("start").onclick = () => { $("welcome").hidden = true; store.set("welcomed", true); startGps(); };
$("startNoGps").onclick = () => { $("welcome").hidden = true; gpsMsg("Sem localização: estás só a ver o mapa."); };

// ---------------- boot ----------------
(async () => {
  applyTheme(); setGhost(S.ghost); fillProfile(); renderHome(); renderList(); sheetH();
  if (store.get("welcomed", false)) { $("welcome").hidden = true; startGps(); }
  try { S.uid = await B.init(); }
  catch (e) { console.warn(e); toast("Não foi possível ligar ao servidor. A funcionar só no teu telemóvel."); return; }
  B.onDriver(onDriver);
  B.onChanges(kind => { if (kind === "events") loadEvents(); if (kind === "reports") loadReports(); if (kind === "profiles") loadProfiles(); });
  map.once("load", () => { loadEvents(); loadReports(); });
  if (map.loaded()) { loadEvents(); loadReports(); }
  loadProfiles();
  setInterval(loadReports, 60000);
  setInterval(renderHighlights, 30000);
  if (B.mode === "demo") setTimeout(loadEvents, 3000);
  renderHighlights();
})();

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// ---------------- north button ----------------
function applyNorth() {
  $("northBtn").classList.toggle("on", S.north);
  $("northBtn").setAttribute("aria-label", S.north ? "Mapa com norte fixo (toca para seguir a tua direção)" : "Pôr o norte para cima");
}
map.on("rotate", () => { $("northNeedle").style.transform = `rotate(${-map.getBearing()}deg)`; });
$("northBtn").onclick = () => {
  S.north = !S.north; store.set("north", S.north); applyNorth();
  toast(S.north ? "Norte fixo no topo" : "O mapa segue a tua direção");
  if (S.north) map.easeTo({ bearing: 0, duration: 500 });
  else { S.follow = true; if (R.nav) chaseCam(600); else if (S.me) map.easeTo({ center: [S.me.lng, S.me.lat], bearing: followBearing(), duration: 600 }); }
};
applyNorth();
})();
