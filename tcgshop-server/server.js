'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),core=require('./sync-core');
const {readBody,sendShop}=require('./sync-http');
function createServer({file,token,updatesDir=path.join(path.dirname(file),'updates')}){
 if(!token||token.length<16)throw Error('请设置至少 16 位的独立 SYNC_TOKEN');
 const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Content-Encoding,If-Match,If-None-Match,Authorization','Access-Control-Expose-Headers':'ETag','Access-Control-Allow-Methods':'GET,PUT,OPTIONS','Cache-Control':'no-store'},hash=raw=>'"'+crypto.createHash('sha256').update(raw).digest('hex')+'"';
 function read(){const raw=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'null';return {raw,etag:hash(raw),get data(){const data=JSON.parse(raw);if(data!==null)core.migratePayload(data);return data;}};}
 function send(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...cors,...extra});res.end(JSON.stringify(data));}
 function body(req){return readBody(req,core.limit);}
 return http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS')return send(res,204,null);
 // Public release files contain no shop data or sync credentials.
 if(require('./updates').handleUpdate(req,res,updatesDir,send))return;
 const expected=Buffer.from('Bearer '+token),actual=Buffer.from(req.headers.authorization||'');if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return send(res,401,{error:'同步密钥不正确'});
 if(req.url==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'tcgshop-pos-sync',syncVersion:2,schema:core.schema,features:{conditionalGet:true,gzipRequests:true}});
 if(req.url==='/api/shop'&&req.method==='GET'){try{const current=read();if(req.headers['if-none-match']===current.etag){res.writeHead(304,{...cors,ETag:current.etag,Vary:'Accept-Encoding'});return res.end();}return await sendShop(req,res,current.data,current.etag,cors);}catch{return send(res,500,{error:'NAS 店铺数据无法读取，请保留数据目录检查'});}}
 if(req.url==='/api/shop'&&req.method==='PUT'){try{const data=core.validate(await body(req));const current=read();if(!req.headers['if-match'])return send(res,428,{error:'缺少版本校验'});if(req.headers['if-match']!==current.etag)return send(res,412,{error:'其他设备已更新 NAS 数据'});
 // No await between the version comparison and atomic replacement: competing PUTs serialize.
 fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)){fs.copyFileSync(file,file+'.previous');fs.chmodSync(file+'.previous',0o600);const backups=path.join(path.dirname(file),'backups');fs.mkdirSync(backups,{recursive:true});const name=Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.json',target=path.join(backups,name);fs.copyFileSync(file,target);fs.chmodSync(target,0o600);const history=fs.readdirSync(backups).filter(n=>/^\d{13}-[a-f0-9]{8}\.json$/.test(n)).sort();for(const old of history.slice(0,Math.max(0,history.length-30))){const target=path.resolve(backups,old);if(path.dirname(target)!==path.resolve(backups))throw Error('备份目录不正确');fs.unlinkSync(target);}}const raw=JSON.stringify(data);const tmp=file+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);return send(res,200,{ok:true},{ETag:hash(raw)});
 }catch(e){return send(res,e.status||400,{error:e.message||'保存失败'});}}
 return send(res,404,{error:'Not found'});
 });
}
if(require.main===module){const server=createServer({file:process.env.SHOP_FILE||'/data/shop.json',token:process.env.SYNC_TOKEN});server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('TCGshop POS NAS sync ready'));}
module.exports={createServer};
