from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AccessToken, User
from ..schemas import LoginIn, RegisterIn, TokenOut
from ..security import hash_password, new_token, verify_password
from ..deps import current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_payload(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
    }


@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    username = payload.username.strip().lower()
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(status_code=409, detail="Bu login band")
    user = User(username=username, full_name=payload.full_name, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    token_value, expires_at = new_token()
    db.add(AccessToken(token=token_value, user_id=user.id, expires_at=expires_at))
    db.commit()
    db.refresh(user)
    return TokenOut(token=token_value, user=user_payload(user))


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    username = payload.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login yoki parol xato")
    token_value, expires_at = new_token()
    db.add(AccessToken(token=token_value, user_id=user.id, expires_at=expires_at))
    db.commit()
    return TokenOut(token=token_value, user=user_payload(user))


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict:
    return user_payload(user)
