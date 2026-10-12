const assert=require('assert'),path=require('path'),{pathToFileURL}=require('url');
const nativeSource=require('fs').readFileSync(path.join(__dirname,'../tcgshop-android/app/src/main/java/com/tcgshop/pos/MainActivity.java'),'utf8');
const payloadLimit=Number(nativeSource.match(/MAX_PRINTER_PAYLOAD=(\d+)/)[1]);
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const p=await b.newPage({viewport:{width:1024,height:768}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await require('./test-auth.cjs').prepare(p);
  await p.addInitScript(()=>{
   window.printerCalls=[];window.mockConnected=false;
   window.NativePOS={printerRequest:(id,action,json)=>{
    const payload=JSON.parse(json);printerCalls.push({id,action,payload});
    if(action==='print'&&window.holdPrint){window.heldPrinterId=id;return;}
    let r={ok:true};
    if(action==='pair')r.devices=window.cancelPair?[]:[{name:'PIN 小票机',address:'22:33:44:55:66:77'}];
    if(action==='devices')r.devices=[{name:'测试中文小票机',address:'AA:BB:CC:DD:EE:FF'},{name:'<img src=x>',address:'11:22:33:44:55:66'}];
    if(action==='connect'){mockConnected=true;r.message='连接已建立';}
    if(action==='disconnect'){mockConnected=false;r.message='已断开';}
    if(action==='print')r.message='数据已发送，请确认小票机实际出纸';
    r.connected=mockConnected;r.address=mockConnected?'AA:BB:CC:DD:EE:FF':'';
    if(window.rejectPrinter&&action==='connect')r={ok:false,message:'请允许附近设备权限后重试'};
    setTimeout(()=>POSPrinter.receiveNative(id,r),10);
   }};
  });
  await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await p.evaluate(()=>{page='settings';render()});
  await p.locator('#printerPair').click();await p.waitForFunction(()=>document.getElementById('printerStatus').textContent.includes('已刷新系统配对结果'));
  assert.equal(await p.locator('#printerDevice').inputValue(),'22:33:44:55:66:77');
  assert.equal(await p.evaluate(()=>printerCalls.filter(c=>c.action==='connect'||c.action==='print').length),0);
  await p.evaluate(()=>window.cancelPair=true);await p.locator('#printerPair').click();await p.waitForFunction(()=>document.getElementById('printerStatus').textContent.includes('尚未发现'));
  assert.equal(await p.locator('#printerDevice').inputValue(),'');
  await p.locator('#printerDevices').click();await p.waitForFunction(()=>document.getElementById('printerDevice').options.length===3);
  assert.equal(await p.locator('.printer-panel img').count(),0);
  await p.locator('#printerDevice').selectOption('AA:BB:CC:DD:EE:FF');await p.locator('#printerPaper').selectOption('576');
  await p.locator('#printerConnect').click();await p.waitForFunction(()=>document.getElementById('printerStatus').textContent==='连接已建立');
  assert.equal(await p.evaluate(()=>POSPrinter.config().width),576);
  const before=await p.evaluate(()=>localStorage.getItem(KEY));
  await p.locator('#printerTest').click();await p.waitForFunction(()=>printerCalls.some(c=>c.action==='print'));
  await p.waitForFunction(()=>!document.getElementById('printerTest').disabled);
  assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),before);
  assert((await p.evaluate(()=>printerCalls.find(c=>c.action==='print').payload.lines.join('\n'))).includes('中文测试'));
  const payloadSize=await p.evaluate(()=>JSON.stringify(printerCalls.find(c=>c.action==='print').payload).length);
  assert(payloadSize<200000,'Compressed default images must stay below the old bridge limit');
  assert(payloadSize<payloadLimit,'Default receipt images must fit the native bridge');
  await p.locator('#printerDisconnect').click();await p.waitForFunction(()=>document.getElementById('printerStatus').textContent==='已断开');
  await p.evaluate(()=>window.rejectPrinter=true);await p.locator('#printerConnect').click();await p.waitForFunction(()=>document.getElementById('printerStatus').textContent.includes('附近设备'));
  await p.evaluate(()=>{rejectPrinter=false;page='pos';render()});
  await p.locator('[data-add="sample-0"]').click();await p.locator('#checkout').click();await p.getByRole('button',{name:'已到账，完成收款'}).click();
  await p.evaluate(()=>{transact(s=>s.products[0].price=9999);page='receipts';render()});
  const ledger=await p.evaluate(()=>localStorage.getItem(KEY));
  await p.locator('[data-print-order]').click();await p.waitForFunction(()=>printerCalls.filter(c=>c.action==='print').length===2);
  await p.waitForFunction(()=>!document.querySelector('[data-print-order]').disabled);
  const sent=await p.evaluate(()=>printerCalls.filter(c=>c.action==='print').at(-1).payload);
  assert.equal(sent.address,'AA:BB:CC:DD:EE:FF');assert.equal(sent.width,576);assert.deepEqual(sent.socialCodes,[]);assert.equal(sent.showQr,false);assert(!('qrSeed' in sent));
  assert(sent.lines.includes('原实收：¥15.00'));assert(!sent.lines.some(s=>s.includes('99.99')));
  assert(sent.lines.includes('收银员：测试管理员'));assert(!sent.lines.some(s=>s.includes('regression')));
  assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),ledger);
  await p.locator('[data-receipt]').click();await p.evaluate(()=>holdPrint=true);await p.locator('#receiptPrint').click();
  await p.waitForFunction(()=>!!window.heldPrinterId);assert(await p.locator('#receiptPrint').isDisabled());
  await p.evaluate(()=>POSPrinter.receiveNative(heldPrinterId,{progress:true,message:'正在发送小票数据…'}));
  assert(await p.locator('#receiptPrint').isDisabled());
  await p.evaluate(()=>POSPrinter.printOrder(state.orders[0].id));assert.equal(await p.evaluate(()=>printerCalls.filter(c=>c.action==='print').length),3);
  await p.evaluate(()=>POSPrinter.receiveNative(heldPrinterId,{ok:false,message:'发送超时；可能已有部分内容出纸，请检查后再手动重试'}));
  await p.waitForFunction(()=>!document.getElementById('receiptPrint').disabled);
  assert.equal(await p.evaluate(()=>printerCalls.filter(c=>c.action==='print').length),3);assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),ledger);
  await p.locator('#closeDialog').click();await p.evaluate(()=>{
   transact(s=>s.shops.push({id:'print-other',name:'另一店',demo:false,inventory:Object.fromEntries(s.products.map(p=>[p.id,{stock:0,cost:p.catalogCost}])),orders:[],expenses:[],movements:[]}));
   window.originalPrintOrder=state.orders[0].id;POSSyncCore.activate(state,'print-other');
  });
  assert(await p.evaluate(()=>{try{POSPrinter.receipt(originalPrintOrder);return false}catch{return true}}));
  await p.reload();assert.equal(await p.evaluate(()=>POSPrinter.config().address),'AA:BB:CC:DD:EE:FF');
  await p.evaluate(()=>{page='settings';render()});await p.screenshot({path:path.join(__dirname,'printer-settings.png'),fullPage:true});
  assert.equal(await p.locator('.receipt-social-codes img').count(),0);
  assert.equal(await p.locator('#receiptShowQr').count(),0);await p.locator('#receiptStyleSave').click();
  assert.equal(await p.locator('.receipt-social-codes img').count(),0);
  await p.locator('#printerTest').click();await p.waitForFunction(()=>!document.getElementById('printerTest').disabled);
  assert.equal(await p.evaluate(()=>printerCalls.at(-1).payload.socialCodes.length),0);
  await p.evaluate(()=>{delete NativePOS.printerRequest;render()});assert((await p.locator('#printerStatus').innerText()).includes('需更新安装包'));
  await p.locator('#printerTest').click();await p.waitForFunction(()=>document.getElementById('printerStatus').textContent.includes('当前版本不支持蓝牙打印'));
  const image=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=10;return c.toDataURL('image/png').split(',')[1]});
  await p.locator('#receiptLogo').setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('invalid')});await p.waitForFunction(()=>document.getElementById('receiptStyleStatus').textContent.includes('无法识别'));assert.equal(await p.locator('#receiptStyleSave').isDisabled(),false);
  await p.locator('#receiptLogo').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await p.waitForFunction(()=>document.getElementById('receiptStyleStatus').textContent.includes('已读取'));await p.locator('#receiptFooter').fill('测试感谢语');await p.locator('#receiptStyleClear').click();assert.equal(await p.evaluate(()=>POSPrinter.style().footer),'测试感谢语');
  await p.evaluate(()=>{const OriginalReader=FileReader;window.FileReader=class extends OriginalReader{readAsDataURL(file){const callback=this.onload;this.onload=e=>setTimeout(()=>callback.call(this,e),200);super.readAsDataURL(file)}}});
  await p.locator('#receiptLogo').setInputFiles({name:'late.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await p.evaluate(()=>{page='products';render()});await p.waitForTimeout(300);
  assert.deepEqual(errors,[]);console.log('PASS: printer pairing/preferences/errors, immutable receipt totals, duplicate guard, invalid/late logo handling, footer preservation and old bridge compatibility.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
