// Three-way reconciliation never silently chooses between conflicting edits.
const syncEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function mergeLedger(base,local,remote){
 const result={sales:[],expenses:[],history:[],dateMarks:{}};
 for(const kind of ['sales','expenses']){
  const map=rows=>new Map((rows||[]).map(v=>[v.id,v]));
  const b=map(base?.[kind]),l=map(local[kind]),r=map(remote[kind]);
  for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){
   const bv=b.get(id),lv=l.get(id),rv=r.get(id);let value;
   const deleted=(ledger)=>(ledger.history||[]).some(h=>h.action==='delete'&&h.kind===kind&&h.record?.id===id);
   if(syncEqual(lv,rv))value=lv;
   else if(base&&syncEqual(lv,bv))value=rv;
   else if(base&&syncEqual(rv,bv))value=lv;
   else if(!base&&!lv&&!deleted(local))value=rv;
   else if(!base&&!rv&&!deleted(remote))value=lv;
   else throw Error('同一条记录存在不同修改或删除，请先备份，再选择保留哪台设备的数据');
   if(value)result[kind].push(value);
  }
 }
 result.history=[...new Map([...(remote.history||[]),...(local.history||[])].map(h=>[JSON.stringify(h),h])).values()];
 for(const field of ['dateMarks','redDateMarks']){
  const b=base?.[field]||{},l=local[field]||{},r=remote[field]||{};result[field]={};
  for(const day of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])){
   const bv=b[day]===true,lv=l[day]===true,rv=r[day]===true;let value;
   if(lv===rv)value=lv;
   else if(base&&lv===bv)value=rv;
   else if(base&&rv===bv)value=lv;
   else if(!base&&!Object.prototype.hasOwnProperty.call(l,day))value=rv;
   else if(!base&&!Object.prototype.hasOwnProperty.call(r,day))value=lv;
   else throw Error('同一天的颜色标记在不同设备上发生冲突，请先备份，再选择保留哪台设备的数据');
   result[field][day]=value;
  }
 }
 return result;
}
let syncBusy=false,syncTimer,retryTimer,syncGeneration=0;
const syncPrefsKey='generic-auto-sync';
function syncPrefs(){try{return JSON.parse(localStorage.getItem(syncPrefsKey)||'{}')}catch{return {}}}
function syncBaseUrl(){const u=new URL($('serverUrl').value.trim());if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('请填写有效的服务器地址');return u.href.replace(/\/$/,'');}
function baselineKey(url){return key+'-sync-base:'+url;}
function readBaseline(url){try{return JSON.parse(localStorage.getItem(baselineKey(url))||'null')}catch{return null}}
function syncStatus(message){$('syncStatus').textContent=message;$('autoSyncStatus').textContent=message;}
function queueAutoSync(){syncGeneration++;if(syncPrefs().edit){syncStatus('已保存本机，等待同步');clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync('auto'),1000);}}
async function sync(mode){
 if(syncBusy)return;
 const automatic=mode==='auto',generation=syncGeneration;
 let url;try{url=syncBaseUrl()}catch(e){syncStatus(e.message);return;}
 if(['upload','download'].includes(mode)&&!confirm(mode==='upload'?'将以本机账本替换服务器账本，是否继续？':'将以服务器账本替换本机账本，是否继续？'))return;
 syncBusy=true;clearTimeout(retryTimer);document.querySelectorAll('[data-sync]').forEach(b=>b.disabled=true);$('serverUrl').disabled=true;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 const request=async(path,options={})=>{
  const token=$('syncToken').value.trim();
  const response=await fetch(url+path,{...options,cache:'no-store',signal:controller.signal,headers:{...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
  if(!response.ok)throw Error(response.status===412?'服务器数据已变化，请重新同步':response.status===401?'同步密钥不正确':('服务响应 '+response.status));
  return {body:await response.json(),etag:response.headers.get('ETag')};
 };
 try{
  localStorage.setItem('generic-server-url',url);localStorage.setItem('generic-sync-token:'+url,$('syncToken').value.trim());
  syncStatus('正在同步…');
  const health=await request('/api/health');if(health.body.ok!==true)throw Error('不是有效的同步服务');
  if(mode==='health'){syncStatus(health.body.syncVersion===2?'连接成功，支持自动同步':'连接成功；请更新 NAS 服务端后开启自动同步');return;}
  if(health.body.syncVersion!==2)throw Error('请先更新 NAS 同步服务端，旧版本不支持安全自动同步');
  const remote=await request('/api/backup');if(!remote.etag)throw Error('同步服务缺少版本标识，请检查代理配置');
  const valid=normalize(remote.body),local=JSON.parse(JSON.stringify(data));
  const next=mode==='download'?valid:mode==='upload'?local:mergeLedger(readBaseline(url),local,valid);
  localStorage.setItem(key+'-before-sync',JSON.stringify(local));
  if(mode!=='download')await request('/api/backup',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':remote.etag},body:JSON.stringify(next)});
  // Edits made while the network request was running must remain local and queued.
  const current=syncGeneration===generation?next:mergeLedger(local,data,next);
  if(!persist(current,false))throw Error('本机保存失败');
  localStorage.setItem(baselineKey(url),JSON.stringify(next));
  syncStatus('同步成功 · '+new Date().toLocaleTimeString());
 }catch(e){
  syncStatus(e.name==='AbortError'?'连接超时，数据保留在本机':e.message+'（本机数据已保留）');
  if(automatic&&(e.name==='AbortError'||e instanceof TypeError||e.message.includes('服务器数据已变化')))retryTimer=setTimeout(()=>sync('auto'),30000);
 }finally{
  clearTimeout(timer);syncBusy=false;$('serverUrl').disabled=false;document.querySelectorAll('[data-sync]').forEach(b=>b.disabled=false);
  if(syncGeneration!==generation&&syncPrefs().edit){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync('auto'),1000);}
 }
}
function initAutoSync(){
 const panel=$('settingsLayer').querySelector('.sync-panel');
 panel.querySelector('.sync-hint').textContent='自动合并不同记录；同一记录冲突时暂停。首次启用前请更新 NAS 服务端。';
 const controls=document.createElement('div');controls.className='auto-sync-options';controls.innerHTML='<label for="syncToken">同步密钥（外网访问必填）</label><input id="syncToken" type="password" autocomplete="off" placeholder="与 NAS 服务端配置一致"><label><input type="checkbox" id="syncOnEdit">保存、修改或删除后自动上传</label><label><input type="checkbox" id="syncOnOpen">打开应用或返回前台时自动同步</label><button id="syncNow">立即合并同步</button>';
 panel.insertBefore(controls,panel.querySelector('.sync-actions'));
 const status=document.createElement('p');status.id='autoSyncStatus';status.className='subtle';status.setAttribute('role','status');document.querySelector('.hero').after(status);
 $('syncOnEdit').checked=!!syncPrefs().edit;$('syncOnOpen').checked=!!syncPrefs().open;
 const loadToken=()=>{try{$('syncToken').value=localStorage.getItem('generic-sync-token:'+syncBaseUrl())||''}catch{}};loadToken();
 $('serverUrl').onchange=()=>{try{localStorage.setItem('generic-server-url',syncBaseUrl());loadToken();syncStatus('地址已保存，请测试连接')}catch(e){syncStatus(e.message)}};
 $('syncToken').onchange=()=>{try{localStorage.setItem('generic-sync-token:'+syncBaseUrl(),$('syncToken').value.trim())}catch{}};
 for(const id of ['syncOnEdit','syncOnOpen'])$(id).onchange=()=>{localStorage.setItem(syncPrefsKey,JSON.stringify({edit:$('syncOnEdit').checked,open:$('syncOnOpen').checked}));if(syncPrefs().edit||syncPrefs().open)sync('auto');else{clearTimeout(syncTimer);clearTimeout(retryTimer);syncStatus('自动同步已关闭')}};
 $('syncNow').onclick=()=>sync('auto');
 window.addEventListener('online',()=>{if(syncPrefs().edit||syncPrefs().open)sync('auto')});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncPrefs().open)sync('auto')});
 syncStatus(syncPrefs().edit||syncPrefs().open?'自动同步已开启':'自动同步未开启');
 if(syncPrefs().open||syncPrefs().edit)setTimeout(()=>sync('auto'),0);
}
