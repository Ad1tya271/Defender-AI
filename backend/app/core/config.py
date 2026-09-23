from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    OLLAMA_BASE_URL: str
    OLLAMA_MODEL: str
    SECRET_KEY: str
    APP_ENV: str = "development"

    class Config:
        env_file = ".env"

settings = Settings()