FROM python:3.11-slim

WORKDIR /workspace

# System deps for audio, science, and compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    git \
    libsndfile1 \
    libpam0g \
    libpam-modules \
    nodejs \
    npm \
    passwd \
    && rm -rf /var/lib/apt/lists/*

# JupyterHub needs the Node-based configurable HTTP proxy
RUN npm install -g configurable-http-proxy

# Python deps
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

EXPOSE 8888

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--no-browser", "--allow-root", "--port=8888"]
