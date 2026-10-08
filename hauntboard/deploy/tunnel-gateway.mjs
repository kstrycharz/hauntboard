import {createServer,request} from 'node:http';
const origin=new URL(process.env.ORIGIN);
if(origin.protocol!=='https:'||origin.origin!==process.env.ORIGIN)throw new Error('Canonical HTTPS origin required.');
// Keep the existing Quick Tunnel destination and URL while forwarding to the live app.
createServer((req,res)=>{
  if(req.headers.host!==origin.host){res.writeHead(403);res.end('Unsupported host');return;}
  const upstream=request({hostname:'app',port:8280,path:req.url,method:req.method,headers:{...req.headers,host:origin.host}},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.setTimeout(40000,()=>upstream.destroy());
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Application unavailable. Please retry.'}));});
  req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
}).listen(8281,'0.0.0.0');
