from pydantic_settings import BaseSettings
from pathlib import Path

# Get the project root directory (two levels up from this file)
PROJECT_ROOT = Path(__file__).parent.parent.parent


class Settings(BaseSettings):
    # Database settings
    # POSTGRES_USER: str 
    # POSTGRES_PASSWORD: str
    # POSTGRES_HOST: str
    # POSTGRES_PORT: int
    # POSTGRES_DB: str 
    
    # # Redis settings
    # REDIS_HOST: str = "redis"
    # REDIS_PORT: int = 6379
    # REDIS_DB: int = 0
    # REDIS_PASSWORD: Optional[str] = None
    
    # Supabase — Project URL and service role key from Supabase > Settings > API
    # JWT secret from Supabase > Settings > API > JWT Settings > JWT Secret
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # Gemini settings
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-3.1-flash-live-preview"
    # Text / structured JSON (call reports); avoid live-preview models here
    GEMINI_REPORT_MODEL: str = "gemini-2.5-flash"

    # Application settings
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"

    model_config = {
        "env_file": PROJECT_ROOT / ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",
    }


settings = Settings()