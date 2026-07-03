# Clario Hosting & Deployment Setup Guide

This document outlines all requirements and steps to deploy Clario for production hosting.

---

## Table of Contents

1. [Backend Requirements](#backend-requirements)
2. [Frontend Requirements](#frontend-requirements)
3. [Environment Variables](#environment-variables)
4. [Local Development Setup](#local-development-setup)
5. [Production Deployment](#production-deployment)
6. [Deployment Options](#deployment-options)
7. [Security Checklist](#security-checklist)

---

## Backend Requirements

### System Requirements
- **Python**: 3.11 or higher
- **Package Manager**: `uv` (recommended) or `pip`

### Python Dependencies

All dependencies are listed in:
- `pyproject.toml` (for uv)
- `requirements.txt` (for pip)

#### Key Dependencies:
- **FastAPI** (0.135.2+) - Web framework and async support
- **Uvicorn** (0.24.0+) - ASGI server
- **Google GenAI** (1.69.0+) - Gemini AI integration
- **LangChain** (0.3.0+) - LLM orchestration
- **python-dotenv** - Environment variable management
- **websockets** - Real-time voice session support
- **loguru** - Structured logging

### Installation

#### Using uv (Recommended)
```bash
cd clario-backend
uv venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv pip install -r requirements.txt
```

#### Using pip
```bash
cd clario-backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

---

## Frontend Requirements

### System Requirements
- **Node.js**: 18.x or higher
- **Package Manager**: `npm`, `bun`, or `pnpm`

### Node Dependencies
- **Vite** (5.4.19+) - Build tool
- **React** (18.3+) - UI framework
- **TailwindCSS** (3.4+) - Styling
- **Supabase JS** (2.100+) - Auth & database client
- **React Router** (6.30+) - Client-side routing
- **React Query** (5.83+) - Data fetching
- **i18next** - Internationalization

### Installation

```bash
cd clario-frontend

# Using npm
npm install

# Or using bun (faster)
bun install

# Or using pnpm
pnpm install
```

---

## Environment Variables

### Backend (.env)

**Required:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-secret
GEMINI_API_KEY=your-gemini-api-key
```

**Optional (Production):**
```env
ENV=production                                    # Set to 'production' to disable reload
HOST=0.0.0.0                                     # Server host
PORT=8000                                        # Server port
ALLOWED_ORIGINS=https://yourdomain.com          # Comma-separated CORS origins
GEMINI_REPORT_MODEL=gemini-2.0-flash            # Optional: AI model for reports
```

### Frontend (.env)

**Required:**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_BACKEND_BASE_URL=https://api.yourdomain.com
```

---

## Local Development Setup

### 1. Backend

```bash
cd clario-backend
source .venv/bin/activate
python run.py
# Server runs on http://localhost:8000
```

### 2. Frontend

```bash
cd clario-frontend
npm run dev
# Frontend runs on http://localhost:8080 (or http://localhost:5173 if port unavailable)
```

### 3. Access the Application
- Open browser: http://localhost:8080

---

## Production Deployment

### Backend Pre-Deployment Checklist

- [ ] Update `.env` with production credentials
- [ ] Set `ENV=production` in `.env`
- [ ] Update `ALLOWED_ORIGINS` to your domain(s)
- [ ] Ensure `DEBUG=false`
- [ ] Use a production ASGI server (Gunicorn + Uvicorn)
- [ ] Configure logging (Loguru is pre-configured)
- [ ] Set up error tracking (optional: Sentry integration)

### Frontend Pre-Deployment Checklist

- [ ] Update `.env` with production domain
- [ ] Set `VITE_BACKEND_BASE_URL` to production API URL
- [ ] Run production build: `npm run build`
- [ ] Verify build output in `dist/` directory
- [ ] Test production build locally: `npm run preview`

### Production Build Commands

#### Backend
```bash
# With gunicorn (recommended for production)
gunicorn -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 app.main:app
```

#### Frontend
```bash
npm run build
# Output: dist/ directory ready for deployment
```

---

## Deployment Options

### Option 1: Vercel (Recommended for Frontend)

**Frontend:**
1. Connect GitHub repository to Vercel
2. Set environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_BACKEND_BASE_URL`
3. Deploy

### Option 2: Railway.app

**Backend & Frontend:**
1. Connect repository
2. Configure environment variables
3. Set start commands:
   - Backend: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`
   - Frontend: `npm run build && npm preview -- --host`

### Option 3: Docker (Any Cloud Provider)

**Backend Dockerfile:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "app.main:app"]
```

**Frontend Dockerfile:**
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json bun.lockb ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "3000"]
```

### Option 4: AWS (Elastic Beanstalk, App Runner, etc.)

Requires:
- `.ebextensions/` configuration
- `Procfile` for backend: `web: gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`
- S3 for frontend static hosting

### Option 5: Heroku (Legacy but Simple)

**Backend Procfile:**
```
web: gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

**Frontend:**
Deploy to separate platform (Vercel, Netlify, or S3).

---

## Security Checklist

### API Security
- [ ] Use HTTPS only in production (enforce in ALLOWED_ORIGINS)
- [ ] Enable CORS properly (not `*` - use specific domains)
- [ ] Implement rate limiting on API endpoints
- [ ] Use service_role secret for backend Supabase calls (never anon)
- [ ] Rotate secret keys regularly

### Code Security
- [ ] Remove `.env` from git (use .gitignore)
- [ ] Never commit actual API keys/secrets
- [ ] Use environment variables for all secrets
- [ ] Keep dependencies updated: `pip check` and `npm audit`
- [ ] Enable security headers (HSTS, CSP, etc.)

### Infrastructure Security
- [ ] Use HTTPS certificates (Let's Encrypt recommended)
- [ ] Configure WAF (Web Application Firewall) if available
- [ ] Set up monitoring and alerts
- [ ] Regular backups of Supabase database
- [ ] Use private networks where applicable
- [ ] Implement request signing for API calls

### Supabase Security
- [ ] Use Row Level Security (RLS) policies
- [ ] Verify service_role key rotation
- [ ] Monitor usage and set spending limits
- [ ] Enable 2FA for Supabase account
- [ ] Review user permissions regularly

---

## Running the Application

### For Development
```bash
# Terminal 1: Backend
cd clario-backend
source .venv/bin/activate
python run.py

# Terminal 2: Frontend
cd clario-frontend
npm run dev
```

### For Production
See [Production Deployment](#production-deployment) section above.

---

## Troubleshooting

### Backend won't start
- Verify Python 3.11+ installed: `python --version`
- Check all dependencies installed: `pip list`
- Verify `.env` file exists with all required keys
- Check port 8000 isn't already in use

### Frontend build fails
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear build cache: `rm -rf dist && npm run build`
- Verify environment variables in `.env`

### CORS errors
- Verify `ALLOWED_ORIGINS` in backend `.env`
- Verify `VITE_BACKEND_BASE_URL` in frontend `.env`
- Check browser console for exact error

---

## Support & Documentation

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Vite Docs](https://vitejs.dev/)
- [Supabase Docs](https://supabase.com/docs)
- [Google Gemini Docs](https://ai.google.dev/docs)
