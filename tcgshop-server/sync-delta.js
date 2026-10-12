/* Shared record-aware patches. A version check is required before applying a patch. */
(function(root){
 'use strict';
 const copy=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const keyed=a=>Array.isArray(a)&&a.every(x=>x&&typeof x==='object'&&typeof x.id==='string')&&new Set(a.map(x=>x.id)).size===a.length;
 function diff(before,after){const ops=[];
  function walk(a,b,path){if(same(a,b))return;
   if(keyed(a)&&keyed(b)){const old=new Map(a.map(x=>[x.id,x])),next=new Map(b.map(x=>[x.id,x]));
    const add=b.filter(x=>!old.has(x.id)),remove=a.filter(x=>!next.has(x.id)).map(x=>x.id),order=b.map(x=>x.id),positions=add.map(x=>b.findIndex(y=>y.id===x.id));
    const reordered=!same(a.filter(x=>next.has(x.id)).map(x=>x.id),b.filter(x=>old.has(x.id)).map(x=>x.id));
    if(add.length||remove.length||reordered)ops.push({op:'rows',path,add:copy(add),remove,positions,...(reordered?{order}:{})});
    for(const row of b)if(old.has(row.id))walk(old.get(row.id),row,[...path,{id:row.id}]);return;
   }
   if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
    for(const k of Object.keys(a))if(!Object.hasOwn(b,k))ops.push({op:'delete',path:[...path,k]});
    for(const k of Object.keys(b))if(!Object.hasOwn(a,k))ops.push({op:'set',path:[...path,k],value:copy(b[k])});else walk(a[k],b[k],[...path,k]);return;
   }ops.push({op:'set',path,value:copy(b)});
  }walk(before,after,[]);return ops;
 }
 function apply(base,ops){if(!Array.isArray(ops)||ops.length>100000)throw Error('增量数据格式不正确');let out=copy(base);
  const bad=()=>{throw Error('增量路径不正确');};
  function step(value,key){if(typeof key==='string'){if(['__proto__','prototype','constructor'].includes(key)||!value||typeof value!=='object'||Array.isArray(value))bad();return value[key];}
   if(!key||Object.keys(key).length!==1||typeof key.id!=='string'||!keyed(value))bad();const row=value.find(x=>x.id===key.id);if(!row)bad();return row;}
  for(const op of ops){if(!op||!Array.isArray(op.path)||op.path.length>60||!['set','delete','rows'].includes(op.op))bad();
   if(!op.path.length){if(op.op!=='set')bad();out=copy(op.value);continue;}
   let parent=out;for(const key of op.path.slice(0,-1))parent=step(parent,key);const key=op.path.at(-1);
   if(op.op==='rows'){const rows=step(parent,key);if(!keyed(rows)||!keyed(op.add)||!Array.isArray(op.remove)||!Array.isArray(op.positions)||op.positions.length!==op.add.length)bad();
    const map=new Map(rows.map(r=>[r.id,r]));for(const id of op.remove){if(typeof id!=='string'||!map.has(id))bad();map.delete(id);}
    for(const row of op.add){if(map.has(row.id))bad();map.set(row.id,copy(row));}
    const ordered=rows.filter(r=>!op.remove.includes(r.id));for(let i=0;i<op.add.length;i++){const index=op.positions[i];if(!Number.isSafeInteger(index)||index<0||index>ordered.length)bad();ordered.splice(index,0,map.get(op.add[i].id));}
    if(op.order!==undefined){if(!Array.isArray(op.order)||op.order.length!==map.size||new Set(op.order).size!==map.size||op.order.some(id=>!map.has(id)))bad();rows.splice(0,rows.length,...op.order.map(id=>map.get(id)));}else rows.splice(0,rows.length,...ordered);
   }else{if(typeof key!=='string'||['__proto__','prototype','constructor'].includes(key)||!parent||typeof parent!=='object'||Array.isArray(parent))bad();if(op.op==='delete')delete parent[key];else parent[key]=copy(op.value);}
  }return out;
 }
 const api={diff,apply};if(typeof module==='object'&&module.exports)module.exports=api;else root.POSDelta=api;
})(typeof window==='object'?window:globalThis);
