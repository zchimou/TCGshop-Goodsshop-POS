const assert=require('assert/strict'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1100,height:900},timezoneId:'America/Los_Angeles'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await require('./test-auth.cjs').prepare(p);await p.goto(pathToFileURL(path.join(process.env.POS_TEST_ASSET_ROOT||__dirname,'index.html')).href);
  await p.evaluate(()=>{
   const product=state.products[0],actor=POSAuth.actor();
   product.name='宝可梦收藏卡特别版超长商品名称'.repeat(5)+'SKU'+ 'A'.repeat(100);
   const sale=(id,time,price)=>({id,time,actor,total:price,cost:300,discount:0,payment:'现金',refunded:false,refunds:[],lines:[{productId:product.id,name:product.name,code:product.code,sku:product.sku,qty:1,price,cost:300}]});
   const yesterday=sale('ORDER-12','2026-10-12T15:50:00Z',123456789);
   yesterday.refunds=[{id:'REFUND-14',time:'2026-10-13T16:10:00Z',actor,amount:123456789,cost:300,note:'',lines:[{lineIndex:0,qty:1,amount:123456789,cost:300}]}];yesterday.refunded=true;
   state.orders=[sale('ORDER-13-EARLY','2026-10-12T16:20:00Z',5000),yesterday,sale('ORDER-13-LATE','2026-10-13T02:00:00Z',7000)];
   state.movements=[{id:'MOVE-12',time:yesterday.time,name:product.name,productId:product.id,type:'销售出库',delta:-1,after:4,actor,note:'ORDER-12'},
    {id:'MOVE-14',time:yesterday.refunds[0].time,name:product.name,productId:product.id,type:'销售退货',delta:1,after:3,actor,note:'ORDER-12 · REFUND-14'},
    {id:'MOVE-13',time:state.orders[0].time,name:product.name,productId:product.id,type:'销售出库',delta:-1,after:2,actor,note:'ORDER-13-EARLY'}];
   page='receipts';render();
  });
  const dates=['2026-10-14','2026-10-13','2026-10-12'];
  assert.deepEqual(await p.locator('.record-day').evaluateAll(els=>els.map(e=>e.dataset.recordDate)),dates);
  assert.deepEqual(await p.locator('.records-table thead').first().locator('th').allTextContents(),['类型','商品','金额','单号 / 时间','操作人','状态','操作']);
  assert.deepEqual(await p.locator('.records-table td[data-label="操作人"]').allTextContents(),Array(4).fill('测试管理员'));
  assert(!(await p.locator('#main').innerText()).includes('regression'));
  assert.equal(await p.evaluate(()=>state.orders[0].actor.username),'regression');
  assert.equal(await p.locator('[data-record-date="2026-10-14"] [data-record-type]').getAttribute('data-record-type'),'refund');
  assert((await p.locator('.record-day-heading h3').first().innerText()).includes('2026年10月14日'));
  assert((await p.locator('[data-record-date="2026-10-13"] tbody tr').first().innerText()).includes('ORDER-13-LATE'));
  await p.locator('[data-receipt="ORDER-13-LATE"]').click();assert(await p.locator('#dialog').isVisible());assert(!(await p.locator('#dialogBody').innerText()).includes('regression'));assert((await p.locator('.receipt-meta').innerText()).includes('收银员：测试管理员'));await p.locator('#closeDialog').click();
  await p.locator('[data-refund="REFUND-14"]').click();assert((await p.locator('#dialogBody').innerText()).includes('退款金额'));assert(!(await p.locator('#dialogBody').innerText()).includes('regression'));await p.locator('#closeDialog').click();
  await p.locator('#receiptSearch').fill('REFUND-14');assert.equal(await p.locator('.record-day').count(),1);await p.locator('#receiptSearch').fill('no-match');assert.equal(await p.locator('.record-day').count(),0);assert((await p.locator('#main').innerText()).includes('暂无销售与退款记录'));
  await p.evaluate(()=>{page='movements';render()});assert.deepEqual(await p.locator('.record-day').evaluateAll(els=>els.map(e=>e.dataset.recordDate)),dates);
  assert.deepEqual(await p.locator('.records-table td[data-label="操作人"]').allTextContents(),Array(3).fill('测试管理员'));assert(!(await p.locator('#main').innerText()).includes('regression'));
  await p.locator('#movementType').selectOption('销售退货');assert.equal(await p.locator('.record-day').count(),1);assert.equal(await p.locator('.record-day').getAttribute('data-record-date'),'2026-10-14');await p.locator('#movementType').selectOption('全部');
  for(const width of [320,390,430,640,768,1100]){
   await p.setViewportSize({width,height:900});
   for(const section of ['receipts','movements','reports']){
    await p.evaluate(section=>{page=section;receiptQuery='';movementType='全部';reportFrom='2026-10-12';reportTo='2026-10-14';render()},section);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${section}: viewport overflow at ${width}`);
    if(width<=640){
     const selector=section==='reports'?'.reports-page .panel,.reports-page .stat,.report-product-name,.report-date-range,.bar-col':'.records-table';
     assert(await p.locator(selector).evaluateAll(els=>els.every(e=>e.scrollWidth<=e.clientWidth+1)),`${section}: content overflow at ${width}`);
     if(section==='reports'){
      assert.equal(await p.locator('.bars').evaluate(e=>getComputedStyle(e).display),'grid');
      assert(await p.locator('#reportFrom').evaluate(e=>e.getBoundingClientRect().height>=44));
      assert.equal(await p.locator('.report-items-panel tbody tr').count(),1);
      assert((await p.locator('.report-items-panel tbody').innerText()).includes('¥120.00'));
     }
    }else if(section==='reports'){
     assert.equal(await p.locator('.bars').evaluate(e=>getComputedStyle(e).display),'flex');
     assert.equal(await p.locator('.report-date-range').evaluate(e=>getComputedStyle(e).display),'contents');
     assert.equal(await p.locator('.report-items-panel thead').evaluate(e=>getComputedStyle(e).display),'table-header-group');
    }
   }
  }
  await p.evaluate(()=>{state.products[0].name='宝可梦 · 朱紫补充包';for(const o of state.orders)for(const l of o.lines)l.name=state.products[0].name;for(const m of state.movements)m.name=state.products[0].name;setNavigation(false);page='reports';render()});
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(__dirname,'preview-phone-reports.png'),fullPage:true});
  await p.locator('#prevDayReport').click();assert.equal(await p.locator('#reportFrom').inputValue(),'2026-10-11');assert.equal(await p.locator('#reportTo').inputValue(),'2026-10-13');
  await p.evaluate(()=>{page='receipts';render()});await p.screenshot({path:path.join(__dirname,'preview-phone-daily-receipts.png'),fullPage:true});
  await p.setViewportSize({width:1100,height:900});await p.evaluate(()=>{setNavigation(false);page='reports';reportFrom='2026-10-12';reportTo='2026-10-14';render()});await p.screenshot({path:path.join(__dirname,'preview-tablet-reports.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: reordered receipts, Shanghai daily groups across midnight, chronological movements, refund dates, search/filter/details, phone content bounds at four widths and unchanged tablet table/chart.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
