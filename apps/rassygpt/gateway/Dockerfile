FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /app/requirements.txt

COPY app.py /app/app.py
COPY routes.default.yaml /app/routes.default.yaml

RUN useradd -r -u 10001 -g users rassygpt \
    && mkdir -p /data/config /data/logs \
    && chown -R rassygpt:users /data /app
USER rassygpt

EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port 8080 --proxy-headers --workers ${RASSYGPT_GATEWAY_WORKERS:-4} --limit-concurrency ${RASSYGPT_GATEWAY_LIMIT_CONCURRENCY:-256} --backlog 2048"]
