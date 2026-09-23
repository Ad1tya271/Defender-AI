from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, projects, scans

app = FastAPI(title="DefenderAI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(scans.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}