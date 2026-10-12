const assert=require('assert/strict'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});try{const p=await b.newPage({viewport:{width:1000,height:850}});await require('./test-auth.cjs').prepare(p);await p.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
const result=await p.evaluate(()=>{
 const saved=transact(s=>{s.products=s.products.concat(Array.from({length:300},(_,i)=>({...s.products[0],id:'perf-'+i,sku:'P'+i,code:'P'+i,name:'性能商品'+i,stock:100})));s.cart=[];s.discount=0;});if(!saved)throw Error(document.getElementById('toast').textContent);
 const grid=document.querySelector('.product-grid'),search=document.getElementById('search'),first=grid.firstElementChild;grid.scrollTop=400;
 const start=performance.now();for(let i=0;i<20;i++)addToCart('perf-0',1);
 return {stable:grid===document.querySelector('.product-grid')&&first===grid.firstElementChild&&search===document.getElementById('search'),scroll:grid.scrollTop,qty:state.cart[0].qty,ms:performance.now()-start};});
assert(result.stable,'Cart edits must not recreate catalog');assert(result.scroll>0);assert.equal(result.qty,20);
await p.locator('[data-qty="perf-0"][data-delta="1"]').click();assert.equal(await p.evaluate(()=>state.cart[0].qty),21,'One click must increment once');
const feedback=await p.evaluate(()=>{
 addToCart('perf-1',1);const cart=$('currentCart'),bar=$('mobileCart'),list=cart.querySelector('.cart-items'),row=list.querySelector('[data-cart-item="perf-0"]'),unchanged=list.querySelector('[data-cart-item="perf-1"]');
 addToCart('perf-0',1);
 const stable=cart===$('currentCart')&&bar===$('mobileCart')&&row===list.querySelector('[data-cart-item="perf-0"]')&&unchanged===list.querySelector('[data-cart-item="perf-1"]');
 const animating=row.getAnimations().length>0;
 addToCart('perf-0',-1);addToCart('perf-1',-1);
 return {stable,animating,removed:!list.querySelector('[data-cart-item="perf-1"]'),rows:list.querySelectorAll('[data-cart-item]').length};
});assert(feedback.stable);assert(feedback.animating);assert(feedback.removed);assert.equal(feedback.rows,1);
await p.reload();assert.equal(await p.evaluate(()=>state.cart[0].qty),21);
await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>{const n=document.getElementById('currentCart');toggleCart(true);toggleCart(false);return n===document.getElementById('currentCart')}));
await p.emulateMedia({reducedMotion:'reduce'});assert(await p.evaluate(()=>{addToCart('perf-0',1);return document.querySelector('[data-cart-item="perf-0"]').getAnimations().length===0;}));await p.evaluate(()=>modal('测试','<p>内容</p>'));assert.equal(await p.locator('#dialog').evaluate(el=>getComputedStyle(el).animationName),'none');
console.log('PASS: 300 products, 20 cart edits preserve catalog/search/scroll; single handlers, reload persistence, drawer reuse, reduced motion.',JSON.stringify(result));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
