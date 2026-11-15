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
CHAMPS = {"enfant", "amis", "maitresse", "doudou", "parents"}


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
    for k in ("amis", "parents"):
        if k in d:
            if not isinstance(d[k], list):
                err.append(f"{k} : liste attendue")
            else:
                for i, x in enumerate(d[k]):
                    personne(x, f"{k}[{i}]", err)
    if "maitresse" in d and not (isinstance(d["maitresse"], str) and 2 <= len(d["maitresse"]) <= 40):
        err.append("maitresse : texte attendu (ex. « Madame Rose »)")
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
          + (", la maîtresse" if "maitresse" in d else "") + (", le doudou" if "doudou" in d else "") + ").")


if __name__ == "__main__":
    main()
