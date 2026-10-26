#!/usr/bin/env python3
"""Descarrega os preços dos combustíveis da DGEG (precoscombustiveis.dgeg.gov.pt)
e grava um ficheiro compacto precos.json para a app.

Corre num GitHub Action (ver .github/workflows/precos.yml), porque o site da DGEG
não deixa ser lido diretamente por apps web noutro domínio.
"""
import json, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone

API = "https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos"
# id DGEG -> chave curta usada na app
FUELS = {
    2101: "gasoleo",            # Gasóleo simples
    2105: "gasoleo_aditivado",  # Gasóleo especial
    3201: "gasolina95",         # Gasolina simples 95
    3205: "gasolina95_aditivada",
    3400: "gasolina98",         # Gasolina 98
    3405: "gasolina98_aditivada",
    1120: "gpl",                # GPL Auto
}

def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "StreetMaps/1.0 (+https://per31ra.github.io/Streetmaps/)", "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print(f"falhou ({e}), nova tentativa", file=sys.stderr); time.sleep(5 * (attempt + 1))
    raise SystemExit("A DGEG não respondeu")

def price(v):
    if isinstance(v, (int, float)): return round(float(v), 3)
    try: return round(float(str(v).replace("€", "").replace(",", ".").strip()), 3)
    except ValueError: return None

stations = {}
for fid, key in FUELS.items():
    page, total = 1, 0
    while True:
        j = get({"idsTiposComb": fid, "idMarca": "", "idTipoPosto": "", "idDistrito": "", "idsMunicipios": "", "qtdPorPagina": 5000, "pagina": page})
        rows = j.get("resultado") or []
        if page == 1 and rows: print(key, "exemplo:", json.dumps(rows[0], ensure_ascii=False)[:400])
        for r in rows:
            sid, p = r.get("Id"), price(r.get("Preco"))
            lat, lng = r.get("Latitude"), r.get("Longitude")
            if sid is None or p is None or lat is None or lng is None: continue
            s = stations.setdefault(sid, {"n": (r.get("Nome") or "").strip(), "b": (r.get("Marca") or "").strip(),
                                          "lat": round(float(lat), 5), "lng": round(float(lng), 5), "p": {}, "u": ""})
            s["p"][key] = p
            s["u"] = max(s["u"], str(r.get("DataAtualizacao") or "")[:16])
        total += len(rows)
        if len(rows) < 5000: break
        page += 1
    print(key, total, "postos")

if len(stations) < 500:
    raise SystemExit(f"Só {len(stations)} postos: resposta estranha, não atualizo")
out = {"updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "source": "DGEG - Preços dos Combustíveis Online",
       "stations": list(stations.values())}
with open(sys.argv[1] if len(sys.argv) > 1 else "precos.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print(len(stations), "postos gravados")
