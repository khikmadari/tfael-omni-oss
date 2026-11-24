# TFAEL-OMNI — image untuk deploy (Railway atau host Docker lain).
# Tahap 1 membangun frontend (frontend/assets tidak ada di repo); tahap 2 menjalankan server Python.

FROM node:22-slim AS web
WORKDIR /src/tfael-omni
COPY tfael-omni/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ /src/frontend/
COPY tfael-omni/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
# openssl: sertifikat HTTPS lokal; dnsutils: dig/nslookup untuk OSINT; libglib2.0-0: OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends openssl dnsutils libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements-server.txt backend/requirements-server.txt
RUN pip install -r backend/requirements-server.txt
COPY backend/ backend/
COPY --from=web /src/frontend/ frontend/
# Basis data di /data supaya bisa ditaruh di volume (pasang volume Railway di /data).
ENV OMNI_DB_PATH=/data/tfael_omni.db
RUN mkdir -p /data frontend/uploads
EXPOSE 8080
CMD ["sh", "-c", "python3 backend/server.py ${PORT:-8080}"]
