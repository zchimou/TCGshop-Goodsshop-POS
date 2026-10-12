'use strict';
const http=require('http'),path=require('path'),crypto=require('crypto'),core=require('./sync-core'),delta=require('./sync-delta');
const {readBody,sendShop}=require('./sync-http'),{createStore}=require('./sync-store');
function createServer({file,token,updatesDir=path.join(path.dirname(file),'updates')}){
 if(!token||token.length<16)throw Error('请设置至少 16 位的独立 SYNC_TOKEN');
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Content-Encoding,If-Match,If-None-Match,Authorization','Access-Control-Expose-Headers':'ETag','Access-Control-Allow-Methods':'GET,PUT,OPTIONS','Cache-Control':'no-store'},store=createStore(file);
 function send(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...cors,...extra});res.end(JSON.stringify(data));}
 function unchanged(res,etag){res.writeHead(304,{...cors,ETag:etag,Vary:'Accept-Encoding'});res.end();}
 const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS')return send(res,204,null);
  if(require('./updates').handleUpdate(req,res,updatesDir,send))return;
  const expected=Buffer.from('Bearer '+token),actual=Buffer.from(req.headers.authorization||'');if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return send(res,401,{error:'同步密钥不正确'});
  if(req.url==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'tcgshop-pos-sync',syncVersion:2,schema:core.schema,features:{conditionalGet:true,gzipRequests:true,deltaSync:1,imageStore:1,liveNotifications:1}});
  try{
   const image=/^\/api\/images\/([a-f0-9]{64})$/.exec(req.url);
   if(image){if(req.method==='GET')return send(res,200,{data:store.imageGet(image[1])});if(req.method==='PUT'){const b=await readBody(req,600000);store.imagePut(image[1],b.data);return send(res,200,{ok:true});}}
   if(req.url==='/api/events'&&req.method==='GET'){const current=store.read(),from=req.headers['if-none-match'];if(!from||from!==current.etag)return send(res,200,{changed:true},{ETag:current.etag});return store.wait(req,res,current.etag,send,cors);}
   if((req.url==='/api/shop'||req.url==='/api/changes')&&req.method==='GET'){
    let current;try{current=store.read();}catch{return send(res,500,{error:'NAS 店铺数据无法读取，请保留数据目录检查'});}const from=req.headers['if-none-match'];if(from===current.etag)return unchanged(res,current.etag);
    const result=req.url==='/api/shop'?store.materialize(current.data):store.changes(current,from);return await sendShop(req,res,result,current.etag,cors);
   }
   if((req.url==='/api/shop'||req.url==='/api/changes')&&req.method==='PUT'){
    const incoming=await readBody(req,core.limit),current=store.read();
    if(!req.headers['if-match'])return send(res,428,{error:'缺少版本校验'});if(req.headers['if-match']!==current.etag)return send(res,412,{error:'其他设备已更新 NAS 数据'});
    // No await between comparison and replacement; simultaneous writers cannot overwrite a newer version.
    const payload=req.url==='/api/shop'?incoming:incoming.mode==='full'?incoming.payload:incoming.mode==='delta'&&current.data?delta.apply(current.data,incoming.patch):null;
    const etag=store.commit(core.validate(payload),current);return send(res,200,{ok:true},{ETag:etag});
   }
   return send(res,404,{error:'Not found'});
  }catch(e){return send(res,e.status||400,{error:e.message||'同步失败，NAS 数据已保留'});}
 });
 server.on('close',()=>store.close());return server;
}
if(require.main===module){const server=createServer({file:process.env.SHOP_FILE||'/data/shop.json',token:process.env.SYNC_TOKEN});server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('TCGshop POS NAS sync ready'));}
module.exports={createServer};
