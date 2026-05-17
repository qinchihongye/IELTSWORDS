"""
敏感信息加密工具
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

import os
import warnings

from .config.settings import SECRET_KEY


def _build_fernet() -> Fernet:
    raw = os.getenv("FERNET_KEY")
    if raw:
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
    else:
        warnings.warn(
            "FERNET_KEY 未设置，暂时回退使用 SECRET_KEY。生产环境请设置独立的 FERNET_KEY。",
            DeprecationWarning,
        )
        digest = hashlib.sha256(SECRET_KEY.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


FERNET = _build_fernet()


def encrypt_secret(value: str) -> str:
    return FERNET.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(value: str | None) -> str | None:
    if not value:
        return None

    try:
        return FERNET.decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None
