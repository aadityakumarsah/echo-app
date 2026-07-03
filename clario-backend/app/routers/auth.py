from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.core.auth import (
    authenticate_user,
    create_token,
    create_user,
    get_current_user,
)

auth_router = APIRouter(prefix="/auth", tags=["Auth"])


class AuthRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@auth_router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: AuthRequest):
    user = create_user(body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        )
    token = create_token(user["id"])
    return AuthResponse(access_token=token, user=user)


@auth_router.post("/login", response_model=AuthResponse)
def login(body: AuthRequest):
    user = authenticate_user(body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_token(user["id"])
    return AuthResponse(access_token=token, user=user)


@auth_router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return {"id": user.get("id"), "email": user.get("email"), "created_at": user.get("created_at")}
