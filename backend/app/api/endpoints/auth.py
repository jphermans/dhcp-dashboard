"""Authentication endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    create_temp_token,
    decode_token,
    generate_totp_secret,
    get_totp_uri,
    generate_qr_code_base64,
    verify_totp,
)
from app.models import User, UserRole, UserSettings
from app.schemas import (
    Token,
    TokenRefresh,
    LoginRequest,
    LoginResponse,
    ChangePasswordRequest,
    UserCreate,
    UserResponse,
    UserUpdate,
    Setup2FAResponse,
    Verify2FARequest,
    Disable2FARequest,
    LoginWith2FARequest,
    AdminUserCreate,
)
from app.api.deps import get_current_user, role_required

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == request.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    # Update last_login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    # Force password change on first login
    if user.password_change_required:
        temp_token = create_temp_token(subject=user.id, scope="password_change")
        return LoginResponse(
            require_password_change=True,
            temp_token=temp_token,
        )

    # Check if 2FA is required
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    user_settings = settings_result.scalar_one_or_none()
    if user_settings and user_settings.totp_enabled:
        temp_token = create_temp_token(subject=user.id, scope="2fa_login")
        return LoginResponse(
            require_2fa=True,
            temp_token=temp_token,
        )

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    return LoginResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/change-password", response_model=LoginResponse)
async def change_password(request: ChangePasswordRequest, db: AsyncSession = Depends(get_db)):
    """Change password using a temp token from forced password change flow."""
    payload = decode_token(request.temp_token)
    if not payload or payload.get("type") != "temp" or payload.get("scope") != "password_change":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired change-password token",
        )
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Set new password and clear the flag
    user.hashed_password = get_password_hash(request.new_password)
    user.password_change_required = False
    await db.commit()

    # Issue full tokens now
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    return LoginResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if username or email already exists
    existing = await db.execute(
        select(User).where((User.username == request.username) | (User.email == request.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered",
        )
    user = User(
        username=request.username,
        email=request.email,
        hashed_password=get_password_hash(request.password),
        full_name=request.full_name,
        role=UserRole(request.role) if request.role in [r.value for r in UserRole] else UserRole.READONLY,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/refresh", response_model=Token)
async def refresh_token(request: TokenRefresh):
    payload = decode_token(request.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    user_id = payload.get("sub")
    access_token = create_access_token(subject=user_id)
    refresh_token = create_refresh_token(subject=user_id)
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_current_user(
    update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if update.email is not None:
        current_user.email = update.email
    if update.full_name is not None:
        current_user.full_name = update.full_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


# Admin-only user management
@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(role_required(UserRole.ADMIN)),
):
    result = await db.execute(select(User).order_by(User.created_at))
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(role_required(UserRole.ADMIN)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(role_required(UserRole.ADMIN)),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if update.email is not None:
        user.email = update.email
    if update.full_name is not None:
        user.full_name = update.full_name
    if update.role is not None:
        user.role = UserRole(update.role)
    if update.is_active is not None:
        user.is_active = update.is_active
    await db.commit()
    await db.refresh(user)
    return user


# ──────────────────────────── 2FA ────────────────────────────
@router.get("/2fa/setup", response_model=Setup2FAResponse)
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate TOTP secret, URI and QR code for the current user."""
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )
    user_settings = settings_result.scalar_one_or_none()

    # Rotate secret on every setup request so a new QR is generated
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, current_user.username)
    qr_b64 = generate_qr_code_base64(uri)

    if user_settings:
        user_settings.totp_secret = secret
        user_settings.totp_enabled = False  # not verified yet
    else:
        user_settings = UserSettings(
            user_id=current_user.id,
            totp_secret=secret,
            totp_enabled=False,
        )
        db.add(user_settings)
    await db.commit()

    return Setup2FAResponse(secret=secret, qr_code_base64=qr_b64, uri=uri)


@router.post("/2fa/verify")
async def verify_2fa(
    request: Verify2FARequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify a TOTP code and enable 2FA for the current user."""
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )
    user_settings = settings_result.scalar_one_or_none()
    if not user_settings or not user_settings.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not set up. Call GET /auth/2fa/setup first.",
        )
    if not verify_totp(user_settings.totp_secret, request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 2FA code",
        )
    user_settings.totp_enabled = True
    await db.commit()
    return {"message": "2FA enabled successfully"}


@router.post("/2fa/disable")
async def disable_2fa(
    request: Disable2FARequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable 2FA after a valid TOTP confirmation."""
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == current_user.id)
    )
    user_settings = settings_result.scalar_one_or_none()
    if not user_settings or not user_settings.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled",
        )
    if not verify_totp(user_settings.totp_secret, request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 2FA code",
        )
    user_settings.totp_secret = None
    user_settings.totp_enabled = False
    await db.commit()
    return {"message": "2FA disabled"}


@router.post("/login-2fa", response_model=LoginResponse)
async def login_2fa(
    request: LoginWith2FARequest,
    db: AsyncSession = Depends(get_db),
):
    """Complete login with a TOTP code after receiving require_2fa."""
    payload = decode_token(request.temp_token)
    if not payload or payload.get("type") != "temp" or payload.get("scope") != "2fa_login":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired 2FA challenge token",
        )
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    )
    user_settings = settings_result.scalar_one_or_none()
    if not user_settings or not user_settings.totp_enabled or not user_settings.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this user",
        )
    if not verify_totp(user_settings.totp_secret, request.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code",
        )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    return LoginResponse(access_token=access_token, refresh_token=refresh_token)


# ─────────────────── Admin User Management ───────────────────
@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_user(
    body: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(role_required(UserRole.ADMIN)),
):
    """Create a new user (admin only)."""
    existing = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already exists",
        )
    user = User(
        username=body.username,
        email=body.email,
        hashed_password=get_password_hash(body.password),
        full_name=body.full_name,
        role=UserRole(body.role),
        password_change_required=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(role_required(UserRole.ADMIN)),
):
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account",
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await db.delete(user)
    # Also clean up associated settings
    settings_result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    for s in settings_result.scalars():
        await db.delete(s)
    await db.commit()
    return None
