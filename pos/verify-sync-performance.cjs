const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),zlib=require('zlib'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
const {createServer}=require('../tcgshop-server/server');
const {readBody}=require('../tcgshop-server/sync-http');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pos-sync-fast-')),file=path.join(dir,'shop.json'),token='performance-regression-only',server=createServer({file,token});
 const requests=[];server.on('request',(req,res)=>{const entry={url:req.url,method:req.method,encoding:req.headers['content-encoding'],conditional:req.headers['if-none-match']};requests.push(entry);res.on('finish',()=>{entry.status=res.statusCode});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+token};let b;
 const limited=http.createServer(async(req,res)=>{try{res.end(JSON.stringify(await readBody(req,2048)))}catch(e){res.writeHead(e.status||400);res.end(e.message)}});await new Promise(r=>limited.listen(0,'127.0.0.1',r));
 function wire(encoding){return new Promise((resolve,reject)=>{http.get(base+'/api/shop',{headers:{...headers,'Accept-Encoding':encoding}},r=>{const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>resolve({headers:r.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});}
 try{
  b=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const p=await b.newPage();await require('./test-auth.cjs').prepare(p);await p.route('**/api/health',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({service:'tcgshop-pos-sync',syncVersion:2,schema:require('./sync-core').schema,features:{conditionalGet:true,gzipRequests:true}})})); await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await p.evaluate(()=>{page='settings';render()});await p.locator('#nasUrl').evaluate(e=>e.closest('details').open=true);await p.locator('#nasUrl').fill(base);await p.locator('#nasToken').fill(token);await p.locator('#nasSave').click();await p.evaluate(()=>POSSync.pause());await p.waitForFunction(()=>!POSSync.isBusy());await p.evaluate(()=>POSSync.run());
  assert((await p.evaluate(()=>POSSync.status())).startsWith('同步成功'));assert(requests.some(r=>r.method==='PUT'&&r.encoding==='gzip'));
  let start=requests.length;const before=await p.evaluate(()=>localStorage.getItem(KEY));await p.evaluate(()=>POSSync.run());let added=requests.slice(start).filter(r=>r.method!=='OPTIONS');
  assert.equal(added.length,1);assert.equal(added[0].status,304);assert(added[0].conditional);assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),before);
  const identity=await wire('identity'),compressed=await wire('gzip');assert.equal(compressed.headers['content-encoding'],'gzip');assert.deepEqual(zlib.gunzipSync(compressed.body),identity.body);assert(compressed.body.length<identity.body.length);assert.equal((await wire('gzip;q=0')).headers['content-encoding'],undefined);
  await p.evaluate(()=>transact(s=>s.products[0].name='本机修改保留'));start=requests.length;await p.evaluate(()=>POSSync.run());added=requests.slice(start).filter(r=>r.method!=='OPTIONS');assert(added.some(r=>r.method==='GET'&&r.status===200&&!r.conditional));assert(added.some(r=>r.method==='PUT'&&r.encoding==='gzip'));assert.equal(JSON.parse(fs.readFileSync(file)).ledger.products[0].name,'本机修改保留');
  let remote=await fetch(base+'/api/shop',{headers});const payload=await remote.json();payload.ledger.products[1].name='另一台设备修改';assert.equal((await fetch(base+'/api/shop',{method:'PUT',headers:{...headers,'If-Match':remote.headers.get('etag'),'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,200);
  await p.evaluate(()=>POSSync.run());assert.equal(await p.evaluate(()=>state.products[1].name),'另一台设备修改');
  // Every request is still authorized, even when the caller knows the ETag.
  const tag=(await fetch(base+'/api/shop',{headers})).headers.get('etag');assert.equal((await fetch(base+'/api/shop',{headers:{'If-None-Match':tag}})).status,401);
  assert.equal((await fetch(base+'/api/shop',{method:'PUT',headers:{...headers,'If-Match':'"stale"','Content-Encoding':'gzip'},body:zlib.gzipSync(Buffer.from(JSON.stringify(payload)))})).status,412);
  assert.equal((await fetch(base+'/api/shop',{method:'PUT',headers:{...headers,'If-Match':tag,'Content-Encoding':'gzip'},body:Buffer.from('corrupt gzip')})).status,400);
  const bounded='http://127.0.0.1:'+limited.address().port;
  assert.equal((await fetch(bounded,{method:'POST',headers:{'Content-Encoding':'gzip'},body:zlib.gzipSync(Buffer.from(JSON.stringify({large:'a'.repeat(10000)})))})).status,413);
  assert.equal((await fetch(bounded,{method:'POST',headers:{'Content-Encoding':'br'},body:'{}'})).status,415);
  // Old servers do not advertise compression or conditional reads.
  await p.route('**/api/health',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({service:'tcgshop-pos-sync',syncVersion:2,schema:require('./sync-core').schema})}));
  await p.evaluate(()=>{page='settings';render()});await p.locator('#nasSave').evaluate(e=>e.closest('details').open=true);await p.locator('#nasSave').click();await p.evaluate(()=>POSSync.pause());await p.waitForFunction(()=>!POSSync.isBusy());await p.evaluate(()=>POSSync.run());start=requests.length;await p.evaluate(()=>transact(s=>s.products[0].name='兼容旧 NAS'));await p.evaluate(()=>POSSync.run());added=requests.slice(start).filter(r=>r.method!=='OPTIONS');assert(added.some(r=>r.method==='PUT'&&!r.encoding));assert(added.filter(r=>r.method==='GET').every(r=>!r.conditional));
  console.log(JSON.stringify({fixtureBytes:identity.body.length,gzipBytes:compressed.body.length,unchangedCheckRequests:1,unchangedResponseBytes:0}));
  console.log('PASS: 304/no rewrite, health reuse, gzip upload/download, remote changes, old NAS fallback, authenticated 304, CAS conflict, corrupt gzip, decompression limit, unsupported encoding.');
 }finally{if(b)await b.close();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>limited.close(r))]);}
})().catch(e=>{console.error(e);process.exitCode=1});
