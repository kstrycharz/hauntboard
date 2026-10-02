# M2 candidate preflight only. This upstream release is marked prerelease.
FROM ubuntu:24.04@sha256:a853f94d226358a79c740cfc7bce0c289748f3fe3488d921d038ccd752c61b60
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3t64 libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home wallet && mkdir /wallet && chown wallet:wallet /wallet
ADD --checksum=sha256:61ff7763cadf6236b58ee625c656e7aec55104ef910310a7281b746853c02749 https://github.com/tari-project/tari-ootle/releases/download/v0.43.0/tari_ootle_walletd-0.43.0-392d805-linux-x86_64 /usr/local/bin/tari_ootle_walletd
RUN chmod 755 /usr/local/bin/tari_ootle_walletd
USER wallet
ENTRYPOINT ["tari_ootle_walletd"]
CMD ["--help"]
