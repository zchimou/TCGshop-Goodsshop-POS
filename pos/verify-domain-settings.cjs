const {chromium}=require('playwright');
const assert=require('assert/strict'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const p=await b.newPage();await require('./test-auth.cjs').prepare(p);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://**/*',r=>r.abort());
  await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  const old='https://legacy.example.com/tcgshop',next='https://pos.example.com';
  const before=await p.evaluate(async({old,next})=>{
   POSSync.pause();const cfg={url:old,token:'fake-domain-migration-token',edit:false,open:true};
   const payload={ledger:POSSyncCore.project(state),accounts:POSAuth.snapshot()},base={hash:'domain-test',etag:'"domain-1"',storeId:'domain-store'};
   await POSAssets.baseline(old,{etag:base.etag,payload});
   localStorage.setItem('TCGshop-POS-nas-base:'+old,JSON.stringify(base));localStorage.setItem('TCGshop-POS-nas-config-v1',JSON.stringify(cfg));
   return {ledger:localStorage.getItem(KEY),accounts:localStorage.getItem('TCGshop-POS-accounts-v1'),base,cached:await POSAssets.baseline(old)};
  },{old,next});
  await p.reload();await p.waitForFunction(next=>JSON.parse(localStorage.getItem('TCGshop-POS-nas-config-v1')).url===next,next);
  await p.evaluate(()=>POSSync.pause());
  const after=await p.evaluate(async next=>({cfg:JSON.parse(localStorage.getItem('TCGshop-POS-nas-config-v1')),ledger:localStorage.getItem(KEY),accounts:localStorage.getItem('TCGshop-POS-accounts-v1'),base:JSON.parse(localStorage.getItem('TCGshop-POS-nas-base:'+next)),cached:await POSAssets.baseline(next)}),next);
  assert.equal(after.cfg.token,'fake-domain-migration-token');assert.equal(after.cfg.edit,false);
  assert.equal(after.ledger,before.ledger);assert.equal(after.accounts,before.accounts);assert.deepEqual(after.base,before.base);assert.deepEqual(after.cached,before.cached);
  await p.reload();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('TCGshop-POS-nas-config-v1')).url),next);
  await p.evaluate(()=>{POSSync.pause();localStorage.setItem('TCGshop-POS-nas-config-v1',JSON.stringify({url:'http://192.168.1.20:5689',token:'fake-domain-migration-token',edit:false}));});
  await p.reload();assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('TCGshop-POS-nas-config-v1')).url),'http://192.168.1.20:5689');
  assert.deepEqual(errors,[]);
  console.log('PASS: old-domain configuration and IndexedDB baseline migrate together, token/preferences/ledger/accounts preserved, repeated launch stable, private NAS URLs preserved.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
