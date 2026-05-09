FROM ghcr.io/cheshire-cat-ai/core@sha256:79e27004db1ce034f62e4697ef198e0dcb7d6c61443e23c9783e24d384a03f80

COPY ops/bootstrap-cat.py /bootstrap/bootstrap-cat.py
COPY docker/cat-entrypoint.sh /bootstrap/cat-entrypoint.sh

RUN chmod +x /bootstrap/cat-entrypoint.sh

ENTRYPOINT ["/bootstrap/cat-entrypoint.sh"]
