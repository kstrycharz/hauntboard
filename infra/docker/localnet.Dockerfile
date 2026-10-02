# Isolated local capability tests; same candidate release as the wallet preflight.
FROM ubuntu:24.04@sha256:a853f94d226358a79c740cfc7bce0c289748f3fe3488d921d038ccd752c61b60
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3t64 libdbus-1-3 unzip \
    && rm -rf /var/lib/apt/lists/*
ADD --checksum=sha256:20c3a443b16ff223bcb73c9c1ac05d3503b2675479ce4beda77b7e4d951670db https://github.com/tari-project/tari-ootle/releases/download/v0.43.0/tari_ootle-0.43.0-392d805-linux-x86_64.zip /tmp/ootle.zip
RUN unzip /tmp/ootle.zip -d /opt/ootle && rm /tmp/ootle.zip \
    && useradd --uid 10001 --create-home localnet && mkdir /network && chown localnet:localnet /network
USER localnet
WORKDIR /network
