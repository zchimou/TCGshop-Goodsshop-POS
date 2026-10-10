const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,timezoneId:'Asia/Shanghai'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
  const result=await page.evaluate(()=>{
   const setDate=value=>{$('selectedDate').value=value;render()};
   const swipe=(selector,dx,dy=0,cancel=false,multi=false)=>{
    const target=document.querySelector(selector),start={identifier:1,clientX:195,clientY:200},end={...start,clientX:195+dx,clientY:200+dy};
    const emit=(type,touches,changed)=>{const e=new Event(type,{bubbles:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed}});target.dispatchEvent(e)};
    emit('touchstart',[start],[start]);emit('touchmove',multi?[end,{...end,identifier:2}]:[end],[end]);if(cancel)emit('touchcancel',[],[end]);emit('touchend',[],[end]);return $('selectedDate').value;
   };
   const before=JSON.stringify(data),values=[];setDate('2026-12-31');values.push(swipe('.metrics',-120));values.push(swipe('.metrics',120));
   setDate('2024-03-01');values.push(swipe('.metrics',120));
   values.push(swipe('.metrics',-120,80));values.push(swipe('.metrics',-20));values.push(swipe('#amount',-120));values.push(swipe('.metrics',-120,0,true));values.push(swipe('.metrics',-120,0,false,true));
   openSettings();values.push(swipe('.metrics',-120));closeLayer($('settingsLayer'));
   $('incomeNote').focus();values.push(swipe('.metrics',-120));$('incomeNote').blur();
   return {values,unchanged:before===JSON.stringify(data)};
  });
  assert.deepEqual(result.values,['2027-01-01','2026-12-31',...Array(8).fill('2024-02-29')]);assert.equal(result.unchanged,true);
  // Native date picker changes use the same notice and transition as swipes.
  const picker=await page.evaluate(()=>{
   $('amount').value='123.45';$('note').value='保留未保存备注';calculate();
   $('selectedDate').value='2026-10-04';$('selectedDate').dispatchEvent(new Event('change',{bubbles:true}));
   return {date:displayedDate,notice:$('dateNotice').textContent,shown:$('dateNotice').classList.contains('show'),frames:dateTransitionAnimations[0].effect.getKeyframes(),duration:dateTransitionAnimations[0].effect.getTiming().duration};
  });
  assert.equal(picker.date,'2026-10-04');assert(picker.shown);assert(picker.notice.includes('2026年10月4日 · 周日'));
  assert.equal(picker.duration,420);assert.equal(picker.frames[0].transform,'translateX(70px)');assert.equal(picker.frames[0].opacity,'0.25');
  const edgeCases=await page.evaluate(()=>{
   const previousAnimations=dateTransitionAnimations.slice(),same=changeSelectedDate('2026-10-04');
   $('selectedDate').value='';$('selectedDate').dispatchEvent(new Event('change',{bubbles:true}));
   const emptyDate=$('selectedDate').value,invalid=changeSelectedDate('2026-02-30');
   changeSelectedDate('2026-10-05');changeSelectedDate('2026-10-06');changeSelectedDate('2026-10-03');
   return {same,emptyDate,invalid,oldCancelled:previousAnimations.every(a=>a.playState==='idle'),active:dateTransitionAnimations.length,date:displayedDate,notice:$('dateNotice').textContent,drafts:[$('amount').value,$('note').value],ancient:dateKey(localDate('0099-12-31'))};
  });
  assert.equal(edgeCases.same,false);assert.equal(edgeCases.emptyDate,'2026-10-04');assert.equal(edgeCases.invalid,false);assert(edgeCases.oldCancelled);assert.equal(edgeCases.active,1);assert.equal(edgeCases.date,'2026-10-03');assert(edgeCases.notice.includes('2026年10月3日 · 周六'));assert.deepEqual(edgeCases.drafts,['123.45','保留未保存备注']);assert.equal(edgeCases.ancient,'0099-12-31');
  await page.waitForFunction(()=>dateTransitionAnimations.length===0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{window.scrollTo(0,0);$('toast').classList.remove('show');});
  await page.screenshot({path:'date-switch-preview.png'});
  // Test real browser touch routing, not just synthetic DOM touch events.
  await page.evaluate(()=>$('selectedDate').focus());
  const session=await page.context().newCDPSession(page),box=await page.locator('.metrics').boundingBox();
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:240,y:box.y+35}]});
  for(const x of [210,180,150,120])await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:box.y+35}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await page.locator('#selectedDate').inputValue(),'2026-10-04');
  assert((await page.locator('#dateNoticeMessage').textContent()).includes('2026年10月4日 · 周日'));
  await page.waitForFunction(()=>!$('dateNotice').classList.contains('show'));
  assert.equal(await page.locator('#dateNoticeMessage').textContent(),'');
  for(const width of [320,390,760,1100]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(()=>changeSelectedDate(displayedDate==='2026-10-04'?'2026-10-03':'2026-10-04'));
   const layout=await page.evaluate(()=>{const b=$('dateNotice').getBoundingClientRect();return {noOverflow:document.documentElement.scrollWidth<=innerWidth,inside:b.x>=0&&b.right<=innerWidth&&b.top>=0}});
   assert(layout.noOverflow,'horizontal overflow '+width);assert(layout.inside,'notice bounds '+width);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(()=>{changeSelectedDate('2026-10-08');return {animations:dateTransitionAnimations.length,notice:$('dateNotice').classList.contains('show'),transition:getComputedStyle($('dateNotice')).transitionDuration}});
  assert.equal(reduced.animations,0);assert(reduced.notice);assert.equal(reduced.transition,'0s');
  assert.deepEqual(errors,[]);
  console.log('PASS: swipe + real touch, picker notice, animation/reduced-motion, rapid switching, invalid dates, drafts, year/leap boundaries, responsive bounds; ledger unchanged');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
