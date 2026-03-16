# ── Stage 1: Build frontend ──────────────────────────────────────────
FROM node:22-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python runtime ─────────────────────────────────────────
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS runtime

WORKDIR /app

# Copy dependency metadata first for better layer caching
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy backend source
COPY backend/ ./

# Copy built frontend into static/ directory
COPY --from=frontend-build /app/frontend/dist ./static

# Create profiles directory
RUN mkdir -p /app/profiles

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080
ENV HOST=0.0.0.0
ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 8080

CMD ["sh", "-c", "uvicorn main:app --host ${HOST} --port ${PORT}"]
