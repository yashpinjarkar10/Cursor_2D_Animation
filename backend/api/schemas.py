# Pydantic request and response schemas for the Manim Animation API
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

Quality = Literal["low", "medium", "high"]
RequestMode = Literal["create", "modify", "extend", "remove", "restructure"]


# Register a new user account payload
class SignupRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254, examples=["user@example.com"])
    password: str = Field(..., min_length=8, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=100)


# Sign in with email and password payload
class LoginRequest(BaseModel):
    email: str = Field(..., examples=["user@example.com"])
    password: str


# Refresh access token payload
class RefreshRequest(BaseModel):
    refresh_token: str


# Authenticated user details response
class AuthUserResponse(BaseModel):
    id: UUID
    email: str
    display_name: Optional[str] = None


# Authentication response returned on signup or login
class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: Optional[int] = None
    user: AuthUserResponse


# Refresh token response payload
class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: Optional[int] = None


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


# Create new project request payload
class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, examples=["My BST Animation"])
    description: Optional[str] = Field(default=None, max_length=1000)


# Update project request payload
class UpdateProjectRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)


# Project details response
class ProjectResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# Project list response with total count
class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]
    total: int


# Create new chat session request payload
class CreateChatRequest(BaseModel):
    title: Optional[str] = Field(
        default=None, max_length=500, examples=["Binary Search Tree animation"]
    )


# Chat session response
class ChatResponse(BaseModel):
    id: UUID
    project_id: UUID
    user_id: UUID
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# Chat session list response with total count
class ChatListResponse(BaseModel):
    chats: list[ChatResponse]
    project_id: UUID
    total: int


# Request payload for generating animation inside a chat session
class ChatGenerateRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=10_000,
        examples=["Create an animation showing how binary search works step by step"],
    )
    mode: RequestMode = "create"
    voiceover_enabled: bool = False
    duration: float = Field(default=30.0, gt=0, le=300)
    aspect_ratio: str = Field(default="16:9", examples=["16:9", "9:16", "1:1"])
    quality: Quality = "low"
    project_context: Optional[dict[str, Any]] = None


# Animation generation record response
class GenerationResponse(BaseModel):
    id: UUID
    chat_id: UUID
    user_id: UUID
    query: str
    mode: str
    status: Literal["pending", "processing", "success", "failed"]
    video_url: Optional[str] = None
    generated_code: Optional[str] = None
    scene_class: Optional[str] = None
    duration: Optional[float] = None
    attempt_count: int = 0
    error_message: Optional[str] = None
    failure_type: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# Generation list response with total count
class GenerationListResponse(BaseModel):
    generations: list[GenerationResponse]
    chat_id: UUID
    total: int
