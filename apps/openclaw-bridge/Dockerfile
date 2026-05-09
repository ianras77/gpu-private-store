FROM node:22-alpine AS ui-build

WORKDIR /app/ex_app
COPY ex_app/package.json ex_app/package-lock.json ./
RUN npm ci
COPY ex_app/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY ex_app ./ex_app
COPY appinfo ./appinfo
COPY img ./img

COPY --from=ui-build /app/ex_app/ui-dist ./ex_app/ui-dist

EXPOSE 8000

CMD ["uvicorn", "ex_app.lib.main:app", "--host", "0.0.0.0", "--port", "8000"]
