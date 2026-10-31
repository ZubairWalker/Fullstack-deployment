# Full-Stack Deployment with Docker

This project demonstrates a production-style deployment for a full-stack todo application using Docker, Nginx, React, Node.js, MongoDB, and Redis.

## Architecture

- React frontend served through Nginx
- Node.js/Express backend for todo APIs
- MongoDB for persistent data
- Redis for caching
- Nginx as a reverse proxy and edge layer

## Directories

- `frontend/` – React client application and Docker image
- `backend/` – Express API, MongoDB models, uploads, and Docker image
- `nginx/` – reverse proxy and SSL configuration
- `monitoring/` – Prometheus configuration for metrics
- `scripts/` – health and maintenance helpers

## Development startup

```bash
docker compose up --build
```

The app is then available via:

- Frontend: http://localhost/
- API: http://localhost/api
- Health: http://localhost/health

## Production startup

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Common commands

```bash
docker compose logs -f
docker compose up -d --build
docker compose down -v
```

## Backup / restore notes

```bash
docker exec todo-mongo mongodump --db todoapp --out /backup
docker run --rm -v todo_mongo-data:/data -v $(pwd):/backup alpine tar czf /backup/mongo-backup.tar.gz -C /data .
```

## Environment configuration

Use `.env.example` as the template for local development, and `.env.production` for production values.
