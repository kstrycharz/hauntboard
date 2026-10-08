# Dedicated Esmeralda wallet tooling; private state is kept in a named volume.
FROM ubuntu:24.04@sha256:a853f94d226358a79c740cfc7bce0c289748f3fe3488d921d038ccd752c61b60
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3t64 libdbus-1-3 unzip && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:1e6a1ece9ff63355955de768f8ed5e7656d97d3b7640f31acf6b655f74c6ae3d https://github.com/tari-project/tari/releases/download/v6.1.0/tari_suite-6.1.0-esme-463e53d-linux-x86_64.zip /tmp/tari.zip
RUN unzip /tmp/tari.zip -d /opt/tari && rm /tmp/tari.zip
WORKDIR /private
