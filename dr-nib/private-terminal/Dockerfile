ARG NODE_IMAGE=node@sha256:7cc56ef285a8568121537d17b05e72128f01b89c54607b51acf084a50ef483f3
FROM ${NODE_IMAGE}
USER root
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 python3-pip python3-venv python3-numpy python3-pandas python3-requests jq git curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY unpack-runtime.py /tmp/unpack-runtime.py
# Official gVisor release, verified before extraction. No mutable runtime tag.
RUN curl -fL --retry 2 https://github.com/google/gvisor/releases/download/release-20261012.0/gvisor-x86_64.tar.bz2 -o /tmp/gvisor.tar.bz2 && echo '180dd277f657c1478f09490e8a9a595f7378257510b43d1d3694a769aef9ed02  /tmp/gvisor.tar.bz2' | sha256sum -c - && python3 /tmp/unpack-runtime.py /tmp/gvisor.tar.bz2 && rm /tmp/gvisor.tar.bz2 /tmp/unpack-runtime.py
WORKDIR /app
COPY policy.mjs runner.mjs cache-proxy.mjs ./
ENV GOMAXPROCS=2
CMD ["node","/app/runner.mjs"]
