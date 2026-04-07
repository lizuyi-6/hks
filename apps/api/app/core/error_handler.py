import uuid
import traceback
from datetime import datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class APIError(Exception):
    def __init__(
        self,
        error_type: str,
        message: str,
        error_location: str = "",
        details: dict = None
    ):
        self.error_type = error_type
        self.message = message
        self.error_location = error_location
        self.details = details or {}
        self.request_id = str(uuid.uuid4())[:8]

    def to_dict(self) -> dict:
        result = {
            "errorType": self.error_type,
            "message": self.message,
            "errorLocation": self.error_location,
            "requestId": self.request_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        if self.details:
            result["details"] = self.details
        return result


class ValidationError(APIError):
    def __init__(self, message: str, field: str = "", details: dict = None):
        super().__init__(
            error_type="ValidationError",
            message=message,
            error_location=field,
            details=details
        )


class NotFoundError(APIError):
    def __init__(self, message: str, resource: str = ""):
        super().__init__(
            error_type="NotFoundError",
            message=message,
            error_location=resource
        )


class AuthError(APIError):
    def __init__(self, message: str = "认证失败"):
        super().__init__(
            error_type="AuthError",
            message=message,
            error_location="authentication"
        )


class BusinessError(APIError):
    def __init__(self, message: str, context: str = "", details: dict = None):
        super().__init__(
            error_type="BusinessError",
            message=message,
            error_location=context,
            details=details
        )


class SystemError(APIError):
    def __init__(self, message: str, error_location: str = "system"):
        super().__init__(
            error_type="SystemError",
            message=message,
            error_location=error_location
        )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=get_status_code(exc.error_type),
            content=exc.to_dict()
        )

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=exc.to_dict()
        )

    @app.exception_handler(NotFoundError)
    async def not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content=exc.to_dict()
        )

    @app.exception_handler(AuthError)
    async def auth_error_handler(request: Request, exc: AuthError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content=exc.to_dict()
        )

    @app.exception_handler(BusinessError)
    async def business_error_handler(request: Request, exc: BusinessError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=exc.to_dict()
        )

    @app.exception_handler(SystemError)
    async def system_error_handler(request: Request, exc: SystemError) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=exc.to_dict()
        )

    @app.exception_handler(Exception)
    async def general_error_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = str(uuid.uuid4())[:8]
        error_response = {
            "errorType": "UnknownError",
            "message": str(exc) if not isinstance(exc, SystemExit) else "Server error",
            "errorLocation": f"{request.method} {request.url.path}",
            "requestId": request_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        return JSONResponse(
            status_code=500,
            content=error_response
        )


def get_status_code(error_type: str) -> int:
    status_codes = {
        "ValidationError": 422,
        "NotFoundError": 404,
        "AuthError": 401,
        "BusinessError": 400,
        "SystemError": 500,
        "NetworkError": 502,
        "TimeoutError": 504,
        "UnknownError": 500,
    }
    return status_codes.get(error_type, 500)
