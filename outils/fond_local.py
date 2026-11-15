#!/usr/bin/env python3
"""Fabrique le fond de carte d'un lieu proche (quelques communes), à mettre dans une leçon chiffrée.

Le résultat est un SVG (`images[].svg` de la leçon) : départements, pays voisin, et une zone par commune
(`id` choisi, `data-lx`/`data-ly` = point de l'étiquette). La leçon le désigne dans `carte.fond` ("img1")
et chaque cible désigne sa zone (`"zone": "z-xxx"`).
Les communes choisies sont personnelles : ne jamais écrire ce SVG ni ces codes dans le dépôt.

Usage :
  python3 -I outils/fond_local.py --communes 33063:z-a,33281:z-b --sortie /tmp/fond.svg [--marge 0.25] [--largeur 1000]
Sources : IGN Admin Express 2018 via france-geojson (Licence ouverte Etalab), Natural Earth (domaine public).
"""
import argparse
import json
import math
import sys
import urllib.request
import warnings
from pathlib import Path

from shapely.geometry import shape, box
from shapely.ops import unary_union, transform

warnings.filterwarnings("ignore", category=DeprecationWarning)
CACHE = Path("/tmp/cartes-src")
FG = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
NOMS_DEP = {}


def source(url):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / url.rsplit("/", 1)[-1]
    if not f.exists():
        urllib.request.urlretrieve(url, f)
    return json.loads(f.read_text(encoding="utf-8"))


def communes_dep(dep):
    deps = source(FG + "departements-version-simplifiee.geojson")["features"]
    nom = [f["properties"]["nom"] for f in deps if f["properties"]["code"] == dep][0]
    slug = nom.lower().replace(" ", "-").replace("'", "-")
    for a, b in (("é", "e"), ("è", "e"), ("ô", "o"), ("ç", "c"), ("â", "a"), ("î", "i")):
        slug = slug.replace(a, b)
    return source(f"{FG}departements/{dep}-{slug}/communes-{dep}-{slug}.geojson")["features"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--communes", required=True, help="code_insee:id_zone, séparés par des virgules")
    ap.add_argument("--sortie", required=True)
    ap.add_argument("--marge", type=float, default=0.25, help="marge autour des communes, en fraction de l'étendue")
    ap.add_argument("--largeur", type=int, default=1000)
    a = ap.parse_args()
    if "/cahier-revisions/" in str(Path(a.sortie).resolve()):
        sys.exit("Refusé : ce fond est personnel, écris-le hors du dépôt (ex. /tmp/fond.svg).")
    voulues = dict(x.split(":") for x in a.communes.split(","))
    deps = sorted({c[:2] for c in voulues})
    geo, noms = {}, {}
    for dep in deps:
        for f in communes_dep(dep):
            if f["properties"]["code"] in voulues:
                geo[f["properties"]["code"]] = shape(f["geometry"]).buffer(0)
                noms[f["properties"]["code"]] = f["properties"]["nom"]
    manquantes = set(voulues) - set(geo)
    if manquantes:
        sys.exit(f"communes introuvables : {', '.join(sorted(manquantes))}")
    u = unary_union(list(geo.values()))
    x0, y0, x1, y1 = u.bounds
    mx, my = (x1 - x0) * a.marge, (y1 - y0) * a.marge
    m = max(mx, my / 1.0)
    cadre = box(x0 - m, y0 - m, x1 + m, y1 + m)
    lon0, lat0, lon1, lat1 = cadre.bounds
    c = math.cos(math.radians((lat0 + lat1) / 2))
    k = a.largeur / ((lon1 - lon0) * c)
    H = round((lat1 - lat0) * k)
    xy = lambda lon, lat: ((lon - lon0) * c * k, (lat1 - lat) * k)
    proj = lambda g: transform(lambda xs, ys, zs=None: tuple(zip(*[xy(x, y) for x, y in zip(xs, ys)])), g)

    def d_of(g, tol=1.0):
        g = proj(g).simplify(tol)
        out = []
        for p in getattr(g, "geoms", [g]):
            if p.geom_type != "Polygon":
                continue
            for ring in [p.exterior] + list(p.interiors):
                pts = list(ring.coords)[:-1]
                if len(pts) >= 3:
                    out.append("M" + " ".join(f"{x:.0f} {y:.0f}" for x, y in pts) + "Z")
        return "".join(out)

    def lignes(g, tol=1.0):
        g = proj(g).simplify(tol)
        out = []
        for ln in getattr(g, "geoms", [g]):
            pts = list(getattr(ln, "coords", []))
            if len(pts) >= 2:
                out.append("M" + " ".join(f"{x:.0f} {y:.0f}" for x, y in pts))
        return "".join(out)

    dep_feats = [f for f in source(FG + "departements-version-simplifiee.geojson")["features"]]
    dep_geo = {f["properties"]["code"]: shape(f["geometry"]).buffer(0) for f in dep_feats}
    dans = {code: g.intersection(cadre) for code, g in dep_geo.items() if g.intersects(cadre)}
    france = unary_union(list(dans.values()))
    limites = unary_union([g.boundary for g in dans.values()]).intersection(france.buffer(-0.0005)).intersection(cadre)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {a.largeur} {H}">',
             f'<rect width="{a.largeur}" height="{H}" fill="#e3e3e3"/>',
             f'<path d="{d_of(france)}" fill="#fff6e0" stroke="#666" stroke-width="2"/>',
             f'<path d="{lignes(limites)}" fill="none" stroke="#a07" stroke-width="2" stroke-dasharray="8 5"/>']
    etiquettes = []
    hors = cadre.difference(france.buffer(0.001))
    ne = source(NE)["features"]
    for f in ne:
        g = shape(f["geometry"]).buffer(0)
        if f["properties"]["ADM0_A3"] != "FRA" and g.intersects(hors) and hors.intersection(g).area > hors.area * 0.15:
            p = hors.intersection(g).representative_point()
            etiquettes.append((f["properties"]["NAME_FR"] if "NAME_FR" in f["properties"] else f["properties"]["NAME"], *xy(p.x, p.y), "#666"))
    for code, g in dans.items():
        if g.area > cadre.area * 0.12:
            p = g.difference(u.buffer(0.035)).representative_point()
            etiquettes.append((dep_feats[[f["properties"]["code"] for f in dep_feats].index(code)]["properties"]["nom"], *xy(p.x, p.y), "#a07"))
    infos = []
    for code, zid in voulues.items():
        g = geo[code]
        p = g.representative_point()
        lx, ly = xy(p.x, p.y)
        parts.append(f'<path id="{zid}" data-lx="{lx:.0f}" data-ly="{ly:.0f}" d="{d_of(g, 0.8)}" fill="#ffd27a" stroke="#8a5a00" stroke-width="2"/>')
        infos.append((zid, noms[code], round(lx), round(ly)))
    for t, x, y, col in etiquettes:
        demi = len(t) * 28 * 0.3
        x = max(demi + 6, min(a.largeur - demi - 6, x))
        parts.append(f'<text x="{x:.0f}" y="{y:.0f}" font-size="28" font-style="italic" fill="{col}" text-anchor="middle">{t}</text>')
    parts.append("</svg>")
    svg = "".join(parts)
    Path(a.sortie).write_text(svg, encoding="utf-8")
    print(f"{a.sortie} : {len(svg)} caractères, {a.largeur}×{H}")
    for zid, nom, lx, ly in infos:
        print(f"  {zid:12s} {nom:25s} étiquette ({lx}, {ly})")


if __name__ == "__main__":
    main()
