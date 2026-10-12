'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),core=require('./sync-core'),delta=require('./sync-delta');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
function createStore(file){
 const images=path.join(path.dirname(file),'images'),history=new Map(),waiters=new Set();let historyBytes=0,cached;
 function imageFile(id){if(!/^[a-f0-9]{64}$/.test(id))throw Error('图片编号不正确');return path.join(images,id+'.jpg');}
 function imageGet(id){const target=imageFile(id);if(!fs.existsSync(target))throw Object.assign(Error('商品图片不存在'),{status:404});const bytes=fs.readFileSync(target);if(digest(bytes)!==id)throw Error('商品图片校验失败');return 'data:image/jpeg;base64,'+bytes.toString('base64');}
 function imagePut(id,data){if(typeof data!=='string'||data.length>600000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data))throw Error('商品封面格式不正确');const bytes=Buffer.from(data.split(',')[1],'base64');if(digest(bytes)!==id)throw Error('商品图片校验失败');const target=imageFile(id);fs.mkdirSync(images,{recursive:true});if(fs.existsSync(target)){imageGet(id);return;}const tmp=target+'.'+crypto.randomBytes(6).toString('hex')+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,target);}
 function separate(payload){if(!payload)return null;const result=clone(payload);for(const p of result.ledger.products){if(!p.cover)continue;if(p.cover.startsWith('asset:')){if(!fs.existsSync(imageFile(p.cover.slice(6))))throw Error('缺少商品图片，请先上传封面');continue;}const id=digest(Buffer.from(p.cover.split(',')[1],'base64'));imagePut(id,p.cover);p.cover='asset:'+id;}return core.validate(result);}
 function materialize(payload){if(!payload)return null;const result=clone(payload);for(const p of result.ledger.products)if(p.cover?.startsWith('asset:'))p.cover=imageGet(p.cover.slice(6));return result;}
 function remember(etag,payload){if(history.has(etag))return;const bytes=Buffer.byteLength(JSON.stringify(payload));history.set(etag,{payload,bytes});historyBytes+=bytes;while(history.size>32||historyBytes>32*1024*1024){const key=history.keys().next().value;historyBytes-=history.get(key).bytes;history.delete(key);}}
 function read(){const raw=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'null';if(cached?.raw===raw)return cached;const etag='"'+digest(raw)+'"',parsed=JSON.parse(raw);if(parsed!==null)core.migratePayload(parsed);const data=separate(parsed);remember(etag,data);return cached={etag,data,raw};}
 function commit(data,current){const normalized=separate(core.validate(data)),raw=JSON.stringify(normalized);fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file)){fs.copyFileSync(file,file+'.previous');fs.chmodSync(file+'.previous',0o600);const backups=path.join(path.dirname(file),'backups');fs.mkdirSync(backups,{recursive:true});const target=path.join(backups,Date.now()+'-'+crypto.randomBytes(4).toString('hex')+'.json');fs.copyFileSync(file,target);fs.chmodSync(target,0o600);const names=fs.readdirSync(backups).filter(n=>/^\d{13}-[a-f0-9]{8}\.json$/.test(n)).sort();for(const name of names.slice(0,Math.max(0,names.length-30)))fs.unlinkSync(path.join(backups,name));}
  const tmp=file+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);const etag='"'+digest(raw)+'"';remember(current.etag,current.data);remember(etag,normalized);cached={raw,etag,data:normalized};for(const wake of [...waiters])wake(etag);return etag;
 }
 function changes(current,from){const old=history.get(from);return old&&old.payload!==null&&current.data!==null?{mode:'delta',from,patch:delta.diff(old.payload,current.data)}:{mode:'full',payload:current.data};}
 function wait(req,res,etag,send,cors){if(waiters.size>=256)return send(res,429,{error:'实时连接繁忙，请稍后重试'});let done=false;
  const finish=tag=>{if(done)return;done=true;clearTimeout(timer);waiters.delete(finish);res.removeListener('close',closed);if(res.destroyed)return;if(tag===etag){res.writeHead(304,{...cors,ETag:tag});res.end();}else send(res,200,{changed:true},{ETag:tag});};
  const closed=()=>{done=true;clearTimeout(timer);waiters.delete(finish);};const timer=setTimeout(()=>finish(etag),15000);res.on('close',closed);waiters.add(finish);
 }
 function close(){for(const wake of [...waiters])wake('');}
 return {read,commit,materialize,changes,wait,close,imageGet,imagePut};
}
module.exports={createStore};
