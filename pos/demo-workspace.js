/* An authenticated administrator can switch this tab to a separate local ledger. */
window.POSDemo = (() => {
  const ledgerKey = 'TCGshop-POS-ledger-v1';
  const accountsKey = 'TCGshop-POS-accounts-v1';
  const loginKey = 'TCGshop-POS-device-session-v1';
  const marker = 'TCGshop-POS-active-demo';
  const prefix = 'TCGshop-demo:';
  function authorized() {
    const login = JSON.parse(localStorage.getItem(loginKey) || 'null');
    const accounts = JSON.parse(localStorage.getItem(accountsKey) || 'null');
    return accounts?.users.find(u => u.enabled && u.role === 'admin' &&
      u.id === login?.id && u.salt === login.stamp && u.id === sessionStorage.getItem(marker));
  }
  let active = false;
  try { active = !!sessionStorage.getItem(marker) && !!authorized(); } catch {}
  function exit() {
    sessionStorage.removeItem(marker);
    location.reload();
  }
  function checkAccess() {
    if (active && !authorized()) { exit(); throw Error('请重新登录管理员账号'); }
  }
  if(active) {
    window.addEventListener('storage', e => {
      if(!e.key || [accountsKey,loginKey].includes(e.key)) checkAccess();
    });
    window.addEventListener('pageshow',checkAccess);
  }

  function catalogInto(target, source) {
    const incoming = new Set(source.products.filter(p=>!p.deleted).map(p=>p.sku));
    for (const p of target.products) if(!incoming.has(p.sku)) p.deleted=true;
    const bySku = new Map(target.products.map(p=>[p.sku,p]));
    for (const original of source.products.filter(p=>!p.deleted)) {
      let p = bySku.get(original.sku);
      if (!p) {
        p = {id:uid(), stock:0, cost:original.catalogCost ?? original.cost};
        target.products.push(p);
      }
      for(const key of ['name','sku','code','price','catalogCost','min','category','cover','symbol','art','tint','costRate']){
        if(original[key]===undefined)delete p[key];else p[key]=original[key];
      }
      p.deleted=false;
    }
    for (const shop of source.shops) {
      const old = target.shops.find(s=>s.id===shop.id);
      if(old) old.name=shop.name;
      else target.shops.push({id:shop.id,name:shop.name,demo:false,inventory:{},orders:[],movements:[],expenses:[],stocktakes:[]});
      if(shop.id===target.activeShopId)target.store=shop.name;
    }
    target.categories=[...source.categories];
    target.costRates=[...source.costRates];
    target.nextSku=Math.max(target.nextSku,source.nextSku);
    target.cart=target.cart.filter(l=>target.products.some(p=>p.id===l.productId&&!p.deleted));
    target.discount=Math.min(target.discount,target.cart.reduce((sum,l)=>sum+l.qty*cartUnitPrice(l,target.products.find(p=>p.id===l.productId)),0));
  }
  function enter() {
    const user=POSAuth.requireAdmin();
    if(readOnly || POSSync.isBusy())throw Error('请等待本机账本可用后重试');
    const saved=localStorage.getItem(prefix+ledgerKey);
    let target;
    if(saved)target=validate(JSON.parse(saved));
    else {
      target=validate(initial());
      target.products=[];target.orders=[];target.movements=[];target.demo=false;
      target.shops=[];target.activeShopId=state.activeShopId;
    }
    catalogInto(target,state);
    target.workspaceKind="internal-demo";
    POSSyncCore.capture(target);
    validate(target);
    localStorage.setItem(prefix+ledgerKey,POSAssets.serialize(target));
    let accounts=JSON.parse(localStorage.getItem(prefix+accountsKey)||'{"version":1,"users":[]}');
    accounts.users=accounts.users.filter(u=>u.id!==user.id && u.username!==user.username);
    accounts.users.push({...user});
    localStorage.setItem(prefix+accountsKey,JSON.stringify(accounts));
    localStorage.setItem(prefix+loginKey,JSON.stringify({id:user.id,stamp:user.salt}));
    sessionStorage.setItem(marker,user.id);
    location.reload();
  }
  function localSync() {
    const noop=()=>{};
    async function restoreLedger(ledger){
      return (await POSAssets.hydrate({ledger},()=>{throw Error('本机缺少封面，请先同步正式店铺');})).ledger;
    }
    let lastRaw=localStorage.getItem(ledgerKey);
    async function run(){
      checkAccess();
      const raw=localStorage.getItem(ledgerKey);
      if(!raw || raw===lastRaw)return;
      const source=await restoreLedger(validate(JSON.parse(raw)));
      if(transact(s=>catalogInto(s,source),false)){lastRaw=raw;render();}
    }
    function refresh(){run().catch(e=>toast(e.message));}
    async function pickup(body){
      checkAccess();
      let result;
      if(!transact(s=>{
        const payload={schema:POSSyncCore.schema,storeId:'local-demo',accounts:POSAuth.snapshot(),ledger:POSSyncCore.project(s)};
        const store={read:()=>({data:payload}),commit:updated=>{
          s.shops=updated.ledger.shops;s.pickups=updated.ledger.pickups;
          POSSyncCore.activate(s,s.activeShopId,true);
        }};
        result=demoPickupRules(store,{...body,actorId:POSAuth.requireUser().id});
      },false))throw Error(document.getElementById('toast').textContent);
      return result;
    }
    return {restoreLedger,pickup,run,onPage:refresh,onResume:refresh,start:()=>{
      const indicator=document.getElementById('nasIndicator');
      indicator.textContent='本机目录';indicator.onclick=refresh;
    },panel:()=>'',gateControls:()=>'',status:()=>'本机目录',isBusy:()=>false,
      wirePanel:noop,wireGate:noop,changed:noop,onLogin:noop,pause:noop,cancel:noop,receiveNative:noop};
  }
  return {active,prefix:active?prefix:'',enter,exit,localSync};
})();
