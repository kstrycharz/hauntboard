FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c
WORKDIR /app
COPY --chown=node:node hauntboard/server.mjs ./hauntboard/server.mjs
COPY --chown=node:node hauntboard/lib ./hauntboard/lib
COPY --chown=node:node hauntboard/web ./hauntboard/web
RUN node -e "const fs=require('node:fs'); for(const name of ['wallet-recovery','transaction-identity']) { const bytes=fs.readFileSync('/app/hauntboard/web/'+name+'.wasm'); if(!WebAssembly.validate(bytes)) throw Error('Invalid WASM: '+name); } const module=new WebAssembly.Module(fs.readFileSync('/app/hauntboard/web/transaction-identity.wasm')); const exports=new Set(WebAssembly.Module.exports(module).map(x=>x.name)); for(const name of ['memory','transaction_buffer','identity_buffer','transaction_identity','transaction_max_epoch']) if(!exports.has(name)) throw Error('Missing WASM export: '+name);"
COPY --chown=node:node hauntboard/scripts/operations-backup.mjs ./hauntboard/scripts/operations-backup.mjs
RUN mkdir /companion && chown node:node /companion
USER node
EXPOSE 8280
CMD ["node", "hauntboard/server.mjs"]
