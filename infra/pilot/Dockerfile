FROM ghcr.io/valhalla/valhalla@sha256:4fd114eb1d26b8fc2f43bcb3df234c1b63a0bf13c277405e5943d5361dc575de
# Exact Osmium version; transitive apt packages are not byte-reproducible.
# Osmium 버전은 고정하며 apt 전이 패키지의 바이트 재생성은 보장하지 않습니다.
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends osmium-tool=1.16.0-1build1 \
    && rm -rf /var/lib/apt/lists/*
