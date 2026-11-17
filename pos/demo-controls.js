(() => {
  const demo = POSDemo.active;
  if(demo)page='settings';
  let taps = 0, started = 0;
  document.addEventListener('click', event => {
    if (demo || page !== 'settings' || !POSAuth.isAdmin() || !event.target.closest('.settings-intro')) {
      taps = 0;
      return;
    }
    if (!taps || performance.now() - started > 3500) {
      started = performance.now();
      taps = 0;
    }
    if (++taps === 5) guarded(POSDemo.enter);
  });
  if (!demo) return;

  const strip = document.createElement('section');
  strip.className = 'trial-strip';
  strip.innerHTML = '<b>内部演示</b><button id="generateTrial" class="primary">生成演示销售</button><button id="trialClear">按日清空</button><button id="exitTrial">返回入口</button>';
  const baseRender = render;
  render = function () {
    baseRender();
    if(page==='settings' && POSAuth.isAdmin()) document.querySelector('.settings-intro')?.after(strip);
  };
  render();
  const style = document.createElement('style');
  style.textContent = '.trial-strip{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px clamp(12px,3vw,40px);background:#edf1ff;color:#354981}.trial-strip b{margin-right:auto}.trial-strip button{min-height:38px}.trial-products{display:grid;gap:8px}.trial-product{padding:12px;border:1px solid #e0e5f0;border-radius:12px}.trial-product-heading{display:flex;align-items:center;gap:10px;margin-bottom:10px}.trial-product-heading span{min-width:0;overflow-wrap:anywhere}.trial-product-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.trial-product-fields label{font-size:12px;min-width:0}.trial-product-fields input{margin-top:6px}.trial-product:has(input[type=checkbox]:not(:checked)) .trial-product-fields{opacity:.55}@media(max-width:600px){.trial-product-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}.trial-product input{min-width:0;width:100%}.trial-product input[type=checkbox]{width:18px}.trial-product small{display:block;color:#63718b}.auth-locked .trial-strip{display:none}';
  document.head.append(style);
  strip.querySelector('#exitTrial').onclick = () => POSDemo.exit();
  strip.querySelector('#generateTrial').onclick = () => guarded(openGenerator);
  strip.querySelector('#trialClear').onclick = () => guarded(openClear);

  function openClear(){
    POSAuth.requireAdmin();
    modal('清空指定日期的生成数据','<form>'+field('销售日期','clearDate',day(),'date','required')+'<p id="clearSummary"></p>'+actions('确认清空')+'</form>');
    const selected=()=>state.orders.filter(o=>o.id.startsWith('DEMO-')&&day(new Date(o.time))===$('clearDate').value);
    const preview=()=>{const orders=selected();$('clearSummary').textContent=state.store+' · '+orders.length+' 笔自动生成的小票。将一并移除关联退款和库存流水，退回尚未退款的商品数量。';$('dialogBody').querySelector('[type=submit]').disabled=!orders.length;};
    $('clearDate').oninput=preview;preview();
    wireForm(()=>{
      POSAuth.requireAdmin();
      const ids=new Set(selected().map(o=>o.id));
      if(!ids.size)return;
      if(!transact(s=>{
        const shop=s.shops.find(b=>b.id===s.activeShopId);
        const removed=shop.deletedRecords||=[];
        s.orders=s.orders.filter(o=>{
          if(!ids.has(o.id))return true;
          o.lines.forEach((l,i)=>{s.products.find(p=>p.id===l.productId).stock+=l.qty-returnedQty(o,i);});
          removed.push({kind:'order',id:o.id});return false;
        });
        s.movements=s.movements.filter(m=>{
          if(!['销售出库','销售退货'].includes(m.type)||!ids.has(m.note.split(' · ')[0]))return true;
          removed.push({kind:'movement',id:m.id,productId:m.productId,delta:m.delta,time:m.time,...(m.unitCost===undefined?{}:{unitCost:m.unitCost})});return false;
        });
      },false))return;
      $('dialog').close();render();toast('已清空 '+ids.size+' 笔生成的小票');
    });
  }

  function openGenerator() {
    POSAuth.requireAdmin();
    const products = activeProducts();
    if (!products.length) fail('请先添加演示商品');
    const rows = products.map((p,i) => `<div class="trial-product"><label class="trial-product-heading"><input type="checkbox" aria-label="选择 ${esc(p.name)}" data-pick="${i}" ${i<3?'checked':''}><span>${esc(p.name)}<small>库存 ${p.stock}</small></span></label><div class="trial-product-fields"><label>销售总数量<input type="number" id="total${i}" value="5" min="1" max="1000" step="1" required></label><label>每单最少<input type="number" id="min${i}" value="1" min="1" max="1000" step="1" required></label><label>每单最多<input type="number" id="max${i}" value="3" min="1" max="1000" step="1" required></label><label>单价（元）<input type="number" id="price${i}" value="${(p.price/100).toFixed(2)}" min=".01" step=".01" required></label></div></div>`).join('');
    modal('生成演示销售', `<form><p>${esc(state.store)} · 时间按北京时间生成</p><div class="form-grid">${field('销售日期','trialDate',day(),'date','required')}${field('开始时间','trialStart','09:00','time','required')}${field('结束时间','trialEnd','18:00','time','required')}<label class="field">收款方式<select id="trialPayment"><option>已收款</option><option>现金</option></select></label></div><p>逐个商品设置总销量，每笔随机销售一种商品，数量在设定范围内。最少和最多相同时，每单使用固定数量。</p><div class="trial-products">${rows}</div><p id="trialSummary" class="hint"></p><p class="hint">每次合计最多生成 1000 件；生成后增加演示小票，并扣减对应演示库存。无法按范围凑足总数量时会提示调整。</p>${actions('生成销售')}</form>`);
    function summary(){
      let total=0,count=0;
      for(const [i] of products.entries()){
        const checked=$('dialogBody').querySelector('[data-pick="'+i+'"]').checked;
        for(const id of ['total','min','max','price'])$(id+i).disabled=!checked;
        if(checked){count++;total+=Number($('total'+i).value)||0;}
      }
      $('trialSummary').textContent='已选 '+count+' 种商品，合计 '+total+' 件';
    }
    $('dialogBody').querySelector('form').addEventListener('input',summary);summary();
    wireForm(() => {
      POSAuth.requireAdmin();
      const selectedDate = $('trialDate').value;
      const date = new Date(selectedDate+'T00:00:00+08:00');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)||!Number.isFinite(date.getTime())||day(date)!==selectedDate)fail('请选择有效的销售日期');
      const stamp = id => Date.parse(selectedDate+'T'+$(id).value+':00+08:00');
      const start = stamp('trialStart'), end = stamp('trialEnd');
      if (!Number.isFinite(start+end) || end<start) fail('结束时间须在开始时间之后或相同');
      const choices = [...document.querySelectorAll('[data-pick]:checked')].map(el=>{
        const i=el.dataset.pick, total=Number($('total'+i).value), min=Number($('min'+i).value), max=Number($('max'+i).value), price=moneyInput('price'+i);
        const name=products[i].name;
        if(!Number.isInteger(total)||total<1||total>1000)fail(name+'：销售总数量须为 1–1000 的整数');
        if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>1000)fail(name+'：每单数量范围须为 1–1000 的整数，最多不能小于最少');
        if(Math.ceil(total/max)>Math.floor(total/min))fail(name+'：当前范围无法凑足销售总数量，请调整总数量或范围');
        return {id:products[i].id,total,min,max,price};
      });
      if (!choices.length) fail('请选择至少一种商品');
      const total=choices.reduce((n,c)=>n+c.total,0);
      if(total>1000)fail('本次合计销售数量不能超过 1000 件');
      const random=(min,max)=>min+Math.floor(Math.random()*(max-min+1));
      const plan=[];
      for(const choice of choices){
        // Select a feasible order count, then keep every random batch within range
        // while reserving enough quantity for the remaining orders.
        let count=random(Math.ceil(choice.total/choice.max),Math.floor(choice.total/choice.min)),left=choice.total;
        while(count){
          const qty=random(Math.max(choice.min,left-(count-1)*choice.max),Math.min(choice.max,left-(count-1)*choice.min));
          plan.push({id:choice.id,price:choice.price,qty,time:new Date(random(start,end)).toISOString()});
          left-=qty;count--;
        }
      }
      plan.sort((a,b)=>a.time.localeCompare(b.time));
      const payment = $('trialPayment').value;
      if (!transact(s=>{
        for (const row of plan) {
          const p = s.products.find(product=>product.id===row.id && !product.deleted);
          if (!p) fail('商品已变更，请重新选择');
          const id = 'DEMO-'+uid(), amount = row.qty*row.price;
          const line = {productId:p.id,name:p.name,sku:p.sku,code:p.code,qty:row.qty,price:row.price,cost:p.cost};
          s.orders.push({id,time:row.time,actor:POSAuth.actor(),lines:[line],total:amount,discount:0,cost:p.cost*row.qty,payment,cashReceived:amount,change:0,refunded:false});
          p.stock -= row.qty;
          addMovement(s,p,-row.qty,'销售出库',id);
          s.movements.at(-1).time = row.time;
        }
      },false)) return;
      $('dialog').close();
      reportFrom = reportTo = selectedDate;
      page = 'reports';
      render();
      toast('已生成 '+plan.length+' 笔演示销售，共 '+total+' 件');
    });
  }
})();
