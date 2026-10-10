const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {createServer}=require('../tcgshop-server/server');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-update-test-')),updates=path.join(dir,'updates'),shop=path.join(dir,'shop.json');
 fs.mkdirSync(updates);fs.writeFileSync(shop,'null');
 const server=createServer({file:shop,token:'regression-updates-secret'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/update')).status,503);
  const apk=Buffer.from('isolated-test-apk-bytes'),sha256=crypto.createHash('sha256').update(apk).digest('hex');
  const m={schema:1,packageName:'com.tcgshop.pos',versionCode:26,versionName:'2.0.1',size:apk.length,sha256,notes:'测试更新'};
  fs.writeFileSync(path.join(updates,sha256+'.apk'),apk);fs.writeFileSync(path.join(updates,'latest.json'),JSON.stringify(m));
  const response=await fetch(base+'/api/update');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(await response.json(),m);
  const download=await fetch(base+'/api/update/apk/'+sha256+'.apk');assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/vnd.android.package-archive');assert.deepEqual(Buffer.from(await download.arrayBuffer()),apk);
  assert.equal((await fetch(base+'/api/shop')).status,401);
  assert.equal((await fetch(base+'/api/update',{method:'PUT',body:'{}'})).status,401);
  assert.equal((await fetch(base+'/api/update/apk/..%2Fshop.json')).status,404);
  assert.equal((await fetch(base+'/api/update/apk/'+'0'.repeat(64)+'.apk')).status,404);
  for(const change of [{packageName:'wrong.app'},{versionCode:0},{versionCode:26.5},{size:apk.length+1},{sha256:'../shop'},{notes:'x'.repeat(4001)}]){
   fs.writeFileSync(path.join(updates,'latest.json'),JSON.stringify({...m,...change}));assert.equal((await fetch(base+'/api/update')).status,503);
  }
  assert.equal(fs.readFileSync(shop,'utf8'),'null');
  console.log('PASS: public version/download, no-cache manifest, exact APK bytes, missing/corrupt release rejected, traversal blocked, sync auth preserved, ledger untouched.');
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
