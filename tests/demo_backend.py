from __future__ import annotations
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from code_to_video import render_manim_code

app = FastAPI(title="Demo Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Query(BaseModel):
    topic: str

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/render")
def render(query: Query):
    try:
        video_path = render_manim_code(query.topic)
        return {"status": "ok", "output": f"Rendered: {video_path}"}
    except Exception as e:
        # Surface readable error to the frontend
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
