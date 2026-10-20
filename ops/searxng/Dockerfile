FROM searxng/searxng@sha256:d81e14a4328ba7a57f297dff0472be629d30bf29580406c0d5b3bdab563c9bed
# Local dev and Railway use the same config: JSON API on, limiter off
# (rate-limiting happens per-provider in the backend, not at the proxy).
# Production MUST override the secret via SEARXNG_SECRET_KEY env (see below).
COPY ops/searxng/settings.yml /etc/searxng/settings.yml
