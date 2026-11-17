/* Staff packing and online, server-authoritative store pickup. */
window.POSPickup=(()=>{
 const status=r=>({pending:'待领取',redeemed:'已核销',cancelled:'已取消'}[r.status]);
 const hold=(sku,shop=state.activeShopId)=>POSPickupCore.reserved(state.pickups,shop,sku);
 function shopStock(sku,shopId){const p=state.products.find(p=>p.sku===sku);return p?(shopId===state.activeShopId?p.stock:state.shops.find(b=>b.id===shopId)?.inventory[p.id]?.stock||0):0;}
 function redemptionTime(row){
  if(row.status!=='redeemed')return '';
  const valid=typeof row.completedAt==='string'&&Number.isFinite(Date.parse(row.completedAt));
  return '<span class="pickup-redeemed-time">核销时间：'+(valid?'<time datetime="'+esc(row.completedAt)+'">'+time(row.completedAt)+'</time>':'未记录')+'</span>';
 }
 function summary(row){return `<div class="pickup-meta"><b>${esc(row.number)}</b><strong class="pickup-raffle">抽奖码：${esc(POSPickupCore.raffle(row)||"未分配")}</strong><span>自提店铺：${esc(POSShops.name(row.shopId))}</span><span>打包人：${esc(actorLabel(row.actor))} · ${time(row.time)}</span><span>状态：${status(row)}</span>${redemptionTime(row)}${row.note?`<span>备注：${esc(row.note)}</span>`:''}</div><div class="pickup-lines">${row.lines.map(l=>`<div><span><b>${esc(l.name)}</b><small>SKU ${esc(l.sku)} · 单价 ${yuan(l.price)}</small></span><span>× ${l.qty}</span><strong>${yuan(l.qty*l.price)}</strong></div>`).join('')}</div><div class="pickup-total">共 ${row.lines.reduce((n,l)=>n+l.qty,0)} 件<strong>${yuan(row.total)}</strong></div>`;}
 function renderPage(){
  const me=POSAuth.requireUser(),rows=(state.pickups||[]).filter(r=>r.shopId===state.activeShopId||r.actor.id===me.id||me.role==='admin').slice().sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  return `<div class="section-title"><div><h2>自提订单</h2><p class="sub">打包预留数量，核销后出库并生成销售小票</p></div><div class="section-actions"><button id="pickupBack">返回商品</button><button id="pickupRefresh">刷新订单</button><button id="pickupRaffle">抽奖</button>${me.role==='admin'?'<button id="pickupClearRaffle" class="danger">清空过往抽奖码</button>':''}<button id="pickupCreate" class="primary">＋ 商品打包</button></div></div><p class="hint">预订单不计入销售。可使用收银台扫码或商品页扫一扫，在所选自提店铺核销；核销需联网并确认已收款。</p><div class="pickup-list">${rows.map(r=>`<article class="panel pickup-card"><div class="pickup-card-title"><b>${esc(r.number)}</b><span class="badge ${r.status==='pending'?'':'good'}">${status(r)}</span></div><p><strong>抽奖码：${esc(POSPickupCore.raffle(r)||"未分配")}</strong></p><p>${esc(POSShops.name(r.shopId))} · ${esc(r.lines.map(l=>l.name+' ×'+l.qty).join('、'))}</p><small>打包时间：${time(r.time)} · ${esc(actorLabel(r.actor))}</small>${r.status==='redeemed'?'<p>'+redemptionTime(r)+'</p>':''}<div class="pickup-card-footer"><strong>${yuan(r.total)}</strong><button data-pickup-show="${r.id}">${r.status==='pending'?'查看取货码':'查看订单'}</button></div></article>`).join('')||'<div class="panel empty">暂无自提订单，点击「商品打包」创建</div>'}</div>`;
 }
 async function refresh(){if(POSSync.isBusy())throw Error('正在同步，请稍后重试');await POSSync.run('manual');render();}
 function wire(){
  $('pickupClearRaffle')?.addEventListener('click',clearRaffle);
  $('pickupRaffle')?.addEventListener('click',()=>POSRaffle.open());
  $('pickupOrders')?.addEventListener('click',()=>{page='pickups';query='';render();POSSync.onPage();});
  $('pickupBack')?.addEventListener('click',()=>{page='products';render();});
  $('pickupRefresh')?.addEventListener('click',()=>refresh().catch(e=>toast(e.message)));
  $('pickupCreate')?.addEventListener('click',()=>pack());
  document.querySelectorAll('[data-pickup-show]').forEach(b=>b.onclick=()=>show(state.pickups.find(r=>r.id===b.dataset.pickupShow)));
 }
 function clearRaffle(){
  if(POSAuth.requireUser().role!=='admin'){toast('只有管理员可以清空全部抽奖码');return;}
  modal('清空过往抽奖码','<p>确认清空所有店铺自提单的抽奖码？包括待领取、已核销和已取消订单，清空后可以重新使用这些号码。</p><p class="hint">自提订单、取货二维码、库存和销售记录保持不变。此前保存的凭证图片不会自动更新，请重新生成需要使用的凭证。</p><form id="clearRaffleForm"><p class="auth-error" role="alert"></p>'+actions('确认清空全部抽奖码')+'</form>');
  const form=$('clearRaffleForm'),error=form.querySelector('.auth-error');
  form.querySelector('[data-cancel]').onclick=()=>$('dialog').close();
  form.onsubmit=async event=>{
   event.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;error.textContent='';
   try{
    const result=await POSSync.pickup({action:'clearRaffle'});
    if(form.isConnected)$('dialog').close();
    await POSSync.run('manual');render();toast('已清空 '+result.cleared+' 个抽奖码，可重新赋码');
   }catch(e){if(error.isConnected)error.textContent=e.message;else toast(e.message);}finally{button.disabled=false;}
  };
 }
 function pack(){
  POSAuth.requireUser();const draft=[],requestId=uid().replaceAll('-','');
  modal('商品打包',`<form id="pickupPackForm">${POSShops.select('自提店铺','pickupShop',state.activeShopId)}${field('取货人 / 备注（可选）','pickupNote','','text','maxlength="200"')}${field('抽奖码（手动填写，可暂留空）','pickupRaffleCode','','text','inputmode="numeric" pattern="[1-9][0-9]{0,8}" maxlength="9" placeholder="留空暂不分配"')}<div class="pickup-picker">${field('查找商品','pickupSearch','','search','placeholder="搜索商品名称或 SKU"')}<label class="field">选择商品<select id="pickupProduct" aria-label="选择打包商品"></select></label><button type="button" id="pickupAdd">添加商品</button></div><div id="pickupDraft" class="pickup-draft"></div><div id="pickupSum" class="pickup-total"></div><p class="hint">金额和单价保存在预订单中，不计入当日销售；核销时按此金额生成销售小票。未定价商品请填写单价。打包和核销需要连接已更新的 NAS。</p><p id="pickupError" class="auth-error" role="alert"></p>${actions('生成预订单及取货码')}</form>`);
  const form=$('pickupPackForm'),draftBox=$('pickupDraft'),sum=$('pickupSum');
  function options(){const q=$('pickupSearch').value.trim().toLowerCase();$('pickupProduct').innerHTML=activeProducts().filter(p=>(p.name+' '+p.sku).toLowerCase().includes(q)).sort(productNameCompare).map(p=>`<option value="${esc(p.sku)}">${esc(p.name)} · SKU ${esc(p.sku)}</option>`).join('');}
  function money(v){return /^\d+(\.\d{1,2})?$/.test(v)&&Number.isSafeInteger(Math.round(Number(v)*100))?Math.round(Number(v)*100):NaN;}
  function numbers(){let qty=0,total=0;for(const l of draft){qty+=Number(l.qty);total+=Number(l.qty)*money(l.price);}sum.innerHTML=`预订 ${Number.isFinite(qty)?qty:'—'} 件<strong>${Number.isFinite(total)?yuan(total):'请检查单价'}</strong>`;}
  function draw(){const shop=$('pickupShop').value;draftBox.innerHTML=draft.map((l,i)=>`<div class="pickup-draft-row"><span><b>${esc(l.name)}</b><small>SKU ${esc(l.sku)}</small><small>可预定 ${Math.max(0,shopStock(l.sku,shop)-hold(l.sku,shop))}</small></span><label>数量<input data-pickup-qty="${i}" aria-label="${esc(l.name)}数量" type="number" min="1" max="1000000000" step="1" value="${esc(l.qty)}" required></label><label>单价（元）<input data-pickup-price="${i}" aria-label="${esc(l.name)}单价" type="number" min="0.01" step="0.01" value="${esc(l.price)}" placeholder="填写单价" required></label><button type="button" data-pickup-remove="${i}" aria-label="移除${esc(l.name)}">移除</button></div>`).join('')||'<p class="hint">请添加要打包的商品</p>';
   draftBox.querySelectorAll('[data-pickup-qty]').forEach(el=>el.oninput=()=>{draft[Number(el.dataset.pickupQty)].qty=el.value;numbers();});draftBox.querySelectorAll('[data-pickup-price]').forEach(el=>el.oninput=()=>{draft[Number(el.dataset.pickupPrice)].price=el.value;numbers();});draftBox.querySelectorAll('[data-pickup-remove]').forEach(el=>el.onclick=()=>{draft.splice(Number(el.dataset.pickupRemove),1);draw();});numbers();
  }
  $('pickupSearch').oninput=options;$('pickupShop').onchange=draw;$('pickupAdd').onclick=()=>{const p=activeProducts().find(p=>p.sku===$('pickupProduct').value);if(!p)return;const existing=draft.find(l=>l.sku===p.sku);if(existing)existing.qty=String(Number(existing.qty)+1);else draft.push({sku:p.sku,name:p.name,qty:'1',price:p.price?(p.price/100).toFixed(2):''});draw();};
  form.querySelector('[data-cancel]').onclick=()=>$('dialog').close();
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]'),error=$('pickupError');if(button.disabled)return;button.disabled=true;error.textContent='';
   try{if(!draft.length)throw Error('请至少添加一件商品');const lines=draft.map(l=>{const qty=Number(l.qty),price=money(l.price);if(!/^\d+$/.test(l.qty)||!integer(qty,1)||!integer(price,1))throw Error('请填写有效数量和单价');return {sku:l.sku,qty,price};});const result=await POSSync.pickup({action:'create',id:requestId,shopId:$('pickupShop').value,note:$('pickupNote').value.trim(),lines,raffleCode:$('pickupRaffleCode').value.trim()});if(!form.isConnected){toast('预订单已生成，可在自提订单中查看');POSSync.onPage();return;}$('dialog').close();await POSSync.run('manual');page='pickups';render();show(result.pickup);}
   catch(e){if(error.isConnected)error.textContent=e.message;else toast(e.message);}finally{button.disabled=false;}
  };options();draw();
 }
 async function show(row){
  if(!row)return;modal('自提预订单',summary(row)+(row.status!=='cancelled'&&(row.shopId===state.activeShopId||POSAuth.requireUser().role==='admin')?'<div class="form-actions"><button id="pickupRaffleEdit">手动设置抽奖码</button></div>':'')+(row.status==='pending'?'<div class="pickup-qr" id="pickupQr" aria-label="自提二维码">正在生成二维码…</div><p class="hint">保存取货码交给顾客；到对应店铺出示核销。金额尚未计入销售。</p><div class="form-actions"><button id="pickupSaveQr">保存取货凭证</button>'+((row.shopId===state.activeShopId||POSAuth.requireUser().role==='admin')?'<button id="pickupCancel" class="danger">取消预订单</button>':'')+'</div>':`<p class="hint">${row.status==='redeemed'?'核销人：':'取消时间：'+time(row.completedAt)+' · '}${esc(actorLabel(row.completedBy))}${row.orderId?' · 销售单号 '+esc(row.orderId):''}</p>`));
  $('pickupRaffleEdit')?.addEventListener('click',()=>editRaffle(row));const qrBox=$('pickupQr');if(!qrBox)return;
  try{const z=await ProductCodeScanner.library();if(!qrBox.isConnected)return;const svg=new z.BrowserQRCodeSvgWriter().write(POSPickupCore.qr(row),320,320);qrBox.replaceChildren(svg);$('pickupSaveQr').onclick=()=>saveImage(row,svg).catch(e=>toast(e.message));}
  catch(e){if(qrBox.isConnected)qrBox.textContent='二维码生成失败：'+e.message;}
  $('pickupCancel')?.addEventListener('click',()=>{modal('取消自提预订单',summary(row)+'<p>确认取消此预订单？取消后释放预定数量，原取货码失效。</p><form><p id="pickupError" class="auth-error"></p>'+actions('确认取消预订单')+'</form>');const form=$('dialogBody').querySelector('form');form.querySelector('[data-cancel]').onclick=()=>$('dialog').close();form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{await POSSync.pickup({action:'cancel',code:POSPickupCore.qr(row),shopId:row.shopId});$('dialog').close();await POSSync.run('manual');render();toast('预订单已取消，预定数量已释放');}catch(e){$('pickupError').textContent=e.message;}finally{button.disabled=false;}};});
 }
 function editRaffle(row){
  modal('手动设置抽奖码',summary(row)+'<form id="pickupRaffleForm">'+field('抽奖码（留空暂不分配）','pickupAssignedCode',POSPickupCore.raffle(row),'text','inputmode="numeric" pattern="[1-9][0-9]{0,8}" maxlength="9"')+'<p id="pickupError" class="auth-error" role="alert"></p>'+actions('保存抽奖码')+'</form>');
  const form=$('pickupRaffleForm');form.querySelector('[data-cancel]').onclick=()=>$('dialog').close();form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{const result=await POSSync.pickup({action:'setRaffle',shopId:row.shopId,code:POSPickupCore.qr(row),raffleCode:$('pickupAssignedCode').value.trim()});if(!form.isConnected){POSSync.onPage();return;}$('dialog').close();await POSSync.run('manual');render();show(result.pickup);toast('抽奖码已保存');}catch(e){if(form.isConnected)$('pickupError').textContent=e.message;else toast(e.message);}finally{button.disabled=false;}};
 }
 async function saveImage(row,svg){
  const images=await POSPickupVoucher.images(row,POSShops.name(row.shopId),svg);
  function save(item){if(window.NativePOS?.saveImage)NativePOS.saveImage(item.filename,item.data);else{const a=document.createElement('a');a.href=item.data;a.download=item.filename;a.click();}}
  if(images.length===1){save(images[0]);return;}
  modal('保存提货凭证','<p class="hint">商品较多，已分为 '+images.length+' 张图片，每张均含取货码。请逐张保存。</p><div class="form-actions">'+images.map((item,i)=>'<button data-pickup-save-page="'+i+'">保存第 '+(i+1)+' 页</button>').join('')+'</div>');document.querySelectorAll('[data-pickup-save-page]').forEach(b=>b.onclick=()=>save(images[Number(b.dataset.pickupSavePage)]));
 }
 async function scan(code){
  if(!POSPickupCore.parse(code)){toast('自提二维码格式不正确');return;}
  modal('查询自提订单','<p role="status">正在核对自提店铺与订单状态…</p>');const waiting=$('dialogBody').firstElementChild;
  try{const result=await POSSync.pickup({action:'lookup',code,shopId:state.activeShopId});const row=result.pickup;if(!$('dialog').open||!waiting.isConnected)return;
   if(row.status!=='pending'){modal('自提订单'+status(row),summary(row)+'<p class="notice">'+(row.status==='redeemed'?'此单已核销，不会重复出库或生成小票。':'此单已取消，不能核销。')+'</p>');return;}
   modal('确认自提核销',summary(row)+'<p class="notice">请核对实物并确认已收款。核销后扣减本店库存、生成销售小票，计入核销当天销售。</p><form><p id="pickupError" class="auth-error" role="alert"></p>'+actions('已收款，核销并生成小票')+'</form>');const form=$('dialogBody').querySelector('form');form.querySelector('[data-cancel]').onclick=()=>$('dialog').close();form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;try{const result=await POSSync.pickup({action:'redeem',code,shopId:state.activeShopId});$('dialog').close();await POSSync.run('manual');render();toast(result.repeated?'此单已经核销，未重复出库':state.pickups?.some(r=>r.id===result.pickup.id&&r.status==='redeemed')?'核销成功，库存与销售小票已更新':'服务器已核销成功，请点击同步刷新本机显示');}catch(e){if($('pickupError'))$('pickupError').textContent=e.message;else toast(e.message);}finally{button.disabled=false;}};
  }catch(e){if($('dialog').open&&waiting.isConnected)modal('无法核销','<p class="auth-error" role="alert">'+esc(e.message)+'</p>');else toast(e.message);}
 }
 return {hold,render:renderPage,wire,pack,scan};
})();
