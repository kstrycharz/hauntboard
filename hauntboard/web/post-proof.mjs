const component = /^component_[a-f0-9]{64}$/;
const providers = ['https://ootle-indexer-a.tari.com','https://ootle-indexer-b.tari.com'];
export function chainStateLink(config, address) {
  if(!component.test(address ?? '')) throw new Error('Invalid chain component');
  if(config.network !== 'esmeralda') return `/api/raw?address=${encodeURIComponent(address)}`;
  const provider = config.providerUrl ?? providers[0];
  if(!providers.includes(provider)) throw new Error('Unsupported chain provider');
  return `${provider}/substates/${address}`;
}
export function postProof(config, thread, post) {
  const index = post.index;
  if(!Number.isSafeInteger(index) || index < 0 || index >= thread.postCount) throw new Error('Invalid post position');
  const paged = thread.schema >= 3;
  const pageNumber = paged ? Math.floor(index / 16) : 0;
  const address = paged ? thread.pages[pageNumber] : thread.address;
  return {address, href:chainStateLink(config,address), postNumber:index+1, pageNumber:pageNumber+1, slot:paged?index%16:index};
}
