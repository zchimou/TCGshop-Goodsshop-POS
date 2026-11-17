const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
let date='2026-11-06';
const context={state:{activeShopId:'shop-a',orders:[
 {id:'normal',payment:'现金',time:'2026-11-06T10:00:00+08:00',total:10000,cost:4000,refunds:[{time:'2026-11-06T11:00:00+08:00',amount:2000,cost:800}]},
 {id:'pickup',pickupId:'pickup-one',payment:'已收款',time:'2026-11-06T10:00:00+08:00',total:5000,cost:2000,refunds:[{time:'2026-11-06T11:00:00+08:00',amount:1000,cost:400}]},
 {id:'legacy-pickup',payment:'现金',time:'2026-11-05T10:00:00+08:00',total:3000,cost:1000,refunds:[{time:'2026-11-06T11:00:00+08:00',amount:500,cost:100}]}
 ],pickups:[{status:'redeemed',shopId:'shop-a',orderId:'legacy-pickup'},{status:'pending',shopId:'shop-a',total:99999}],expenses:[{time:'2026-11-06T11:00:00+08:00',amount:1000}]},inRange:t=>t.slice(0,10)===date};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('./refunds.js'),'utf8'),context);
let t=context.reportTotals();assert.equal(t.regularNet,8000);assert.equal(t.pickupGross,5000);assert.equal(t.pickupReturned,1500);assert.equal(t.pickupNet,3500);assert.equal(t.regularNet+t.pickupNet,t.net);assert.equal(t.net,11500);assert.equal(t.profit,5800);assert.equal(t.cashNet,7500);assert.equal(t.pickupCount,1);
date='2026-11-05';t=context.reportTotals();assert.equal(t.regularNet,0);assert.equal(t.pickupNet,3000);assert.equal(t.cashNet,3000);assert.equal(t.profit,2000);
console.log('PASS: separate ordinary/pickup net sales, refunds by original order and actual refund date, legacy redemption reference, pending orders excluded, cash across both categories and total profit without double counting.');
