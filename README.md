# Drone Mission Planning Module

Bachelor's Thesis: Design and Implementation of a Drone Mission Planning Module for Airport Lighting Inspection

**Author:** Štefan Moravík | **University:** Masaryk University, Faculty of Informatics

## Structure

- `frontend/` — React 18 + TypeScript + MapLibre GL JS + CesiumJS
- `backend/` — Python 3.12 + FastAPI + SQLAlchemy + PostGIS
- `docs/` — Thesis artifacts, wireframes, diagrams

## Quick Start

```bash
# Start PostGIS
docker compose up -d

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 with PostGIS 3.4
- Docker
