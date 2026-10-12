/* Loyverse product CSV import. No ledger changes before confirmation. */
window.POSLoyverseImport=(()=>{
 const norm=s=>String(s??'').replace(/^\uFEFF/,'').trim().toLowerCase();
 function csv(text){
  const rows=[];let row=[],cell='',quoted=false,closed=false;
  function push(){row.push(cell);cell='';closed=false;}
  for(let i=0;i<text.length;i++){
   const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
   if(c===','){push();continue;}if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;push();if(row.some(v=>v.trim()))rows.push(row);row=[];continue;}
   if(c==='"'&&!cell&&!closed){quoted=true;continue;}if(closed||c==='"')throw Error('CSV 引号格式不正确');cell+=c;
  }
  if(quoted)throw Error('CSV 引号未闭合');push();if(row.some(v=>v.trim()))rows.push(row);return rows;
 }
 function schema(text){const rows=csv(text.replace(/^\uFEFF/,''));if(rows.length<2)throw Error('CSV 中没有商品');const headers=rows[0].map(norm),stores=[];for(const h of rows[0]){const m=h.trim().match(/^(?:Price|In stock|Low stock|Available for sale)\s*\[(.+)\]$/i);if(m&&!stores.includes(m[1]))stores.push(m[1]);}return {rows,headers,stores};}
 function number(raw,label,money=false){const s=String(raw).trim();if(s.toLowerCase()==='variable')throw Error(label+'为浮动价格，请先设置固定售价');if(s.startsWith('-'))throw Error(label+'为负数，请先核对');if(!/^\d+(\.\d+)?$/.test(s))throw Error(label+'无效');const n=Number(s),v=money?Math.round(n*100):n;if(!Number.isSafeInteger(v)||v<0||v>1e9||(money&&Math.abs(n*100-v)>0.00001))throw Error(label+(money?'最多两位小数':'必须为非负整数'));return v;}
 function prepare(text,source){
  const {rows,headers,stores}=schema(text);if(stores.length>1&&!source)throw Error('请选择 CSV 来源店铺');source=source||stores[0]||'';if(source&&!stores.includes(source))throw Error('来源店铺不存在');
  const find=(...names)=>{for(const n of names){const i=headers.indexOf(norm(n));if(i>=0)return i;}return -1;};
  const ix={name:find('Name','Item name','商品名称'),sku:find('SKU'),code:find('Barcode','条码','商品编码'),category:find('Category','分类'),price:find('Price','售价','销售价格'),defaultPrice:find('Default price'),cost:find('Cost','成本','采购成本'),stock:find('In stock','Current quantity','库存','当前库存'),min:find('Low stock','低库存提醒'),weight:find('Sold by weight'),included:find('SKU of included item')};
  if(source){ix.price=find(`Price [${source}]`);ix.stock=find(`In stock [${source}]`);ix.min=find(`Low stock [${source}]`);}
  if(ix.name<0)throw Error('未找到商品名称列');if(ix.price<0&&ix.defaultPrice<0)throw Error('未找到售价列');
  const codes=new Set(activeProducts().map(p=>p.code)),skus=new Set(state.products.map(p=>p.sku)),items=[],errors=[],warnings=[];
  for(let n=1;n<rows.length;n++){
   const r=rows[n],v=k=>ix[k]>=0?String(r[ix[k]]??'').trim():'';
   try{
    if(r.length!==headers.length)throw Error('列数与表头不一致');if(!v('name'))throw Error('商品名称为空');if(v('name').length>200)throw Error('商品名称过长');
    if(/^(y|yes|true|1)$/i.test(v('weight')))throw Error('暂不支持称重商品');if(v('included'))throw Error('暂不支持组合商品');
    const rawPrice=v('price')||v('defaultPrice'),price=!rawPrice||rawPrice.toLowerCase()==='variable'?0:number(rawPrice,'售价',true),cost=number(v('cost')||'0','成本',true),stock=number(v('stock')||'0','库存'),min=number(v('min')||'0','库存提醒');
    let sku=v('sku');const code=v('code')||sku;if(!code||code.length>80||/[\u0000-\u001f\u007f]/.test(code))throw Error('条码和 SKU 均为空或编码无效');if(codes.has(code))throw Error('商品编码重复，已跳过');
    if(!sku||skus.has(sku)){sku=newSku([...state.products,...items],state.nextSku);warnings.push(`第 ${n+1} 行重新分配 SKU：${sku}`);}if(sku.length>100||(/^\d+$/.test(sku)&&Number(sku)>=1e9))throw Error('SKU 超出支持范围');
    if(!v('code'))warnings.push(`第 ${n+1} 行条码为空，使用原 SKU 作为商品编码`);
    const category=state.categories.includes(v('category'))?v('category'):UNSELECTED;
    items.push({name:v('name'),code,sku,category,price,cost,stock,min,symbol:'◇',tint:'#e8eee4',art:'#6f9c66'});codes.add(code);skus.add(sku);
   }catch(e){errors.push(`第 ${n+1} 行「${v('name')}」：${e.message}`);}
  }
  return {items,errors,warnings,total:rows.length-1,source};
 }
 async function open(file){
  if(!file)return;POSAuth.requireAdmin();if(file.size>10*1024*1024)throw Error('CSV 文件超过 10MB');const text=await file.text();POSAuth.requireAdmin();const {stores}=schema(text),target=state.activeShopId,before=ledgerRaw,account=POSAuth.user().id;
  const preview=source=>{
   const prepared=prepare(text,source);
   modal('导入 Loyverse 商品',`<p>来源：${esc(prepared.source||'商品列表')} → 当前店铺：${esc(state.store)}</p><p class="hint">新增 ${prepared.items.length} 件，跳过 ${prepared.errors.length} 行。库存仅导入当前店铺；其他店铺新商品库存为 0。已有商品不覆盖，未知分类归入「未选择」。</p><div class="table-wrap"><table><thead><tr><th>名称 / 编码 / SKU</th><th>售价</th><th>成本</th><th>库存</th></tr></thead><tbody>${prepared.items.slice(0,50).map(p=>`<tr><td>${esc(p.name)}<small>${esc(p.code)} / ${esc(p.sku)}</small></td><td>${p.price?yuan(p.price):'收款时定价'}</td><td>${yuan(p.cost)}</td><td>${p.stock}</td></tr>`).join('')}</tbody></table></div>${prepared.items.length>50?'<p>预览前 50 件，其余商品一并导入。</p>':''}<div class="hint">${[...prepared.errors,...prepared.warnings].map(esc).join('<br>')}</div><form>${actions('确认导入')}</form>`);
   $('dialogBody').querySelector('[type=submit]').disabled=!prepared.items.length;
   wireForm(()=>{POSAuth.requireAdmin();if(POSAuth.user().id!==account||state.activeShopId!==target||ledgerRaw!==before)fail('账号、店铺或账本已变化，请重新选择 CSV');if(!prepared.items.length)fail('没有可导入的商品');if(transact(s=>{for(const data of prepared.items){const p={...data,id:uid()};s.products.push(p);if(p.stock)addMovement(s,p,p.stock,'期初库存','Loyverse 商品导入');}},false)){$('dialog').close();render();toast(`已导入 ${prepared.items.length} 件商品`);}});
  };
  if(stores.length>1){modal('选择 CSV 来源店铺',`<form><p>请选择要导入到「${esc(state.store)}」的来源店铺。将使用该店铺的售价和库存。</p><div class="field"><label for="loyverseSource">CSV 来源店铺</label><select id="loyverseSource">${stores.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></div>${actions('预览商品')}</form>`);wireForm(()=>{POSAuth.requireAdmin();const source=$('loyverseSource').value;$('dialog').close();preview(source);});}else preview(stores[0]);
 }
 function wirePanel(){const b=$('loyverseImport'),input=$('loyverseImportFile');if(!b||!input)return;b.onclick=()=>guarded(()=>{POSAuth.requireAdmin();input.click();});input.onchange=e=>{const file=e.target.files[0];e.target.value='';open(file).catch(e=>toast('无法读取商品 CSV：'+e.message));};}
 return {wirePanel,open,prepare,schema};
})();
