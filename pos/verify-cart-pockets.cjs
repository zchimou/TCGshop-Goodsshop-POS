const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH, headless:true});
  try {
    const p = await browser.newPage({viewport:{width:1280,height:800}});
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await require('./test-auth.cjs').prepare(p);
    await p.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    const pocketButton = p.locator('#openPockets');
    await p.locator('[data-add="sample-0"]').click();
    await p.locator('[data-cart-price="sample-0"]').click();
    await p.locator('#cartUnitPrice').fill('12.34');
    await p.getByRole('button',{name:'保存单价',exact:true}).click();
    await p.locator('#discount').fill('1.00');
    await p.locator('#discount').press('Tab');
    await pocketButton.click();
    await p.locator('#pocketName').fill('甲');
    await p.getByRole('button',{name:'暂存，接待下一位'}).click();
    assert.equal(await p.evaluate(()=>state.orders.length),0);
    assert.equal(await p.evaluate(()=>state.products[0].stock),36);
    await p.locator('[data-add="sample-0"]').click();
    await p.locator('[data-add="sample-1"]').click();
    await p.reload();
    await p.setViewportSize({width:320,height:700});
    await p.locator('#mobileCart').click();
    await pocketButton.click();
    await p.locator('#pocketName').fill('乙');
    await p.locator('[data-recall]').click();
    assert.equal(await p.locator('#cartTitle').innerText(),'甲');
    assert.equal(await p.locator('#due').innerText(),'¥11.34');
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(await p.locator('#openPockets').evaluate(el=>{
      const a=el.getBoundingClientRect(),b=document.querySelector('#clearCart').getBoundingClientRect(),c=document.querySelector('#closeCart').getBoundingClientRect();
      return a.width>0&&a.right<=b.left&&b.right<=c.left;
    }));
    await p.locator('#checkout').click();
    await p.getByRole('button',{name:'已到账，完成收款'}).click();
    assert.deepEqual(await p.evaluate(()=>[state.orders.length,state.orders[0].total,state.products[0].stock,state.cart.length]),[1,1134,35,0]);
    await p.locator('#mobileCart').click();
    await pocketButton.click();
    await p.locator('[data-recall]').click();
    assert.equal(await p.locator('#cartTitle').innerText(),'乙');
    assert.equal(await p.locator('#due').innerText(),'¥35.00');
    await p.locator('#checkout').click();
    await p.getByRole('button',{name:'已到账，完成收款'}).click();
    assert.deepEqual(await p.evaluate(()=>[state.orders.length,state.cartPockets.length,state.products[0].stock,state.products[1].stock]),[2,0,34,23]);
    await p.setViewportSize({width:1440,height:900});
    await p.locator('[data-add="sample-0"]').click();
    await p.locator('[data-page="settings"]').click();
    await p.locator('#createShop').evaluate(el=>el.closest('details').open=true);
    await p.locator('#createShop').click();
    await p.locator('#newShopName').fill('口袋测试分店');
    await p.getByRole('button',{name:'创建店铺',exact:true}).click();
    const [first,second]=await p.evaluate(()=>state.shops.map(s=>s.id));
    await p.locator('[data-page="pos"]').click();
    async function selectShop(id){
      await p.locator('#accountQuick').click();
      await p.locator('#activeShop').selectOption(id);
      await p.getByRole('button',{name:'切换店铺',exact:true}).click();
    }
    await selectShop(second);
    assert.equal(await pocketButton.innerText(),'口袋 · 0');
    assert.equal(await p.evaluate(()=>state.cart.length),0);
    await selectShop(first);
    assert.equal(await pocketButton.innerText(),'口袋 · 1');
    await pocketButton.click();
    await p.locator('[data-recall]').click();
    assert.equal(await p.locator('#due').innerText(),'¥15.00');
    assert.deepEqual(errors,[]);
    console.log('PASS: park, reload, exchange, manual price, discount, mobile layout, two independent sales and shop isolation.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
