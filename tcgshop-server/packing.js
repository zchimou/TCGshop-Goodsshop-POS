'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{promisify}=require('util');
const {readBody}=require('./sync-http'),pickups=require('./pickups'),pickupCore=require('./pickup-core');
const derive=promisify(crypto.pbkdf2),base='/api/packing',cookieName='tcgshop_packing_session';
function createPacking(store){
 const sessions=new Map(),attempts=new Map(),lifetime=8*60*60*1000;let checking=0;
 const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/voucher.js':'voucher.js','/store-logo.svg':'store-logo.svg','/vendor/zxing-browser-0.2.1.min.js':'vendor/zxing-browser-0.2.1.min.js'};
 const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 function send(res,status,data,extra={}){res.writeHead(status,{...common,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(data));}
 function sessionId(req){const c=(req.headers.cookie||'').split(';').find(v=>v.trim().startsWith(cookieName+'='));return c?c.trim().slice(cookieName.length+1):'';}
 function cookie(req,value,age){const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https'||String(req.headers.origin||'').startsWith('https://');return cookieName+'='+value+'; Path='+base+'; HttpOnly; SameSite=Strict; Max-Age='+age+(secure?'; Secure':'');}
 function admin(req){const id=sessionId(req),session=sessions.get(id);if(!session||session.expires<Date.now()){sessions.delete(id);fail('请使用管理员账号登录',401);}const user=store.read().data?.accounts.users.find(u=>u.id===session.userId);if(!user||!user.enabled||user.role!=='admin'||user.hash!==session.hash){sessions.delete(id);fail('管理员权限已变化，请重新登录',401);}return {session,user};}
 function csrf(req,session){if(req.headers['sec-fetch-site']==='cross-site'||req.headers['x-packing-csrf']!==session.csrf)fail('页面验证已失效，请刷新后重试',403);}
 return async function handle(req,res){
  const pathname=String(req.url||'').split('?')[0];if(pathname!==base&&!pathname.startsWith(base+'/'))return false;
  try{
   const suffix=pathname.slice(base.length)||'/';
   if(req.method==='GET'&&assets[suffix]){const name=assets[suffix],mime=name.endsWith('.svg')?'image/svg+xml':name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':'text/html';res.writeHead(200,{...common,'Content-Type':mime+(mime.startsWith('image/')?'':'; charset=utf-8')});res.end(fs.readFileSync(path.join(__dirname,'packing-web',name)));return true;}
   if(suffix==='/login'&&req.method==='POST'){
    if(req.headers['sec-fetch-site']==='cross-site')fail('请从本站登录',403);
    const b=await readBody(req,8192);if(typeof b.username!=='string'||b.username.length>32||typeof b.password!=='string'||b.password.length<8||b.password.length>128)fail('账号或密码不正确',401);
    const username=b.username.normalize('NFKC').trim().toLowerCase(),key=req.socket.remoteAddress+'|'+username,now=Date.now();
    for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);const attempt=attempts.get(key);if(attempt?.count>=8)fail('尝试次数过多，请稍后再登录',429);if(checking>=4)fail('登录繁忙，请稍后重试',429);
    if(attempts.size>=1000&&!attempts.has(key))attempts.delete(attempts.keys().next().value);attempts.set(key,{count:(attempt?.count||0)+1,until:attempt?.until||now+300000});
    const user=store.read().data?.accounts.users.find(u=>u.username.normalize('NFKC').trim().toLowerCase()===username);checking++;
    let actual;try{actual=await derive(b.password,Buffer.from(user?.salt||'0'.repeat(32),'hex'),600000,32,'sha256');}finally{checking--;}
    if(!user||!user.enabled||!crypto.timingSafeEqual(actual,Buffer.from(user.hash,'hex')))fail('账号或密码不正确',401);
    if(user.role!=='admin')fail('此打包页面仅允许管理员账号使用',403);
    attempts.delete(key);for(const [id,s] of sessions)if(s.expires<now)sessions.delete(id);if(sessions.size>=256)sessions.delete(sessions.keys().next().value);
    const id=crypto.randomBytes(32).toString('hex'),session={userId:user.id,hash:user.hash,csrf:crypto.randomBytes(24).toString('hex'),expires:now+lifetime};sessions.set(id,session);
    send(res,200,{user:{id:user.id,name:user.name},csrf:session.csrf},{'Set-Cookie':cookie(req,id,28800)});return true;
   }
   const {session,user}=admin(req);
   const image=/^\/images\/([a-f0-9]{64})$/.exec(suffix);
   if(image&&req.method==='GET'){
    if(!store.read().data.ledger.products.some(p=>!p.deleted&&p.cover==='asset:'+image[1]))fail('商品封面不存在',404);
    const bytes=Buffer.from(store.imageGet(image[1]).split(',')[1],'base64');
    res.writeHead(200,{...common,'Content-Type':'image/jpeg','Content-Length':bytes.length,'Cache-Control':'private, max-age=86400, immutable'});res.end(bytes);return true;
   }
   if(suffix==='/data'&&req.method==='GET'){
    const s=store.read().data.ledger;
    const products=s.products.filter(p=>!p.deleted).map(p=>({sku:p.sku,name:p.name,price:p.price,cover:p.cover?.startsWith('asset:')?base+'/images/'+p.cover.slice(6):'',inventory:Object.fromEntries(s.shops.map(b=>{const stock=b.inventory[p.id].stock,reserved=pickupCore.reserved(s.pickups,b.id,p.sku);return [b.id,{stock,reserved,available:Math.max(0,stock-reserved)}];}))}));
    send(res,200,{user:{id:user.id,name:user.name},csrf:session.csrf,shops:s.shops.map(({id,name})=>({id,name})),products,orders:(s.pickups||[]).slice().sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)).slice(0,200)});return true;
   }
   if(suffix==='/orders'&&req.method==='POST'){
    csrf(req,session);const b=await readBody(req,512000);
    // The authenticated administrator is the actor; client-supplied roles and account IDs are ignored.
    admin(req);const result=pickups.handle(store,{action:'create',actorId:user.id,id:b.id,shopId:b.shopId,note:b.note,lines:b.lines,raffleCode:b.raffleCode});send(res,200,result);return true;
   }
   if((suffix==='/cancel'||suffix==='/raffle')&&req.method==='POST'){
    csrf(req,session);const b=await readBody(req,8192);admin(req);const row=store.read().data.ledger.pickups.find(r=>r.id===b.id);if(!row)fail('预订单不存在',404);
    const result=pickups.handle(store,{action:suffix==='/cancel'?'cancel':'setRaffle',actorId:user.id,shopId:row.shopId,code:pickupCore.qr(row),raffleCode:b.raffleCode});send(res,200,result);return true;
   }
   if(suffix==='/logout'&&req.method==='POST'){csrf(req,session);sessions.delete(sessionId(req));send(res,200,{ok:true},{'Set-Cookie':cookie(req,'',0)});return true;}
   send(res,404,{error:'页面或接口不存在'});return true;
  }catch(e){send(res,e.status||400,{error:e.message||'操作失败，请稍后重试'});return true;}
 };
}
module.exports={createPacking};
