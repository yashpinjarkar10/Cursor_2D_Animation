from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
import subprocess
import tempfile
import os
import uuid
import requests

app = FastAPI()

# HuggingFace backend endpoint (only used by /api/query and /api/render)
BACKEND_URL = "https://chiragagrawal24-cursor-2d-animation.hf.space/generate"

# Base dir where this script lives
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ----------------- UI ROUTES -----------------
@app.get("/", response_class=HTMLResponse)
async def get_ui():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/{filename}")
async def get_asset(filename: str):
    file_path = os.path.join(BASE_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return JSONResponse(content={"error": "File not found"}, status_code=404)


@app.get("/favicon.ico")
async def favicon():
    path = os.path.join(BASE_DIR, "favicon.ico")  # Locate favicon.ico file
    if os.path.exists(path):                     # If favicon exists in project
        return FileResponse(path)                # Serve it to the browser
    # Tiny 1x1 transparent fallback
    return HTMLResponse(status_code=204)         # Otherwise, send "no content"

# ----------------- GENERIC BACKEND FORWARDER -----------------
async def forward_to_backend(request: Request):
    try:
        data = await request.json()
        query = data.get("query")
        resp = requests.post(BACKEND_URL, json={"query": query}, timeout=120)

        if resp.status_code == 200:
            return JSONResponse(content=resp.json())
        else:
            return JSONResponse(
                content={"error": f"Backend returned {resp.status_code}", "detail": resp.text},
                status_code=resp.status_code
            )
    except Exception as e:
        return JSONResponse(content={"error": "Request failed", "detail": str(e)}, status_code=500)

@app.post("/api/query")
async def call_backend(request: Request):
    return await forward_to_backend(request)

@app.post("/api/render")
async def render_backend(request: Request):
    return await forward_to_backend(request)

# ----------------- MANIM RENDERING -----------------
@app.post("/api/render_manim")
async def render_manim(request: Request):
    try:
        data = await request.json()
        code = data.get("code")
        scene = data.get("scene", "Scene1")

        if not code:
            return JSONResponse(content={"error": "No code provided"}, status_code=400)

        # Temp file for Manim script
        tf = tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w", encoding="utf-8")
        tf.write(code)
        tf_name = tf.name
        tf.close()

        # Force Manim to save into ./media_out
        output_dir = os.path.join(BASE_DIR, "media_out")
        os.makedirs(output_dir, exist_ok=True)

        cmd = [
            "manim", "-ql", "--media_dir", output_dir, tf_name, scene
        ]
        subprocess.run(cmd, check=True)

        # Expected final video path
        output_path = os.path.join(output_dir, "videos", os.path.splitext(os.path.basename(tf_name))[0], "480p15", f"{scene}.mp4")

        if not os.path.exists(output_path):
            return JSONResponse(content={"error": "Render failed, video not found"}, status_code=500)

        return FileResponse(output_path, media_type="video/mp4", filename="output.mp4")

    except subprocess.CalledProcessError as e:
        return JSONResponse(content={"error": "Manim execution failed", "detail": str(e)}, status_code=500)
    except Exception as e:
        return JSONResponse(content={"error": "Request failed", "detail": str(e)}, status_code=500)


# ----------------- MAIN -----------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("frontend-server:app", host="127.0.0.1", port=8000, reload=True)
