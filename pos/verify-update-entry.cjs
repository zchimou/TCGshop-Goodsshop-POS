const {chromium}=require('playwright');
const assert=require('assert/strict'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});try{
 const p=await b.newPage({viewport:{width:390,height:844}});await require('./test-auth.cjs').prepare(p);await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
 await p.evaluate(()=>{page='settings';render()});await p.locator('summary').filter({hasText:'当前版本'}).click();await p.locator('#checkAppUpdate').click();assert((await p.locator('#toast').textContent()).includes('安卓 App'));
 await p.evaluate(()=>{window.updateCalls=0;window.NativePOS={checkUpdates:()=>window.updateCalls++};});
 await p.locator('#checkAppUpdate').click();assert.equal(await p.evaluate(()=>window.updateCalls),1);
 // Rendering for a staff account must keep the same update entry available.
 await p.evaluate(()=>{const original=POSAuth.isAdmin;POSAuth.isAdmin=()=>false;render();POSAuth.isAdmin=original;});
 assert(await p.locator('#checkAppUpdate').isVisible());await p.locator('#checkAppUpdate').click();assert.equal(await p.evaluate(()=>window.updateCalls),2);
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS: administrator/staff update entry, native bridge invocation, browser fallback and mobile layout.');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
