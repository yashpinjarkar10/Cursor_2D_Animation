# Production API routes for authentication, projects, chats, and animation generations
from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from api.middleware.auth import require_current_user
from api.schemas import (
    AuthResponse,
    AuthUserResponse,
    ChatGenerateRequest,
    ChatListResponse,
    ChatResponse,
    CreateChatRequest,
    CreateProjectRequest,
    GenerationListResponse,
    GenerationResponse,
    LoginRequest,
    ProjectListResponse,
    ProjectResponse,
    RefreshRequest,
    RefreshResponse,
    SignupRequest,
    UpdateProjectRequest,
)
from services import auth_service, database_service, generation_service, storage_service
from services.auth_service import User
from services.database_service import Chat, DatabaseError, Project

router = APIRouter()


# Fetch project by ID and verify authenticated user ownership
async def _require_project(project_id: UUID, user: User) -> Project:
    try:
        project = await database_service.get_project(project_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Database error") from exc
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


# Fetch chat by ID and verify project and user ownership
async def _require_chat(chat_id: UUID, project_id: UUID, user: User) -> Chat:
    try:
        chat = await database_service.get_chat(chat_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Database error") from exc
    if chat is None or chat.project_id != project_id:
        raise HTTPException(status_code=404, detail="Chat not found")
    if chat.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return chat


# Best-effort DB write on generation failure
async def _record_generation_failure(
    generation_id: UUID, error: str, state: dict[str, Any]
) -> None:
    try:
        await database_service.update_generation_failure(
            generation_id,
            error,
            str(state.get("failure_type") or "generation"),
            int(state.get("attempt_count") or 0),
        )
    except DatabaseError:
        pass


# Register a new user account via Supabase Auth
@router.post(
    "/auth/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Auth"],
    summary="Register a new user account",
)
async def signup(request: SignupRequest) -> AuthResponse:
    """
    Create a new Supabase Auth account and return tokens.

    - Stores user record in the `users` table automatically.
    - Returns JWT access_token and refresh_token.
    """
    try:
        result = auth_service.signup(
            email=request.email,
            password=request.password,
            display_name=request.display_name,
        )
    except auth_service.AuthenticationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    user_data = result["user"]
    return AuthResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result.get("expires_in"),
        user=AuthUserResponse(
            id=user_data["id"],
            email=user_data["email"],
            display_name=user_data.get("display_name"),
        ),
    )


# Authenticate with email and password and return access and refresh tokens
@router.post(
    "/auth/login",
    response_model=AuthResponse,
    tags=["Auth"],
    summary="Sign in with email and password",
)
async def login(request: LoginRequest) -> AuthResponse:
    try:
        result = auth_service.login(email=request.email, password=request.password)
    except auth_service.AuthenticationError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    user_data = result["user"]
    return AuthResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result.get("expires_in"),
        user=AuthUserResponse(
            id=user_data["id"],
            email=user_data["email"],
            display_name=user_data.get("display_name"),
        ),
    )


# Exchange refresh token for a newly issued access token
@router.post(
    "/auth/refresh",
    response_model=RefreshResponse,
    tags=["Auth"],
    summary="Refresh an access token",
)
async def refresh_token(request: RefreshRequest) -> RefreshResponse:
    try:
        result = auth_service.refresh_access_token(request.refresh_token)
    except auth_service.AuthenticationError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    return RefreshResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        expires_in=result.get("expires_in"),
    )


# Return currently authenticated user profile extracted from JWT
@router.get(
    "/auth/me",
    response_model=AuthUserResponse,
    tags=["Auth"],
    summary="Get the currently authenticated user",
)
async def get_me(user: User = Depends(require_current_user)) -> AuthUserResponse:
    return AuthUserResponse(id=user.id, email=user.email, display_name=user.display_name)


# Create a new project container for the authenticated user
@router.post(
    "/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Projects"],
    summary="Create a new project",
)
async def create_project(
    request: CreateProjectRequest,
    user: User = Depends(require_current_user),
) -> ProjectResponse:
    # Ensure user record is synced in database
    await database_service.ensure_user_exists(user.id, user.email, user.display_name)

    try:
        project_id = await database_service.create_project(
            user_id=user.id,
            name=request.name,
            description=request.description,
        )
        project = await database_service.get_project(project_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not create project") from exc

    if project is None:
        raise HTTPException(status_code=500, detail="Project created but could not be retrieved")

    return ProjectResponse(**project.model_dump())


@router.get(
    "/projects",
    response_model=ProjectListResponse,
    tags=["Projects"],
    summary="List all projects for the current user",
)
async def list_projects(
    user: User = Depends(require_current_user),
) -> ProjectListResponse:
    """Return all projects owned by the authenticated user, newest first."""
    try:
        projects = await database_service.list_user_projects(user.id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not fetch projects") from exc

    return ProjectListResponse(
        projects=[ProjectResponse(**p.model_dump()) for p in projects],
        total=len(projects),
    )


@router.get(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    tags=["Projects"],
    summary="Get a single project",
)
async def get_project(
    project_id: UUID,
    user: User = Depends(require_current_user),
) -> ProjectResponse:
    project = await _require_project(project_id, user)
    return ProjectResponse(**project.model_dump())


# Update project name or description
@router.patch(
    "/projects/{project_id}",
    response_model=ProjectResponse,
    tags=["Projects"],
    summary="Update a project's name or description",
)
async def update_project(
    project_id: UUID,
    request: UpdateProjectRequest,
    user: User = Depends(require_current_user),
) -> ProjectResponse:
    await _require_project(project_id, user)

    try:
        updated = await database_service.update_project(
            project_id=project_id,
            name=request.name,
            description=request.description,
        )
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not update project") from exc

    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return ProjectResponse(**updated.model_dump())


# Permanently delete project and cascade delete chats and generations
@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Projects"],
    summary="Delete a project and all its chats/generations",
)
async def delete_project(
    project_id: UUID,
    user: User = Depends(require_current_user),
) -> None:
    await _require_project(project_id, user)
    try:
        await database_service.delete_project(project_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not delete project") from exc


# Create a new chat session inside a project
@router.post(
    "/projects/{project_id}/chats",
    response_model=ChatResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Chats"],
    summary="Create a new chat in a project",
)
async def create_chat(
    project_id: UUID,
    request: CreateChatRequest,
    user: User = Depends(require_current_user),
) -> ChatResponse:
    await _require_project(project_id, user)

    try:
        chat_id = await database_service.create_chat(
            project_id=project_id,
            user_id=user.id,
            title=request.title,
        )
        chat = await database_service.get_chat(chat_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not create chat") from exc

    if chat is None:
        raise HTTPException(status_code=500, detail="Chat created but could not be retrieved")

    return ChatResponse(**chat.model_dump())


@router.get(
    "/projects/{project_id}/chats",
    response_model=ChatListResponse,
    tags=["Chats"],
    summary="List all chats in a project",
)
async def list_chats(
    project_id: UUID,
    user: User = Depends(require_current_user),
) -> ChatListResponse:
    await _require_project(project_id, user)

    try:
        chats = await database_service.list_project_chats(project_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not fetch chats") from exc

    return ChatListResponse(
        chats=[ChatResponse(**c.model_dump()) for c in chats],
        project_id=project_id,
        total=len(chats),
    )


@router.get(
    "/projects/{project_id}/chats/{chat_id}",
    response_model=ChatResponse,
    tags=["Chats"],
    summary="Get a single chat",
)
async def get_chat(
    project_id: UUID,
    chat_id: UUID,
    user: User = Depends(require_current_user),
) -> ChatResponse:
    chat = await _require_chat(chat_id, project_id, user)
    return ChatResponse(**chat.model_dump())


# Permanently delete chat session and associated generation records
@router.delete(
    "/projects/{project_id}/chats/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Chats"],
    summary="Delete a chat and all its generations",
)
async def delete_chat(
    project_id: UUID,
    chat_id: UUID,
    user: User = Depends(require_current_user),
) -> None:
    await _require_chat(chat_id, project_id, user)
    try:
        await database_service.delete_chat(chat_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not delete chat") from exc


# Generate animation and stream progress events via Server-Sent Events (SSE)
@router.post(
    "/projects/{project_id}/chats/{chat_id}/generate",
    tags=["Generations"],
    summary="Generate an animation (SSE stream)",
    response_description="Server-Sent Events stream with progress and final video URL",
)
async def generate_animation(
    project_id: UUID,
    chat_id: UUID,
    request: ChatGenerateRequest,
    user: User = Depends(require_current_user),
):
    # Verify authorization
    await _require_project(project_id, user)
    await _require_chat(chat_id, project_id, user)

    # --- Sync user record (non-blocking) ---
    await database_service.ensure_user_exists(user.id, user.email, user.display_name)

    # --- Create generation record (status=processing) ---
    try:
        generation_id = await database_service.create_generation(
            chat_id=chat_id,
            user_id=user.id,
            query=request.query,
            mode=request.mode,
            duration=request.duration,
            aspect_ratio=request.aspect_ratio,
            quality=request.quality,
            voiceover_enabled=request.voiceover_enabled,
            project_context=request.project_context,
        )
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not create generation record") from exc

    # --- SSE generator ---
    async def event_stream():
        video_path: Path | None = None
        final_state: dict | None = None
        try:
            async for item in generation_service.stream_generation_events(
                generation_id=generation_id,
                query=request.query,
                mode=request.mode,
                duration=request.duration,
                aspect_ratio=request.aspect_ratio,
                quality=request.quality,
                voiceover_enabled=request.voiceover_enabled,
                project_context=request.project_context,
            ):
                if hasattr(item, "event"):
                    # SSE progress event — forward directly to client
                    yield f"event: {item.event}\ndata: {json.dumps(item.data)}\n\n"
                else:
                    # Final state dict yielded by the service on success
                    final_state = item

            if final_state is None:
                # generation_service already emitted an error SSE event; nothing more to do
                return

            # --- Upload to Supabase Storage ---
            video_path = Path(str(final_state["final_video"]))
            yield f"event: uploading\ndata: {json.dumps({'progress': 0.95, 'generation_id': str(generation_id)})}\n\n"

            video_url = await storage_service.upload_video(generation_id, video_path)
            execution = final_state.get("execution_result") or {}

            # --- Persist success ---
            await database_service.update_generation_success(
                generation_id=generation_id,
                code=str(final_state.get("generated_code") or ""),
                video_url=video_url,
                video_storage_path=f"{generation_id}.mp4",
                scene_class=final_state.get("scene_class"),
                scene_plan=final_state.get("scene_plan"),
                capability_plan=final_state.get("capability_plan"),
                retrieval_trace=final_state.get("retrieval_trace"),
                implementation_plan=final_state.get("implementation_plan"),
                attempt_count=int(final_state.get("attempt_count") or 0),
            )

            # --- Emit complete ---
            complete_payload = json.dumps({
                "generation_id": str(generation_id),
                "chat_id": str(chat_id),
                "project_id": str(project_id),
                "status": "success",
                "video_url": video_url,
                "generated_code": final_state.get("generated_code"),
                "scene_class": final_state.get("scene_class"),
                "duration": execution.get("duration"),
                "attempt_count": int(final_state.get("attempt_count") or 0),
            })
            yield f"event: complete\ndata: {complete_payload}\n\n"

        except generation_service.GenerationError as exc:
            await _record_generation_failure(generation_id, str(exc), exc.state)
            yield f"event: error\ndata: {json.dumps({'error': str(exc), 'generation_id': str(generation_id), 'failure_type': 'generation'})}\n\n"

        except storage_service.StorageError as exc:
            await _record_generation_failure(generation_id, str(exc), {})
            yield f"event: error\ndata: {json.dumps({'error': str(exc), 'generation_id': str(generation_id), 'failure_type': 'storage'})}\n\n"

        except DatabaseError as exc:
            await _record_generation_failure(generation_id, str(exc), {})
            yield f"event: error\ndata: {json.dumps({'error': str(exc), 'generation_id': str(generation_id), 'failure_type': 'database'})}\n\n"

        finally:
            # Always clean up temp file
            if video_path is not None:
                await storage_service.delete_local_file(video_path)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# List all generations for a chat ordered newest first
@router.get(
    "/projects/{project_id}/chats/{chat_id}/generations",
    response_model=GenerationListResponse,
    tags=["Generations"],
    summary="List all generations in a chat",
)
async def list_generations(
    project_id: UUID,
    chat_id: UUID,
    user: User = Depends(require_current_user),
) -> GenerationListResponse:
    await _require_project(project_id, user)
    await _require_chat(chat_id, project_id, user)

    try:
        generations = await database_service.list_chat_generations(chat_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not fetch generations") from exc

    return GenerationListResponse(
        generations=[GenerationResponse(**g.model_dump()) for g in generations],
        chat_id=chat_id,
        total=len(generations),
    )


# Retrieve a single generation record by ID with owner authorization check
@router.get(
    "/generations/{generation_id}",
    response_model=GenerationResponse,
    tags=["Generations"],
    summary="Get a single generation by ID",
)
async def get_generation(
    generation_id: UUID,
    user: User = Depends(require_current_user),
) -> GenerationResponse:
    try:
        generation = await database_service.get_generation(generation_id)
    except DatabaseError as exc:
        raise HTTPException(status_code=502, detail="Could not fetch generation") from exc

    if generation is None:
        raise HTTPException(status_code=404, detail="Generation not found")
    if generation.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return GenerationResponse(**generation.model_dump())


# List configured Supabase Storage buckets for connectivity verification
@router.get(
    "/storage/buckets",
    tags=["Storage"],
    summary="List Supabase Storage buckets (diagnostics)",
)
async def storage_buckets(
    user: User = Depends(require_current_user),  # noqa: ARG001 — auth gate only
):
    from db.supabase_bucket import list_buckets

    try:
        return list_buckets()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase storage error: {exc}") from exc


# Health check endpoint returning API status, version, and knowledge engine health
@router.get(
    "/health",
    tags=["Health"],
    summary="Health check",
)
async def health():
    from graph.nodes.retrieval import get_knowledge

    try:
        knowledge_health = get_knowledge().health()
    except Exception as exc:
        knowledge_health = {"status": "error", "error": str(exc)}

    return {
        "service": "Manim Animation API",
        "version": "4.0.0",
        "status": "running",
        "routes": {
            "auth": ["POST /auth/signup", "POST /auth/login", "POST /auth/refresh", "GET /auth/me"],
            "projects": [
                "POST /projects",
                "GET /projects",
                "GET /projects/{id}",
                "PATCH /projects/{id}",
                "DELETE /projects/{id}",
            ],
            "chats": [
                "POST /projects/{id}/chats",
                "GET /projects/{id}/chats",
                "GET /projects/{id}/chats/{id}",
                "DELETE /projects/{id}/chats/{id}",
            ],
            "generations": [
                "POST /projects/{id}/chats/{id}/generate (SSE)",
                "GET /projects/{id}/chats/{id}/generations",
                "GET /generations/{id}",
            ],
        },
        "knowledge": knowledge_health,
    }
