from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5-coder:7b"
    SECRET_KEY: str
    APP_ENV: str = "development"
    EXECUTION_MODE: str = "local"  # "local", "cloud", or "hybrid"
    AI_PROVIDER: str = "ollama"  # "ollama", "mock", or future cloud providers
    AI_TIMEOUT_SECONDS: int = 120
    SEMGREP_PATH: Optional[str] = None
    TRIVY_PATH: Optional[str] = None
    MAX_UPLOAD_SIZE_BYTES: int = 50_000_000  # 50 MB
    SCAN_TIMEOUT_SECONDS: int = 300  # 5 minutes

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()