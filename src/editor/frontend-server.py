import os
from pathlib import Path
import httpx, uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).resolve().parent
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")

app = FastAPI(title="Frontend Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"ok": True, "backend": BACKEND_URL}

# Avoid noisy favicon 404s (serve a 204 if no icon file is present)
@app.get("/favicon.ico")
async def favicon():
    ico = STATIC_DIR / "favicon.ico"
    if ico.exists():
        return Response(content=ico.read_bytes(), media_type="image/x-icon")
    return Response(status_code=204)

@app.post("/api/render")
async def proxy_render(body: dict):
    topic = (body or {}).get("topic", "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Missing 'topic'")
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{BACKEND_URL}/render", json={"topic": topic})
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Cannot reach backend: {exc}") from exc

    ctype = resp.headers.get("content-type", "")
    if "application/json" in ctype.lower():
        return JSONResponse(status_code=resp.status_code, content=resp.json())
    return JSONResponse(status_code=resp.status_code, content={"raw": resp.text})

# Serve static frontend (index.html, app.js, styles files) from this folder
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    # Open http://127.0.0.1:3000/
    uvicorn.run(app, host="127.0.0.1", port=3000)