"""Vérifie les générateurs d'exercices (generateurs.js) sur des milliers de tirages.

Usage : python3 -I tests/test_generateurs.py
- chaque réponse est recalculée par l'évaluateur de validate.py à partir de l'expression ;
- « le plus grand / le plus petit » est recalculé à partir des deux nombres affichés ;
- les nombres en lettres sont comparés à num2words (orthographe rectifiée : tirets partout), si installé.
Prérequis : node.
"""
import json
import re
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "outils"))
from validate import eval_expr  # noqa: E402

try:
    from num2words import num2words
except ImportError:
    num2words = None

N = 400
SPECS = [
    {"id": "g1", "type": "decomposition", "nombre": 1, "params": {"chiffres": 3, "forme": "produits"}},
    {"id": "g2", "type": "decomposition", "nombre": 1, "params": {"chiffres": 4, "forme": "somme"}},
    {"id": "g3", "type": "composition", "nombre": 1, "params": {"chiffres": 3}},
    {"id": "g4", "type": "composition", "nombre": 1, "params": {"chiffres": 4}},
    {"id": "g5", "type": "echanges", "nombre": 1},
    {"id": "g6", "type": "ecrire_chiffres", "nombre": 1, "params": {"chiffres": 3}},
    {"id": "g7", "type": "ecrire_chiffres", "nombre": 1, "params": {"chiffres": 4}},
    {"id": "g8", "type": "comparer", "nombre": 1, "params": {"chiffres": 4, "sens": "mixte"}},
    {"id": "g9", "type": "table", "nombre": 1, "params": {"tables": [2, 3, 4, 5, 6, 7, 8, 9], "operation": "mixte"}},
    {"id": "g10", "type": "partage", "nombre": 1, "params": {"tables": [2, 3, 4, 5]}},
    {"id": "g11", "type": "moitie", "nombre": 1, "params": {"max": 50}},
    {"id": "g12", "type": "fractions", "nombre": 1, "params": {"operation": "mixte"}},
    {"id": "g13", "type": "heure", "nombre": 1},
    {"id": "g14", "type": "heure", "nombre": 1, "params": {"cas": "horloge"}},
    {"id": "g15", "type": "multiplication_posee", "nombre": 1, "params": {"chiffres": 3, "chiffres_multiplicateur": 2}},
    {"id": "g16", "type": "conversion", "nombre": 1, "params": {"groupes": ["longueur", "masse", "contenance", "duree"]}},
    {"id": "g17", "type": "perimetre", "nombre": 1},
    {"id": "g18", "type": "double_moitie", "nombre": 1},
    {"id": "g19", "type": "decomposer_produit", "nombre": 1},
    {"id": "g20", "type": "table", "nombre": 1, "params": {"tables": [25], "jusqua": 6}},
    {"id": "g21", "type": "table", "nombre": 1, "params": {"tables": [6, 7, 8, 9], "operation": "addition"}},
]
JS = f"""
require({json.dumps(str(ROOT / "generateurs.js"))});
const G = globalThis.GENERATEURS, out = [];
for (let i = 0; i < {N}; i++) out.push(...G.creer({json.dumps(SPECS)}));
out.push(...G.creer([{{"id": "s", "type": "table", "nombre": 6, "params": {{"tables": [2]}}}}]).map(x => Object.assign(x, {{session: true}})));
process.stdout.write(JSON.stringify(out));
"""
items = json.loads(subprocess.run(["node", "-e", JS], capture_output=True, text=True, check=True).stdout)

fails = []
def ko(msg):
    if len(fails) < 15:
        print("  KO ", msg)
    fails.append(msg)

def txt(c):
    return c if isinstance(c, str) else c["texte"]

counts = {}
for it in items:
    counts[it["genere"]] = counts.get(it["genere"], 0) + 1
    rep = it["reponse"]
    if not re.fullmatch(r"[0-9]{1,7}", rep):
        ko(f"réponse non saisissable au pavé : {it}")
    if "comparaison" in it:
        a, b = it["comparaison"]["nombres"]
        attendu = max(a, b) if it["comparaison"]["sens"] == "grand" else min(a, b)
        if a == b or int(rep) != attendu or str(a)[0] != str(b)[0] and len(str(a)) != len(str(b)):
            ko(f"comparaison : {it}")
        shown = [int(x.replace(" ", "")) for x in re.findall(r"\d[\d ]*\d|\d", txt(it["consigne"]))]
        if shown != [a, b]:
            ko(f"comparaison : nombres affichés {shown} ≠ {[a, b]}")
        continue
    val = eval_expr(it["expression"])
    if val != Fraction(int(rep)):
        ko(f"{it['expression']} = {val} et non {rep}")
    if "svg" in it:
        # relit l'horloge : angle de la grande aiguille (rouge) et de la petite (bleue)
        import math
        def angle(color):
            m = re.search(r'x2="([\d.]+)" y2="([\d.]+)" stroke="' + color, it["svg"])
            x, y = float(m[1]) - 110, 110 - float(m[2])
            return math.degrees(math.atan2(x, y)) % 360
        mins = round(angle("#c62828") / 6) % 60
        heures = int(((angle("#1f3c88") + 1) % 360) // 30) or 12  # +1° : coordonnées arrondies au dixième
        attendu = mins if "minutes" in txt(it["consigne"]) else heures
        if int(rep) != attendu:
            ko(f"horloge : lue {heures} h {mins}, réponse {rep}")
        if "heure indique" in txt(it["consigne"]) and mins > 25:
            ko(f"horloge : petite aiguille ambiguë ({heures} h {mins})")
    if it["genere"] == "fractions":
        f = re.findall(r"\{frac:(\d+)/(\d+)\}", txt(it["consigne"]))
        (a, d1), (b, d2) = f
        signe = "+" if "+" in txt(it["consigne"]) else "−"
        r = int(a) + int(b) if signe == "+" else int(a) - int(b)
        if d1 != d2 or int(rep) != r or not 0 <= r <= int(d1) or int(b) < 1:
            ko(f"fractions : {txt(it['consigne'])} → {rep}")
    if it["genere"] == "ecrire_chiffres":
        if num2words:
            ref = num2words(int(rep), lang="fr").replace(" ", "-")
            if ref != it["lettres"]:
                ko(f"{rep} : « {it['lettres']} » au lieu de « {ref} »")
    if isinstance(it["consigne"], dict) and "÷" in it["consigne"]["oral"]:
        ko(f"symbole ÷ lu par la synthèse vocale : {it}")

# pas de doublon dans une même séance
sess = [txt(x["consigne"]) for x in items if x.get("session")]
if len(sess) != len(set(sess)) or len(sess) != 6:
    ko(f"doublons ou nombre incorrect dans une séance : {sess}")

# couverture exhaustive des nombres en lettres jusqu'à 10 000
if num2words:
    out = subprocess.run(["node", "-e", f"require({json.dumps(str(ROOT / 'generateurs.js'))});"
                          "const L=[];for(let n=0;n<=10000;n++)L.push(globalThis.GENERATEURS.enLettres(n));"
                          "process.stdout.write(JSON.stringify(L))"], capture_output=True, text=True, check=True).stdout
    for n, w in enumerate(json.loads(out)):
        if w != num2words(n, lang="fr").replace(" ", "-"):
            ko(f"en lettres {n} : « {w} » au lieu de « {num2words(n, lang='fr').replace(' ', '-')} »")
else:
    print("  (num2words absent : nombres en lettres non vérifiés)")

print(f"{len(items)} exercices tirés : " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
print("RÉSULTAT :", "PASS" if not fails else f"FAIL ({len(fails)})")
sys.exit(1 if fails else 0)
