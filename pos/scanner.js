/* Local camera and image decoding. No image or video is sent to a server. */
(() => {
  'use strict';
  let dialog, session = null, libraryPromise;
  const get = id => document.getElementById(id);
  function loadLibrary() {
    if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/zxing-browser-0.2.1.min.js';
      script.onload = () => window.ZXingBrowser ? resolve(window.ZXingBrowser) : reject(Error('识别库加载失败'));
      script.onerror = () => { script.remove(); reject(Error('识别库未能加载，请刷新页面后重试')); };
      document.head.append(script);
    }).catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
  }
  function active(s, task = s.task) { return session === s && dialog.open && s.task === task; }
  function status(s, message, kind = '') {
    if (session !== s || !dialog.open) return;
    get('scanStatus').textContent = message;
    get('scanStatus').className = 'scan-status ' + kind;
  }
  function stopCamera(s) {
    s.controls?.stop(); s.controls = null;
    s.stream?.getTracks().forEach(track => track.stop()); s.stream = null;
    const video = get('scanVideo');
    if (video) { video.pause(); video.srcObject = null; }
  }
  function stopTask(s) {
    s.task++; stopCamera(s);
    if (s.url) { URL.revokeObjectURL(s.url); s.url = null; }
    get('scanVideo').hidden = true;
    get('scanPlaceholder').hidden = false;
    get('scanCamera').disabled = false;
    get('scanCamera').textContent = '开启摄像头';
    get('scanStop').hidden = true;
  }
  function dispose() {
    const s = session;
    if (!s) return;
    stopTask(s); session = null;
  }
  function createReader(z) {
    const reader = new z.BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 800 });
    reader.possibleFormats = ['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','CODE_93','ITF','QR_CODE','DATA_MATRIX','PDF_417'].map(format => z.BarcodeFormat[format]);
    return reader;
  }
  function accept(s, text) {
    if (!active(s)) return false;
    const value = String(text).trim();
    if (!value || value.length > 80 || /[\u0000-\u001f\u007f]/.test(value)) {
      status(s, '已识别，但内容不适合作为商品编码（最多 80 个字符，不能含换行）。请换一个商品码。', 'error');
      return false;
    }
    if (s.input && !s.input.isConnected) { dialog.close(); return false; }
    if(s.input){s.input.value = value;s.input.dispatchEvent(new Event('input', { bubbles: true }));}
    const callback = s.onResult;
    stopTask(s); session = null; dialog.close();
    s.input?.focus();
    callback?.(value);
    return true;
  }
  function cameraError(error) {
    if (['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error.name)) return '无法使用相机。请在系统或浏览器设置中允许相机权限，也可选择图片识别。';
    if (['NotFoundError','DevicesNotFoundError'].includes(error.name)) return '没有找到摄像头，请连接摄像头，或选择条码图片。';
    if (['NotReadableError','TrackStartError'].includes(error.name)) return '摄像头暂时无法使用，可能正被其他应用占用。请关闭占用应用，或选择图片。';
    return '摄像头启动失败，请重试或选择图片。';
  }
  async function startCamera(deviceId = '') {
    const s = session; if (!s) return;
    stopTask(s); const task = s.task;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      status(s, '当前页面不能使用摄像头，请用 HTTPS 或本机 localhost 打开；也可直接选择图片识别。', 'error'); return;
    }
    get('scanCamera').disabled = true;
    get('scanCamera').textContent = '正在启动…';
    status(s, '请允许摄像头权限，将商品条形码或二维码放入取景区域。');
    let stream;
    try {
      const z = await loadLibrary(); if (!active(s, task)) return;
      stream = await window.POSCamera.stream();
      if (!active(s, task)) { stream.getTracks().forEach(track => track.stop()); return; }
      s.stream = stream;
      get('scanVideo').hidden = false; get('scanPlaceholder').hidden = true; get('scanStop').hidden = false;
      const reader = createReader(z);
      const controls = await reader.decodeFromStream(stream, get('scanVideo'), (result, error, controls) => {
        if (!active(s, task)) { controls?.stop(); return; }
        if (result) accept(s, result.getText());
      });
      if (!active(s, task)) { controls.stop(); stream.getTracks().forEach(track => track.stop()); return; }
      s.controls = controls;
      get('scanCamera').disabled = false; get('scanCamera').textContent = '重新启动摄像头';
      status(s, '正在扫描…请保持稳定，让条码完整入镜并避免反光。');

    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (active(s, task)) { stopTask(s); status(s, error.message.includes('识别库') ? error.message : cameraError(error), 'error'); }
    }
  }
  async function scanFile(file) {
    const s = session; if (!s || !file) return;
    stopTask(s); const task = s.task;
    if (file.size > 20 * 1024 * 1024) { status(s, '图片超过 20MB，请选择较小的图片。', 'error'); return; }
    if (file.type && !file.type.startsWith('image/')) { status(s, '请选择图片文件。', 'error'); return; }
    status(s, '正在本机识别图片…');
    let fileUrl;
    try {
      const z = await loadLibrary(); if (!active(s, task)) return;
      fileUrl = URL.createObjectURL(file); s.url = fileUrl;
      const image = new Image(); image.src = fileUrl;
      await image.decode(); if (!active(s, task)) return;
      if (image.naturalWidth * image.naturalHeight > 40000000) throw Error('图片尺寸过大，请裁剪到条码区域再试。');
      const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale));
      const reader = createReader(z);
      // Try all orientations; phones often store a barcode sideways.
      for (const rotation of [0,90,180,270]) {
        if (!active(s, task)) return;
        const canvas = document.createElement('canvas');
        canvas.width = rotation % 180 ? height : width;
        canvas.height = rotation % 180 ? width : height;
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(image, -width / 2, -height / 2, width, height);
        try {
          const result = reader.decodeFromCanvas(canvas);
          accept(s, result.getText()); return;
        } catch (error) {
          if (!['NotFoundException','ChecksumException','FormatException'].includes(error.getKind?.() || error.name)) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      status(s, '没有识别到条形码或二维码，请选择清晰、完整的条码图片，或裁剪后重试。', 'error');
    } catch (error) {
      if (active(s, task)) status(s, /识别库|尺寸过大/.test(error.message) ? error.message : '图片无法识别。请使用清晰的 JPG、PNG 或 WebP 图片。', 'error');
    } finally {
      if (fileUrl) { URL.revokeObjectURL(fileUrl); if(s.url===fileUrl)s.url = null; }
    }
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'scanDialog'; dialog.setAttribute('aria-labelledby','scanTitle');
    dialog.innerHTML = `<div class="dialog-head"><div><h2 id="scanTitle">扫描商品条码</h2><p class="sub">支持条形码与二维码，识别后自动填入编码</p></div><button type="button" class="icon-button" id="scanClose" aria-label="关闭扫描">×</button></div><div class="scan-preview"><video id="scanVideo" playsinline muted hidden></video><div id="scanPlaceholder"><span class="scan-code-icon">▥</span><b>对准商品包装上的条码</b><small>保持条码完整、光线充足，避免反光</small></div></div><p id="scanStatus" class="scan-status" role="status" aria-live="polite">选择摄像头扫描，或从相册选择条码图片。</p><div class="scan-actions"><button type="button" class="primary" id="scanCamera">开启摄像头</button><button type="button" class="secondary" id="scanChooseFile">选择图片识别</button><button type="button" id="scanStop" hidden>停止摄像头</button></div><input type="file" id="scanFile" accept="image/*" hidden><p class="hint">图像仅在本机处理。二维码内容作为商品编码填入，不会打开链接。也可以返回手动输入或使用扫码枪。</p>`;
    document.body.append(dialog);
    get('scanClose').onclick = () => { dispose(); dialog.close(); };
    dialog.addEventListener('cancel', () => dispose());
    dialog.addEventListener('close', () => { if (!dialog.open) dispose(); });
    get('scanCamera').onclick = () => startCamera();
    get('scanStop').onclick = () => { if(session){const s=session;stopTask(s);status(s,'摄像头已停止，可重新开启或选择图片。')} };
    get('scanChooseFile').onclick = () => get('scanFile').click();
    get('scanFile').onchange = e => {const file=e.target.files[0];e.target.value='';scanFile(file)};
    document.addEventListener('visibilitychange', () => {if(document.hidden&&session){const s=session;stopTask(s);status(s,'页面进入后台，扫描已停止。返回后请重新开启摄像头。')}});
    window.addEventListener('pospause',()=>{if(session){const s=session;stopTask(s);status(s,'应用进入后台，扫描已停止。返回后请重新开启摄像头。')}});
    window.addEventListener('pagehide',dispose);
  }
  window.ProductCodeScanner = {
    openSearch(onResult){this.open(null,onResult);},
    openInventory(onResult){this.open(null,onResult,'inventory');},
    open(input, onResult, mode) {
      ensureDialog(); dispose();
      session = {input,onResult,task:0,stream:null,controls:null,url:null};
      get('scanTitle').textContent=input?'扫描商品条码':'扫码搜索商品';
      dialog.querySelector('.sub').textContent=input?'识别后填入商品编码':'识别已入库商品后加入当前订单';
      dialog.querySelector('.hint').textContent=input?'图像仅在本机处理。识别后填入商品编码。':'图像仅在本机处理。仅添加已入库商品，未入库的码只提醒。';
      if(mode==='inventory'){get('scanTitle').textContent='扫描查找商品';dialog.querySelector('.sub').textContent='识别后打开商品编辑页';dialog.querySelector('.hint').textContent='图像仅在本机处理，支持商品编码与 SKU。';}
      dialog.showModal(); stopTask(session);
      startCamera();
    }
  };
})();
