from fastapi import FastAPI
from app.api import auth

app = FastAPI(title="DefenderAI API")

app.include_router(auth.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}