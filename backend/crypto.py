"""Reversible encryption of stored secrets (Fernet, keyed off SECRET_KEY).

Used for third-party credentials we must be able to *use* later (not just
verify) -- e.g. the family's EcoleDirecte login. `cryptography` is imported
lazily inside each function so a missing package can't break app import,
matching the convention in backend/services/push.py.

Rotating SECRET_KEY intentionally invalidates every stored secret:
decrypt_secret() returns None rather than raising, so callers can surface a
"please re-enter your credentials" state instead of a 500.
"""

import base64
import hashlib

from backend.config import settings


def _fernet():
    from cryptography.fernet import Fernet

    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def encrypt_secret(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str | None) -> str | None:
    if not ciphertext:
        return None
    from cryptography.fernet import InvalidToken

    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return None
