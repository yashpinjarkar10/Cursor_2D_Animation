from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router
from config import CORS_ORIGINS

app = FastAPI(title="Manim Animation API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
