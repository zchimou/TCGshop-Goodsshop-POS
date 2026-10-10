const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('./refunds.js'),'utf8'),c);
const order={lines:[{productId:'a',name:'商品甲',qty:3,price:100,cost:20},{productId:'b',name:'商品乙',qty:1,price:200,cost:50}],total:499,discount:1,refunds:[]};
let rows=c.reportSaleItems([order],[]);assert.equal(rows.reduce((n,l)=>n+l.total,0),499);
order.refunds.push({lines:[{lineIndex:0,qty:1,amount:c.refundAmount(order,0,0,1)}]});rows=c.reportSaleItems([order],[]);assert.equal(rows.find(l=>l.name==='商品甲').qty,2);assert.equal(rows.reduce((n,l)=>n+l.total,0),400);
order.refunds.push({lines:[{lineIndex:0,qty:2,amount:c.refundAmount(order,0,1,2)}]});rows=c.reportSaleItems([order],[]);assert.equal(rows.length,1);assert.equal(rows[0].name,'商品乙');
order.refunds.push({lines:[{lineIndex:1,qty:1,amount:c.netLineAmount(order,1)}]});assert.equal(c.reportSaleItems([order],[]).length,0);
const other={lines:[{productId:'a',name:'商品甲',qty:1,price:300}],total:300,refunds:[]};assert.equal(c.reportSaleItems([order,other],[])[0].total,300);assert.equal(c.reportSaleItems([order,other],[])[0].qty,1);
console.log('PASS: discount cent allocation, partial and full refunds, fully refunded items hidden, other orders retained.');
