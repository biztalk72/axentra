import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .db import LoginSession, User, get_db

bearer = HTTPBearer(auto_error=False)

def hash_password(password: str):
    salt = secrets.token_hex(16)
    value = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
    return f'pbkdf2_sha256$600000${salt}${value}'

def verify_password(password: str, stored: str):
    try:
        if stored.startswith('pbkdf2_sha256$'):
            _, iterations, salt, digest = stored.split('$')
            actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations)).hex()
        else:
            # Existing installations keep their scrypt credentials until changed.
            salt, digest = stored.split(':')
            actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, digest)
    except (ValueError, TypeError):
        return False

def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    if not credentials:
        raise HTTPException(401, '로그인이 필요합니다.')
    token_hash = hashlib.sha256(credentials.credentials.encode()).hexdigest()
    session = db.get(LoginSession, token_hash)
    if not session or datetime.fromisoformat(session.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(401, '세션이 만료되었습니다.')
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, '유효하지 않은 사용자입니다.')
    return user

def roles(*allowed):
    def dependency(user: User = Depends(current_user)):
        if user.role not in allowed:
            raise HTTPException(403, '이 작업에 대한 권한이 없습니다.')
        return user
    return dependency
