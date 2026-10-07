FROM searxng/searxng:latest
# Local dev and Railway use the same config: JSON API on, limiter off
# (rate-limiting happens per-provider in the backend, not at the proxy).
# Production MUST override the secret via SEARXNG_SECRET_KEY env (see below).
COPY ops/searxng/settings.yml /etc/searxng/settings.yml
