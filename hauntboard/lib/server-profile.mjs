export const TARI_TESTNET_PROVIDERS=Object.freeze(['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com']);

export function serverProfile(env) {
  const profile=env.HAUNTBOARD_PROFILE??'local';
  if(!['local','public','client'].includes(profile))throw new Error('INVALID_SERVER_PROFILE');
  const port=Number(env.PORT??8280);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('INVALID_PORT');
  if(profile==='local'){
    const browserPort=Number(env.LOCAL_BROWSER_PORT??port);
    if(!Number.isInteger(browserPort)||browserPort<1||browserPort>65535)throw new Error('INVALID_LOCAL_BROWSER_PORT');
    const indexer=env.INDEXER_URL??'http://indexer:18300';
    if(!['http://indexer:18300','http://indexer-independent:18300'].includes(indexer))throw new Error('LOCAL_PROVIDER_ONLY');
    const hosts=new Set([`localhost:${port}`,`127.0.0.1:${port}`,`localhost:${browserPort}`,`127.0.0.1:${browserPort}`,`board-web:${port}`,`board-local:${port}`]);
    for(const host of (env.LOCAL_LAN_HOSTS??'').split(',').filter(Boolean)){
      const parts=host.split('.');const valid=parts.length===4&&parts.every(x=>/^(0|[1-9][0-9]{0,2})$/.test(x)&&Number(x)<=255);
      if(!valid||!(parts[0]==='10'||(parts[0]==='192'&&parts[1]==='168')||(parts[0]==='172'&&Number(parts[1])>=16&&Number(parts[1])<=31)))throw new Error('PRIVATE_LOCAL_LAN_HOST_REQUIRED');
      hosts.add(`${host}:${browserPort}`);
    }
    return {profile,port,indexer,origin:null,hosts};
  }
  const origin=new URL(env.ORIGIN);
  const permittedOrigin=profile==='client'?origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname):origin.protocol==='https:';
  if(!permittedOrigin||origin.origin!==env.ORIGIN||origin.username||origin.password)throw new Error('CANONICAL_HTTPS_OR_LOOPBACK_CLIENT_ORIGIN_REQUIRED');
  const provider=new URL(env.INDEXER_URL);
  const approved=(env.APPROVED_PROVIDER_ORIGINS??'').split(',');
  if(provider.protocol!=='https:'||provider.username||provider.password||provider.search||provider.hash||provider.pathname!=='/'||!approved.includes(provider.origin)||!TARI_TESTNET_PROVIDERS.includes(provider.origin))throw new Error('APPROVED_TARI_TESTNET_PROVIDER_REQUIRED');
  return {profile,port,indexer:provider.origin,origin:origin.origin,hosts:new Set([origin.host])};
}
