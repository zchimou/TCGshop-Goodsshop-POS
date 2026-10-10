'use strict';
const zlib=require('zlib');
function readBody(req,limit){return new Promise((resolve,reject)=>{
 const encoding=(req.headers['content-encoding']||'identity').toLowerCase();
 if(!['identity','gzip'].includes(encoding)){req.resume();return reject(Object.assign(Error('不支持的传输压缩格式'),{status:415}));}
 const input=encoding==='gzip'?zlib.createGunzip():req;let chunks=[],size=0,wireSize=0,done=false;
 function fail(error){if(done)return;done=true;chunks=[];if(input!==req){req.unpipe(input);input.destroy();}req.resume();reject(error);}
 req.on('aborted',()=>fail(Error('上传已中断')));req.on('error',fail);
 req.on('data',chunk=>{wireSize+=chunk.length;if(wireSize>limit)fail(Object.assign(Error('数据超过 20MB'),{status:413}));});
 input.on('error',()=>fail(Error('压缩数据不正确')));
 input.on('data',chunk=>{if(done)return;size+=chunk.length;if(size>limit)return fail(Object.assign(Error('解压后数据超过 20MB'),{status:413}));chunks.push(chunk);});
 input.on('end',()=>{if(done)return;done=true;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('JSON 格式不正确'));}});
 if(input!==req)req.pipe(input);
});}
function acceptsGzip(req){return (req.headers['accept-encoding']||'').split(',').some(value=>{const [name,...params]=value.trim().split(';');return name==='gzip'&&!params.some(p=>/^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(p));});}
async function sendShop(req,res,data,etag,cors){
 const raw=Buffer.from(JSON.stringify(data)),headers={'Content-Type':'application/json; charset=utf-8',...cors,ETag:etag,Vary:'Accept-Encoding'};
 let body=raw;if(raw.length>1024&&acceptsGzip(req)){body=await new Promise((resolve,reject)=>zlib.gzip(raw,{level:3},(e,b)=>e?reject(e):resolve(b)));headers['Content-Encoding']='gzip';}
 if(res.destroyed)return;res.writeHead(200,{...headers,'Content-Length':body.length});res.end(body);
}
module.exports={readBody,sendShop};
