const {chromium}=require('playwright');
const assert=require('assert/strict'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await require('./test-auth.cjs').prepare(p);await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  // file:// requests are not interceptable on every Chrome build; hold only this script insertion.
  await p.evaluate(()=>{window.appendScannerLibrary=document.head.append.bind(document.head);document.head.append=(...nodes)=>{if(nodes.length===1&&nodes[0].src?.endsWith('/zxing-browser-0.2.1.min.js')){window.heldScannerLibrary=nodes[0];return;}appendScannerLibrary(...nodes);};window.scannerCanvas=document.createElement('canvas');scannerCanvas.width=1280;scannerCanvas.height=960;window.scannerStreams=[];window.cameraRequests=0;navigator.mediaDevices.getUserMedia=async()=>{cameraRequests++;const stream=scannerCanvas.captureStream(30);scannerStreams.push(stream);return stream;};ProductCodeScanner.openSearch(()=>{});});
  await p.waitForFunction(()=>heldScannerLibrary&&cameraRequests===1);assert.equal(await p.evaluate(()=>typeof ZXingBrowser),'undefined','Camera acquisition must not wait for the library');
  await p.locator('#scanClose').click();await p.waitForFunction(()=>scannerStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));await p.evaluate(()=>{document.head.append=appendScannerLibrary;appendScannerLibrary(heldScannerLibrary);});await p.waitForFunction(()=>typeof ZXingBrowser==='object');
  const fixture=await p.evaluate(async()=>{
   const token='PERF-DENSE-'+'0123456789'.repeat(6),reader=new ZXingBrowser.BrowserQRCodeReader();
   window.drawScanQr=async(text,size)=>{let svg=new ZXingBrowser.BrowserQRCodeSvgWriter().write(text,size,size).outerHTML;if(!svg.includes('xmlns='))svg=svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();const ctx=scannerCanvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1280,960);ctx.drawImage(image,Math.floor((1280-size)/2),Math.floor((960-size)/2),size,size);};
   const small=document.createElement('canvas');small.width=960;small.height=720;let chosen;
   for(const size of [44,48,52,56,60,64,68,72,76,80,84,88,92,100,108,116,124,132,140]){await drawScanQr(token,size);try{if(reader.decodeFromCanvas(scannerCanvas).getText()!==token)continue;}catch{continue;}
    small.getContext('2d').drawImage(scannerCanvas,0,0,960,720);try{reader.decodeFromCanvas(small);}catch{chosen=size;break;}}
   if(!chosen)throw Error('Unable to generate the full-resolution QR fixture');
   window.scanWidths=[];window.broadReads=0;const qrDecode=ZXingBrowser.BrowserQRCodeReader.prototype.decodeBitmap,multiDecode=ZXingBrowser.BrowserMultiFormatReader.prototype.decodeBitmap;
   ZXingBrowser.BrowserQRCodeReader.prototype.decodeBitmap=function(bitmap){scanWidths.push(bitmap.getWidth());return qrDecode.call(this,bitmap);};
   ZXingBrowser.BrowserMultiFormatReader.prototype.decodeBitmap=function(bitmap){broadReads++;return multiDecode.call(this,bitmap);};
   window.scannerFrameTimer=setInterval(()=>{scannerCanvas.getContext('2d').fillRect(0,0,1,1);},33);
   window.scanResult='';ProductCodeScanner.openSearch(value=>scanResult=value);return {token,size:chosen};
  });
  await p.waitForFunction(token=>scanResult===token,fixture.token);const widths=await p.evaluate(()=>scanWidths);assert(widths.includes(960)&&widths.includes(1280),'Dense codes need the original-resolution fallback');
  await p.waitForFunction(()=>scannerStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  const broadBefore=await p.evaluate(async()=>{await drawScanQr('PERF-FAST-QR',180);window.scanResult='';const before=broadReads;ProductCodeScanner.openSearch(value=>scanResult=value);return before;});
  await p.waitForFunction(()=>scanResult==='PERF-FAST-QR');assert.equal(await p.evaluate(()=>broadReads),broadBefore,'A clear QR should bypass the broad barcode search');
  await p.waitForFunction(()=>scannerStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));await p.evaluate(()=>clearInterval(scannerFrameTimer));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({denseQrSize:fixture.size,decodeWidths:widths}));console.log('PASS: camera/library parallel startup, cancellation during library load, real dense QR full-resolution fallback, clear QR fast path, single result and released camera.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
