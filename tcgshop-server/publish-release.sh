#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
container=tcgshop-pos-sync
stage="/tmp/tcgshop-publish-$(date +%s)-$$"
docker exec "$container" mkdir -p "$stage"
docker cp "$here/release/." "$container:$stage"
docker exec -i "$container" node - "$stage" <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {readManifest}=require('/app/updates');
const stage=process.argv[2],target='/data/updates';
const m=readManifest(stage),source=path.join(stage,m.sha256+'.apk');
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(digest(source)!==m.sha256)throw Error('APK integrity check failed; existing release unchanged');
fs.mkdirSync(target,{recursive:true});
const lock=path.join(target,'.publish.lock');
const fd=fs.openSync(lock,'wx');
try{
 const pointer=path.join(target,'latest.json');
 if(fs.existsSync(pointer)){
  const old=JSON.parse(fs.readFileSync(pointer,'utf8'));
  if(old.versionCode>m.versionCode||(old.versionCode===m.versionCode&&old.sha256!==m.sha256))throw Error('Refusing downgrade or different APK with same versionCode');
 }
 const apk=path.join(target,m.sha256+'.apk');
 if(!fs.existsSync(apk)){
  const tmp=apk+'.tmp-'+process.pid;fs.copyFileSync(source,tmp);
  if(digest(tmp)!==m.sha256)throw Error('Copied APK integrity check failed');
  fs.renameSync(tmp,apk);
 }else if(digest(apk)!==m.sha256)throw Error('Existing APK integrity check failed');
 const pending=pointer+'.tmp-'+process.pid;
 fs.writeFileSync(pending,JSON.stringify(m));
 fs.renameSync(pending,pointer);
 console.log('PUBLISHED: '+m.versionName+' (code '+m.versionCode+')');
}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
NODE
