/* Local installation accounts. Passwords are salted PBKDF2 hashes, never plaintext. */
window.POSAuth=(()=>{
 const key='TCGshop-POS-accounts-v1',sessionKey='TCGshop-POS-device-session-v1',iterations=600000;
 let store=null,storeError='',session=null,gateBusy=false,gateEpoch=0;
 const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const bytes=h=>Uint8Array.from(h.match(/../g),x=>parseInt(x,16));
 const normalized=s=>s.normalize('NFKC').trim();
 const identity=s=>normalized(s).toLowerCase();
 function checkStore(s){
  if(!s||s.version!==1||!Array.isArray(s.users)||!s.users.length||s.users.length>200)throw Error('账号数据格式不正确');
  const ids=new Set(),names=new Set();
  for(const u of s.users){if(!u)throw Error('账号数据格式不正确');if(u.shopId===undefined)u.shopId='shop-main';if(typeof u.shopId!=='string'||!/^[-a-zA-Z0-9]+$/.test(u.shopId))throw Error('账号归属店铺不正确');if(!u||typeof u.id!=='string'||!/^[-a-zA-Z0-9]+$/.test(u.id)||ids.has(u.id)||typeof u.username!=='string'||!validName(u.username)||names.has(identity(u.username))||typeof u.name!=='string'||!u.name.trim()||u.name.length>60||!['admin','staff'].includes(u.role)||typeof u.enabled!=='boolean'||!/^[a-f0-9]{32}$/.test(u.salt)||!/^[a-f0-9]{64}$/.test(u.hash)||u.iterations!==iterations)throw Error('账号数据格式不正确');ids.add(u.id);names.add(identity(u.username));}
  if(!s.users.some(u=>u.role==='admin'&&u.enabled))throw Error('至少保留一个可用管理员');return s;
 }
 function load(){try{const raw=localStorage.getItem(key);store=raw===null?null:checkStore(JSON.parse(raw));storeError='';}catch{store=null;storeError='账号资料无法读取，已停止登录。请保留应用数据，联系维护人员检查。';}}
 function validName(v){return /^[\w\u3400-\u9fff.@-]{2,32}$/.test(v);}
 function accountValues(username,name,password,confirm){const v=normalized(username);if(!validName(v))throw Error('账号为 2–32 位汉字、字母、数字或 _ . @ -');if(!name.trim()||name.trim().length>60)throw Error('请填写 1–60 字的显示名称');passwordValues(password,confirm);return {username:v,name:name.trim()};}
 function passwordValues(password,confirm){if(password.length<8||password.length>128)throw Error('密码长度为 8–128 个字符');if(password!==confirm)throw Error('两次输入的密码不一致');}
 async function derive(password,salt){if(!crypto.subtle)throw Error('当前环境不支持安全登录，请使用本机预览或安卓应用');const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations},material,256));}
 async function credential(password){const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return {salt,hash:await derive(password,salt),iterations};}
 function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
 function user(){const u=store?.users.find(u=>u.id===session?.id);return u?.enabled&&u.hash===session.hash?u:null;}
 function requireUser(){const u=user();if(!u)throw Error('请先登录账号');return u;}
 function requireAdmin(){const u=requireUser();if(u.role!=='admin')throw Error('此操作仅管理员可用');return u;}
 function actor(){const u=requireUser();return {id:u.id,username:u.username,name:u.name};}
 function write(next,base){if(localStorage.getItem(key)!==base)throw Error('账号资料已在其他窗口变化，请重新登录后操作');checkStore(next);localStorage.setItem(key,JSON.stringify(next));store=next;window.POSSync?.changed();}
 function logout(){window.POSSync?.cancel();session=null;localStorage.removeItem(sessionKey);gateEpoch++;gateBusy=false;$('authScreen').innerHTML='';document.querySelectorAll('dialog[open]').forEach(d=>d.close());navigationOpen=mobileCartOpen=false;page='pos';query='';$('main').innerHTML='';render();}
 function unlock(u){gateBusy=false;localStorage.setItem(sessionKey,JSON.stringify({id:u.id,stamp:u.salt}));session={id:u.id,hash:u.hash};gateEpoch++;document.body.classList.remove('auth-locked');$('authScreen').hidden=true;$('authScreen').innerHTML='';page='pos';render();window.scrollTo(0,0);window.POSSync?.onLogin();}
 function renderGate(){
  document.body.classList.add('auth-locked');document.body.classList.remove('has-pos','cart-open','navigation-open');$('authScreen').hidden=false;$('main').innerHTML='';
  if(gateBusy||$('authForm'))return;
  if(storeError){$('authScreen').innerHTML=`<div class="login-card"><div class="login-logo">T</div><h1>无法登录</h1><p class="auth-error">${esc(storeError)}</p>${window.POSSync?.gateControls(false)||''}</div>`;window.POSSync?.wireGate();return;}
  const setup=!store;
  $('authScreen').innerHTML=`<div class="login-card"><div class="login-brand"><span class="login-logo">T</span><div><b>TCGshop POS</b><small>收银与库存管理</small></div></div><h1>${setup?'创建管理员账号':'欢迎登录'}</h1><p class="sub">${setup?'首次使用，请自行设置管理员账号和密码，已有账本会保留。':'登录后开始收银与库存管理'}</p><form id="authForm">${field('账号','authUsername','','text','required maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false"')}${setup?field('显示名称','authName','','text','required maxlength="60" autocomplete="name"'):''}${field('密码','authPassword','','password',`required maxlength="128" autocomplete="${setup?'new-password':'current-password'}"`)}${setup?field('再次输入密码','authConfirm','','password','required maxlength="128" autocomplete="new-password"'):''}<p id="authError" class="auth-error" role="alert"></p><button class="primary" id="authSubmit" type="submit">${setup?'创建管理员并进入':'登录'}</button></form><p class="login-note">登录后将记住此设备，退出登录可切换账号</p>${window.POSSync?.gateControls(setup)||''}</div>`;
  window.POSSync?.wireGate();
  $('authForm').onsubmit=async e=>{e.preventDefault();if(gateBusy)return;const epoch=gateEpoch,button=$('authSubmit'),error=$('authError');gateBusy=true;button.disabled=true;button.textContent=setup?'正在创建…':'正在验证…';error.textContent='';
   try{
    const username=$('authUsername').value,password=$('authPassword').value;
    if(setup){const values=accountValues(username,$('authName').value,password,$('authConfirm').value),credentials=await credential(password);if(epoch!==gateEpoch)return;const u={id:crypto.randomUUID(),...values,...credentials,role:'admin',shopId:'shop-main',enabled:true,createdAt:new Date().toISOString()};write({version:1,users:[u]},null);unlock(u);}
    else{
     let attempts;try{attempts=JSON.parse(localStorage.getItem(key+'-attempts')||'{}')}catch{attempts={}}if(attempts.until>Date.now())throw Error('尝试次数较多，请稍后重试');
     const raw=localStorage.getItem(key);load();if(storeError||!store)throw Error('账号资料发生变化，请重新打开应用');const u=store.users.find(u=>identity(u.username)===identity(username));const candidate=await derive(password,u?.salt||'00000000000000000000000000000000');if(epoch!==gateEpoch)return;if(localStorage.getItem(key)!==raw)throw Error('账号资料发生变化，请重试');
     if(!u?.enabled||!equal(candidate,u.hash)){const count=(Number.isSafeInteger(attempts.count)?attempts.count:0)+1;localStorage.setItem(key+'-attempts',JSON.stringify({count:count>=5?0:count,until:count>=5?Date.now()+30000:0}));throw Error(count>=5?'连续验证失败，请 30 秒后重试':'账号或密码不正确，或账号已停用');}
     localStorage.removeItem(key+'-attempts');unlock(u);
    }
   }catch(err){if(epoch===gateEpoch&&error.isConnected){error.textContent=err.message;$('authPassword').value='';}}
   finally{if(epoch===gateEpoch)gateBusy=false;if(button.isConnected){button.disabled=false;button.textContent=setup?'创建管理员并进入':'登录';}}
  };
 }
 function panel(){const u=requireUser();return `<div class="panel"><h3>当前账号</h3><div class="setting-row"><div><b>${esc(u.name)} · ${esc(u.username)}</b><p>${u.role==='admin'?'管理员':'店员'} · ${esc(POSShops.name(u.shopId))}</p></div><div class="account-actions"><button id="ownPassword">修改密码</button><button id="logoutAccount">退出登录</button></div></div></div>${u.role==='admin'?`<div class="panel"><div class="section-title"><h3>账号管理</h3><button id="createAccount" class="primary">＋ 创建账号</button></div><div class="table-wrap"><table><thead><tr><th>账号 / 显示名称</th><th>权限 / 归属店铺</th><th>状态</th><th>操作</th></tr></thead><tbody>${store.users.map(a=>`<tr><td><b>${esc(a.username)}</b><small>${esc(a.name)}</small></td><td>${a.role==='admin'?'管理员':'店员'}<small>${esc(POSShops.name(a.shopId))}</small></td><td>${a.enabled?'启用':'停用'}</td><td><button data-shop-account="${a.id}">归属店铺</button>${a.id===u.id?'当前账号':`<button data-reset-account="${a.id}">重设密码</button><button data-toggle-account="${a.id}">${a.enabled?'停用':'启用'}</button>`}</td></tr>`).join('')}</tbody></table></div><p class="hint">店员可收银、出入库和退款；账号管理、账本备份恢复与清空仅管理员可用。</p></div>`:''}`;}
 function asyncForm(fn){const form=$('dialogBody').querySelector('form');form.querySelector('[data-cancel]')?.addEventListener('click',()=>$('dialog').close());form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]'),error=$('accountError');button.disabled=true;error.textContent='';try{await fn();}catch(err){if(error.isConnected)error.textContent=err.message;}finally{if(button.isConnected)button.disabled=false;}};}
 function passwordForm(target){const self=target.id===requireUser().id;if(!self)requireAdmin();modal(self?'修改密码':'重设账号密码',`<p>${esc(target.name)} · ${esc(target.username)}</p><form>${self?field('当前密码','currentPassword','','password','required autocomplete="current-password"'):''}${field('新密码','newPassword','','password','required minlength="8" maxlength="128" autocomplete="new-password"')}${field('再次输入新密码','confirmPassword','','password','required maxlength="128" autocomplete="new-password"')}<p id="accountError" class="auth-error" role="alert"></p>${actions('保存密码')}</form>`);
  asyncForm(async()=>{const principal=requireUser(),base=localStorage.getItem(key);if(!self)requireAdmin();const pw=$('newPassword').value;passwordValues(pw,$('confirmPassword').value);if(self&&!equal(await derive($('currentPassword').value,principal.salt),principal.hash))throw Error('当前密码不正确');const c=await credential(pw);if(requireUser().id!==principal.id)throw Error('登录账号已变化，请重新操作');if(!self)requireAdmin();const next=JSON.parse(base),item=next.users.find(u=>u.id===target.id);Object.assign(item,c);write(next,base);if(self){session={id:principal.id,hash:c.hash};localStorage.setItem(sessionKey,JSON.stringify({id:principal.id,stamp:c.salt}));}window.POSSync?.changed();$('dialog').close();render();toast('密码已更新');});
 }
 function wirePanel(){
  $('logoutAccount').onclick=logout;$('ownPassword').onclick=()=>guarded(()=>passwordForm(requireUser()));
  if(!user()||user().role!=='admin')return;
  $('createAccount').onclick=()=>{requireAdmin();modal('创建账号',`<form><div class="form-grid">${field('账号','newUsername','','text','required maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false"')}${field('显示名称','newAccountName','','text','required maxlength="60"')}${selectField('账号权限','newAccountRole',['店员','管理员'])}${POSShops.select('归属店铺','newAccountShop',state.activeShopId)}${field('初始密码','newAccountPassword','','password','required minlength="8" maxlength="128" autocomplete="new-password"')}${field('再次输入密码','newAccountConfirm','','password','required maxlength="128" autocomplete="new-password"')}</div><p id="accountError" class="auth-error" role="alert"></p>${actions('创建账号')}</form>`);
   asyncForm(async()=>{const principal=requireAdmin(),base=localStorage.getItem(key),values=accountValues($('newUsername').value,$('newAccountName').value,$('newAccountPassword').value,$('newAccountConfirm').value),role=$('newAccountRole').value==='管理员'?'admin':'staff';const next=JSON.parse(base);if(next.users.some(u=>identity(u.username)===identity(values.username)))throw Error('此账号已存在');const c=await credential($('newAccountPassword').value);if(requireAdmin().id!==principal.id)throw Error('登录账号已变化');next.users.push({id:crypto.randomUUID(),...values,...c,role,shopId:$('newAccountShop').value,enabled:true,createdAt:new Date().toISOString()});write(next,base);$('dialog').close();render();toast('账号已创建');});
  };
  document.querySelectorAll('[data-shop-account]').forEach(b=>b.onclick=()=>guarded(()=>{requireAdmin();const target=store.users.find(u=>u.id===b.dataset.shopAccount);modal('修改归属店铺',`<form>${POSShops.select('归属店铺','accountShop',target.shopId)}${actions('保存归属店铺')}</form>`);wireForm(()=>{requireAdmin();const base=localStorage.getItem(key),next=JSON.parse(base);next.users.find(u=>u.id===target.id).shopId=$('accountShop').value;write(next,base);$('dialog').close();render();toast('账号归属店铺已更新');});}));
  document.querySelectorAll('[data-reset-account]').forEach(b=>b.onclick=()=>guarded(()=>passwordForm(store.users.find(u=>u.id===b.dataset.resetAccount))));
  document.querySelectorAll('[data-toggle-account]').forEach(b=>b.onclick=()=>guarded(()=>{requireAdmin();const base=localStorage.getItem(key),next=JSON.parse(base),u=next.users.find(u=>u.id===b.dataset.toggleAccount);if(u.id===user().id)throw Error('不能停用当前账号');u.enabled=!u.enabled;write(next,base);render();toast(u.enabled?'账号已启用':'账号已停用');}));
 }
 function snapshot(){return store?JSON.parse(JSON.stringify(store)):null;}
 function reloadSnapshot(){load();if(!user())logout();else render();}
 load();try{const saved=JSON.parse(localStorage.getItem(sessionKey)||'null'),u=store?.users.find(u=>u.id===saved?.id);if(u?.enabled&&u.salt===saved?.stamp)session={id:u.id,hash:u.hash};else localStorage.removeItem(sessionKey);}catch{localStorage.removeItem(sessionKey);}
 window.addEventListener('storage',e=>{if(e.key===key||e.key===null){load();if(!user())logout();else if(page==='settings')render();}});
 return {user,requireUser,requireAdmin,actor,isAdmin:()=>user()?.role==='admin',renderGate,panel,wirePanel,logout,snapshot,validateSnapshot:checkStore,reloadSnapshot};
})();
