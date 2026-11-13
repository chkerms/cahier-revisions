#!/usr/bin/env python3
"""Valide un lesson.json : schéma JSON + règles métier que le schéma ne sait pas exprimer.

Usage : python3 validate.py lesson.json [--json]
Code retour : 0 si aucune erreur (les avertissements n'empêchent pas le build), 1 sinon.
"""
import argparse
import ast
import json
import xml.etree.ElementTree as ET
from fractions import Fraction
import re
import sys
import unicodedata
from decimal import Decimal, InvalidOperation
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "lesson_data.schema.json"
TOKEN = re.compile(r"(?<!\\)\{([^{}:]+):([^{}]*)\}")
LANGS = {"en": "en-GB", "de": "de-DE", "es": "es-ES", "it": "it-IT"}
# Durées moyennes estimées (secondes) pour un élève de CE1 ; hypothèse à recaler sur usage réel.
DUREES = {"bloc": 20, "carte": 25, "quiz": 30, "calcul": 25, "oral": 60, "vers": 15}
DUREE_MAX = 10 * 60
# thèmes de l'accueil, par matière (même liste que THEMES dans app.js)
THEMES = {"francais": ["grammaire", "conjugaison", "dictee", "vocabulaire", "poesie"],
          "mathematiques": ["nombres", "fractions", "operations", "calcul_mental", "mesures", "heure", "geometrie",
                            "monnaie", "problemes", "donnees"]}


# ---------------------------------------------------------------- balisage
def parse_markup(s):
    """Retourne (texte_brut, texte_sans_fractions, tokens, erreurs)."""
    errors, tokens = [], []

    def repl_plain(m):
        tokens.append((m.group(1), m.group(2)))
        key, content = m.group(1), m.group(2)
        return content

    plain = TOKEN.sub(repl_plain, s)
    no_frac = TOKEN.sub(lambda m: " " if m.group(1) == "frac" else m.group(2), s)
    leftover = plain.replace("\\{", "").replace("\\}", "")
    if "{" in leftover or "}" in leftover:
        errors.append("balisage mal formé ou imbriqué (accolade orpheline)")
    plain = plain.replace("\\{", "{").replace("\\}", "}")
    for key, content in tokens:
        if key == "frac":
            m = re.fullmatch(r"(\d{1,3})/(\d{1,3})", content)
            if not m:
                errors.append(f"fraction invalide '{{frac:{content}}}' (attendu a/b en chiffres)")
            elif int(m.group(2)) == 0:
                errors.append("fraction de dénominateur 0")
        elif key.startswith("lang-"):
            if key[5:] not in LANGS:
                errors.append(f"langue inconnue '{key}' (autorisées : {', '.join('lang-' + k for k in LANGS)})")
        elif key == "mc" or re.fullmatch(r"c[1-6]", key):
            pass
        else:
            errors.append(f"balise inconnue '{{{key}:...}}'")
        if not content.strip():
            errors.append(f"balise '{key}' vide")
    return plain, no_frac, tokens, errors


def norm(s):
    s = unicodedata.normalize("NFC", s).casefold().replace("’", "'")
    s = re.sub(r"(?<!\d),|,(?!\d)", " ", s)
    s = re.sub(r"[^\w/,]+", " ", s)
    return " ".join(s.split())


def txt(e):
    """Texte d'un énoncé (chaîne ou {texte, oral})."""
    return e if isinstance(e, str) else e["texte"]


# ---------------------------------------------------------------- collecte des textes
def rich_fields(d):
    """Itère (chemin, texte) sur tous les champs à balisage riche."""
    yield "meta/titre", d["meta"]["titre"]
    for i, b in enumerate(d["lecon"]["blocs"]):
        p = f"lecon/blocs/{i}({b['id']})"
        for k in ("texte", "terme"):
            if k in b:
                yield f"{p}/{k}", b[k]
        if b["type"] in ("liste", "tableau") and "titre" in b:
            yield f"{p}/titre", b["titre"]
        for j, it in enumerate(b.get("items", [])):
            yield f"{p}/items/{j}", txt(it)
        for j, h in enumerate(b.get("entetes", [])):
            yield f"{p}/entetes/{j}", h
        for r, row in enumerate(b.get("lignes", [])):
            for c, cell in enumerate(row):
                yield f"{p}/lignes/{r}/{c}", cell
        for j, ev in enumerate(b.get("evenements", [])):
            yield f"{p}/evenements/{j}", ev["libelle"]
        for j, lg in enumerate(b.get("legendes", [])):
            yield f"{p}/legendes/{j}", lg["libelle"]
    for i, c in enumerate(d.get("cartes", [])):
        yield f"cartes/{i}/recto", txt(c["recto"])
        yield f"cartes/{i}/verso", txt(c["verso"])
    for i, q in enumerate(d.get("quiz", [])):
        yield f"quiz/{i}/question", txt(q["question"])
        yield f"quiz/{i}/reponse", txt(q["reponse"])
        for j, x in enumerate(q["distracteurs"]):
            yield f"quiz/{i}/distracteurs/{j}", txt(x)
    for i, c in enumerate(d.get("calculs", [])):
        yield f"calculs/{i}/consigne", txt(c["consigne"])
    for i, o in enumerate(d.get("oral", [])):
        yield f"oral/{i}/question", txt(o["question"])
        for j, pk in enumerate(o["points_cles"]):
            yield f"oral/{i}/points_cles/{j}", pk


def lesson_corpus(d):
    """Texte brut normalisé de la leçon seule (ce qui vient du cahier)."""
    parts = []
    for b in d["lecon"]["blocs"]:
        for k in ("texte", "terme", "titre", "auteur"):
            if k in b:
                parts.append(b[k])
        parts += [txt(it) for it in b.get("items", [])]
        parts += b.get("entetes", [])
        parts += [c for row in b.get("lignes", []) for c in row]
        parts += [v for st in b.get("strophes", []) for v in st]
        parts += [f"{e['repere']} {e['libelle']}" for e in b.get("evenements", [])]
        parts += [lg["libelle"] for lg in b.get("legendes", [])]
        parts += b.get("termes", []) + ([b["resultat"]] if "resultat" in b else [])
    flat = [norm(parse_markup(p)[0]) for p in parts]
    # variante où les fractions sont éclatées, pour qu'un numérateur ou dénominateur isolé soit reconnu
    flat += [x.replace("/", " ") for x in flat if "/" in x]
    return " " + " ¦ ".join(flat) + " "


# ---------------------------------------------------------------- arithmétique
def check_operation(b):
    try:
        t = [Decimal(x.replace(",", ".")) for x in b["termes"]]
        r = Decimal(b["resultat"].replace(",", "."))
    except InvalidOperation:
        return "nombres illisibles"
    if b["operation"] == "addition":
        calc = sum(t)
    elif b["operation"] == "soustraction":
        calc = t[0] - sum(t[1:])
    else:
        calc = t[0]
        for x in t[1:]:
            calc *= x
    if calc != r:
        return (f"résultat {b['resultat']} ≠ calcul {str(calc).replace('.', ',')} : "
                "relire la photo et créer une alerte de lecture si le doute persiste")
    width = max(len(x.replace(",", "")) for x in b["termes"] + [b["resultat"]])
    if "retenues" in b and len(b["retenues"]) > width:
        return f"{len(b['retenues'])} retenues pour {width} colonnes"
    return None


# ---------------------------------------------------------------- calcul et SVG
def eval_expr(expr):
    """Évalue un calcul écrit à la française (× : ÷ −, virgule, espaces de milliers) en valeur exacte."""
    s = expr.replace("−", "-").replace("×", "*").replace("x", "*").replace("÷", "/").replace(":", "/")
    while True:
        s2 = __import__("re").sub(r"(\d) (\d{3})(?!\d)", r"\1\2", s)
        if s2 == s:
            break
        s = s2
    s = s.replace(",", ".")
    try:
        tree = ast.parse(s, mode="eval")
    except SyntaxError:
        raise ValueError("syntaxe")

    def ev(n):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return Fraction(str(n.value))
        if isinstance(n, ast.UnaryOp) and isinstance(n.op, ast.USub):
            return -ev(n.operand)
        if isinstance(n, ast.BinOp) and type(n.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div):
            a, b = ev(n.left), ev(n.right)
            if isinstance(n.op, ast.Add):
                return a + b
            if isinstance(n.op, ast.Sub):
                return a - b
            if isinstance(n.op, ast.Mult):
                return a * b
            if b == 0:
                raise ValueError("division par zéro")
            return a / b
        raise ValueError("élément non autorisé")
    return ev(tree)


def fmt(f):
    if f.denominator == 1:
        return str(f.numerator)
    return str(round(float(f), 3)).replace(".", ",")


SVG_INTERDITS = {"script", "foreignObject", "iframe", "image", "use", "a", "style"}


def check_svg(svg):
    pbs = []
    try:
        root = ET.fromstring(svg)
    except ET.ParseError as ex:
        return [f"SVG mal formé ({ex})"]
    if not root.tag.endswith("svg"):
        pbs.append("la racine doit être <svg>")
    if "viewBox" not in root.attrib:
        pbs.append("viewBox obligatoire (le dessin doit s'adapter à l'écran)")
    for el in root.iter():
        tag = el.tag.split("}")[-1]
        if tag in SVG_INTERDITS:
            pbs.append(f"balise <{tag}> interdite dans un SVG")
        for k, v in el.attrib.items():
            k2 = k.split("}")[-1].lower()
            if k2.startswith("on") or (k2 == "href") or "url(" in v.replace(" ", "") and "url(#" not in v.replace(" ", ""):
                pbs.append(f"attribut '{k2}' interdit (script ou ressource externe)")
    return sorted(set(pbs))


# ---------------------------------------------------------------- validation
BLOC_DEFS = {"titre": "b_titre", "paragraphe": "b_paragraphe", "definition": "b_definition", "regle": "b_regle",
             "remarque": "b_remarque", "exemples": "b_exemples", "liste": "b_liste", "tableau": "b_tableau",
             "operation_posee": "b_operation", "poeme": "b_poeme", "frise": "b_frise", "schema_legende": "b_schema"}


def short(e):
    """Message de schéma lisible, sans recopier toute l'instance."""
    v = e.validator
    if v in ("maxItems", "minItems"):
        return f"{len(e.instance)} élément(s), {'maximum' if v == 'maxItems' else 'minimum'} {e.validator_value}"
    if v in ("maxLength", "minLength"):
        return f"{len(e.instance)} caractères, {'maximum' if v == 'maxLength' else 'minimum'} {e.validator_value} : découper ou raccourcir"
    if v == "unevaluatedProperties" or v == "additionalProperties":
        return "champ non prévu par le schéma : " + e.message.split("(")[-1].rstrip(")")
    if v == "oneOf":
        return "valeur non conforme (chaîne, ou objet {texte, oral})"
    m = e.message
    return m if len(m) < 160 else m[:157] + "..."


def validate(d):
    errors, warnings = [], []
    E = lambda p, m: errors.append(f"{p} : {m}")
    W = lambda p, m: warnings.append(f"{p} : {m}")

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    v = Draft202012Validator(schema)
    schema_errs = sorted(v.iter_errors(d), key=lambda e: list(e.absolute_path))
    defs = {"$defs": schema["$defs"]}
    for e in schema_errs:
        path = "/".join(map(str, e.absolute_path)) or "(racine)"
        ap = list(e.absolute_path)
        if e.validator == "oneOf" and ap[:2] == ["lecon", "blocs"] and len(ap) == 3:
            b = e.instance if isinstance(e.instance, dict) else {}
            ref = BLOC_DEFS.get(b.get("type"))
            if not ref:
                E(path, f"[schéma] type de bloc inconnu '{b.get('type')}' (autorisés : {', '.join(BLOC_DEFS)})")
                continue
            sub = Draft202012Validator({"$ref": f"#/$defs/{ref}", **defs})
            for se in sub.iter_errors(b):
                E(path + "/" + "/".join(map(str, se.absolute_path)), "[schéma] " + short(se))
            continue
        E(path, "[schéma] " + short(e))
    if schema_errs:
        return errors, warnings  # les règles suivantes supposent une structure valide

    # thème de l'accueil
    mat, th = d["meta"]["matiere"], d["meta"].get("theme")
    if mat in THEMES:
        if not th:
            W("meta/theme", f"absent : l'appli devinera le thème ; préciser l'un de {', '.join(THEMES[mat])}")
        elif th not in THEMES[mat]:
            E("meta/theme", f"« {th} » n'est pas un thème de {mat} ({', '.join(THEMES[mat])})")
    elif th:
        E("meta/theme", f"pas de thème pour la matière {mat}")

    blocs = {b["id"]: b for b in d["lecon"]["blocs"]}
    pages = {s["id"] for s in d["meta"].get("sources", [])}
    images = {im["id"]: im for im in d.get("images", [])}

    # unicité des identifiants
    seen = {}
    for coll in ("cartes", "quiz", "calculs", "oral", "images", "generateurs"):
        for it in d.get(coll, []):
            seen.setdefault(it["id"], []).append(coll)
    for b in d["lecon"]["blocs"]:
        seen.setdefault(b["id"], []).append("blocs")
    for k, v_ in seen.items():
        if len(v_) > 1:
            E(k, f"identifiant en double ({', '.join(v_)})")

    # sources, références
    for b in d["lecon"]["blocs"]:
        if "source" in b and b["source"] not in pages:
            E(f"bloc {b['id']}", f"source '{b['source']}' absente de meta.sources")
    for im in images.values():
        if "svg" in im:
            for pb in check_svg(im["svg"]):
                E(f"image {im['id']}", pb)
            continue
        if im["source"] not in pages:
            E(f"image {im['id']}", f"source '{im['source']}' absente de meta.sources")
        c = im["cadrage"]
        if c["x"] + c["l"] > 1.0001 or c["y"] + c["h"] > 1.0001:
            E(f"image {im['id']}", "cadrage hors de la photo")
    used_images = set()
    for b in d["lecon"]["blocs"]:
        if b["type"] == "schema_legende":
            used_images.add(b["image"])
            if b["image"] not in images:
                E(f"bloc {b['id']}", f"image '{b['image']}' non déclarée dans images")
        if b["type"] == "tableau":
            n = len(b["entetes"])
            for r, row in enumerate(b["lignes"]):
                if len(row) != n:
                    E(f"bloc {b['id']}/lignes/{r}", f"{len(row)} cellules pour {n} en-têtes")
        if b["type"] == "operation_posee":
            pb = check_operation(b)
            if pb:
                E(f"bloc {b['id']}", pb)
    # une question qui s'appuie sur un schéma doit montrer l'image (sans la légende, qui donnerait la réponse)
    for coll in ("cartes", "quiz", "calculs", "oral", "generateurs"):
        for it in d.get(coll, []):
            if "image" in it:
                used_images.add(it["image"])
                if it["image"] not in images:
                    E(f"{coll} {it['id']}", f"image '{it['image']}' non déclarée dans images")
            schemas = [blocs[r]["image"] for r in it["ref"] if r in blocs and blocs[r]["type"] == "schema_legende"]
            if schemas and "image" not in it:
                E(f"{coll} {it['id']}", f"s'appuie sur un schéma (ref) mais n'affiche pas l'image : ajouter \"image\": \"{schemas[0]}\"")
    for im in images:
        if im not in used_images:
            W(f"image {im}", "déclarée mais non utilisée")
    for coll in ("cartes", "quiz", "calculs", "oral", "generateurs"):
        for it in d.get(coll, []):
            for r in it["ref"]:
                if r not in blocs:
                    E(f"{coll} {it['id']}", f"ref '{r}' inexistante")
    for q in d.get("quiz", []):
        if q["indice"]["bloc"] not in blocs:
            E(f"quiz {q['id']}", f"indice vers bloc '{q['indice']['bloc']}' inexistant")
    if "recitation" in d:
        rb = blocs.get(d["recitation"]["bloc"])
        if not rb or rb["type"] != "poeme":
            E("recitation", "doit pointer vers un bloc de type poeme")
    for b in (b for b in d["lecon"]["blocs"] if b["type"] == "poeme"):
        if b.get("saisie_parent") and "strophes" in b:
            E(f"bloc {b['id']}", "saisie_parent : le texte est tapé sur la tablette, ne pas fournir de strophes")

    # balisage + conventions d'écriture
    declared = set(d["styles"])
    used_styles = set()
    for path, s in rich_fields(d):
        plain, no_frac, tokens, errs = parse_markup(s)
        for e in errs:
            E(path, e)
        for k, _ in tokens:
            if re.fullmatch(r"c[1-6]", k):
                used_styles.add(k)
                if k not in declared:
                    E(path, f"style '{k}' utilisé mais non déclaré dans styles")
        if re.search(r"\d\s*/\s*\d", no_frac):
            E(path, "fraction écrite en ligne : utiliser {frac:a/b}")
        if re.search(r"\d\s*\*\s*\d", no_frac):
            E(path, "'*' interdit : utiliser ×")
        if re.search(r"\d\s+[xX]\s+\d", no_frac):
            W(path, "'x' entre deux nombres : utiliser × si c'est une multiplication")
        if re.search(r"\b\d+\.\d+\b", no_frac):
            E(path, "point décimal : utiliser la virgule (convention française)")
    for b in (b for b in d["lecon"]["blocs"] if b["type"] == "poeme"):
        for st in b.get("strophes", []):
            for vers in st:
                if "{" in vers:
                    E(f"bloc {b['id']}", "pas de balisage dans un poème")
    for k in declared - used_styles:
        W(f"styles/{k}", "déclaré mais jamais utilisé")

    # quiz : distinctivité et ancrage des distracteurs (arbitrage : uniquement des éléments de la leçon)
    corpus = lesson_corpus(d)
    for q in d.get("quiz", []):
        rep = norm(parse_markup(txt(q["reponse"]))[0])
        dis = [norm(parse_markup(txt(x))[0]) for x in q["distracteurs"]]
        if rep in dis or len(set(dis)) < 2:
            E(f"quiz {q['id']}", "les 3 choix doivent être différents")
        for x, nx in zip(q["distracteurs"], dis):
            if f" {nx} " not in corpus:
                E(f"quiz {q['id']}", f"distracteur « {txt(x)} » absent du texte de la leçon")
        if f" {rep} " not in corpus:
            W(f"quiz {q['id']}", f"bonne réponse « {txt(q['reponse'])} » non trouvée mot pour mot dans la leçon : vérifier qu'elle en découle")

    nb_calculs = len(d.get("calculs", [])) + sum(g["nombre"] for g in d.get("generateurs", []))
    if "calculs" in d["parcours"] and not 3 <= nb_calculs <= 10:
        E("calculs", f"{nb_calculs} calculs par séance (fixes + générés) : il en faut 3 à 10")
    if d.get("generateurs") and "calculs" not in d["parcours"]:
        W("generateurs", "générateurs sans étape calculs dans le parcours : ils ne seront pas proposés")

    # calculs : la réponse est recalculée quand l'expression est fournie
    for c in d.get("calculs", []):
        if "expression" not in c:
            W(f"calculs {c['id']}", "pas d'expression : réponse non vérifiée automatiquement")
            continue
        try:
            val = eval_expr(c["expression"])
        except ValueError as ex:
            E(f"calculs {c['id']}", f"expression illisible ({ex})")
            continue
        rep = Fraction(c["reponse"].replace(",", "."))
        if val != rep:
            E(f"calculs {c['id']}", f"{c['expression']} = {fmt(val)} et non {c['reponse']}")
        if val.denominator != 1 and (val * 1000).denominator != 1:
            E(f"calculs {c['id']}", "résultat non décimal : impossible à saisir au pavé")

    # cohérence du parcours
    t = d["meta"]["type_lecon"]
    if t == "poesie" and "quiz" in d["parcours"]:
        W("parcours", "QCM sur une poésie : préférer lecon, recitation, oral")
    if t != "poesie" and "recitation" in d["parcours"]:
        W("parcours", "récitation hors poésie")

    # charge cognitive estimée
    duree = duree_s(d)
    if duree > DUREE_MAX:
        W("parcours", f"durée estimée {duree // 60} min {duree % 60:02d} s > 10 min : alléger cartes ou blocs")

    if d["meta"]["statut"] == "en_attente_validation":
        W("meta/statut", "en_attente_validation : publier.py refusera tant que le parent n'a pas tranché les alertes bloquantes")
    return errors, warnings


VERS_SAISIE_PARENT = 16  # estimation de durée quand le texte est tapé sur la tablette


def duree_s(d):
    vers = sum(len(v_) for b in d["lecon"]["blocs"] if b["type"] == "poeme" for v_ in (b.get("strophes") or [[""] * VERS_SAISIE_PARENT]))
    return (len(d["lecon"]["blocs"]) * DUREES["bloc"] + len(d.get("cartes", [])) * DUREES["carte"]
            + (len(d.get("calculs", [])) + sum(g["nombre"] for g in d.get("generateurs", []))) * DUREES["calcul"]
            + len(d.get("quiz", [])) * DUREES["quiz"] + len(d.get("oral", [])) * DUREES["oral"]
            + (vers * DUREES["vers"] * 3 if "recitation" in d["parcours"] else 0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lesson")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    try:
        d = json.loads(Path(a.lesson).read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"ERREUR JSON illisible : {e}")
        sys.exit(1)
    errors, warnings = validate(d)
    if a.json:
        print(json.dumps({"erreurs": errors, "avertissements": warnings}, ensure_ascii=False, indent=2))
    else:
        for e in errors:
            print("ERREUR        ", e)
        for w in warnings:
            print("AVERTISSEMENT ", w)
        print(f"\n{len(errors)} erreur(s), {len(warnings)} avertissement(s)"
              + ("" if errors else f" | durée estimée ≈ {round(duree_s(d) / 60)} min"))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
