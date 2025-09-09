# Deployment Guide

## Backend Deployment Options

### 1. Railway (Recommended)
1. Go to [Railway](https://railway.app)
2. Connect GitHub repository
3. Add PostgreSQL database
4. Set environment variables
5. Deploy automatically

### 2. Heroku
```bash
heroku create trevi-leave-management
heroku addons:create heroku-postgresql
heroku config:set NODE_ENV=production
git push heroku main