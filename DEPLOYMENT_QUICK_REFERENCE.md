# Clario Deployment Quick Reference

## Prerequisites Checklist
- [ ] Python 3.11+ (backend)
- [ ] Node.js 18+ (frontend)
- [ ] Supabase account & API keys
- [ ] Google Gemini API key
- [ ] Docker (optional, for containerized deployment)

## Quick Deployment Commands

### Backend Deployment

#### Local Testing
```bash
cd clario-backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your keys
python run.py
```

#### Production with Gunicorn
```bash
pip install gunicorn
ENV=production gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

#### Docker
```bash
docker build -f clario-backend/Dockerfile -t clario-backend .
docker run -p 8000:8000 --env-file clario-backend/.env clario-backend
```

### Frontend Deployment

#### Local Testing
```bash
cd clario-frontend
npm install
npm run dev
```

#### Production Build
```bash
npm install
npm run build
# Output: dist/ directory
```

#### Docker
```bash
docker build -f clario-frontend/Dockerfile -t clario-frontend .
docker run -p 3000:3000 --env-file clario-frontend/.env clario-frontend
```

### Full Stack with Docker Compose
```bash
# Copy environment files
cp clario-backend/.env.example clario-backend/.env
cp clario-frontend/.env.example clario-frontend/.env

# Edit both .env files with your credentials

# Start everything
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Environment Variables Required

### Backend
```env
SUPABASE_URL=your-supabase-url
SUPABASE_SECRET_KEY=your-secret-key
GEMINI_API_KEY=your-gemini-key
ENV=production
ALLOWED_ORIGINS=your-domain.com
```

### Frontend
```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_BACKEND_BASE_URL=your-api-domain
```

## Popular Deployment Platforms

### Railway.app
1. Connect GitHub repo
2. Add environment variables
3. Set start command: `gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`
4. Deploy

### Render.com
1. Connect GitHub repo
2. Create web service with Docker
3. Set environment variables
4. Deploy

### Vercel (Frontend Only)
1. Connect GitHub repo
2. Set VITE_BACKEND_BASE_URL
3. Deploy

### AWS EC2
1. Launch Ubuntu instance
2. Install Python 3.11 & Node.js
3. Clone repo
4. Follow local testing steps
5. Use systemd service to keep running

### Heroku (Legacy)
Backend: Use Procfile (already created)
```
git push heroku main
heroku config:set SUPABASE_URL=your-value
```

## Health Checks

```bash
# Backend
curl http://localhost:8000

# Frontend (after build)
npm run preview

# Docker Health
docker inspect --format='{{.State.Health.Status}}' container_name
```

## Scaling Tips

### Backend
- Start with 4 workers: `-w 4 -k uvicorn.workers.UvicornWorker`
- For N CPU cores: workers = (2 × N) + 1
- Use load balancer (nginx) for multiple instances

### Frontend
- Use CDN (Cloudflare, AWS CloudFront)
- Enable gzip compression
- Cache static assets

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port in use | `lsof -ti :8000 \| xargs kill -9` |
| CORS error | Check ALLOWED_ORIGINS env var |
| Build fails | Clear node_modules/dist and rebuild |
| API 500 error | Check backend logs and .env keys |

## Documentation Links
- Full Setup: See `HOSTING_SETUP.md` in project root
- Backend Details: See `BACKEND_REQUIREMENTS.md` in clario-backend/
- API Docs: Available at http://localhost:8000/docs when running

## Support
For issues, check:
1. Environment variables are set correctly
2. All required API keys are valid
3. Firewall allows necessary ports
4. Docker containers have network access
