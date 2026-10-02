FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS tools
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
WORKDIR /workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN pnpm config set store-dir /pnpm/store
FROM tools AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
# Static preview for M1; production reverse proxy and policy are an M6 gate.
FROM tools AS preview
COPY --from=build --chown=node:node /workspace /workspace
USER node
EXPOSE 4173
CMD ["pnpm", "--filter", "@hauntbox/web", "exec", "vite", "preview", "--host", "0.0.0.0"]
