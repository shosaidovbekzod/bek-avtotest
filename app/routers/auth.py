import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..face_auth import FaceAuthError, verify_admin_face
from ..models import AccessToken, User
from ..schemas import FaceLoginIn, LoginIn, RegisterIn, TokenOut
from ..security import hash_password, new_token, verify_password
from ..deps import current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])
_face_attempts: dict[str, list[float]] = {}


def _check_face_rate_limit(client_ip: str) -> None:
    now = time.monotonic()
    window_start = now - 300
    attempts = [stamp for stamp in _face_attempts.get(client_ip, []) if stamp > window_start]
    if len(attempts) >= 8:
        raise HTTPException(status_code=429, detail="Face ID urinishlari ko'p bo'ldi. 5 daqiqadan keyin qayta urinib ko'ring.")
    attempts.append(now)
    _face_attempts[client_ip] = attempts


def _issue_token(db: Session, user: User) -> TokenOut:
    token_value, expires_at = new_token()
    db.add(AccessToken(token=token_value, user_id=user.id, expires_at=expires_at))
    db.commit()
    return TokenOut(token=token_value, user=user_payload(user))


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
    db.refresh(user)
    return _issue_token(db, user)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    username = payload.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login yoki parol xato")
    return _issue_token(db, user)


@router.post("/face-admin", response_model=TokenOut)
def face_admin_login(payload: FaceLoginIn, request: Request, db: Session = Depends(get_db)) -> TokenOut:
    settings = get_settings()
    if not settings.face_id_enabled:
        raise HTTPException(status_code=403, detail="Face ID orqali kirish o'chirilgan.")
    client_ip = request.client.host if request.client else "unknown"
    _check_face_rate_limit(client_ip)
    try:
        result = verify_admin_face(
            payload.image,
            settings.face_id_images_dir,
            threshold=settings.face_id_threshold,
            max_mb=settings.face_id_max_image_mb,
        )
    except FaceAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result["verified"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Yuz admin rasmlari bilan mos kelmadi.")
    admin_username = settings.admin_username.strip().lower()
    admin = db.scalar(select(User).where(User.username == admin_username, User.is_admin.is_(True)))
    if not admin:
        admin = db.scalar(select(User).where(User.is_admin.is_(True)))
    if not admin:
        raise HTTPException(status_code=404, detail="Admin foydalanuvchi topilmadi.")
    _face_attempts.pop(client_ip, None)
    return _issue_token(db, admin)


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict:
    return user_payload(user)
