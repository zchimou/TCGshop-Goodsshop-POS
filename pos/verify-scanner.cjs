const {chromium}=require('playwright');
const assert=require('assert'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message)); page.setDefaultTimeout(15000);
 await require('./test-auth.cjs').prepare(page);
 await page.goto(process.env.POS_PREVIEW_URL || pathToFileURL(path.join(__dirname,'index.html')).href);
 await page.addScriptTag({path:path.join(__dirname,'vendor/zxing-browser-0.2.1.min.js')});
 const fixtures=await page.evaluate(async()=>{
   async function png(svg){if(!svg.includes('xmlns='))svg=svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);URL.revokeObjectURL(url);return canvas.toDataURL('image/png').split(',')[1];}
   const qr=new ZXingBrowser.BrowserQRCodeSvgWriter().write('SKU-QR-2026',280,280).outerHTML;
   const duplicate=new ZXingBrowser.BrowserQRCodeSvgWriter().write('SV-001',280,280).outerHTML;
   const long=new ZXingBrowser.BrowserQRCodeSvgWriter().write('X'.repeat(100),400,400).outerHTML;
   const digits='6901234567892';
   const A=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
   const B=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
   const C=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
   const parity=['AAAAAA','AABABB','AABBAB','AABBBA','ABAABB','ABBAAB','ABBBAA','ABABAB','ABABBA','ABBABA'][Number(digits[0])];
   let bits='101';for(let i=1;i<=6;i++)bits+=(parity[i-1]==='A'?A:B)[Number(digits[i])];bits+='01010';for(let i=7;i<=12;i++)bits+=C[Number(digits[i])];bits+='101';
   const bars=bits.split('').map((b,i)=>b==='1'?`<rect x="${40+i*4}" y="20" width="4" height="160" fill="black"/>`:'').join('');
   const barcode=`<svg xmlns="http://www.w3.org/2000/svg" width="460" height="220"><rect width="460" height="220" fill="white"/>${bars}</svg>`;
   const blank='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="white"/></svg>';
   return {qr:await png(qr),duplicate:await png(duplicate),long:await png(long),barcode:await png(barcode),blank:await png(blank)};
 });
 await page.evaluate(()=>delete window.ZXingBrowser); // Exercise the actual lazy local loader.
 async function upload(base64){await page.locator('#scanFile').setInputFiles({name:'code.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')})}
 if(!await page.locator('#newProduct').count()){await page.evaluate(()=>setNavigation(true));await page.locator('[data-page="products"]').click();}await page.locator('#newProduct').click();const generatedSku=await page.locator('#pSku').inputValue();await page.locator('#pName').fill('扫描测试商品');await page.locator('#pPrice').fill('10');await page.locator('#pCost').fill('5');
 await page.locator('#scanSku').click();await upload(fixtures.qr);await page.waitForFunction(()=>document.getElementById('pCode').value==='SKU-QR-2026');assert.equal(await page.locator('#scanDialog').evaluate(el=>el.open),false);assert.equal(await page.locator('#pName').inputValue(),'扫描测试商品');assert.equal(await page.locator('#pPrice').inputValue(),'10');
 await page.locator('#scanSku').click();await upload(fixtures.barcode);await page.waitForFunction(()=>document.getElementById('pCode').value==='6901234567892');assert.equal(await page.locator('#pName').inputValue(),'扫描测试商品');
 await page.locator('#scanSku').click();await upload(fixtures.blank);await page.waitForFunction(()=>document.getElementById('scanStatus').textContent.includes('没有识别到'));assert.equal(await page.locator('#pCode').inputValue(),'6901234567892');await page.locator('#scanClose').click();
 await page.locator('#scanSku').click();await upload(fixtures.long);await page.waitForFunction(()=>document.getElementById('scanStatus').textContent.includes('最多 80'));assert.equal(await page.locator('#pCode').inputValue(),'6901234567892');await page.keyboard.press('Escape');assert(await page.locator('#dialog').evaluate(el=>el.open));
 await page.locator('#scanSku').click();await upload(fixtures.duplicate);await page.waitForFunction(()=>document.getElementById('pCode').value==='SV-001');assert((await page.locator('#toast').textContent()).includes('已有商品'));await page.getByRole('button',{name:'保存商品'}).click();assert(await page.locator('#dialog').evaluate(el=>el.open));assert.equal(await page.evaluate(()=>state.products.length),8);
 await page.locator('#pCode').fill('TEST-EDIT');await page.locator('#pCode').press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'pPrice');assert.equal(await page.evaluate(()=>state.products.length),8);
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('test','NotAllowedError')}});await page.locator('#scanSku').click();await page.waitForFunction(()=>document.getElementById('scanStatus').textContent.includes('权限被拒绝'));assert.equal(await page.locator('#scanCamera').isEnabled(),true);await page.locator('#scanClose').click();
 // Actual ZXing camera decoding against a generated video stream (no physical camera access).
 await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();window.testCameraCanvas=document.createElement('canvas');testCameraCanvas.width=640;testCameraCanvas.height=480;const ctx=testCameraCanvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,480);ctx.drawImage(image,180,100,280,280);window.testFrameTimer=setInterval(()=>ctx.drawImage(image,180,100,280,280),100);window.testStreams=[];navigator.mediaDevices.getUserMedia=async()=>{const stream=testCameraCanvas.captureStream(5);testStreams.push(stream);return stream};navigator.mediaDevices.enumerateDevices=async()=>[];},fixtures.qr);
 await page.locator('#scanSku').click();await page.waitForFunction(()=>document.getElementById('pCode').value==='SKU-QR-2026').catch(async e=>{console.log(await page.evaluate(()=>({status:document.getElementById('scanStatus').textContent,video:document.getElementById('scanVideo').readyState,stream:testStreams.map(s=>s.getTracks().map(t=>t.readyState))})));throw e});await page.waitForFunction(()=>testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 // Cancellation while the camera permission request is still pending.
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>window.resolveTestCamera=()=>{const stream=testCameraCanvas.captureStream(5);testStreams.push(stream);resolve(stream)})});await page.locator('#scanSku').click();await page.waitForFunction(()=>typeof resolveTestCamera==='function');await page.locator('#scanClose').click();await page.evaluate(()=>resolveTestCamera());await page.waitForFunction(()=>testStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 for(const width of [320,390,1100]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#scanSku').click();assert(await page.locator('#scanDialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.locator('#scanClose').click();}
 await page.setViewportSize({width:1100,height:900});await page.screenshot({path:path.join(__dirname,'preview-product-scanner.png')});await page.evaluate(()=>clearInterval(testFrameTimer));
 assert.equal(await page.locator('#pSku').inputValue(),generatedSku);assert.deepEqual(errors,[]);console.log('PASS: real QR and EAN13 image decoding, independent SKU preservation, real video decoding using a synthetic camera stream, form preservation, duplicate and long-code rejection, blank image recovery, denied permissions, late camera cleanup, scanner Enter handling and mobile layouts.');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
