from pydantic import EmailStr

from apps.api.app.schemas.common import ApiModel


class RegisterRequest(ApiModel):
    email: EmailStr
    full_name: str
    password: str


class LoginRequest(ApiModel):
    email: EmailStr
    password: str


class TokenResponse(ApiModel):
    access_token: str
    token_type: str = "bearer"
