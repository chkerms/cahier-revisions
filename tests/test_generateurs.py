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


# ---- problèmes guidés : 1 000 tirages par cas, recalculés de façon indépendante
import xml.etree.ElementTree as ET

def valeur_schema(sc):
    """Valeur cachée derrière le « ? », recalculée à partir de la description du schéma."""
    f, q = sc["f"], (lambda x: x == "?")
    try:
        if f == "tout":
            conn = sum(x for x in sc["parts"] if not q(x))
            return Fraction(conn) if q(sc["top"]) else Fraction(sc["top"] - conn)
        if f == "cmp":
            if q(sc["grand"]):
                return Fraction(sc["petit"] + sc["ecart"])
            if q(sc["petit"]):
                return Fraction(sc["grand"] - sc["ecart"])
            return Fraction(sc["grand"] - sc["petit"])
        if f == "egal":
            if q(sc["top"]):
                return Fraction(sc["n"] * sc["part"])
            if q(sc["part"]):
                return Fraction(sc["top"], sc["n"])
            return Fraction(sc["top"], sc["part"])
        if f == "fois":
            return Fraction(sc["petit"] * sc["k"]) if q(sc["grand"]) else Fraction(sc["grand"], sc["k"])
    except (TypeError, ZeroDivisionError):
        return None
    raise ValueError(f)

def connus(sc):
    if sc["f"] == "tout":
        v = [sc["top"]] + sc["parts"]
    elif sc["f"] == "cmp":
        v = [sc["grand"], sc["petit"], sc["ecart"]]
    elif sc["f"] == "egal":
        v = [sc["top"], sc["n"], sc["part"]]
    else:
        v = [sc["petit"], sc["grand"]]
    return [x for x in v if x != "?"]

OP = {"s1_parties": "+", "s1_trois": "+", "s1_perimetre": "×", "s1_egales": "×", "s2_trois": "−", "s4_moins": "−", "s2_complement": "−", "s2_perte": "−", "s2_avant_ajout": "−", "s3_part": "÷",
      "s3_nombre": "÷", "s4_grande": "+", "s4_petite": "−", "s4_ecart": "−", "s5_fois_plus": "×", "s5_fois_moins": "÷"}
E2_CAS = ["e2_gagne_donne", "e2_depenses", "e2_groupes_fois", "e2_groupes_plus", "e2_total_partage"]
SPECIAUX = ["s2_fraction", "e2_seuil"]


def nb(x):
    """« 19,95 » ou « 3 785 » → valeur exacte"""
    return Fraction(x.replace("\u00a0", "").replace(" ", "").replace(",", "."))
def fmt(n):
    return f"{n:,}".replace(",", " ")
NP = 1000
for limite in (999, 9999):
    JSP = f"""
require({json.dumps(str(ROOT / "generateurs.js"))});
const G = globalThis.GENERATEURS, out = [];
const PERSO = {{enfant: ["Inès", "f"], amis: [["Anna", "f"], ["Elio", "m"], ["Iris", "f"]], maitresse: "Madame Olive", doudou: ["Doudou Ours", "m"], parents: [["Papa", "m"], ["Maman", "f"]],
  famille: [["Papi Jo", "m"]],
  problemes: [{{cas: "s1_parties", texte: "Inès cueille {{a}} prunes et {{b}} poires. Combien de fruits a-t-elle ?", unite: "fruits", phrase: "Inès a {{r}} fruits.", blague: "Miam !", max: 300}},
              {{cas: "e2_groupes_plus", texte: "Elio a {{n}} sacs de {{k}} billes et {{e}} billes dans sa poche. Combien de billes a-t-il ?", question: "Combien de billes y a-t-il dans les sacs ?", unite: "billes", phrase: "Elio a {{r}} billes.", k: [5, 8], e: [2, 9]}},
              {{cas: "s5_fois_plus", texte: "Iris a {{a}} perles. Anna en a {{kfois}} plus. Combien de perles a Anna ?", unite: "perles", phrase: "Anna a {{r}} perles.", f: [3, 9]}}]}};
for (const perso of [null, PERSO]) {{
  G.G.perso = perso;
  for (const c of G.G.probleme.cas) for (let i = 0; i < {NP}; i++) out.push(Object.assign(G.G.probleme({{problemes: [c], limite: {limite}, centimes: i % 2 === 0}}), {{c, perso: !!perso}}));
}}
G.G.perso = null;
out.push(...G.creer([{{id: "g2", type: "probleme", nombre: 6, ref: ["b1"], params: {{}}}}]).map(x => Object.assign(x, {{c: "defaut"}})));
out.push(...G.creer([{{id: "g1", type: "probleme", nombre: 6, ref: ["b1"], params: {{strategies: [4]}}}}]).map(x => Object.assign(x, {{c: "seance"}})));
process.stdout.write(JSON.stringify({{cas: G.G.probleme.cas, out}}));
"""
    res = json.loads(subprocess.run(["node", "-e", JSP], capture_output=True, text=True, check=True).stdout)
    if sorted(res["cas"]) != sorted(list(OP) + E2_CAS + SPECIAUX):
        ko(f"problèmes : cas {res['cas']}")
    vus = {}
    noms_perso = 0
    for it in res["out"]:
        P, t = it["probleme"], it["consigne"]["texte"]
        if it["c"] == "seance":
            if not P["cas"].startswith("s4_"):
                ko(f"problèmes : stratégie 4 demandée, cas {P['cas']}")
            continue
        if it["c"] == "defaut":
            if P["cas"].startswith("e2_"):
                ko(f"problèmes : sans « strategies », pas de problème à deux étapes ({P['cas']})")
            continue
        texte_complet = " ".join([x for x in [t, P["phrase"], P.get("blague")] + [e["question"] for e in P.get("etapes") or []] if x])
        if it["perso"] and re.search(r"Inès|Anna|Elio|Iris|Madame Olive|Doudou Ours", texte_complet):
            noms_perso += 1
        if not it["perso"] and re.search(r"Inès|Anna|Elio|Madame Olive|Doudou Ours", texte_complet):
            ko(f"problème {P['cas']} : personnalisation présente sans perso « {t} »")
        if re.search(r"\b(de|que) [AEIOUYÉÈ]", texte_complet):
            ko(f"problème {P['cas']} : élision manquante « {texte_complet} »")
        if P["cas"] == "s2_fraction":
            vus.setdefault(P["cas"], set()).add(t.split(" ")[0] + "…" + str(len(t)))
            m = re.search(r"\{frac:(\d+)/(\d+)\}", t)
            d_, a_, r_ = int(m[2]), int(m[1]), int(it["reponse"])
            E1 = P["etapes"]
            if len(E1) != 1 or r_ != d_ - a_ or r_ < 1 or E1[0]["calcul"] != f"{{frac:{d_}/{d_}}} − {{frac:{a_}/{d_}}}" or f"{{frac:{r_}/{d_}}}" not in P["phrase"]:
                ko(f"problème fraction : « {t} » → {it['reponse']} / {E1} / {P['phrase']}")
            if "{" in it["consigne"]["oral"] or "{" in P["phrase_oral"] or not t.endswith("?") or P["schemas"]:
                ko(f"problème fraction : oral ou forme « {it['consigne']['oral']} »")
            continue
        if P["cas"] == "e2_seuil":
            vus.setdefault(P["cas"], set()).add(t.split(" ")[0] + "…" + str(len(t)))
            E2 = P["etapes"]
            tot = eval_expr(E2[0]["calcul"])
            seuil = nb(E2[1]["seuil"])
            if len(E2) != 2 or not E2[1].get("ouinon") or tot != nb(E2[0]["reponse"]) or it["reponse"] not in ("oui", "non") or E2[1]["reponse"] != it["reponse"]:
                ko(f"problème seuil : étapes {E2}")
            if tot == seuil or not P["phrase"].startswith(it["reponse"].capitalize()) or f"{int(tot)}" not in P["phrase"].replace("\u00a0", " ").replace(" ", ""):
                ko(f"problème seuil : « {t} » / « {P['phrase']} »")
            assez = "assez" in t
            attendu = (tot >= seuil) if assez else (tot <= seuil)
            if (it["reponse"] == "oui") != attendu:
                ko(f"problème seuil : mauvaise réponse « {t} » total {tot}, seuil {seuil} → {it['reponse']}")
            if not E2[0]["question"].endswith("?") or not E2[1]["question"].endswith("?"):
                ko(f"problème seuil : questions {E2}")
            continue
        if P["cas"].startswith("e2_"):
            vus.setdefault(P["cas"], set()).add(t.split(" ")[0] + "…" + str(len(t)))
            E2 = P["etapes"]
            rep2 = int(it["reponse"])
            r1 = eval_expr(E2[0]["calcul"])
            if len(E2) != 2 or r1 != int(E2[0]["reponse"]) or eval_expr(E2[1]["calcul"]) != rep2 or int(E2[1]["reponse"]) != rep2:
                ko(f"problème {P['cas']} : étapes {E2} ≠ {rep2}")
            if fmt(int(E2[0]["reponse"])) not in E2[1]["calcul"].replace("\u00a0", " "):
                ko(f"problème {P['cas']} : l'étape 2 ne reprend pas le résultat de l'étape 1 ({E2})")
            for e in E2:
                if re.search(r" ([+−×÷]) ", e["calcul"])[1] != e["op"] or not e["question"].endswith("?") or not e["aideOp"]:
                    ko(f"problème {P['cas']} : étape {e}")
            if r1 < 1 or rep2 < 1 or r1 != int(r1) or max(r1, rep2) > limite:
                ko(f"problème {P['cas']} : résultat {r1} / {rep2} hors bornes")
            nombres = [int(x.replace(" ", "")) for x in re.findall(r"\d{1,3}(?: \d{3})+|\d+", t)]
            if max(nombres) > limite:
                ko(f"problème {P['cas']} : nombre > {limite} : « {t} »")
            if E2[1]["op"] == "÷" and int(E2[0]["reponse"]) % int(E2[1]["calcul"].split(" ÷ ")[1]):
                ko(f"problème {P['cas']} : division non exacte")
            if not t.endswith("?") or fmt(rep2) not in P["phrase"].replace("\u00a0", " ") or P["unite"] not in P["phrase"] + " " + t:
                ko(f"problème {P['cas']} : énoncé ou phrase « {t} » / « {P['phrase']} »")
            for mauvais in ("undefined", "NaN", "null", "  "):
                if mauvais in texte_complet:
                    ko(f"problème {P['cas']} : « {mauvais} » dans « {texte_complet} »")
            if re.search(r" \?|\d (€|kg|cm|dm|m|g|L)\b", texte_complet) or re.search(r"€|\d (kg|cm|dm|m|g|L)\b", it["consigne"]["oral"]):
                ko(f"problème {P['cas']} : espace ou unité « {t} »")
            counts["probleme"] = counts.get("probleme", 0) + 1
            continue
        vus.setdefault(P["cas"], set()).add(t.split(" ")[0] + "…" + str(len(t)))
        dec = bool(P.get("decimal"))
        rep = nb(it["reponse"])
        if dec and not re.fullmatch(r"\d+(,\d\d)?", it["reponse"].replace(" ", "")):
            ko(f"problème {P['cas']} : réponse en euros mal écrite « {it['reponse']} »")
        if eval_expr(it["expression"]) != rep or rep < 1 or P["calcul"] != it["expression"]:
            ko(f"problème {P['cas']} : {it['expression']} ≠ {rep}")
        if re.search(r" ([+−×÷]) ", it["expression"])[1] != OP[P["cas"]] or P["op"] != OP[P["cas"]]:
            ko(f"problème {P['cas']} : opération {it['expression']}")
        bons = [s for s in P["schemas"] if s["bon"]]
        if len(P["schemas"]) != 3 or len(bons) != 1:
            ko(f"problème {P['cas']} : {len(bons)} bon(s) schéma(s)")
            continue
        if valeur_schema(bons[0]["spec"]) != (rep * 100 if dec else rep):
            ko(f"problème {P['cas']} : le bon schéma vaut {valeur_schema(bons[0]['spec'])}, réponse {rep}")
        specs = [json.dumps(s["spec"], sort_keys=True) for s in P["schemas"]]
        if len(set(specs)) != 3:
            ko(f"problème {P['cas']} : schémas identiques")
        for s in P["schemas"]:
            if not s["bon"] and valeur_schema(s["spec"]) == (rep * 100 if dec else rep):
                ko(f"problème {P['cas']} : un mauvais schéma donne aussi {rep} ({s['spec']})")
            root = ET.fromstring(s["svg"])
            if not root.get("viewBox") or "script" in s["svg"] or "href" in s["svg"]:
                ko(f"problème {P['cas']} : SVG invalide")
        # nombres de l'énoncé = nombres connus du bon schéma ; bornes
        nombres = [nb(x) * (100 if dec else 1) for x in re.findall(r"\d{1,3}(?: \d{3})+(?:,\d\d)?|\d+(?:,\d\d)?", t)]
        for x in connus(bons[0]["spec"]):
            if P["cas"] in ("s5_fois_plus", "s5_fois_moins"):
                break
            if P["cas"] == "s1_perimetre" and x == 4:  # « carré » : les 4 côtés ne sont pas écrits
                continue
            if x not in nombres:
                ko(f"problème {P['cas']} : {x} du schéma absent de l'énoncé « {t} »")
        if dec and "€" not in t + P["unite"]:
            ko(f"problème {P['cas']} : centimes hors d'un prix « {t} »")
        if max([x / (100 if dec else 1) for x in nombres] + [rep]) > limite:
            ko(f"problème {P['cas']} : nombre > {limite} : « {t} »")
        # rédaction
        for mauvais in ("undefined", "NaN", "null", "  "):
            if mauvais in t or mauvais in P["phrase"]:
                ko(f"problème {P['cas']} : « {mauvais} » dans « {t} » / « {P['phrase']} »")
        if re.search(r"\b(de|que) ([AEIOU]|elle\b|il\b)", t + " " + P["phrase"]):
            ko(f"problème {P['cas']} : élision manquante « {t} » / « {P['phrase']} »")
        if not t.endswith("?") or len([m for m in re.split(r"[.?!]", t) if m.strip()]) > 4:
            ko(f"problème {P['cas']} : énoncé « {t} »")
        if any(len(ph.split()) > 22 for ph in re.split(r"(?<=[.?!])\s", t)):
            ko(f"problème {P['cas']} : phrase trop longue « {t} »")
        if re.search(r" \?|\d (€|kg|cm|dm|m|g|L)\b", t + " " + P["phrase"]):
            ko(f"problème {P['cas']} : espace sécable avant « ? » ou une unité : « {t} »")
        rf = it["reponse"] if dec else f"{int(rep):,}".replace(",", " ")
        if rf not in P["phrase"].replace("\u00a0", " ") or P["unite"] not in P["phrase"] + " " + t:
            ko(f"problème {P['cas']} : phrase réponse « {P['phrase']} » ({rep} {P['unite']})")
        if "€" in it["consigne"]["oral"] or re.search(r"\d (kg|cm|dm|m|g|L)\b", it["consigne"]["oral"]):
            ko(f"problème {P['cas']} : unité non lue « {it['consigne']['oral']} »")
        counts["probleme"] = counts.get("probleme", 0) + 1
    for c in list(OP) + E2_CAS + SPECIAUX:
        if len(vus.get(c, ())) < 4:
            ko(f"problème {c} : contextes peu variés ({len(vus.get(c, ()))})")
    perso_tires = [it for it in res["out"] if it.get("perso") and re.search(r"prunes|sacs de \d+ billes|perles\. Anna en a", it["consigne"]["texte"])]
    if len(perso_tires) < NP * 0.3 * 3:
        ko(f"problèmes : énoncés personnels peu tirés ({len(perso_tires)})")
    if any("fois plus" not in it["consigne"]["texte"] for it in res["out"] if "perles. Anna en a" in it["consigne"]["texte"]):
        ko("problèmes : trou {kfois} non rempli")
    if noms_perso < NP * len(res["cas"]) * 0.5:
        ko(f"problèmes : la personnalisation est peu utilisée ({noms_perso} énoncés)")

print(f"{len(items)} exercices tirés : " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
print("RÉSULTAT :", "PASS" if not fails else f"FAIL ({len(fails)})")
sys.exit(1 if fails else 0)
