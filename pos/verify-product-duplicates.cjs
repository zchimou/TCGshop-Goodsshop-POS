const {chromium}=require('playwright');
const assert=require('assert/strict'),path=require('path'),fs=require('fs'),{pathToFileURL}=require('url');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await require('./test-auth.cjs').prepare(page);await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await page.evaluate(()=>{page='products';render();});await page.locator('#newProduct').click();
  const existing=await page.evaluate(()=>({id:state.products[0].id,name:state.products[0].name,code:state.products[0].code}));
  await page.locator('#pName').fill('未保存的新商品');await page.locator('#pPrice').fill('10');await page.locator('#pCost').fill('5');await page.locator('#pStock').fill('2');
  const original=await page.evaluate(()=>ledgerRaw);await page.locator('#pCode').fill(existing.code);
  assert(await page.locator('#pDuplicateWarning').isVisible());assert.equal(await page.locator('#pCode').getAttribute('aria-invalid'),'true');
  assert((await page.locator('#pDuplicateDetails').innerText()).includes(existing.name));
  await page.getByRole('button',{name:'保存商品',exact:true}).click();assert.equal(await page.evaluate(()=>ledgerRaw),original);assert.equal(await page.evaluate(()=>document.activeElement.id),'pDuplicateWarning');
  await page.waitForTimeout(3400);assert(await page.locator('#pDuplicateWarning').isVisible(),'Warning must outlive the old toast timeout');
  for(const width of [320,390,850,1100]){
   await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'保存商品',exact:true}).click();
   const bounds=await page.locator('#pDuplicateWarning').boundingBox();assert(bounds.y>=0&&bounds.y+bounds.height<=844,'Warning must be in view after rejected save');
   const heading=await page.locator('#pDuplicateWarning strong').boundingBox(),header=await page.locator('#dialog .dialog-head').boundingBox();assert(heading.y>=header.y+header.height,'Sticky dialog title must not cover the duplicate warning');
   assert(await page.locator('#dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),'No horizontal dialog overflow');
   if(width===390){const out=path.join(__dirname,'../tcgshop-server/out');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'duplicate-product-preview-390.png')});}
  }
  await page.locator('#pDuplicateFix').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'pCode');
  await page.locator('#pCode').fill('DUPLICATE-FIXED');assert(await page.locator('#pDuplicateWarning').isHidden());assert.equal(await page.locator('#pCode').getAttribute('aria-invalid'),null);
  assert.equal(await page.locator('#pName').inputValue(),'未保存的新商品');assert.equal(await page.locator('#pCost').inputValue(),'5');
  await page.getByRole('button',{name:'保存商品',exact:true}).click();assert(!(await page.locator('#dialog').evaluate(e=>e.open)));assert.equal(await page.evaluate(()=>state.products.filter(p=>p.code==='DUPLICATE-FIXED').length),1);
  await page.evaluate(id=>editProduct(id),existing.id);assert(await page.locator('#pDuplicateWarning').isHidden());
  await page.locator('#pName').fill(existing.name+'（编辑）');await page.getByRole('button',{name:'保存商品',exact:true}).click();assert(!(await page.locator('#dialog').evaluate(e=>e.open)),'Editing the original product keeps its code');
  await page.evaluate(id=>editProduct(id),existing.id);await page.locator('#pCode').fill('DUPLICATE-FIXED');const beforeEdit=await page.evaluate(()=>ledgerRaw);
  await page.locator('#pCode').press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'pDuplicateWarning');
  await page.getByRole('button',{name:'保存商品',exact:true}).click();assert.equal(await page.evaluate(()=>ledgerRaw),beforeEdit);assert.equal(await page.evaluate(id=>product(id).code,existing.id),existing.code);
  await page.locator('#closeDialog').click();await page.locator('#newProduct').click();
  await page.evaluate(()=>{window.scannedCode='DUPLICATE-FIXED';ProductCodeScanner.open=(input,result)=>{input.value=scannedCode;input.dispatchEvent(new Event('input',{bubbles:true}));result(scannedCode);};});
  await page.locator('#scanSku').click();assert(await page.locator('#pDuplicateWarning').isVisible());assert.equal(await page.evaluate(()=>document.activeElement.id),'pDuplicateWarning');
  assert.deepEqual(errors,[]);console.log('PASS: persistent prominent duplicate alert, original data untouched, draft retained, correction allows save, own-code edits allowed, conflicting edits rejected, scanner and Enter reveal warning, four screen sizes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
