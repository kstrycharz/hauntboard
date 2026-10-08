FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git libicu72 libgssapi-krb5-2 libssl3 unzip && rm -rf /var/lib/apt/lists/*
ENV RUNNER_ALLOW_RUNASROOT=1
WORKDIR /home/ubuntu/hauntboard/actions-runner
CMD ["./run.sh"]
