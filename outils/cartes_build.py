#!/usr/bin/env python3
"""Construit cartes.js : les fonds de carte publics de la rubrique « Questionner l'espace ».

Sources (téléchargées dans un cache local, jamais commitées) :
- Natural Earth, 1:50m, pays (domaine public) : https://www.naturalearthdata.com
- IGN Admin Express 2018 via france-geojson (Licence ouverte Etalab) : https://github.com/gregoiredavid/france-geojson

Fonds produits :
- monde : planisphère (projection Natural Earth), continents et océans cliquables ;
- france : France métropolitaine, régions, pays voisins, mers ; projection donnée pour placer une ville par sa latitude et sa longitude ;
- europe : Europe de l'Ouest, un pays par zone (le Royaume-Uni en 4 parties : Angleterre, Écosse, pays de Galles, Irlande du Nord), villes par latitude et longitude.

Usage : python3 outils/cartes_build.py   (pip install --break-system-packages shapely)
Le fond « autour de chez moi » d'une leçon se fait avec outils/fond_local.py : il est personnel, il va dans la leçon chiffrée.
"""
import json
import math
import urllib.request
from pathlib import Path

from shapely.geometry import shape, box, Polygon, MultiPolygon, mapping
import warnings
from shapely.ops import unary_union, transform

warnings.filterwarnings("ignore", category=DeprecationWarning)

RACINE = Path(__file__).resolve().parent.parent
CACHE = Path("/tmp/cartes-src")
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
NE_SUB = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_map_subunits.geojson"
FG = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/"


def source(url):
    CACHE.mkdir(exist_ok=True)
    f = CACHE / url.rsplit("/", 1)[-1]
    if not f.exists():
        urllib.request.urlretrieve(url, f)
    return json.loads(f.read_text(encoding="utf-8"))


def feats(d):
    """Liste des entités d'un GeoJSON (collection, entité seule ou géométrie seule)."""
    if d.get("type") == "FeatureCollection":
        return d["features"]
    if d.get("type") == "Feature":
        return [d]
    return [{"type": "Feature", "properties": {}, "geometry": d}]


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]


def path_d(g, nd=1):
    """Chemin SVG d'une géométrie déjà projetée."""
    out = []
    fmt = lambda v: (f"{v:.{nd}f}").rstrip("0").rstrip(".") if nd else str(int(round(v)))
    for p in polys(g):
        for ring in [p.exterior] + list(p.interiors):
            c = list(ring.coords)[:-1]
            if len(c) < 3:
                continue
            out.append("M" + " ".join(fmt(x) + " " + fmt(y) for x, y in c) + "Z")
    return "".join(out)


# ------------------------------------------------------------------ monde
def ne_proj(lon, lat):
    """Projection Natural Earth (Šavrič et al.), en radians puis mise à l'échelle."""
    l, p = math.radians(lon), math.radians(lat)
    p2 = p * p
    p4 = p2 * p2
    x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)))
    y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
    return x, y


XMAX, _ = ne_proj(180, 0)
_, YMAX = ne_proj(0, 90)
W_MONDE = 1000
S_MONDE = W_MONDE / (2 * XMAX)
H_MONDE = round(2 * YMAX * S_MONDE)


def monde_xy(lon, lat):
    x, y = ne_proj(lon, lat)
    return (x + XMAX) * S_MONDE, (YMAX - y) * S_MONDE


def proj_monde(g):
    return transform(lambda xs, ys, zs=None: tuple(zip(*[monde_xy(x, y) for x, y in zip(xs, ys)])), g.segmentize(1.0))


def continent_de(nom_ne, conti, lon, lat):
    """Continent scolaire d'une partie de pays (les territoires d'outre-mer suivent leur position)."""
    if conti == "Seven seas (open ocean)":
        return None
    if lat < -55:
        return "antarctique"
    if conti == "Europe":
        if lat < -40:
            return None
        if -120 < lon < -25:
            return "amerique_nord" if lat > 12 else "amerique_sud"
        if lon > 100 or lon <= -120:
            return "oceanie"
        if lat < 34:
            return "afrique" if lon < 60 else None
        return "europe"
    if conti == "North America" and lon < -150 and lat < 30:
        return "oceanie"  # Hawaï
    return {"Africa": "afrique", "Asia": "asie", "North America": "amerique_nord", "South America": "amerique_sud",
            "Oceania": "oceanie", "Antarctica": "antarctique"}.get(conti)


OCEANS = {
    "oc_arctique": [(-180, 66.5), (180, 66.5), (180, 90), (-180, 90)],
    "oc_austral": [(-180, -90), (180, -90), (180, -60), (-180, -60)],
    "oc_atlantique": [(-67, -60), (20, -60), (20, -35), (32, 31), (45, 66.5), (-105, 66.5), (-105, 30), (-95, 17),
                      (-85, 12), (-77, 8), (-75, 0), (-65, -20), (-67, -55)],
    "oc_indien": [(20, -60), (147, -60), (147, -40), (130, -12), (125, -9), (105, -6), (100, 5), (98, 20), (60, 30),
                  (32, 31), (20, -35)],
}


def build_monde():
    ne = source(NE)
    parts = {}
    for f in ne["features"]:
        pr = f["properties"]
        g = shape(f["geometry"]).buffer(0)
        if pr["ADM0_A3"] == "RUS":
            west = g.intersection(box(-180, -90, 60, 90))
            east = g.difference(box(-180, -90, 60, 90))
            for p in polys(west):
                c = p.representative_point()
                parts.setdefault("europe" if c.x > 0 else "asie", []).append(p)
            for p in polys(east):
                parts.setdefault("asie", []).append(p)
            continue
        for p in polys(g):
            c = p.representative_point()
            k = continent_de(pr["NAME"], pr["CONTINENT"], c.x, c.y)
            if k:
                parts.setdefault(k, []).append(p)
    zones = {}
    for k, ps in parts.items():
        u = unary_union(ps).buffer(0)
        u = MultiPolygon([p for p in polys(u) if p.area > 0.15])  # îlots trop petits pour le doigt
        zones[k] = proj_monde(u).simplify(0.6)
    terre = unary_union([shape(f["geometry"]).buffer(0) for f in ne["features"]])
    monde = box(-180, -90, 180, 90)
    eau = {}
    for k, pts in OCEANS.items():
        eau[k] = Polygon(pts).intersection(monde)
    eau["oc_pacifique"] = box(-180, -60, 180, 66.5).difference(unary_union([eau["oc_atlantique"], eau["oc_indien"]]))
    for k in eau:
        eau[k] = proj_monde(eau[k]).simplify(0.3)
    contour = proj_monde(monde).simplify(0.3)
    return zones, eau, contour


LABELS_MONDE = {
    "afrique": [(18, 6)], "amerique_nord": [(-102, 47)], "amerique_sud": [(-60, -12)], "antarctique": [(0, -80)],
    "asie": [(92, 50)], "europe": [(24, 53)], "oceanie": [(134, -25)],
    "oc_pacifique": [(-140, 2), (165, 20)], "oc_atlantique": [(-38, 25), (-15, -28)], "oc_indien": [(78, -22)],
    "oc_arctique": [(40, 85)], "oc_austral": [(-110, -64)],
}
NOMS_MONDE = {  # avec l'article : « Non, ça, c'est l'Asie. »
    "afrique": "l'Afrique", "amerique_nord": "l'Amérique du Nord", "amerique_sud": "l'Amérique du Sud", "antarctique": "l'Antarctique",
    "asie": "l'Asie", "europe": "l'Europe", "oceanie": "l'Océanie", "oc_pacifique": "l'océan Pacifique",
    "oc_atlantique": "l'océan Atlantique", "oc_indien": "l'océan Indien", "oc_arctique": "l'océan Arctique", "oc_austral": "l'océan Austral",
}


# ------------------------------------------------------------------ France
F_LON0, F_LAT0, F_LON1, F_LAT1 = -5.6, 41.0, 10.0, 51.75
F_C = math.cos(math.radians(46.5))
W_FR = 1000
F_K = W_FR / ((F_LON1 - F_LON0) * F_C)
H_FR = round((F_LAT1 - F_LAT0) * F_K)


def fr_xy(lon, lat):
    return (lon - F_LON0) * F_C * F_K, (F_LAT1 - lat) * F_K


def proj_fr(g):
    return transform(lambda xs, ys, zs=None: tuple(zip(*[fr_xy(x, y) for x, y in zip(xs, ys)])), g)


def build_france():
    cadre = box(F_LON0, F_LAT0, F_LON1, F_LAT1)
    met = unary_union([shape(f["geometry"]).buffer(0) for f in feats(source(FG + "metropole-version-simplifiee.geojson"))])
    regs = [shape(f["geometry"]).buffer(0) for f in source(FG + "regions-version-simplifiee.geojson")["features"]
            if len(f["properties"]["code"]) == 2 and f["properties"]["code"] >= "11"]
    frontieres = unary_union([r.boundary for r in regs]).difference(met.boundary.buffer(0.01))
    ne = source(NE)
    voisins = unary_union([shape(f["geometry"]).buffer(0).intersection(cadre) for f in ne["features"]
                           if f["properties"]["ADM0_A3"] != "FRA"]).difference(met.buffer(0.02))
    fr = proj_fr(met).simplify(0.5)
    vo = proj_fr(voisins).simplify(0.7)
    lignes = proj_fr(frontieres).simplify(0.5)
    d_lignes = []
    for ln in getattr(lignes, "geoms", [lignes]):
        c = list(getattr(ln, "coords", []))
        if len(c) >= 2:
            d_lignes.append("M" + " ".join(f"{x:.1f} {y:.1f}" for x, y in c))
    return fr, vo, "".join(d_lignes)


TEXTES_FR = [  # étiquettes du fond : pays voisins et mers (italique, discrètes)
    ("Belgique", 4.9, 50.62, "pays"), ("Allemagne", 8.4, 49.75, "pays"), ("Suisse", 8.0, 46.75, "pays"), ("Italie", 8.9, 44.85, "pays"),
    ("Espagne", -3.2, 41.9, "pays"), ("Royaume-Uni", -2.6, 51.15, "pays"),
    ("La Manche", -2.4, 49.95, "mer"), ("Océan Atlantique", -4.2, 46.0, "mer"), ("Mer Méditerranée", 5.6, 42.3, "mer"),
    ("Mer du Nord", 2.4, 51.5, "mer"),
]


# ------------------------------------------------------------------ Europe
E_LON0, E_LAT0, E_LON1, E_LAT1 = -11.0, 35.4, 16.0, 56.2
E_C = math.cos(math.radians(46.5))
W_EU = 1000
E_K = W_EU / ((E_LON1 - E_LON0) * E_C)
H_EU = round((E_LAT1 - E_LAT0) * E_K)
PAYS = {  # clé de zone : (nom avec article, code Natural Earth ADM0_A3 ou SU_A3, position de l'étiquette ou None)
    "france": ("la France", "FRA", (2.4, 46.6)), "espagne": ("l'Espagne", "ESP", (-3.6, 40.0)), "portugal": ("le Portugal", "PRT", (-8.0, 40.7)),
    "angleterre": ("l'Angleterre", "ENG", (-1.6, 52.6)), "ecosse": ("l'Écosse", "SCT", (-4.2, 56.6)), "pays_de_galles": ("le pays de Galles", "WLS", (-3.7, 52.3)),
    "irlande_du_nord": ("l'Irlande du Nord", "NIR", (-6.7, 54.6)), "irlande": ("l'Irlande", "IRL", (-8.0, 53.2)),
    "belgique": ("la Belgique", "BEL", (4.6, 50.6)), "pays_bas": ("les Pays-Bas", "NLD", (6.4, 53.45)), "luxembourg": ("le Luxembourg", "LUX", None),
    "allemagne": ("l'Allemagne", "DEU", (10.0, 51.0)), "suisse": ("la Suisse", "CHE", (8.2, 46.8)), "italie": ("l'Italie", "ITA", (12.5, 42.8)),
    "autriche": ("l'Autriche", "AUT", (14.0, 47.4)), "danemark": ("le Danemark", "DNK", (9.2, 56.0)), "andorre": ("Andorre", "AND", None),
    "maroc": ("le Maroc", "MAR", (-5.5, 35.0)), "algerie": ("l'Algérie", "DZA", (3.0, 35.8)), "tunisie": ("la Tunisie", "TUN", None),
    "tchequie": ("la Tchéquie", "CZE", (15.0, 49.8)), "pologne": ("la Pologne", "POL", (15.5, 52.5)), "slovenie": ("la Slovénie", "SVN", None),
    "croatie": ("la Croatie", "HRV", None), "liechtenstein": ("le Liechtenstein", "LIE", None), "monaco": ("Monaco", "MCO", None),
    "saint_marin": ("Saint-Marin", "SMR", None), "malte": ("Malte", "MLT", None), "vatican": ("le Vatican", "VAT", None),
    "hongrie": ("la Hongrie", "HUN", None), "slovaquie": ("la Slovaquie", "SVK", None), "bosnie": ("la Bosnie-Herzégovine", "BIH", None),
}
TEXTES_EU = [("Océan Atlantique", -8.5, 46.5, "mer"), ("Mer Méditerranée", 4.6, 39.0, "mer"), ("Mer du Nord", 3.2, 55.2, "mer"),
             ("La Manche", -3.4, 49.85, "mer")]


def eu_xy(lon, lat):
    return (lon - E_LON0) * E_C * E_K, (E_LAT1 - lat) * E_K


def proj_eu(g):
    return transform(lambda xs, ys, zs=None: tuple(zip(*[eu_xy(x, y) for x, y in zip(xs, ys)])), g)


def build_europe():
    cadre = box(E_LON0, E_LAT0, E_LON1, E_LAT1)
    par_code = {}
    for f in source(NE)["features"]:
        par_code[f["properties"]["ADM0_A3"]] = shape(f["geometry"]).buffer(0)
    for f in source(NE_SUB)["features"]:
        if f["properties"]["ADM0_A3"] == "GBR":
            par_code[f["properties"]["SU_A3"]] = shape(f["geometry"]).buffer(0)
    parts = {}
    for k, (nom, code, lab) in PAYS.items():
        g = par_code.get(code)
        if g is None or not g.intersects(cadre):
            continue
        g = g.intersection(cadre)
        if code == "FRA":  # métropole et Corse seulement
            g = g.intersection(box(-6, 41, 10, 52))
        g = proj_eu(g).simplify(0.5)
        if g.is_empty:
            continue
        pt = eu_xy(*lab) if lab else None
        parts[k] = {"nom": nom, "d": path_d(g), "type": "pays", "labels": [[round(pt[0], 1), round(pt[1], 1)]] if pt else []}
    manquants = {code for _, code, _ in PAYS.values()} - set(par_code)
    if manquants:
        print("  codes absents :", ", ".join(sorted(manquants)))
    return parts


def main():
    zones, eau, contour = build_monde()
    z = {}
    for k, g in list(zones.items()) + list(eau.items()):
        z[k] = {"nom": NOMS_MONDE[k], "d": path_d(g), "type": "ocean" if k.startswith("oc_") else "continent",
                "labels": [[round(v, 1) for v in monde_xy(lo, la)] for lo, la in LABELS_MONDE[k]]}
    fr, vo, lignes = build_france()
    textes = [[t, round(fr_xy(lo, la)[0], 1), round(fr_xy(lo, la)[1], 1), s] for t, lo, la, s in TEXTES_FR]
    data = {
        "monde": {"vb": [0, 0, W_MONDE, H_MONDE], "contour": path_d(contour), "parts": z,
                  "zones": {"amerique": ["amerique_nord", "amerique_sud"]}},
        "france": {"vb": [0, 0, W_FR, H_FR], "france": path_d(fr), "voisins": path_d(vo), "regions": lignes, "textes": textes,
                   "proj": {"lon0": F_LON0, "lat1": F_LAT1, "c": round(F_C, 6), "k": round(F_K, 4)}},
    }
    eu = build_europe()
    data["europe"] = {"vb": [0, 0, W_EU, H_EU], "parts": eu, "zones": {"royaume_uni": ["angleterre", "ecosse", "pays_de_galles", "irlande_du_nord"]},
                      "textes": [[t, round(eu_xy(lo, la)[0], 1), round(eu_xy(lo, la)[1], 1), s] for t, lo, la, s in TEXTES_EU],
                      "proj": {"lon0": E_LON0, "lat1": E_LAT1, "c": round(E_C, 6), "k": round(E_K, 4)}}
    js = ("/* Fonds de carte de la rubrique « Questionner l'espace ». Fichier généré par outils/cartes_build.py : ne pas modifier à la main.\n"
          "   Sources : Natural Earth (domaine public) ; IGN Admin Express 2018 via france-geojson (Licence ouverte Etalab). */\n"
          "window.CARTES = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (RACINE / "cartes.js").write_text(js, encoding="utf-8")
    print(f"cartes.js : {len(js) // 1024} Ko ; monde {W_MONDE}×{H_MONDE}, France {W_FR}×{H_FR}, Europe {W_EU}×{H_EU} ({len(eu)} pays)")
    for k, v in z.items():
        print(f"  {k:15s} {len(v['d']):6d} car.")


if __name__ == "__main__":
    main()
