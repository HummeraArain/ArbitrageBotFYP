FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

RUN python - <<'PY'
from pathlib import Path
req = Path("requirements.txt").read_text().splitlines()
cleaned = []
for line in req:
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        cleaned.append(line)
        continue
    if stripped.lower() == "logging":
        continue
    cleaned.append(line)
Path("requirements.docker.txt").write_text("\n".join(cleaned) + "\n")
PY

RUN pip install --upgrade pip && pip install -r requirements.docker.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
