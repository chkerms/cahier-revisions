#!/usr/bin/env python3
"""Gestion du mot de passe du cahier.

  python3 outils/cles.py init --mot-de-passe XXX           # une seule fois, à la création
  python3 outils/cles.py changer --ancien XXX --nouveau YYY # change le mot de passe, les leçons restent lisibles
  python3 outils/cles.py verifier --mot-de-passe XXX
Après « changer », la tablette redemandera le nouveau mot de passe.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cryptography.exceptions import InvalidTag  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
import crypto_cahier as C  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("init"); i.add_argument("--mot-de-passe", required=True); i.add_argument("--force", action="store_true")
    c = sub.add_parser("changer"); c.add_argument("--ancien", required=True); c.add_argument("--nouveau", required=True)
    v = sub.add_parser("verifier"); v.add_argument("--mot-de-passe", required=True)
    a = ap.parse_args()

    if a.cmd == "init":
        if C.PRIV.exists() and not a.force:
            sys.exit("Des clés existent déjà. --force rendrait illisibles toutes les leçons publiées.")
        if len(a.mot_de_passe) < 4:
            sys.exit("Mot de passe trop court (4 caractères minimum).")
        pem, sealed = C.generate(a.mot_de_passe)
        C.PUB.parent.mkdir(exist_ok=True)
        C.PUB.write_bytes(pem)
        C.PRIV.write_text(json.dumps(sealed, indent=1))
        print("Clés créées : cle/publique.pem, cle/privee.json")
        return

    sealed = json.loads(C.PRIV.read_text())
    try:
        k = C.open_private(sealed, a.ancien if a.cmd == "changer" else a.mot_de_passe)
    except InvalidTag:
        sys.exit("Mot de passe incorrect.")
    if a.cmd == "verifier":
        print("Mot de passe correct.")
        return
    der = k.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    C.PRIV.write_text(json.dumps(C.seal_private(der, a.nouveau), indent=1))
    print("Mot de passe changé. Les leçons existantes restent lisibles avec le nouveau mot de passe.")


if __name__ == "__main__":
    main()
