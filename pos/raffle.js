/* A local, per-shop draw. Sampling uses Web Crypto without replacement. */
window.POSRaffle = (() => {
  function numbers(text) {
    const tokens = text.trim().replace(/(\d)\s*([-~～至])\s*(?=\d)/g, '$1$2').split(/[\s,，、;；]+/).filter(Boolean);
    const values = new Set();
    for (const token of tokens) {
      const match = /^(\d{1,9})(?:\s*[-~～至]\s*(\d{1,9}))?$/.exec(token);
      if (!match) throw Error('号码请用正整数，范围可填写 1-100');
      const first = Number(match[1]), last = Number(match[2] || match[1]);
      if (first < 1 || last < first || last - first > 9999) throw Error('号码范围无效，最多支持 10000 个号码');
      for (let n = first; n <= last; n++) values.add(String(n));
      if (values.size > 10000) throw Error('最多支持 10000 个号码');
    }
    if (!values.size) throw Error('请填写参与抽奖的号码');
    return [...values];
  }
  function randomIndex(size) {
    const limit = Math.floor(4294967296 / size) * size;
    const buffer = new Uint32Array(1);
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
    return buffer[0] % size;
  }
  function draw(prizes, participants) {
    const total = prizes.reduce((n, p) => n + p.qty, 0);
    if (!prizes.length || prizes.some(p => !p.name.trim() || p.name.length > 80 ||
      !Number.isInteger(p.qty) || p.qty < 1 || p.qty > 10000)) throw Error('请填写奖品名称及有效数量');
    if (total > participants.length) throw Error('奖品总数量超过参与号码数，请增加号码或减少奖品');
    const pool = [...participants];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let cursor = 0;
    return prizes.map(prize => ({...prize, winners: pool.slice(cursor, cursor += prize.qty)}));
  }
  function key() {
    return (window.POSDemo?.prefix || '') + 'TCGshop-raffle:' + state.activeShopId;
  }
  function saved() {
    try { return JSON.parse(localStorage.getItem(key()) || 'null'); } catch { return null; }
  }
  function show(result) {
    modal('抽奖结果', '<p>' + time(result.time) + '</p>' +
      '<p class="hint">' + result.count + ' 个参与号码 · 同一号码本轮最多中奖一次 · 本机保留本店最近一轮结果</p>' +
      result.prizes.map(p => '<section class="raffle-result"><h3>' + esc(p.name) + ' × ' + p.qty +
        '</h3><div>' + p.winners.map(n => '<b>' + esc(n) + '</b>').join('') + '</div></section>').join('') +
      '<div class="form-actions"><button id="raffleNew">开始新一轮</button><button id="raffleDone" class="primary">完成</button></div>');
    $('raffleDone').onclick = () => $('dialog').close();
    $('raffleNew').onclick = configure;
  }
  function configure() {
    POSAuth.requireUser();
    modal('自提抽奖', '<form id="raffleForm"><p class="hint">每个号码本轮最多中奖一次，重复号码会自动合并。</p>' +
      '<div id="rafflePrizes" class="raffle-prizes"></div><button type="button" id="raffleAdd">＋ 添加奖品</button>' +
      '<label class="field raffle-numbers">参与抽奖号码<textarea id="raffleNumbers" rows="4" maxlength="120000" placeholder="例如 1-100，105，108"></textarea></label>' +
      '<button type="button" id="raffleUseOrders">填入本店自提单抽奖码</button>' +
      '<p class="hint">填入待领取和已核销自提单的已赋号码，可继续编辑。</p>' +
      '<p id="raffleError" class="auth-error" role="alert"></p>' + actions('随机抽奖') + '</form>');
    function addPrize() {
      if ($('rafflePrizes').children.length >= 50) { toast('最多添加 50 种奖品'); return; }
      const row = document.createElement('div');
      row.className = 'raffle-prize';
      row.innerHTML = '<label>奖品名称<input class="raffle-name" maxlength="80" required placeholder="例如 补充包"></label>' +
        '<label>数量<input class="raffle-qty" type="number" min="1" max="10000" step="1" value="1" required></label>' +
        '<button type="button" aria-label="删除奖品">×</button>';
      row.querySelector('button').onclick = () => row.remove();
      $('rafflePrizes').append(row);
    }
    addPrize();
    $('raffleAdd').onclick = addPrize;
    $('raffleUseOrders').onclick = () => {
      const codes = (state.pickups || []).filter(r => r.shopId === state.activeShopId && r.status !== 'cancelled')
        .map(r => POSPickupCore.raffle(r)).filter(Boolean);
      $('raffleNumbers').value = [...new Set(codes)].join('，');
    };
    const currentShop = state.activeShopId;
    const form = $('raffleForm');
    form.querySelector('[data-cancel]').onclick = () => $('dialog').close();
    form.onsubmit = event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      if (button.disabled) return;
      try {
        POSAuth.requireUser();
        if (state.activeShopId !== currentShop) throw Error('店铺已切换，请重新打开抽奖');
        const participants = numbers($('raffleNumbers').value);
        const prizes = [...$('rafflePrizes').children].map(row => ({
          name: row.querySelector('.raffle-name').value.trim(), qty: Number(row.querySelector('.raffle-qty').value)
        }));
        const result = {shop: state.store, time: new Date().toISOString(), count: participants.length,
          prizes: draw(prizes, participants)};
        button.disabled = true;
        localStorage.setItem(key(), JSON.stringify(result));
        show(result);
      } catch (error) {
        button.disabled = false;
        $('raffleError').textContent = error.message;
      }
    };
  }
  function open() {
    POSAuth.requireUser();
    const result = saved();
    if (result) show(result); else configure();
  }
  return {open, numbers, draw};
})();
