function optionSelect(label,id,options,selected,kind,extra=[]){
 return `<div class="field"><label for="${id}">${label}</label><div class="option-select"><select id="${id}"><option value="">未选择</option>${extra.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}${options.map(o=>`<option value="${esc(o.value)}" ${String(selected)===String(o.value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select><button type="button" data-add-option="${kind}" aria-label="管理${label}" title="新增或删除选项">＋</button></div><div class="option-create" id="${kind}Editor" hidden><label for="${kind}Value">${kind==='category'?'新分类名称':'新成本百分比（0–100）'}</label><div class="option-select"><input id="${kind}Value" ${kind==='rate'?'type="number" min="0" max="100" step="0.01"':'type="text" maxlength="40"'}><button type="button" id="${kind}Save">添加</button></div><small id="${kind}Error" role="status"></small><div id="${kind}Options" class="option-list"></div><small>删除后相关商品归到「未选择」，已有成本金额保留。</small></div></div>`;
}
function wireOptionCreation(selectId,kind,onChange){
 const panel=$(kind+'Editor'),input=$(kind+'Value'),error=$(kind+'Error'),collection=kind==='category'?'categories':'costRates';
 function list(){
  $(kind+'Options').innerHTML=state[collection].map(v=>`<div class="option-list-row"><span>${esc(kind==='category'?v:rateLabel(v))}</span><button type="button" class="danger" data-delete-option="${esc(v)}">删除</button></div>`).join('')||'<p class="sub">暂无自定义选项</p>';
  $(kind+'Options').querySelectorAll('[data-delete-option]').forEach(b=>b.onclick=()=>{
   const value=kind==='category'?b.dataset.deleteOption:Number(b.dataset.deleteOption),select=$(selectId);
   if(!transact(s=>{s[collection]=s[collection].filter(v=>v!==value);for(const p of s.products){if(kind==='category'&&p.category===value)p.category=UNSELECTED;if(kind==='rate'&&p.costRate===value)delete p.costRate;}},false)){error.textContent='删除未能保存';return;}
   const selected=select.value===String(value);[...select.options].filter(o=>o.value===String(value)).forEach(o=>o.remove());if(selected)select.value='';list();onChange?.();toast('选项已删除，相关商品已归到未选择');
  });
 }
 document.querySelector(`[data-add-option="${kind}"]`).onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){list();input.focus()}};
 function save(){error.textContent='';try{
  let value;if(kind==='category'){value=input.value.trim();if(!value||value.length>40||value==='全部'||value===UNSELECTED)fail('请输入分类名称，不能使用「全部」或「未选择」');}
  else{const raw=input.value.trim();if(!/^\d+(\.\d{1,2})?$/.test(raw))fail('百分比最多保留两位小数');value=Math.round(Number(raw)*100);if(!integer(value)||value>10000)fail('请输入 0–100% 的百分比');}
  if(!state[collection].includes(value)&&!transact(s=>s[collection].push(value),false)){error.textContent='选项未能保存';return;}
  const select=$(selectId);if(![...select.options].some(o=>o.value===String(value)))select.add(new Option(kind==='category'?value:rateLabel(value),String(value)));select.value=String(value);panel.hidden=true;input.value='';onChange?.();toast('选项已保存');
 }catch(e){error.textContent=e.message}}
 $(kind+'Save').onclick=save;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save()}});
}
function percentCost(price,rate){return Math.round(price*rate/10000);}
function inventoryQtyInput(id,allowNegative=false){const raw=$(id).value.trim();if(!new RegExp(allowNegative?'^-?\\d+$':'^\\d+$').test(raw))fail('库存数量必须为整数');const n=Number(raw);if(!Number.isSafeInteger(n)||n<-1000000000||n>1000000000)fail('库存数量超出范围');return n;}
function editProduct(id){
 const p=id?product(id):null,selectedRate=p?.costRate??'',sku=p?.sku||newSku();
 modal(p?'编辑商品':'新建商品',`<form>${coverEditorMarkup()}<div class="form-grid">${field('商品名称','pName',p?.name||'','text','required maxlength="100"')}${barcodeField(p?.code||'')}${field('SKU（自动生成）','pSku',sku,'text','readonly')}${field('售价（元，可留空）','pPrice',p?.price?(p.price/100).toFixed(2):'','number','min="0.01" step="0.01" placeholder="收款时输入单价"')}${optionSelect('商品成本','pCostRate',state.costRates.map(r=>({value:r,label:rateLabel(r)})),selectedRate,'rate')}${field(p?'本产品成本（元）':'单件采购成本（元）','pCost',p?(p.cost/100).toFixed(2):'','number',p?'readonly':'required min="0" step="0.01"')}${field(p?'库存数量':'期初库存','pStock',p?String(p.stock):'0','number',p?'min="-1000000000" max="1000000000" step="1"':'required min="0" step="1"')}</div><p class="hint" id="pCostHint"></p>${p?'<p class="hint">修改库存数量会自动生成入库或出库记录；修改比例只用于后续采购。</p>':''}${actions('保存商品')}</form>`);
 const coverEditor=mountCoverEditor(p?.cover||'');$('pCostRate').value=String(selectedRate);
 function preview(){
  if($('pCostRate').value===''||$('pPrice').value.trim()===''){$('pCost').readOnly=!!p;$('pCostHint').textContent=p?'未选择成本比例，后续采购时填写实际成本金额。':'未选择成本比例，请手动填写单件采购成本（无采购成本可填 0）。';return;}
  $('pCost').readOnly=true;const price=Math.round(Number($('pPrice').value)*100),rate=Number($('pCostRate').value),cost=Number.isFinite(price)?percentCost(price,rate):0;if(!p)$('pCost').value=(cost/100).toFixed(2);$('pCostHint').textContent=`${p?'下次采购参考成本':'采购成本'} = 售价 × ${rateLabel(rate)}，单件 ${yuan(cost)}。`;
 }
 $('pPrice').addEventListener('input',preview);$('pCostRate').onchange=preview;wireOptionCreation('pCostRate','rate',preview);wireProductScanner(id);preview();
 wireForm(()=>{
  if(coverEditor.busy())fail('请等待封面处理完成');const values={cover:coverEditor.value(),name:$('pName').value.trim(),sku,code:$('pCode').value.trim(),category:p?.category||UNSELECTED,price:$('pPrice').value.trim()===''?0:moneyInput('pPrice'),min:p?.min??0};
  if(!values.name||!values.code)fail('请填写名称并手动或扫码输入编码');if(activeProducts().some(x=>x.id!==id&&x.code===values.code))fail('商品编码已存在');
  const keep=$('pCostRate').value===''||values.price===0,rate=keep?undefined:Number($('pCostRate').value);if(!keep&&!state.costRates.includes(rate))fail('请选择有效的成本比例');const cost=p?product(id).cost:keep?moneyInput('pCost',true):percentCost(values.price,rate),stock=p?inventoryQtyInput('pStock',true):qtyInput('pStock',true);
  if(transact(s=>{if(p){const item=s.products.find(x=>x.id===id),before=item.stock;Object.assign(item,values);item.stock=stock;if(keep)delete item.costRate;else item.costRate=rate;const delta=stock-before;if(delta)addMovement(s,item,delta,delta>0?'编辑入库':'编辑出库','编辑商品库存');}else{const item={id:uid(),...values,cost,stock,symbol:'◇',tint:'#e8eee4',art:'#6f9c66'};if(!keep)item.costRate=rate;s.products.push(item);if(stock)addMovement(s,item,stock,'期初库存','新建商品');}const subtotal=s.cart.reduce((a,l)=>a+cartUnitPrice(l,s.products.find(p=>p.id===l.productId))*l.qty,0);s.discount=Math.min(s.discount,subtotal);})){category='全部';$('dialog').close();render();toast('商品已保存');}
 });
}
function coverEditorMarkup(){return `<div id="pCoverPanel" class="cover-editor"><div class="cover-thumb"><img id="pCoverPreview" alt="商品封面预览" hidden><span id="pCoverPlaceholder">▧<small>商品封面</small></span></div><div class="cover-controls"><b>商品封面 <small>可选</small></b><div class="cover-buttons"><button type="button" class="secondary" id="pCoverPhoto">◉ 拍照</button><button type="button" id="pCoverChoose">选择图片</button><button type="button" class="danger" id="pCoverRemove" hidden>移除</button></div><small id="pCoverStatus" role="status">上传和拍照自动压缩至 60KB 以内，保存后随商品同步。</small></div><input id="pCoverFile" type="file" accept="image/*" hidden><input id="pCoverCapture" type="file" accept="image/*" capture="environment" hidden></div>`;}
// JPEG remains compatible with the local ledger, NAS and older clients.
function coverBytes(data){const b=data.slice(data.indexOf(',')+1);return b.length*3/4-(b.endsWith('==')?2:b.endsWith('=')?1:0);}
function coverSize(bytes){return (bytes/1024).toFixed(1)+' KB';}
async function compressCover(source,width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)fail('图片尺寸无效');
 const limit=60*1024,scale=Math.min(1,640/Math.max(width,height)),canvas=document.createElement('canvas');
 let w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
 try{
  for(let size=0;size<12;size++){
   canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)fail('无法处理图片');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,w,h);
   for(const quality of [.82,.72,.62,.52]){
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片压缩失败')),'image/jpeg',quality));
    if(blob.type!=='image/jpeg')fail('当前设备不支持 JPEG 压缩');
    if(blob.size<=limit)return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('读取压缩图片失败'));reader.readAsDataURL(blob);});
   }
   w=Math.max(1,Math.floor(w*.8));h=Math.max(1,Math.floor(h*.8));
  }
  fail('图片压缩失败，请选择其他照片');
 }finally{canvas.width=canvas.height=1;}
}
function mountCoverEditor(initial){
 const root=$('pCoverPanel');let cover=initial,busy=false,revision=0;
 const active=()=>root.isConnected&&$('dialog').open;
 function show(){if(!active())return;$('pCoverPreview').hidden=!cover;$('pCoverPlaceholder').hidden=!!cover;$('pCoverRemove').hidden=!cover;if(cover)$('pCoverPreview').src=cover;else $('pCoverPreview').removeAttribute('src');}
 async function choose(file){if(!file)return;const token=++revision;busy=true;$('pCoverStatus').textContent='正在处理封面…';let url;
  try{if(file.size>20*1024*1024)fail('图片超过 20MB，请选择较小的照片');if(file.type&&!file.type.startsWith('image/'))fail('请选择图片文件');url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();if(!active()||token!==revision)return;if(image.naturalWidth*image.naturalHeight>40000000)fail('图片尺寸过大，请先缩小照片');const compressed=await compressCover(image,image.naturalWidth,image.naturalHeight);if(!active()||token!==revision)return;cover=compressed;show();const bytes=coverBytes(cover);$('pCoverStatus').textContent='封面已压缩：'+coverSize(file.size)+' → '+coverSize(bytes)+(bytes<file.size?'，减少 '+Math.round((1-bytes/file.size)*100)+'%':'')+'。保存商品后生效。';}
  catch(e){if(active()&&token===revision)$('pCoverStatus').textContent=/20MB|尺寸过大|图片文件/.test(e.message)?e.message:'照片无法读取，请换用 JPG、PNG 或 WebP 图片';}
  finally{if(url)URL.revokeObjectURL(url);if(token===revision)busy=false;}
 }
 $('pCoverChoose').onclick=()=>$('pCoverFile').click();for(const id of ['pCoverFile','pCoverCapture'])$(id).onchange=e=>{const file=e.target.files[0];e.target.value='';choose(file)};
 $('pCoverRemove').onclick=()=>{revision++;busy=false;cover='';show();$('pCoverStatus').textContent='封面已移除，保存商品后生效。';};
 $('pCoverPhoto').onclick=()=>openCoverCamera(value=>{if(!active())return;revision++;busy=false;cover=value;show();$('pCoverStatus').textContent='照片已压缩：'+coverSize(coverBytes(value))+'。保存商品后生效。';},()=>{if(active())$('pCoverCapture').click();});
 show();return {value:()=>cover,busy:()=>busy};
}
function openCoverCamera(onPhoto,fallback){
 const camera=document.createElement('dialog');camera.id='coverCameraDialog';camera.setAttribute('aria-labelledby','coverCameraTitle');camera.innerHTML=`<div class="dialog-head"><h2 id="coverCameraTitle">拍摄商品封面</h2><button type="button" class="icon-button" id="coverCameraClose" aria-label="关闭拍照">×</button></div><div class="cover-camera-view"><video id="coverCameraVideo" autoplay playsinline muted></video></div><p id="coverCameraStatus" class="hint" role="status">正在开启相机，请允许相机权限。</p><div class="form-actions"><button type="button" id="coverCameraFallback">手机拍照 / 选择照片</button><button type="button" class="primary" id="coverCameraShutter" disabled>拍摄并使用</button></div>`;document.body.append(camera);camera.showModal();const video=camera.querySelector('video'),message=camera.querySelector('#coverCameraStatus'),shutter=camera.querySelector('#coverCameraShutter');let stream,closed=false;
 function dispose(){closed=true;stream?.getTracks().forEach(t=>t.stop());video.pause();video.srcObject=null;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',close);}
 function close(){dispose();if(camera.open)camera.close();}
 function visibility(){if(document.hidden)close();}
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',close);camera.addEventListener('cancel',dispose);camera.addEventListener('close',()=>{dispose();camera.remove();},{once:true});camera.querySelector('#coverCameraClose').onclick=close;camera.querySelector('#coverCameraFallback').onclick=()=>{close();fallback();};
 shutter.onclick=async()=>{if(shutter.disabled)return;shutter.disabled=true;message.textContent='正在压缩照片…';const frame=document.createElement('canvas');try{if(!video.videoWidth||!video.videoHeight)fail('摄像头画面尚未就绪');const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));frame.width=Math.max(1,Math.round(video.videoWidth*scale));frame.height=Math.max(1,Math.round(video.videoHeight*scale));frame.getContext('2d').drawImage(video,0,0,frame.width,frame.height);const photo=await compressCover(frame,frame.width,frame.height);if(closed)return;close();onPhoto(photo);}catch(e){if(!closed)message.textContent=e.message;}finally{frame.width=frame.height=1;if(!closed)shutter.disabled=false;}};
 (async()=>{try{if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)fail('当前环境无法开启摄像头，请选择照片或使用手机拍照。');const acquired=await window.POSCamera.stream();if(closed||!camera.open){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;video.srcObject=stream;await video.play();if(closed)return;shutter.disabled=false;message.textContent='将商品封面放入画面，点击「拍摄并使用」。';}catch(e){stream?.getTracks().forEach(t=>t.stop());if(!closed)message.textContent=e.name==='NotAllowedError'?'摄像头权限被拒绝，可使用手机拍照或选择照片。':e.name==='NotFoundError'?'未找到摄像头，可使用手机拍照或选择照片。':'摄像头不可用，可使用手机拍照或选择照片。';}})();
}
function stockDialog(id){
 if(!activeProducts().length){toast('请先新建商品');return;}
 modal('记录出入库',`<form><div class="form-grid"><div class="field full"><label for="stockProduct">商品</label><select id="stockProduct">${activeProducts().map(p=>`<option value="${p.id}" ${p.id===id?'selected':''}>${esc(p.name)} · 当前 ${p.stock} 件</option>`).join('')}</select></div>${selectField('操作类型','stockType',['采购入库','手动出库','盘点调整'])}${field('数量（盘点时填写实际库存）','stockQty','','number','required min="0" step="1"')}<div id="stockRateField">${optionSelect('采购成本比例','stockRate',state.costRates.map(r=>({value:r,label:rateLabel(r)})),'','rate')}</div>${field('入库单件成本（元）','stockCost','','number','min="0" step="0.01"')}${field('说明 / 供应商','stockNote','','text','required maxlength="200"')}</div><p class="hint" id="stockCostHint"></p>${actions('确认并记录')}</form>`);
 const costField=$('stockCost').closest('.field');
 function updateCost(){const p=product($('stockProduct').value);if(!p.price){$('stockRate').value='';$('stockRate').disabled=true;}else $('stockRate').disabled=false;const manual=$('stockRate').value===''||p.price===0;$('stockCost').readOnly=!manual;if(!manual)$('stockCost').value=(percentCost(p.price,Number($('stockRate').value))/100).toFixed(2);$('stockCostHint').textContent=$('stockType').value==='采购入库'?(manual?'未选择比例，请填写实际单件采购成本，入库后自动更新平均成本。':`单件采购成本 = 售价 ${yuan(p.price)} × ${rateLabel(Number($('stockRate').value))}。入库后自动更新平均成本。`):'手动出库和盘点不会产生收款记录。';}
 function chooseDefault(){const p=product($('stockProduct').value);$('stockRate').value=p.costRate===undefined?'':String(p.costRate);$('stockCost').value='';updateCost();}
 function sync(){const purchase=$('stockType').value==='采购入库';costField.hidden=$('stockRateField').hidden=!purchase;$('stockCost').required=purchase;$('stockQty').min=$('stockType').value==='盘点调整'?'0':'1';updateCost();}
 chooseDefault();sync();$('stockType').onchange=sync;$('stockProduct').onchange=chooseDefault;$('stockRate').onchange=updateCost;wireOptionCreation('stockRate','rate',updateCost);
 wireForm(()=>{const type=$('stockType').value,qty=qtyInput('stockQty',type==='盘点调整'),cost=type==='采购入库'?moneyInput('stockCost',true):0,note=$('stockNote').value.trim(),pid=$('stockProduct').value;if(!note)fail('请填写出入库说明');if(transact(s=>{const p=s.products.find(p=>p.id===pid),delta=type==='采购入库'?qty:type==='手动出库'?-qty:qty-p.stock;if(type==='手动出库'&&p.stock+delta<0)fail('库存不足，不能手动出库');if(delta===0)fail('库存未发生变化');if(type==='采购入库')p.cost=receivedCost(p.stock,p.cost,qty,cost);p.stock+=delta;addMovement(s,p,delta,type,note);})){ $('dialog').close();toast('库存与流水已更新');}});
}

function stocktakeDialog(){
 POSAuth.requireAdmin();
 const products=activeProducts().slice().sort(productNameCompare);
 if(!products.length){toast('请先新建商品');return;}
 const rows=products.map(p=>({productId:p.id,name:p.name,sku:p.sku,cover:p.cover||'',before:p.stock,after:Math.max(0,p.stock),unitCost:p.cost}));
 modal('新建盘库单',`<form class="stocktake-form"><p class="hint">填写实盘数量后，系统会直接更新当前店铺库存，并按商品成本计算金额差异。未修改的商品也会保存在盘库表中。</p>${field('盘库说明','stocktakeNote','定期盘库 '+day(),'text','required maxlength="200"')}<div class="table-wrap stocktake-editor"><table><thead><tr><th>商品 / SKU</th><th>账面数量</th><th>实盘数量</th><th>数量差异</th><th>商品成本</th><th>金额差异</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td><div class="inventory-product stocktake-product"><span class="inventory-thumb">${r.cover?`<img src="${esc(r.cover)}" alt="${esc(r.name)}封面">`:'◇'}</span><span><b>${esc(r.name)}</b><small>SKU ${esc(r.sku)}</small></span></div></td><td>${r.before}</td><td><input class="stocktake-qty" data-stocktake-index="${i}" type="number" min="0" max="1000000000" step="1" value="${r.after}" aria-label="${esc(r.name)}实盘数量" required></td><td data-stocktake-delta="${i}">0</td><td>${yuan(r.unitCost)}</td><td data-stocktake-amount="${i}">${yuan(0)}</td></tr>`).join('')}</tbody></table></div><div class="stocktake-summary"><span>变动商品 <b id="stocktakeChanged">0</b> 件</span><span>数量差异 <b id="stocktakeQtyDiff">0</b></span><span>金额差异 <b id="stocktakeAmountDiff">${yuan(0)}</b></span></div>${actions('确认盘库并更新库存')}</form>`);
 function calculate(){let changed=0,qtyDiff=0,amountDiff=0;for(const [i,r] of rows.entries()){const input=document.querySelector(`[data-stocktake-index="${i}"]`),deltaCell=document.querySelector(`[data-stocktake-delta="${i}"]`),amountCell=document.querySelector(`[data-stocktake-amount="${i}"]`),valid=/^\d+$/.test(input.value)&&integer(Number(input.value)),after=valid?Number(input.value):r.before,delta=after-r.before,amount=delta*r.unitCost;if(delta)changed++;qtyDiff+=delta;amountDiff+=amount;deltaCell.textContent=signedQty(delta);amountCell.textContent=signedYuan(amount);deltaCell.classList.toggle('negative-stock',delta<0);amountCell.classList.toggle('negative-stock',amount<0);}$('stocktakeChanged').textContent=changed;$('stocktakeQtyDiff').textContent=signedQty(qtyDiff);$('stocktakeAmountDiff').textContent=signedYuan(amountDiff);}
 document.querySelectorAll('[data-stocktake-index]').forEach(input=>input.addEventListener('input',calculate));calculate();
 wireForm(()=>{POSAuth.requireAdmin();const note=$('stocktakeNote').value.trim();if(!note)fail('请填写盘库说明');const counted=rows.map((r,i)=>{const input=document.querySelector(`[data-stocktake-index="${i}"]`);if(!/^\d+$/.test(input.value)||!integer(Number(input.value)))fail('实盘数量必须为非负整数');return {...r,after:Number(input.value)};});if(transact(s=>{POSAuth.requireAdmin();const id=uid(),now=new Date().toISOString(),actor=POSAuth.actor(),lines=[];let qtyDiff=0,amountDiff=0;for(const row of counted){const p=s.products.find(p=>p.id===row.productId);if(!p||p.deleted)fail('商品已被删除，请重新盘库');if(p.stock!==row.before||p.cost!==row.unitCost)fail('库存或成本已变化，请重新盘库');const delta=row.after-row.before,amount=delta*row.unitCost;if(Math.abs(delta)>1000000000)fail('数量差异超出范围');if(!Number.isSafeInteger(amount))fail('金额差异超出范围');p.stock=row.after;const {cover,...line}=row;lines.push({...line,delta,amountDiff:amount});qtyDiff+=delta;amountDiff+=amount;if(delta)addMovement(s,p,delta,'盘库调整','盘库单 '+id+' · '+note);}if(!Number.isSafeInteger(qtyDiff)||!Number.isSafeInteger(amountDiff))fail('盘库汇总超出范围');s.stocktakes.push({id,time:now,note,actor,lines,qtyDiff,amountDiff});})){ $('dialog').close();page='movements';render();toast('盘库完成，库存和盘库数据表已更新');}});
}
