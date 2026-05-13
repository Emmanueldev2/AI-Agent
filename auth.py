"""
auth.py — Glow.ai v2
JWT token creation, password hashing using bcrypt directly (no passlib).
"""

import os
import bcrypt
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, Cookie
from sqlalchemy.orm import Session

from database import get_db, User

SECRET_KEY        = os.getenv("SECRET_KEY", "glow-ai-secret-change-in-production-2025")
ALGORITHM         = "HS256"
TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    # Truncate to 72 bytes — bcrypt hard limit
    pwd_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes    = plain.encode("utf-8")[:72]
        hashed_bytes = hashed.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


def create_token(user_id: int, email: str) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "email": email, "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def get_current_user(
    glow_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not glow_token:
        return None
    payload = decode_token(glow_token)
    if not payload:
        return None
    return db.query(User).filter(User.id == int(payload["sub"])).first()


def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
