/* Printer preferences are device-local; receipts never change the ledger. */
window.POSPrinter=(()=>{
 const key='TCGshop-POS-printer-v1',styleKey='TCGshop-POS-receipt-style-v1',pending=new Map();
 // Upgrade only the exact previous bundled logo; preserve custom uploads and removal.
 (async()=>{try{const raw=localStorage.getItem(styleKey);if(!raw)return;const saved=JSON.parse(raw);if(typeof saved.logo!=='string'||!saved.logo)return;const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(saved.logo));const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash==='a41565d201071d96f861683f94091b3afb5c12319fe825ddfdcc779b2e38312a'&&localStorage.getItem(styleKey)===raw){saved.logo=window.POSReceiptLogo;localStorage.setItem(styleKey,JSON.stringify(saved));}}catch{}})();
 let busy=false,status='尚未连接小票机',connectedAddress='';
 const supported=()=>typeof window.NativePOS?.printerRequest==='function';
 function config(){try{const c=JSON.parse(localStorage.getItem(key)||'{}');return {address:typeof c.address==='string'?c.address:'',name:typeof c.name==='string'?c.name:'',width:c.width===576?576:384};}catch{return {address:'',name:'',width:384};}}
 function style(){try{const s=JSON.parse(localStorage.getItem(styleKey)||'{}');return {logo:typeof s.logo==='string'&&s.logo.startsWith('data:image/')?s.logo:(s.logo===''?'':window.POSReceiptLogo||''),footer:typeof s.footer==='string'&&s.footer.trim()?s.footer.trim():'感谢惠顾',showQr:false};}catch{return {logo:window.POSReceiptLogo||'',footer:'感谢惠顾',showQr:false};}}
 function saveStyle(next){localStorage.setItem(styleKey,JSON.stringify({logo:next.logo||'',footer:(next.footer||'感谢惠顾').trim()||'感谢惠顾',showQr:false}));}
 function update(message){status=message;const el=$('printerStatus');if(el)el.textContent=message;document.querySelectorAll('[data-print-order],#receiptPrint,#printerConnect,#printerTest,#printerDevices,#printerDisconnect,#printerSave,#printerBluetooth,#printerPair').forEach(b=>b.disabled=busy);}
 function request(action,payload={}){
  if(!supported())return Promise.reject(Error(window.NativePOS?'当前版本不支持蓝牙打印，请更新应用':'蓝牙小票机连接需在 Android App 中使用'));
  return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>{pending.delete(id);connectedAddress='';reject(Error(action==='print'?'发送未得到确认，可能已经出纸，请检查后再手动重试':'小票机操作超时，请重试'));},action==='print'?100000:action==='pair'?600000:35000);pending.set(id,{resolve,reject,timeout});try{NativePOS.printerRequest(id,action,JSON.stringify(payload));}catch(e){clearTimeout(timeout);pending.delete(id);reject(e);}});
 }
 function receiveNative(id,result){const task=pending.get(id);if(!task)return;if(result?.progress===true){update(result.message||'正在打印…');return;}pending.delete(id);clearTimeout(task.timeout);if(result?.ok){if('connected' in result)connectedAddress=result.connected?result.address:'';task.resolve(result);}else{connectedAddress='';task.reject(Error(result?.message||'小票机操作未完成'));}}
 async function perform(fn){if(busy){toast('正在处理打印操作，请稍候');return;}POSAuth.requireUser();busy=true;update('正在处理小票机操作…');try{await fn();}catch(e){update(e.message);toast(e.message);}finally{busy=false;update(status);}}
 function save(){POSAuth.requireUser();const select=$('printerDevice'),address=select.value;if(!/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(address))throw Error('请先刷新并选择已配对的小票机');const width=Number($('printerPaper').value);if(![384,576].includes(width))throw Error('请选择纸宽');const c={address:address.toUpperCase(),name:select.selectedOptions[0]?.textContent||'蓝牙小票机',width};localStorage.setItem(key,JSON.stringify(c));return c;}
 function panel(){const c=config();return `<div class="panel printer-panel"><h3>小票机连接</h3><p class="hint">首次使用请点击「配对新小票机」，在系统蓝牙页面选择打印机并输入设备说明书上的 PIN，然后返回本页。</p><div class="form-grid"><div class="field"><label for="printerDevice">已配对设备</label><select id="printerDevice"><option value="">请选择小票机</option>${c.address?`<option value="${esc(c.address)}" selected>${esc(c.name||c.address)}</option>`:''}</select></div><div class="field"><label for="printerPaper">纸宽</label><select id="printerPaper"><option value="384" ${c.width===384?'selected':''}>58mm（384 点）</option><option value="576" ${c.width===576?'selected':''}>80mm（576 点）</option></select></div></div><div class="account-actions"><button id="printerPair" class="secondary">配对新小票机（PIN）</button><button id="printerBluetooth">系统蓝牙设置</button><button id="printerDevices">刷新设备</button><button id="printerSave">保存设置</button><button id="printerConnect" class="primary">连接</button><button id="printerDisconnect">断开</button><button id="printerTest">测试打印</button></div><p id="printerStatus" class="hint" role="status">${esc(supported()?status:window.NativePOS?'当前安装版本尚未包含蓝牙打印，需更新安装包后连接。':'浏览器可查看设置，蓝牙连接与打印需在 Android App 中使用。')}</p><p class="hint">连接设置仅保存在本机；发送成功后请确认小票机实际出纸。</p></div>`;}


 function stylePanel(){const s=style();return `<div class="panel receipt-style-panel"><h3>小票样式</h3><p class="hint">打印时使用当前店铺名称。样式设置只保存在本机，不会写入销售账本。</p><div class="receipt-style-preview">${s.logo?`<img src="${esc(s.logo)}" alt="小票 logo">`: '<div class="receipt-style-placeholder">LOGO</div>'}<b>${esc(state.store)}</b><small>订单号与商品明细将在打印时填入</small><span>${esc(s.footer)} · ${esc(state.store)}</span></div><div class="field"><label for="receiptLogo">顶部标志</label><input id="receiptLogo" type="file" accept="image/*"><small class="field-note">建议使用方形或横向图片，应用会自动压缩。</small></div><div class="field"><label for="receiptFooter">底部感谢语</label><input id="receiptFooter" maxlength="40" value="${esc(s.footer)}" placeholder="感谢惠顾"></div><div class="account-actions"><button id="receiptStyleSave" class="primary">保存小票样式</button><button id="receiptStyleClear" class="danger">移除标志</button></div><p id="receiptStyleStatus" class="hint" role="status">${s.logo?'已设置标志':'未设置标志，将打印店铺名称'}</p></div>`;}
 function wirePanel(){
  if(!$('printerConnect'))return;
  $('printerPair').onclick=()=>perform(async()=>{
   update('请在系统蓝牙页面选择小票机，输入 PIN 完成配对后返回');
   const previous=new Set([...$('printerDevice').options].map(o=>o.value));
   const r=await request('pair');POSAuth.requireUser();
   const select=$('printerDevice');if(!select)return;
   const selected=select.value,devices=r.devices||[];
   select.replaceChildren(new Option('请选择小票机',''));
   for(const d of devices)select.add(new Option((d.name||'蓝牙设备')+' · '+d.address,d.address));
   const added=devices.filter(d=>!previous.has(d.address));
   if(added.length===1)select.value=added[0].address;
   else if(devices.some(d=>d.address===selected))select.value=selected;
   update(devices.length?'已刷新系统配对结果，请选择小票机并点击连接':'尚未发现已配对的经典蓝牙小票机；如已取消或 PIN 错误，请重新配对');
  });
  $('printerBluetooth').onclick=()=>perform(async()=>{await request('settings');update('配对后返回本页，点击刷新设备');});
  $('printerDevices').onclick=()=>perform(async()=>{const r=await request('devices');POSAuth.requireUser();const select=$('printerDevice');if(!select)return;const selected=select.value;select.replaceChildren(new Option('请选择小票机',''));for(const d of r.devices||[])select.add(new Option((d.name||'蓝牙设备')+' · '+d.address,d.address));if([...select.options].some(o=>o.value===selected))select.value=selected;update(r.devices?.length?'请选择小票机并连接':'未找到已配对设备，请先进行系统配对');});
  $('printerSave').onclick=()=>guarded(()=>{save();update('设置已保存');});
  $('printerConnect').onclick=()=>perform(async()=>{const c=save(),r=await request('connect',c);update(r.message||'连接已建立');});
  $('printerDisconnect').onclick=()=>perform(async()=>{const r=await request('disconnect');update(r.message||'已断开');});
  $('printerTest').onclick=()=>perform(async()=>{const c=save(),s=style(),r=await request('print',{...c,logo:s.logo,centerLines:[state.store],footerLines:[s.footer+' · '+state.store],showQr:false,socialCodes:[],lines:['小票机连接测试',`纸宽：${c.width===384?'58':'80'}mm`,'中文测试：商品 / 数量 / 金额','1234567890  ¥12.34',time(new Date().toISOString())]});update(r.message);toast(r.message);});
 }
 function wireStylePanel(){if(!$('receiptStyleSave'))return;let next=style(),loading=false,epoch=0;const input=$('receiptLogo'),saveButton=$('receiptStyleSave'),clearButton=$('receiptStyleClear'),statusEl=$('receiptStyleStatus');
  input.onchange=()=>{const file=input.files?.[0];if(!file)return;const current=++epoch,active=()=>current===epoch&&statusEl.isConnected;
   if(file.size>8*1024*1024){loading=false;saveButton.disabled=clearButton.disabled=false;toast('logo 图片不能超过 8MB');return;}
   loading=true;saveButton.disabled=clearButton.disabled=true;statusEl.textContent='正在读取并压缩 logo…';
   const finish=message=>{if(!active())return;loading=false;saveButton.disabled=clearButton.disabled=false;statusEl.textContent=message;};
   const reader=new FileReader();reader.onerror=()=>finish('图片读取失败，请重新选择');reader.onload=()=>{if(!active())return;const img=new Image();img.onerror=()=>finish('无法识别这张图片，请选择有效图片');img.onload=()=>{if(!active())return;try{const scale=Math.min(1,320/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);next.logo=canvas.toDataURL('image/jpeg',.78);finish('已读取 logo，点击保存样式后生效');}catch{finish('图片处理失败，请重新选择');}};img.src=reader.result;};reader.readAsDataURL(file);
  };
  saveButton.onclick=()=>guarded(()=>{POSAuth.requireUser();if(loading)throw Error('请等待 logo 处理完成');next.footer=$('receiptFooter').value;saveStyle(next);toast('小票样式已保存');render();});clearButton.onclick=()=>guarded(()=>{POSAuth.requireUser();if(loading)throw Error('请等待 logo 处理完成');next.logo='';next.footer=$('receiptFooter').value;saveStyle(next);toast('logo 已移除');render();});
 }
 function receipt(orderId){
  POSAuth.requireUser();const o=state.orders.find(o=>o.id===orderId);if(!o)throw Error('当前店铺未找到该订单');
  const lines=['订单号：'+o.id,'下单时间：'+time(o.time),'收银员：'+actorLabel(o.actor),'--------------------------------'];
  for(const l of o.lines){lines.push(l.name,`${yuan(l.price)} × ${l.qty}    ${yuan(l.price*l.qty)}`);}
  lines.push('--------------------------------','商品小计：'+yuan(o.lines.reduce((n,l)=>n+l.price*l.qty,0)),'整单优惠：−'+yuan(o.discount),'原实收：'+yuan(o.total),refundStatus(o));
  if(o.refunds.length)lines.push('已退款：'+yuan(o.refunds.reduce((n,r)=>n+r.amount,0)));
  return lines;
 }
 function printOrder(id){return perform(async()=>{const c=config(),s=style();if(!c.address)throw Error('请先在「数据与设置 → 小票机」选择设备并连接');const lines=receipt(id),r=await request('print',{...c,logo:s.logo,centerLines:[state.store],footerLines:[s.footer+' · '+state.store],showQr:false,socialCodes:[],lines});update(r.message);toast(r.message);});}
 function wireReceipts(){document.querySelectorAll('[data-print-order]').forEach(b=>{b.disabled=busy;b.onclick=()=>printOrder(b.dataset.printOrder);});}
 return {panel,stylePanel,wirePanel,wireStylePanel:wireStylePanel,wireReceipts,printOrder,receiveNative,receipt,config,style};
})();
