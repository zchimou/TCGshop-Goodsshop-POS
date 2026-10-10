const {chromium}=require('playwright');
const {pathToFileURL}=require('url');
const assert=require('assert');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(pathToFileURL(require('path').resolve('index.html')).href);
 const beforeToggle=await page.evaluate(()=>JSON.stringify({data,storage:{...localStorage}}));
 const marker=page.locator('#colorToggleBtn');assert.equal(await marker.getAttribute('aria-pressed'),'false');
 const gray=await marker.evaluate(el=>getComputedStyle(el).backgroundColor);
 await marker.click();assert.equal(await marker.getAttribute('aria-pressed'),'true');assert.notEqual(await marker.evaluate(el=>getComputedStyle(el).backgroundColor),gray);
 const marked=await page.evaluate(()=>({day:$('selectedDate').value,marks:data.dateMarks}));assert.equal(marked.marks[marked.day],true);
 await page.locator('#selectedDate').fill('2026-10-04');await page.locator('#selectedDate').dispatchEvent('change');assert.equal(await marker.getAttribute('aria-pressed'),'false');
 await marker.click();assert.equal(await marker.getAttribute('aria-pressed'),'true');
 await page.locator('#selectedDate').fill(marked.day);await page.locator('#selectedDate').dispatchEvent('change');assert.equal(await marker.getAttribute('aria-pressed'),'true');
 await marker.click();assert.equal(await marker.getAttribute('aria-pressed'),'false');assert.equal((await page.evaluate(day=>data.dateMarks[day],marked.day)),undefined);assert.equal((await page.evaluate(()=>Object.keys(data.dateMarks).length)),1);assert.equal(await page.locator('.modal-backdrop.show').count(),0);
 for(const width of [320,390,760,1100]){await page.setViewportSize({width,height:844});const markerBox=await marker.boundingBox(),weekBox=await page.locator('#weekInfoBtn').boundingBox();assert(Math.abs(markerBox.width-32)<.1);assert(Math.abs(markerBox.height-32)<.1);assert(markerBox.x+markerBox.width<=weekBox.x);assert(Math.abs(markerBox.y+16-weekBox.y-weekBox.height/2)<1);}
 for(const width of [320,390,760,1100]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);}
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{data.sales=[{date:'2025-12-28',a:999},{date:'2025-12-29',a:100},{date:'2026-01-04',a:200},{date:'2026-01-05',a:999}];$('selectedDate').value='2026-01-01';render();});
 assert.equal(await page.locator('#weeklySalesTotal').textContent(),'¥300.00');assert((await page.locator('#weeklySalesRange').textContent()).includes('2025-12-29 — 2026-01-04'));
 const weeklyBox=await page.locator('.weekly-sales').boundingBox(),dailyBox=await page.locator('.metrics').boundingBox();assert(weeklyBox.y+weeklyBox.height<=dailyBox.y);
 await page.reload();
 await page.locator('#amount').fill('100');await page.getByText('保存这笔销售',{exact:true}).click();assert.equal(await page.locator('#profitTotal').textContent(),'¥24.62');assert.equal(await page.locator('#weeklySalesTotal').textContent(),'¥100.00');
 await page.locator('[data-edit]').click();await page.locator('#editAmount').fill('200');await page.getByText('保存修改',{exact:true}).click();assert.equal(await page.locator('#profitTotal').textContent(),'¥49.24');
 for(const n of ['first','second']){await page.locator('#expenseAmount').fill('10');await page.locator('#expenseNote').fill(n);await page.locator('.expense-form button').click();}
 await page.locator('.record').filter({hasText:'second'}).locator('[data-delete]').click();assert.equal(await page.locator('.record').filter({hasText:'first'}).count(),1);assert.equal(await page.locator('.record').filter({hasText:'second'}).count(),0);
 await page.locator('[data-kind="sales"]').click();await page.locator('#dayHistory').click();assert((await page.locator('#dialogBody').textContent()).includes('修改前'));assert((await page.locator('#dialogBody').textContent()).includes('删除'));await page.locator('#dialog .close').click();
 await page.locator('#weekInfoBtn').click();assert.equal(await page.locator('#dialogBody .record').count(),7);assert((await page.locator('#dialogBody .record').first().textContent()).includes('周一'));await page.locator('#weekStart').fill('2026-01-01');await page.locator('#weekStart').dispatchEvent('change');assert((await page.locator('#dialogBody').textContent()).includes('2025-12-29'));await page.locator('#dialog .close').click();
 await page.locator('#settingsBtn').click();const title=await page.locator('#settingsTitle').boundingBox(),status=await page.locator('#syncStatus').boundingBox();assert(status.y>title.y+title.height);await page.screenshot({path:'settings-fixed.png'});await page.locator('#settingsLayer .close').click();assert.equal(await page.locator('#settingsLayer').isVisible(),false);
 await page.locator('#amount').fill('100');await page.locator('#owner').selectOption('赤眸');await page.getByText('保存这笔销售',{exact:true}).click();
 await page.locator('#ownerCostsBtn').click();assert.equal(await page.locator('#dialogBody .record').count(),5);assert((await page.locator('#dialogBody .record').filter({hasText:'赤眸'}).textContent()).includes('¥75.00'));await page.locator('#costPrev').click();assert.equal(await page.locator('.owner-total strong').textContent(),'¥0.00');await page.locator('#dialog .close').click();
 const beforeIncome=await page.evaluate(()=>totals($('selectedDate').value));
 await page.locator('#incomeAmount').fill('30.50');await page.locator('#incomeNote').fill('活动补贴');await page.locator('#saveIncome').click();
 const afterIncome=await page.evaluate(()=>totals($('selectedDate').value));assert.equal(afterIncome.profit,Math.round((beforeIncome.profit+30.5)*100)/100);assert.equal(afterIncome.sales,beforeIncome.sales);assert.equal(afterIncome.cost,beforeIncome.cost);assert.equal(afterIncome.spend,beforeIncome.spend);
 assert((await page.locator('.record').filter({hasText:'活动补贴'}).textContent()).includes('+¥30.50'));
 await page.reload();assert.equal(await page.locator('#incomeTotal').textContent(),'¥30.50');
 await page.locator('#weekInfoBtn').click();assert((await page.locator('.week-card').filter({hasText:'本周额外收入'}).textContent()).includes('¥30.50'));await page.locator('#dialog .close').click();
 await page.locator('.record').filter({hasText:'活动补贴'}).locator('[data-delete]').click();assert.equal(await page.locator('#profitTotal').textContent(),'¥'+beforeIncome.profit.toFixed(2));
 await page.locator('#dayHistory').click();assert((await page.locator('#dialogBody').textContent()).includes('额外收入 · 活动补贴'));await page.locator('#dialog .close').click();
 const tinyAmount=await page.evaluate(()=>{const before=data.expenses.length;$('incomeAmount').value='0.001';addIncome();return {unchanged:data.expenses.length===before,message:$('toast').textContent};});assert(tinyAmount.unchanged);assert(tinyAmount.message.includes('0.01'));
 const failedDelete=await page.evaluate(()=>{const before=JSON.stringify(data),original=Storage.prototype.setItem;try{Storage.prototype.setItem=()=>{throw Error('test storage full')};deleteRecord('sales',data.sales[0].id);return {unchanged:JSON.stringify(data)===before,message:$('toast').textContent};}finally{Storage.prototype.setItem=original;$('incomeAmount').value='';}});assert(failedDelete.unchanged);assert(failedDelete.message.includes('保存失败'));
 await page.screenshot({path:'android-preview-fixed.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: responsive layouts, sales, expenses, income totals/persistence/week/delete history, settings, tiny-amount validation, failed-delete safety');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
