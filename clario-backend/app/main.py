import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env into os.environ so os.getenv() calls anywhere in the app see the values
load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import websocket_router, auth_router, settings_router, sessions_router, tts_router, relief_router, payments_router, nepal_payments_router, daily_checks_router
from app.core.database import init_db
from app.db.subscriptions import init_subscriptions_table

app = FastAPI()

@app.on_event("startup")
def on_startup():
    init_db()
    init_subscriptions_table()

# Configure CORS based on environment
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:8080"
)
ALLOWED_ORIGINS = [o.strip().rstrip("/") for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

app.include_router(auth_router)
app.include_router(settings_router)
app.include_router(sessions_router)
app.include_router(websocket_router)
app.include_router(tts_router)
app.include_router(relief_router)
app.include_router(payments_router)
app.include_router(nepal_payments_router)
app.include_router(daily_checks_router)

@app.get("/", tags=['Root'])
def read_root():
    return {"message": "Clario Backend!"}



