// All amounts are integer cents. Discounts are allocated once per order line.
function netLineAmount(order,index){
 const subtotal=order.lines.reduce((s,l)=>s+l.price*l.qty,0),before=order.lines.slice(0,index).reduce((s,l)=>s+l.price*l.qty,0),after=before+order.lines[index].price*order.lines[index].qty;
 return Number(BigInt(order.total)*BigInt(after)/BigInt(subtotal)-BigInt(order.total)*BigInt(before)/BigInt(subtotal));
}
function returnedQty(order,index){return (order.refunds||[]).reduce((s,r)=>s+r.lines.filter(l=>l.lineIndex===index).reduce((a,l)=>a+l.qty,0),0);}
function refundAmount(order,index,previous,qty){const l=order.lines[index],net=netLineAmount(order,index);return Number(BigInt(net)*BigInt(previous+qty)/BigInt(l.qty)-BigInt(net)*BigInt(previous)/BigInt(l.qty));}
function validateRefunds(order){
 if(order.refunds===undefined)order.refunds=order.refunded?[{id:'legacy-'+order.id,time:order.refundTime,note:order.refundNote||'旧版整单退货',amount:order.total,cost:order.cost,lines:order.lines.map((l,i)=>({lineIndex:i,qty:l.qty,amount:netLineAmount(order,i),cost:l.qty*l.cost}))}]:[];
 if(!Array.isArray(order.refunds))fail('退款记录格式不正确');const quantities=order.lines.map(()=>0),ids=new Set();
 for(const r of order.refunds){
  r.actor=validateActor(r.actor);
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||!validDate(r.time)||typeof r.note!=='string'||!r.note.trim()||!Array.isArray(r.lines)||!r.lines.length||!integer(r.amount)||!integer(r.cost))fail('退款记录不正确');ids.add(r.id);const indexes=new Set();let amount=0,cost=0;
  for(const l of r.lines){if(!integer(l.lineIndex)||l.lineIndex>=order.lines.length||indexes.has(l.lineIndex)||!integer(l.qty,1))fail('退款商品不正确');indexes.add(l.lineIndex);const original=order.lines[l.lineIndex],previous=quantities[l.lineIndex];if(previous+l.qty>original.qty)fail('退款数量超过已售数量');if(l.amount!==refundAmount(order,l.lineIndex,previous,l.qty)||l.cost!==original.cost*l.qty)fail('退款金额或成本不一致');quantities[l.lineIndex]+=l.qty;amount+=l.amount;cost+=l.cost;}
  if(amount!==r.amount||cost!==r.cost)fail('退款汇总不一致');
 }
 const full=order.lines.every((l,i)=>quantities[i]===l.qty);if(order.refunded!==full)fail('退款状态不一致');
}
function refundStatus(order){return order.refunded?'已退货':order.refunds?.length?'部分退款':'已收款';}
function calculateReturn(order,quantities){
 const lines=[];order.lines.forEach((l,i)=>{const qty=quantities[i]||0,previous=returnedQty(order,i);if(!integer(qty)||qty>l.qty-previous)fail('退款数量超过可退数量');if(qty)lines.push({lineIndex:i,qty,amount:refundAmount(order,i,previous,qty),cost:l.cost*qty});});if(!lines.length)fail('请选择至少一件要退的商品');return {lines,amount:lines.reduce((s,l)=>s+l.amount,0),cost:lines.reduce((s,l)=>s+l.cost,0)};
}
function recordReturn(orderId,quantities,note='未填写'){note=note.trim()||'未填写';return transact(s=>{
 const order=s.orders.find(o=>o.id===orderId);if(!order)fail('未找到订单');const result=calculateReturn(order,quantities),now=new Date().toISOString();order.refunds.push({id:uid(),time:now,note:note.trim(),actor:POSAuth.actor(),...result});
 for(const row of result.lines){const original=order.lines[row.lineIndex],p=s.products.find(p=>p.id===original.productId);p.cost=receivedCost(p.stock,p.cost,row.qty,original.cost);p.stock+=row.qty;addMovement(s,p,row.qty,'销售退货',orderId+' · '+note.trim());}
 order.refunded=order.lines.every((l,i)=>returnedQty(order,i)===l.qty);if(order.refunded)order.refundTime=now;
});}
function showReceipt(id){
 const o=state.orders.find(o=>o.id===id),returned=(o.refunds||[]).reduce((s,r)=>s+r.amount,0);
 modal('销售小票',`<h3>${esc(state.store)}</h3><div class="receipt-meta"><span>${esc(o.id)}</span><span>${time(o.time)}</span><span>销售账号：${esc(actorLabel(o.actor))}</span></div><div class="table-wrap"><table><thead><tr><th>商品</th><th>数量 / 已退</th><th>金额</th></tr></thead><tbody>${o.lines.map((l,i)=>`<tr><td>${esc(l.name)}</td><td>${l.qty} / ${returnedQty(o,i)}</td><td>${yuan(l.price*l.qty)}</td></tr>`).join('')}</tbody></table></div><div class="setting-row"><span>整单优惠</span><b>−${yuan(o.discount)}</b></div><div class="setting-row"><span>${o.payment==='已收款'?'':esc(o.payment)}原实收</span><b>${yuan(o.total)}</b></div>${returned||o.refunds.length?`<div class="setting-row"><span>已退款 / 净收款</span><b>${yuan(returned)} / ${yuan(o.total-returned)}</b></div>`:''}${o.payment==='现金'?`<p class="hint">顾客支付 ${yuan(o.cashReceived)} · 找零 ${yuan(o.change)}</p>`:''}<div class="notice">${refundStatus(o)}${o.refunded?' · '+time(o.refundTime):''}</div>${o.refunds.length?`<div class="refund-history"><h3>退款记录</h3>${o.refunds.map(r=>`<div class="refund-history-row"><b>${yuan(r.amount)}</b><small>${time(r.time)} · ${esc(actorLabel(r.actor))} · ${esc(r.note)}</small><small>${r.lines.map(l=>esc(o.lines[l.lineIndex].name)+' × '+l.qty).join('、')}</small></div>`).join('')}</div>`:''}<div class="form-actions">${o.refunded?'':'<button class="secondary" id="refundItems">单项退款</button><button class="danger" id="refundOrder">'+(o.refunds.length?'退回剩余全部':'整单退货')+'</button>'}<button id="receiptPrint">打印小票</button><button class="primary" id="receiptDone">完成</button></div>`);
 $('receiptPrint').onclick=()=>POSPrinter.printOrder(id);$('receiptDone').onclick=()=>$('dialog').close();if($('refundItems'))$('refundItems').onclick=()=>{$('dialog').close();refundDialog(id,false)};if($('refundOrder'))$('refundOrder').onclick=()=>{$('dialog').close();refundDialog(id,true)};
}
function refundDialog(id,all){
 const o=state.orders.find(o=>o.id===id),quantities=o.lines.map((l,i)=>all?l.qty-returnedQty(o,i):0);
 modal(all?'确认整单退货':'单项退款',`<form>${all?'':`<div class="refund-lines">${o.lines.map((l,i)=>{const remaining=l.qty-returnedQty(o,i);return `<div class="refund-line"><div><b>${esc(l.name)}</b><small>已售 ${l.qty} · 已退 ${returnedQty(o,i)} · 可退 ${remaining}</small></div><div><label for="refundQty${i}">退款数量</label><input id="refundQty${i}" data-refund-index="${i}" type="number" min="0" max="${remaining}" step="1" value="0" ${remaining?'':'disabled'}></div></div>`}).join('')}</div>`}<div class="receipt-total" id="refundPreview"></div><p class="hint">优惠按商品及数量分摊，按原实收金额退款，回补所退商品库存。请先通过原支付渠道实际退款，再确认记录。</p>${actions('已退款，确认退货')}</form>`);
 function selection(){return all?quantities:o.lines.map((l,i)=>qtyInput('refundQty'+i,true));}
 function preview(){try{const selected=selection();if(selected.every(q=>q===0)){$('refundPreview').textContent='退款金额：¥0.00';return;}const result=calculateReturn(state.orders.find(o=>o.id===id),selected);$('refundPreview').textContent='退款金额：'+yuan(result.amount);}catch(e){$('refundPreview').textContent=e.message}}
 document.querySelectorAll('[data-refund-index]').forEach(input=>input.addEventListener('input',preview));preview();
 wireForm(()=>{const selected=selection();if(recordReturn(id,selected)){$('dialog').close();toast('退款已记录，所退商品库存已回补')}});
}
function reportSaleItems(sales,products){
 const items=new Map(),byId=new Map(products.map(p=>[p.id,p]));
 for(const order of sales)order.lines.forEach((line,index)=>{
  const qty=line.qty-returnedQty(order,index);if(qty<=0)return;
  const returned=(order.refunds||[]).reduce((sum,r)=>sum+r.lines.filter(l=>l.lineIndex===index).reduce((n,l)=>n+l.amount,0),0);
  const key=line.productId,entry=items.get(key)||{name:line.name,cover:byId.get(key)?.cover||'',qty:0,total:0};
  entry.qty+=qty;entry.total+=netLineAmount(order,index)-returned;items.set(key,entry);
 });
 return [...items.values()].sort((a,b)=>b.total-a.total);
}
function reportTotals(){
 const sales=state.orders.filter(o=>inRange(o.time)),refunds=state.orders.flatMap(o=>(o.refunds||[]).map(r=>({...r,total:r.amount,payment:o.payment,orderId:o.id}))).filter(r=>inRange(r.time)),expenses=state.expenses.filter(e=>inRange(e.time));const gross=sales.reduce((s,o)=>s+o.total,0),returned=refunds.reduce((s,r)=>s+r.amount,0),cost=sales.reduce((s,o)=>s+o.cost,0)-refunds.reduce((s,r)=>s+r.cost,0),spend=expenses.reduce((s,e)=>s+e.amount,0);return {sales,refunds,expenses,gross,returned,net:gross-returned,cost,spend,profit:gross-returned-cost-spend};
}

function showRefundReceipt(orderId,refundId){const o=state.orders.find(o=>o.id===orderId),r=o?.refunds.find(r=>r.id===refundId);if(!r){toast('未找到退款记录');return;}modal('退款小票',`<h3>${esc(state.store)}</h3><div class="receipt-meta"><span>退款单 ${esc(r.id)}</span><span>${time(r.time)}</span><span>操作账号：${esc(actorLabel(r.actor))}</span></div><p class="hint">原订单：${esc(o.id)}</p><div class="table-wrap"><table><thead><tr><th>退款商品</th><th>数量</th><th>退款金额</th></tr></thead><tbody>${r.lines.map(l=>'<tr><td>'+esc(o.lines[l.lineIndex].name)+'</td><td>'+l.qty+'</td><td>'+yuan(l.amount)+'</td></tr>').join('')}</tbody></table></div><div class="setting-row"><span>退款金额</span><b class="refund-amount">${yuan(r.amount)}</b></div><p class="hint">退款备注：${esc(r.note)}</p><div class="form-actions"><button id="refundOriginal">查看原订单</button><button class="primary" id="refundReceiptDone">完成</button></div>`);$('refundReceiptDone').onclick=()=>$('dialog').close();$('refundOriginal').onclick=()=>{$('dialog').close();showReceipt(o.id)};}

// Only positive physical stock participates in weighted average cost.
function receivedCost(stock,cost,qty,incomingCost){const held=Math.max(0,stock);return Math.round((held*cost+qty*incomingCost)/(held+qty));}
