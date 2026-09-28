from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.rate_limiter import rate_limit_login
from app.core.security import create_access_token, hash_password, verify_password
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.user import User
from app.schemas.user import Token, UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        email=user_in.email,
        hashed_password=hash_password(user_in.password),
    )
    db.add(new_user)
    try:
        db.flush()
        db.add(
            AuditEvent(
                user_id=new_user.id,
                action="user_registered",
                resource_type="user",
                resource_id=str(new_user.id),
                details=f"User {new_user.email} registered",
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")

    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token, dependencies=[Depends(rate_limit_login)])
def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        db.add(
            AuditEvent(
                user_id=None,
                action="login_failed",
                resource_type="user",
                ip_address=request.client.host if request.client else None,
                details=f"Failed login attempt for {credentials.email}",
            )
        )
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(data={"sub": str(user.id)})

    db.add(
        AuditEvent(
            user_id=user.id,
            action="user_logged_in",
            resource_type="user",
            resource_id=str(user.id),
            ip_address=request.client.host if request.client else None,
            details=f"User {user.email} logged in successfully",
        )
    )
    db.commit()

    return Token(access_token=token)