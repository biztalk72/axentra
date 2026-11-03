FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir uv==0.8.22
COPY pyproject.toml uv.lock ./
ARG INSTALL_INTEGRATIONS=false
RUN if [ "$INSTALL_INTEGRATIONS" = "true" ]; then uv sync --frozen --no-dev --extra integrations; else uv sync --frozen --no-dev; fi
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
RUN useradd --uid 10001 --create-home forge && chown -R forge:forge /app
USER forge
EXPOSE 8000
CMD ["sh", "-c", ".venv/bin/alembic upgrade head && exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000"]
