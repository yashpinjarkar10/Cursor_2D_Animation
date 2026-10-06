# FastAPI dependency for Supabase Bearer-token authentication
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services import auth_service
from services.auth_service import User

_bearer_scheme = HTTPBearer(auto_error=False)


# Validate Supabase access token and return authenticated user
async def require_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        return auth_service.get_current_user(credentials.credentials)
    except auth_service.AuthenticationError as exc:
        raise _unauthorized() from exc


# Return standardized HTTP 401 Unauthorized exception
def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )
