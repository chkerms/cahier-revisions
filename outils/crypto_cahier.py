"""Chiffrement du cahier.

Principe (hybride) :
- une paire de clés RSA-OAEP (SHA-256). La clé publique est dans le dépôt (cle/publique.pem) :
  elle suffit pour publier une leçon, sans connaître le mot de passe ;
- la clé privée est dans le dépôt, chiffrée par le mot de passe (cle/privee.json,
  PBKDF2-SHA256 + AES-256-GCM) ; seule la tablette la déchiffre ;
- chaque leçon est chiffrée en AES-256-GCM avec une clé aléatoire, elle-même chiffrée par la clé publique.
Formats compatibles WebCrypto (RSA-OAEP hash SHA-256, AES-GCM tag concaténé, PKCS8).
"""
import base64
import json
import os
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "cle" / "publique.pem"
PRIV = ROOT / "cle" / "privee.json"
ITER = 250_000
OAEP = padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)

b64e = lambda b: base64.b64encode(b).decode("ascii")
b64d = base64.b64decode


def _kdf(password, salt, iterations):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations).derive(password.encode("utf-8"))


def seal_private(pkcs8_der, password):
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(_kdf(password, salt, ITER)).encrypt(iv, pkcs8_der, None)
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "salt": b64e(salt), "iv": b64e(iv), "ct": b64e(ct)}


def open_private(sealed, password):
    key = _kdf(password, b64d(sealed["salt"]), sealed["iter"])
    der = AESGCM(key).decrypt(b64d(sealed["iv"]), b64d(sealed["ct"]), None)  # InvalidTag si mauvais mot de passe
    return serialization.load_der_private_key(der, password=None)


def generate(password):
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    der = k.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    pem = k.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    return pem, seal_private(der, password)


def encrypt_lesson(obj, pub_pem=None):
    pub = serialization.load_pem_public_key(pub_pem or PUB.read_bytes())
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    k, iv = AESGCM.generate_key(256), os.urandom(12)
    return {"v": 1, "alg": "RSA-OAEP-256+A256GCM", "k": b64e(pub.encrypt(k, OAEP)),
            "iv": b64e(iv), "ct": b64e(AESGCM(k).encrypt(iv, data, None))}


def decrypt_lesson(env, private_key):
    k = private_key.decrypt(b64d(env["k"]), OAEP)
    return json.loads(AESGCM(k).decrypt(b64d(env["iv"]), b64d(env["ct"]), None))
