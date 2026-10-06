# Authentication service for JWT validation and Supabase Auth proxy operations
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

import jwt
from pydantic import BaseModel

from config import SUPABASE_JWT_SECRET


# Authenticated user representation extracted from validated JWT
class User(BaseModel):
    id: UUID
    email: str
    display_name: Optional[str] = None


# Raised when authentication or token validation fails
class AuthenticationError(Exception):
    pass


_jwks_client: jwt.PyJWKClient | None = None


# Lazily load and cache PyJWKClient for Supabase JWKS endpoint
def _get_jwks_client() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        from config import SUPABASE_URL

        jwks_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = jwt.PyJWKClient(jwks_url)
    return _jwks_client


# Decode and verify Supabase JWT supporting both ES256 and HS256
def decode_jwt(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except Exception as exc:
        raise AuthenticationError(f"Malformed token header: {exc}") from exc

    alg = header.get("alg", "HS256")

    # 1. Asymmetric ES256 verification via Supabase JWKS
    if alg == "ES256":
        try:
            jwks = _get_jwks_client()
            signing_key = jwks.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        except jwt.ExpiredSignatureError as exc:
            raise AuthenticationError("Token has expired") from exc
        except Exception as exc:
            raise AuthenticationError(f"ES256 token verification failed: {exc}") from exc

    # 2. Symmetric HS256 verification via SUPABASE_JWT_SECRET
    if not SUPABASE_JWT_SECRET:
        raise AuthenticationError("SUPABASE_JWT_SECRET is not configured")
    try:
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError(f"Invalid token: {exc}") from exc


# Extract User object from validated JWT payload
def extract_user(token: str) -> User:
    payload = decode_jwt(token)
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id or not email:
        raise AuthenticationError("Token is missing required fields (sub, email)")
    try:
        return User(
            id=UUID(user_id),
            email=email,
            display_name=payload.get("user_metadata", {}).get("display_name"),
        )
    except (ValueError, TypeError) as exc:
        raise AuthenticationError(f"Invalid user_id format in token: {exc}") from exc


# Validate JWT and return authenticated user for route dependencies
def get_current_user(token: str) -> User:
    return extract_user(token)


# Register new user via Supabase Auth and return session credentials
def signup(email: str, password: str, display_name: Optional[str] = None) -> dict[str, Any]:
    from db.supabase_client import get_supabase

    try:
        supabase = get_supabase()
        options: dict[str, Any] = {}
        if display_name:
            options["data"] = {"display_name": display_name}

        # Provision pre-confirmed user via Service Role Admin API to prevent rate limit friction
        try:
            supabase.auth.admin.create_user(
                {
                    "email": email,
                    "password": password,
                    "email_confirm": True,
                    "user_metadata": options.get("data", {}),
                }
            )
        except Exception as admin_err:
            err_str = str(admin_err).lower()
            if "already registered" not in err_str and "already exists" not in err_str:
                try:
                    supabase.auth.sign_up(
                        {
                            "email": email,
                            "password": password,
                            **({"options": options} if options else {}),
                        }
                    )
                except Exception:
                    pass

        # Acquire authenticated session
        login_resp = supabase.auth.sign_in_with_password(
            {"email": email, "password": password}
        )
        session = login_resp.session
        user = login_resp.user

        if not session or not user:
            raise AuthenticationError("Failed to obtain session after user creation.")

        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "expires_in": session.expires_in,
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": (user.user_metadata or {}).get("display_name"),
            },
        }
    except AuthenticationError:
        raise
    except Exception as exc:
        raise AuthenticationError(f"Signup failed: {exc}") from exc


# Sign in with email and password via Supabase Auth
def login(email: str, password: str) -> dict[str, Any]:
    from db.supabase_client import get_supabase

    try:
        supabase = get_supabase()
        response = supabase.auth.sign_in_with_password(
            {"email": email, "password": password}
        )
        if not response.session:
            raise AuthenticationError("Invalid email or password")

        user = response.user
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "expires_in": response.session.expires_in,
            "user": {
                "id": user.id,
                "email": user.email,
                "display_name": (user.user_metadata or {}).get("display_name"),
            },
        }
    except AuthenticationError:
        raise
    except Exception as exc:
        raise AuthenticationError(f"Login failed: {exc}") from exc


# Refresh expired access token using refresh token
def refresh_access_token(refresh_token: str) -> dict[str, Any]:
    from db.supabase_client import get_supabase

    try:
        supabase = get_supabase()
        response = supabase.auth.refresh_session(refresh_token)
        if not response.session:
            raise AuthenticationError("Token refresh failed — please log in again")
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "expires_in": response.session.expires_in,
        }
    except AuthenticationError:
        raise
    except Exception as exc:
        raise AuthenticationError(f"Token refresh failed: {exc}") from exc
