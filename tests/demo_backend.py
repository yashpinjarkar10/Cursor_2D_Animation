# app.py
from fastapi import FastAPI
from pydantic import BaseModel
from code_to_video import render_manim_code

app = FastAPI()

# Input mod for request body
class Query(BaseModel):
    topic: str

@app.post("/render")
def render(query: Query):
    result = render_manim_code(query.topic)
    return {"status": "success", "output": str(result)}
