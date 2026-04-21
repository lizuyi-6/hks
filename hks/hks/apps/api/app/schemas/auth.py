from pydantic import Field

from apps.api.app.schemas.common import ApiModel


def _email_field() -> str:
    return Field(
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        description="Email address",
    )


class RegisterRequest(ApiModel):
    email: str = _email_field()
    full_name: str
    password: str


class LoginRequest(ApiModel):
    email: str = _email_field()
    password: str


class TokenResponse(ApiModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(ApiModel):
    old_password: str
    new_password: str


class ForgotPasswordRequest(ApiModel):
    email: str = _email_field()


class ResetPasswordRequest(ApiModel):
    token: str
    new_password: str


class RefreshRequest(ApiModel):
    token: str
