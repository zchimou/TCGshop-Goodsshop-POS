/* A device preference is local to this installation, separate from the ledger. */
window.POSCamera=(()=>{
 const key='TCGshop-POS-camera';
 const preferred=()=>{try{return localStorage.getItem(key)||''}catch{return ''}};
 async function stream(){
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('当前环境无法开启摄像头');
  const id=preferred(),base={width:{ideal:1280},height:{ideal:960}};
  try{return await navigator.mediaDevices.getUserMedia({audio:false,video:{...base,...(id?{deviceId:{exact:id}}:{facingMode:{ideal:'environment'}})}})}
  catch(e){if(id&&['OverconstrainedError','NotFoundError'].includes(e.name))return navigator.mediaDevices.getUserMedia({audio:false,video:{...base,facingMode:{ideal:'environment'}}});throw e;}
 }
 function mountSettings(){
  const select=document.getElementById('cameraPreference'),status=document.getElementById('cameraSettingsStatus'),button=document.getElementById('refreshCameras');
  async function refresh(authorize=false){let acquired;button.disabled=true;
   try{if(authorize)acquired=await stream();const devices=await navigator.mediaDevices.enumerateDevices();if(!select.isConnected)return;
    select.replaceChildren(new Option('自动（优先后置相机）',''));const cameras=devices.filter(d=>d.kind==='videoinput');cameras.forEach((d,i)=>select.add(new Option(d.label||'相机 '+(i+1),d.deviceId)));
    const saved=preferred();if(saved&&!cameras.some(d=>d.deviceId===saved))select.add(new Option('上次选择的相机（暂不可用，自动使用后置相机）',saved));select.value=saved;
    status.textContent=cameras.length?'此选择同时用于扫码和商品拍照，仅在本机保存。':'未发现相机，请连接或授权后刷新。';
   }catch(e){if(select.isConnected)status.textContent=e.name==='NotAllowedError'?'未允许相机权限，请在系统或浏览器中授权后重试。':'无法读取相机列表，请检查设备或权限。';}
   finally{acquired?.getTracks().forEach(t=>t.stop());if(button.isConnected)button.disabled=false;}
  }
  select.onchange=()=>{try{localStorage.setItem(key,select.value);status.textContent='相机选择已保存，下次扫码和拍照自动使用。';}catch{status.textContent='相机选择未能保存，请检查本地存储。';}};
  button.onclick=()=>refresh(true);refresh();
 }
 return {stream,mountSettings};
})();
