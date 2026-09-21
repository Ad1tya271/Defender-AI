from fastapi import FastAPI

app = FastAPI(title="DefenderAI API")

@app.get("/health")
def health_check():
    return {"status": "ok"}