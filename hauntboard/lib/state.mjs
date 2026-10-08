import {COMPONENT} from './chain.mjs';
function address(value) {
  if(typeof value==='string' && COMPONENT.test(value))return value;
  if(Array.isArray(value) && value.length===32 && value.every(x=>Number.isInteger(x)&&x>=0&&x<=255))return `component_${Buffer.from(value).toString('hex')}`;
  // Canonical BOR serde tags are sentinels, not user-supplied board text.
  if(value && typeof value==='object') {
    for(const candidate of Object.values(value)) {
      if(typeof candidate==='string' && /^[a-f0-9]{64}$/.test(candidate))return `component_${candidate}`;
      try{return address(candidate);}catch{}
    }
  }
  throw new Error('INVALID_CHAIN_ADDRESS_ENCODING');
}
function bytes(value, max) {
  if(!Array.isArray(value)||value.length>max||!value.every(x=>Number.isInteger(x)&&x>=0&&x<=255))throw new Error('INVALID_CHAIN_BYTES');
  return value;
}
export function decodeState(row, locator) {
  if(row?.verified!==true||!Number.isSafeInteger(row.version)||row.version<0)throw new Error('UNVERIFIED_CHAIN_STATE');
  const s=row.substate?.Component?.body?.state;
  if(!Array.isArray(s)||!((s.length===8&&s[0]===2)||(s.length===12&&[3,4].includes(s[0])))||typeof s[1]!=='boolean'||typeof s[3]!=='string'||![0,1].includes(s[4])||(s[0]===4&&s[4]!==0))throw new Error('UNSUPPORTED_BOARD_SCHEMA');
  const isBoard=s[1];
  if(!Array.isArray(s[6])||s[6].length>128||!Array.isArray(s[7])||s[7].length>32)throw new Error('INVALID_CHAIN_COLLECTION');
  const paged=s[0]>=3;
  if(paged&&!Array.isArray(s[8]))throw new Error('INVALID_CHAIN_PAGES');
  const pages=paged?s[8].map(address):[];
  const postCount=paged?s[9]:s[7].length;
  const pageOwner=paged&&s[10]!==''?address(s[10]):null;
  const pageStart=paged?s[11]:0;
  if(pages.length>128||!Number.isInteger(postCount)||postCount<0||postCount>2048||!Number.isInteger(pageStart)||pageStart<0||pageStart%16!==0)throw new Error('INVALID_CHAIN_PAGES');
  if(paged&&(pageOwner?(pages.length!==0||postCount!==s[7].length||postCount>16):(s[7].length!==0||(!isBoard&&pages.length!==Math.ceil(postCount/16)))))throw new Error('INVALID_CHAIN_PAGE_COUNTS');
  if(new Set(pages).size!==pages.length||pageStart>=2048||pageStart+postCount>2048)throw new Error('INVALID_CHAIN_PAGE_RANGE');
  const board=s[2]===''?null:address(s[2]),uid=bytes(s[5],16);
  if(isBoard?(board!==null||pageOwner!==null||pages.length!==0||postCount!==0||uid.length!==0):(board===null||uid.length!==16||s[6].length!==0))throw new Error('INVALID_CHAIN_ROLE');
  if(!pageOwner&&pageStart!==0)throw new Error('INVALID_CHAIN_PAGE_START');
  const text=value=>typeof value==='string'&&Buffer.byteLength(value)>=1&&Buffer.byteLength(value)<=80&&value.trim().length>0;
  if(!pageOwner&&!text(s[3]))throw new Error('INVALID_CHAIN_TITLE');
  const threadAddresses=new Set(),threadIds=new Set();
  for(const t of s[6]){
    if(!Array.isArray(t)||t.length!==(s[0]===4?4:5)||!text(t[1])||![0,1].includes(t[2])||(s[0]===4&&t[2]!==0)||bytes(t[3],16).length!==16)throw new Error('INVALID_CHAIN_THREAD');
    const addr=address(t[0]),identity=JSON.stringify(t[3]);
    if(threadAddresses.has(addr)||threadIds.has(identity))throw new Error('DUPLICATE_CHAIN_THREAD');threadAddresses.add(addr);threadIds.add(identity);
  }
  for(const [index,p] of s[7].entries()){
    const offset=s[0]===4?0:1,parent=p?.[1+offset],epoch=p?.[3+offset];
    if(!Array.isArray(p)||p.length!==(s[0]===4?4:5)||bytes(p[0],16).length!==16||!Number.isInteger(parent)||parent< -1||parent>=pageStart+index||bytes(p[2+offset],4096).length===0||!Number.isSafeInteger(epoch)||epoch<0)throw new Error('INVALID_CHAIN_POST');
  }
  return {address:locator,version:row.version,verified:row.verified,schema:s[0],isBoard,board:s[2]===''?null:address(s[2]),title:s[3],mode:s[4],uid:bytes(s[5],16),pages,postCount,pageOwner,pageStart,capacity:paged?2048:32,pageSize:paged?16:32,
    threads:s[6].map(t=>({address:address(t[0]),title:t[1],mode:t[2],uid:bytes(t[3],16),...(s[0]===4?{}:{author:t[4]})})),
    posts:s[7].map((p,index)=>{const offset=s[0]===4?0:1;return {index:pageStart+index,nonce:bytes(p[0],16),...(offset?{author:p[1]}:{}),parent:p[1+offset]===-1?null:p[1+offset],payload:bytes(p[2+offset],4096),epoch:p[3+offset]};})};
}
