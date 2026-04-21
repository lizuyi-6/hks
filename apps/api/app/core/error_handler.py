import logging
import os
import uuid
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


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


_IS_PRODUCTION = os.getenv("APP_ENV", "development") == "production"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
        status = get_status_code(exc.error_type)
        _log_api_error(request, exc, status)
        return JSONResponse(status_code=status, content=exc.to_dict())

    @app.exception_handler(ValidationError)
    async def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
        _log_api_error(request, exc, 422)
        return JSONResponse(status_code=422, content=exc.to_dict())

    @app.exception_handler(NotFoundError)
    async def not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        _log_api_error(request, exc, 404)
        return JSONResponse(status_code=404, content=exc.to_dict())

    @app.exception_handler(AuthError)
    async def auth_error_handler(request: Request, exc: AuthError) -> JSONResponse:
        logger.warning(
            "auth.error path=%s request_id=%s",
            request.url.path,
            exc.request_id,
        )
        return JSONResponse(status_code=401, content=exc.to_dict())

    @app.exception_handler(BusinessError)
    async def business_error_handler(request: Request, exc: BusinessError) -> JSONResponse:
        _log_api_error(request, exc, 400)
        return JSONResponse(status_code=400, content=exc.to_dict())

    @app.exception_handler(SystemError)
    async def system_error_handler(request: Request, exc: SystemError) -> JSONResponse:
        logger.error(
            "system.error path=%s request_id=%s message=%s",
            request.url.path,
            exc.request_id,
            exc.message,
        )
        return JSONResponse(status_code=500, content=exc.to_dict())

    @app.exception_handler(Exception)
    async def general_error_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(
            "unhandled.exception path=%s method=%s request_id=%s",
            request.url.path,
            request.method,
            request_id,
        )
        # Never leak internal exception text to clients in production.
        client_message = "内部错误，请稍后重试" if _IS_PRODUCTION else str(exc)
        error_response: dict = {
            "errorType": "UnknownError",
            "message": client_message,
            "errorLocation": f"{request.method} {request.url.path}",
            "requestId": request_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
        # Surface the underlying exception class in non-production environments
        # so the workbench "详情" panel can tell ``UndefinedColumn`` apart from
        # ``ConnectionRefusedError`` without requiring server log access.
        if not _IS_PRODUCTION:
            details: dict = {"exception": type(exc).__name__}
            # SQLAlchemy-style exceptions expose the offending SQL on ``.statement``.
            statement = getattr(exc, "statement", None)
            if isinstance(statement, str) and statement:
                details["sql"] = statement[:500]
            orig = getattr(exc, "orig", None)
            if orig is not None:
                details["origin"] = f"{type(orig).__name__}: {orig}"[:500]
            error_response["details"] = details
        return JSONResponse(status_code=500, content=error_response)


def _log_api_error(request: Request, exc: APIError, status: int) -> None:
    level = logging.WARNING if status < 500 else logging.ERROR
    logger.log(
        level,
        "api.error type=%s status=%d path=%s request_id=%s",
        exc.error_type,
        status,
        request.url.path,
        exc.request_id,
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
