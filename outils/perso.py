#!/usr/bin/env python3
"""Personnalisation des problèmes (prénoms, maîtresse, doudou, parents) : chiffrée dans lecons/perso.json.

  python3 -I outils/perso.py perso.json                        # vérifie, chiffre, écrit lecons/perso.json
  python3 -I outils/perso.py --lire --mot-de-passe XXX         # relit la personnalisation publiée
  python3 -I outils/perso.py --supprimer                       # retour aux prénoms génériques

Format (tout est facultatif) :
  {"enfant": ["Prénom", "f"], "amis": [["Prénom", "f"], ["Prénom", "m"]], "maitresse": "Madame X",
   "doudou": ["Nom du doudou", "m"], "parents": [["Papa", "m"], ["Maman", "f"]]}
Le genre ("f" ou "m") sert aux accords (« elle a… », « gourmande »). Jamais de nom de famille,
d'adresse ni de nom d'école. Le fichier en clair reste hors du dépôt ; le commit et le push restent à faire.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crypto_cahier as C  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CIBLE = ROOT / "lecons" / "perso.json"
INDEX = ROOT / "lecons" / "index.json"


def declarer(present):
    """L'index annonce la personnalisation : l'appli ne la cherche que si elle existe."""
    idx = json.loads(INDEX.read_text()) if INDEX.exists() else {"v": 1, "lecons": []}
    if present:
        idx["perso"] = {"maj": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    else:
        idx.pop("perso", None)
    INDEX.write_text(json.dumps(idx, ensure_ascii=False, indent=1) + "\n")
CHAMPS = {"enfant", "amis", "maitresse", "doudou", "parents", "famille", "problemes"}
SANS_PERSO = {"e2_seuil", "s2_fraction"}  # forme de réponse particulière : contextes du code seulement
CHAMPS_ENONCE = {"cas", "texte", "unite", "phrase", "blague", "question", "max", "min", "f", "x", "y", "z", "k", "q", "e"}


def personne(x, ou, err):
    if not (isinstance(x, list) and len(x) == 2 and isinstance(x[0], str) and x[0].strip() and x[1] in ("f", "m")):
        err.append(f"{ou} : attendu [\"Prénom\", \"f\" ou \"m\"], reçu {x!r}")
    elif len(x[0]) > 30 or any(c.isdigit() for c in x[0]):
        err.append(f"{ou} : « {x[0]} » ne ressemble pas à un prénom")


def verifier(d):
    err = []
    if not isinstance(d, dict):
        return ["le fichier doit contenir un objet JSON"]
    for k in d:
        if k not in CHAMPS:
            err.append(f"champ inconnu « {k} » (attendus : {', '.join(sorted(CHAMPS))})")
    if "enfant" in d:
        personne(d["enfant"], "enfant", err)
    if "doudou" in d:
        personne(d["doudou"], "doudou", err)
    for k in ("amis", "parents", "famille"):
        if k in d:
            if not isinstance(d[k], list):
                err.append(f"{k} : liste attendue")
            else:
                for i, x in enumerate(d[k]):
                    personne(x, f"{k}[{i}]", err)
    if "maitresse" in d and not (isinstance(d["maitresse"], str) and 2 <= len(d["maitresse"]) <= 40):
        err.append("maitresse : texte attendu (ex. « Madame Rose »)")
    for i, m in enumerate(d.get("problemes", [])):
        ou = f"problemes[{i}]"
        if not isinstance(m, dict) or not all(isinstance(m.get(k), str) and m[k].strip() for k in ("cas", "texte", "unite", "phrase")):
            err.append(f"{ou} : cas, texte, unite et phrase sont obligatoires")
            continue
        for k in m:
            if k not in CHAMPS_ENONCE:
                err.append(f"{ou} : champ inconnu « {k} »")
        if not m["texte"].rstrip().endswith("?") or "{r}" not in m["phrase"]:
            err.append(f"{ou} : le texte finit par « ? » et la phrase contient {{r}}")
        if m["cas"] in SANS_PERSO:
            err.append(f"{ou} : pas d'énoncé personnel pour le cas {m['cas']} (réponse oui / non ou fraction)")
            continue
        if m["cas"].startswith("e2_") and not (m.get("question") or "").rstrip().endswith("?"):
            err.append(f"{ou} : un problème à deux étapes demande une « question » intermédiaire qui finit par « ? »")
    if not err and d.get("problemes"):
        err += essayer(d)
    return err


def essayer(d):
    """Tire chaque énoncé personnel 200 fois avec le vrai générateur : aucun trou ni nombre incohérent."""
    import subprocess
    js = rf"""
require({json.dumps(str(ROOT / "generateurs.js"))});
const G = globalThis.GENERATEURS.G, P = {json.dumps(d, ensure_ascii=False)}, out = [];
if (P.problemes.some(m => !G.probleme.cas.includes(m.cas))) {{ console.log(JSON.stringify({{inconnu: P.problemes.map(m => m.cas).filter(c => !G.probleme.cas.includes(c))}})); process.exit(0); }}
P.problemes.forEach((m, i) => {{
  G.perso = Object.assign({{}}, P, {{problemes: [m], forcer: true}});
  for (let k = 0; k < 200; k++) {{
    const x = G.probleme({{problemes: [m.cas], limite: 999}});
    out.push({{i, t: x.consigne.texte, ph: x.probleme.phrase, q: (x.probleme.etapes || []).map(e => e.question).join(" "), r: x.reponse}});
  }}
}});
console.log(JSON.stringify({{out}}));"""
    try:
        res = json.loads(subprocess.run(["node", "-e", js], capture_output=True, text=True, check=True).stdout)
    except Exception as e:  # noqa: BLE001
        return [f"essai impossible (node requis) : {e}"]
    if "inconnu" in res:
        return [f"cas inconnu(s) : {', '.join(res['inconnu'])}"]
    err = []
    for i, m in enumerate(d["problemes"]):
        tirs = [o for o in res["out"] if o["i"] == i]
        if not tirs:
            err.append(f"problemes[{i}] ({m['cas']}) : jamais tiré")
        for o in tirs:
            tout = o["t"] + " " + o["ph"] + " " + o["q"]
            if re.search(r"\{\w+\}|undefined|NaN|null", tout) or re.search(r"\d{4}", tout.replace(" ", "")):
                err.append(f"problemes[{i}] ({m['cas']}) : trou non rempli dans « {tout} »")
                break
            if f"{int(o['r']):,}".replace(",", " ") not in o["ph"].replace("\u00a0", " "):
                err.append(f"problemes[{i}] ({m['cas']}) : la phrase « {o['ph']} » ne donne pas la réponse {o['r']}")
                break
    return err


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fichier", nargs="?")
    ap.add_argument("--lire", action="store_true")
    ap.add_argument("--mot-de-passe")
    ap.add_argument("--supprimer", action="store_true")
    a = ap.parse_args()
    if a.lire:
        if not a.mot_de_passe:
            sys.exit("--lire demande --mot-de-passe")
        if not CIBLE.exists():
            sys.exit("Aucune personnalisation publiée.")
        try:
            k = C.open_private(json.loads(C.PRIV.read_text()), a.mot_de_passe)
        except Exception:
            sys.exit("Mot de passe incorrect.")
        print(json.dumps(C.decrypt_lesson(json.loads(CIBLE.read_text()), k), ensure_ascii=False, indent=2))
        return
    if a.supprimer:
        CIBLE.unlink(missing_ok=True)
        declarer(False)
        print("Personnalisation supprimée.")
        return
    if not a.fichier:
        ap.error("fichier de personnalisation attendu")
    d = json.loads(Path(a.fichier).read_text(encoding="utf-8"))
    err = verifier(d)
    if err:
        print("Personnalisation refusée :")
        for e in err:
            print("  ERREUR", e)
        sys.exit(1)
    CIBLE.write_text(json.dumps(C.encrypt_lesson(d), ensure_ascii=False))
    declarer(True)
    n = len(d.get("amis", []))
    print(f"OK personnalisation chiffrée dans lecons/perso.json ({n} copain(s)"
          + (", la maîtresse" if "maitresse" in d else "") + (", le doudou" if "doudou" in d else "")
          + (f", {len(d['problemes'])} énoncé(s) personnel(s)" if d.get("problemes") else "") + ").")


if __name__ == "__main__":
    main()
