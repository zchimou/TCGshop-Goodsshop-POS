'use strict';
const fs=require('fs'),path=require('path');
const APK=/^[a-f0-9]{64}\.apk$/;
function readManifest(dir){
 const raw=fs.readFileSync(path.join(dir,'latest.json'),'utf8');
 if(Buffer.byteLength(raw)>65536)throw Error('更新信息过大');
 const m=JSON.parse(raw);
 if(m.schema!==1||m.packageName!=='com.tcgshop.pos'||!Number.isSafeInteger(m.versionCode)||m.versionCode<1||typeof m.versionName!=='string'||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(m.versionName)||!Number.isSafeInteger(m.size)||m.size<1||m.size>100*1024*1024||typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.sha256)||typeof m.notes!=='string'||m.notes.length>4000)throw Error('更新信息格式错误');
 if(fs.statSync(path.join(dir,m.sha256+'.apk')).size!==m.size)throw Error('安装包不完整');
 return {schema:1,packageName:m.packageName,versionCode:m.versionCode,versionName:m.versionName,size:m.size,sha256:m.sha256,notes:m.notes};
}
function handleUpdate(req,res,dir,send){
 if(req.url==='/api/update'&&req.method==='GET'){
  try{send(res,200,readManifest(dir));}catch{send(res,503,{error:'更新尚未发布或安装包不完整，请联系管理员'});}
  return true;
 }
 if(req.url.startsWith('/api/update/apk/')&&req.method==='GET'){
  const name=req.url.slice('/api/update/apk/'.length);
  if(!APK.test(name)){send(res,404,{error:'安装包不存在'});return true;}
  const file=path.join(dir,name);
  try{
   const size=fs.statSync(file).size;
   if(size<1||size>100*1024*1024)throw Error();
   res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Length':size,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
   const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch{send(res,404,{error:'安装包不存在'});}
  return true;
 }
 return false;
}
module.exports={handleUpdate,readManifest};
