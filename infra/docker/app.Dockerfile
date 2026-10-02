FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS build
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile && pnpm check && pnpm build
FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c AS api
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/package.json /workspace/package.json
COPY --from=build --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=build --chown=node:node /workspace/apps/api /workspace/apps/api
COPY --from=build --chown=node:node /workspace/apps/worker /workspace/apps/worker
COPY --from=build --chown=node:node /workspace/packages /workspace/packages
COPY --from=build --chown=node:node /workspace/scripts/lib /workspace/scripts/lib
USER node
EXPOSE 3000
CMD ["node","--experimental-strip-types","apps/api/main.mjs"]
FROM caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b AS web
RUN setcap -r /usr/bin/caddy
COPY --from=build /workspace/apps/web/dist /srv
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
USER 1000:1000
EXPOSE 8080
FROM postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652 AS maintenance
WORKDIR /workspace
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build /workspace/package.json /workspace/package.json
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY scripts/application-backup.mjs /workspace/scripts/application-backup.mjs
USER 1000:1000
ENTRYPOINT ["node","scripts/application-backup.mjs"]
