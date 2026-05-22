"""
JWT + password hashing utilities.
Secret key auto-generated on first run and stored in the DB Settings table.
"""
import os
import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
import bcrypt

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7



# Fallback secret (overridden at startup from DB or env)
_SECRET_KEY: str = os.getenv("JWT_SECRET", secrets.token_hex(32))


def set_secret(key: str) -> None:
    global _SECRET_KEY
    _SECRET_KEY = key


def get_secret() -> str:
    return _SECRET_KEY


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt()
    # bcrypt requires bytes, so we encode the string
    hashed = bcrypt.hashpw(plain.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_access_token(user_id: int, username: str, is_admin: bool) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,
        "exp": expire,
    }
    return jwt.encode(payload, _SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises JWTError on invalid/expired token."""
    return jwt.decode(token, _SECRET_KEY, algorithms=[ALGORITHM])
