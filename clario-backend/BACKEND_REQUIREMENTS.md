# Clario Backend - Requirements & Setup Guide

A comprehensive guide to all requirements for running the Clario backend server.

---

## Quick Start

### Minimum Requirements
- **Python**: 3.11 or higher
- **Operating System**: Linux, macOS, or Windows
- **Internet**: Required for Supabase and Gemini API access
- **RAM**: 512MB minimum (1GB recommended)
- **Disk**: 500MB for dependencies

### Installation in 3 Steps

```bash
# 1. Navigate to backend directory
cd clario-backend

# 2. Install dependencies (using pip)
pip install -r requirements.txt

# 3. Copy environment template and add your secrets
cp .env.example .env
# Edit .env with your API keys

# 4. Run the server
python run.py
# Server will be available at http://localhost:8000
```

---

## Detailed Requirements

### Python Version Support

The backend requires **Python 3.11 or higher**.

Check your Python version:
```bash
python --version
# or
python3 --version
```

If you don't have Python 3.11+:
- **macOS**: `brew install python@3.12`
- **Ubuntu/Debian**: `sudo apt-get install python3.11 python3.11-venv`
- **Windows**: Download from [python.org](https://www.python.org/downloads/)
- **Any OS**: Use [pyenv](https://github.com/pyenv/pyenv) for version management

### Package Manager Options

Choose one:

#### Option A: `uv` (Recommended - Fast & Modern)
```bash
# Install uv: https://docs.astral.sh/uv/
curl -LsSf https://astral.sh/uv/install.sh | sh

# Setup
cd clario-backend
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt
python run.py
```

#### Option B: `pip` (Built-in, Slower)
```bash
cd clario-backend
python -m venv .venv
source .venv/bin/activate  # .venv\Scripts\activate on Windows
pip install -r requirements.txt
python run.py
```

#### Option C: `Poetry` (Requires Poetry setup)
```bash
cd clario-backend
poetry install
poetry run python run.py
```

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| FastAPI | ≥0.135.2 | Web framework & HTTP server |
| Uvicorn | ≥0.24.0 | ASGI server (async) |
| google-genai | ≥1.69.0 | Google Gemini AI integration |
| langchain-core | ≥0.3.0 | LLM framework foundation |
| langchain-google-genai | ≥2.0.0 | LangChain + Gemini integration |
| websockets | ≥16.0 | Real-time bidirectional communication |
| python-dotenv | ≥1.2.2 | Environment variable loading |
| python-multipart | ≥0.0.22 | Form data parsing |
| loguru | ≥0.7.3 | Structured logging |

### External API Requirements

The backend connects to these external services:

#### 1. **Supabase** (Database & Auth)
- **Account**: Free tier available at https://supabase.com
- **Credentials Needed**:
  - `SUPABASE_URL` - Your project URL
  - `SUPABASE_SECRET_KEY` - Service role key (NOT anon key)
- **Purpose**: User authentication, session storage, conversation history
- **Database Tables Required**:
  - `users` - User profiles
  - `voice_sessions` - Call sessions
  - `conversation_history` - Chat messages
  - `user_settings` - User preferences

#### 2. **Google Gemini AI** (AI Engine)
- **Account**: https://makersuite.google.com/app/apikeys
- **Credentials Needed**:
  - `GEMINI_API_KEY` - Your API key
- **Purpose**: Real-time voice conversation, session analysis
- **Models Used**:
  - `gemini-2.0-flash-exp` - Default for voice sessions
  - `gemini-2.0-flash` - Optional for reports

### Network Requirements

- **Port 8000** - Backend API server (configurable via `PORT` env var)
- **Outbound HTTPS** - Required for Supabase and Gemini APIs
- **WebSocket Support** - For real-time voice streaming
- **CORS Headers** - For frontend communication

---

## Environment Variables

### Required Variables

```env
# Supabase Configuration
SUPABASE_URL=https://kyvrjyenvazxvguuoatp.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxx  # Service role key

# Google Gemini API
GEMINI_API_KEY=AIzaSyC3xxxxx
```

### Optional Variables

```env
# Deployment Environment
ENV=development  # or 'production' (disables reload)

# Server Configuration
HOST=0.0.0.0     # Bind address
PORT=8000        # Server port

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:8080,https://yourdomain.com

# Optional AI Configuration
GEMINI_REPORT_MODEL=gemini-2.0-flash
```

### Setting Environment Variables

**Option 1: .env file (Recommended for development)**
```bash
cp .env.example .env
# Edit .env with your values
python run.py  # Automatically loads .env
```

**Option 2: Command line (for testing)**
```bash
export SUPABASE_URL="https://..."
export SUPABASE_SECRET_KEY="sb_secret_..."
export GEMINI_API_KEY="AIzaSy..."
python run.py
```

**Option 3: System environment (for production)**
```bash
export ENV=production
export PORT=8000
python run.py
```

---

## Installation Steps

### 1. Clone & Navigate
```bash
git clone https://github.com/yourusername/clario.git
cd clario/clario-backend
```

### 2. Create Virtual Environment
```bash
# macOS/Linux
python3.11 -m venv .venv
source .venv/bin/activate

# Windows
python -m venv .venv
.venv\Scripts\activate
```

### 3. Install Dependencies
```bash
# Using pip (slowest)
pip install -r requirements.txt

# Or using pip with cache
pip install --no-cache-dir -r requirements.txt

# Or using uv (fastest - recommended)
uv pip install -r requirements.txt
```

### 4. Configure Environment
```bash
# Copy example file
cp .env.example .env

# Edit with your credentials (use nano, vim, or IDE)
nano .env
```

### 5. Verify Installation
```bash
# Check all dependencies are installed
pip list | grep -E "fastapi|uvicorn|google-genai"

# Try importing main dependencies
python -c "import fastapi; import google.genai; print('OK')"
```

### 6. Start the Server
```bash
# Development (with auto-reload)
python run.py

# Or explicitly set environment
ENV=development python run.py

# Production (no reload)
ENV=production python run.py
```

**Expected output:**
```
INFO:     Will watch for changes in these directories: ['/path/to/clario-backend']
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started server process [12345]
INFO:     Application startup complete.
```

---

## Running in Production

### Using Gunicorn (Recommended)

```bash
# Install gunicorn
pip install gunicorn

# Run with 4 workers
gunicorn -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 app.main:app

# With environment variables
ENV=production PORT=8000 gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

### Using Docker

**Dockerfile example:**
```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "app.main:app"]
```

**Build and run:**
```bash
docker build -t clario-backend .
docker run -p 8000:8000 --env-file .env clario-backend
```

### Using Systemd (Linux)

Create `/etc/systemd/system/clario-backend.service`:
```ini
[Unit]
Description=Clario Backend
After=network.target

[Service]
Type=notify
User=www-data
WorkingDirectory=/opt/clario/clario-backend
Environment="PATH=/opt/clario/clario-backend/.venv/bin"
Environment="PYTHONUNBUFFERED=1"
EnvironmentFile=/opt/clario/.env
ExecStart=/opt/clario/clario-backend/.venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable clario-backend
sudo systemctl start clario-backend
```

---

## Health Checks

### Verify Server is Running

```bash
# Check API is responding
curl http://localhost:8000

# Check with verbose output
curl -v http://localhost:8000

# Expected response:
# {"message":"Clario Backend!"}
```

### Verify Dependencies

```bash
# FastAPI
python -c "from fastapi import FastAPI; print('FastAPI OK')"

# Gemini
python -c "import google.genai; print('Gemini OK')"

# Supabase
python -c "from supabase import create_client; print('Supabase OK')"
```

---

## Troubleshooting

### Issue: "ModuleNotFoundError: No module named 'fastapi'"

**Solution:**
```bash
# Activate virtual environment
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt
```

### Issue: "Port 8000 is already in use"

**Solution:**
```bash
# Use a different port
PORT=8001 python run.py

# Or find and kill the process using port 8000
# macOS/Linux
lsof -ti :8000 | xargs kill -9

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Issue: "Permission denied" on .venv activation

**Solution (Linux/macOS):**
```bash
chmod +x .venv/bin/activate
source .venv/bin/activate
```

### Issue: "GEMINI_API_KEY not found"

**Solution:**
```bash
# Verify .env file exists
ls -la .env

# Check it contains the key
grep GEMINI_API_KEY .env

# Re-copy from .env.example
cp .env.example .env
# Then add your actual keys
```

### Issue: "Connection to Supabase failed"

**Solution:**
- Verify `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are correct
- Check your internet connection
- Verify Supabase account is active and not rate-limited
- Test with curl: `curl $SUPABASE_URL`

---

## Performance Tips

### Increase Worker Count
```bash
# For 4 CPU cores
gunicorn -w 5 -k uvicorn.workers.UvicornWorker app.main:app
# Rule: workers = (2 × CPU cores) + 1
```

### Enable Caching
```bash
# The backend already uses LangChain caching, no additional config needed
```

### Optimize Startup
```bash
# Pre-compile Python files
python -m compileall .

# Use faster JSON serializer
pip install orjson
```

---

## Security Best Practices

1. **Never commit .env to git**
   ```bash
   # .gitignore should include
   .env
   .env.*.local
   .venv/
   ```

2. **Use service_role key for backend only**
   - Backend: Uses `SUPABASE_SECRET_KEY` (service_role)
   - Frontend: Uses separate publishable key

3. **Restrict CORS origins in production**
   ```env
   ALLOWED_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
   ```

4. **Keep dependencies updated**
   ```bash
   pip list --outdated
   pip install --upgrade pip setuptools wheel
   ```

---

## Deployment Platforms

| Platform | Best For | Command |
|----------|----------|---------|
| Railway | Simplicity | `gunicorn` command |
| Render | Performance | Docker container |
| Fly.io | Global | Docker container |
| AWS EC2 | Control | Systemd service |
| Heroku | Legacy | Procfile: `web: gunicorn...` |

See `HOSTING_SETUP.md` for detailed platform guides.

---

## Support

- **API Documentation**: Visit `http://localhost:8000/docs` when running
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **Gemini Docs**: https://ai.google.dev/docs
- **Supabase Docs**: https://supabase.com/docs
