from fastapi import FastAPI
from app.api import auth, projects, scans

app = FastAPI(title="DefenderAI API")

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(scans.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}