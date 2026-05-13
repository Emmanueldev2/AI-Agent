"""
auth.py — Glow.ai v2
JWT token creation, password hashing, current user dependency.
"""

import os
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Cookie
from sqlalchemy.orm import Session

from database import get_db, User

SECRET_KEY        = os.getenv("SECRET_KEY", "glow-ai-secret-change-in-production-2025")
ALGORITHM         = "HS256"
TOKEN_EXPIRE_DAYS = 30

# Use a more robust configuration to avoid passlib's bcrypt bug with newer bcrypt versions
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b")

def hash_password(password: str) -> str:
    # Explicitly truncate to 72 bytes to avoid passlib's internal check bug
    # and ensure we're passing a string to hash
    return pwd_context.hash(password[:72])

def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain[:72], hashed)
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
