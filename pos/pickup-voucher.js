/* Lossless pickup images, including every SKU line. Long orders paginate instead of truncating. */
window.POSPickupVoucher=(()=>{
 const yuan=n=>'¥'+(n/100).toFixed(2),date=t=>new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
 function wrapped(ctx,text,width){const out=[];let line='';for(const char of String(text)){if(char==='\n'){out.push(line);line='';continue;}if(line&&ctx.measureText(line+char).width>width){out.push(line);line=char;}else line+=char;}if(line||!out.length)out.push(line);return out;}
 async function images(row,shopName,svg){
  let source=svg.outerHTML;if(!source.includes('xmlns='))source=source.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'})),qr=new Image();
  try{qr.src=url;await qr.decode();const logo=new Image();logo.src=window.POSPickupLogo;await logo.decode();const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=900;ctx.font='24px sans-serif';
   const lines=row.lines.map(l=>({...l,names:wrapped(ctx,l.name,440),skus:wrapped(ctx,'SKU '+l.sku,440)}));
   const pages=[[]];let height=0;for(const l of lines){l.height=(l.names.length+l.skus.length)*32+26;if(height+l.height>6100&&pages.at(-1).length){pages.push([]);height=0;}pages.at(-1).push(l);height+=l.height;}
   const notes=wrapped(ctx,row.note||'',788),shop=wrapped(ctx,shopName,440),result=[];
   for(let i=0;i<pages.length;i++){
    const rows=pages[i],rowsHeight=rows.reduce((n,l)=>n+l.height,0),extra=shop.length*34+(row.note?notes.length*31+15:0);canvas.height=874+rowsHeight+extra;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);const watermarkSize=Math.min(560,canvas.height-610),watermarkY=610+(canvas.height-610-watermarkSize)/2;ctx.save();ctx.globalAlpha=0.10;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(logo,(canvas.width-watermarkSize)/2,watermarkY,watermarkSize,watermarkSize);ctx.restore();ctx.textBaseline='top';ctx.textAlign='center';ctx.fillStyle='#172440';ctx.font='bold 34px sans-serif';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillText('商品自提凭证',450,36);let y=91;ctx.font='26px sans-serif';for(const line of shop){ctx.fillText(line,450,y);y+=34;}
    ctx.font='bold 32px sans-serif';ctx.fillText('抽奖码：'+(row.raffleCode===undefined?row.raffleNumber:row.raffleCode||'未分配'),450,y+6);y+=54;ctx.font='20px sans-serif';ctx.fillText(row.number,450,y+6);ctx.fillText('打包时间：'+date(row.time),450,y+35);ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,290,y+80,320,320);y+=430;
    ctx.font='20px sans-serif';ctx.fillText('到指定门店出示此码核销 · 预订单',450,y);y+=49;ctx.textAlign='left';ctx.font='bold 23px sans-serif';ctx.fillText('提货商品 / SKU',56,y);ctx.fillText('数量',540,y);ctx.fillText('单价',635,y);ctx.fillText('小计',755,y);y+=43;
    for(const l of rows){ctx.strokeStyle='#d9dfeb';ctx.beginPath();ctx.moveTo(56,y-10);ctx.lineTo(844,y-10);ctx.stroke();ctx.fillStyle='#172440';ctx.font='24px sans-serif';let ly=y;for(const name of l.names){ctx.fillText(name,56,ly);ly+=32;}ctx.font='21px sans-serif';ctx.fillStyle='#5c6d87';for(const sku of l.skus){ctx.fillText(sku,56,ly);ly+=32;}ctx.font='22px sans-serif';ctx.fillStyle='#172440';ctx.fillText(String(l.qty),540,y);ctx.fillText(yuan(l.price),635,y,104);ctx.fillText(yuan(l.price*l.qty),755,y,105);y+=l.height;}
    ctx.font='bold 27px sans-serif';ctx.fillText('整单合计：'+row.lines.reduce((n,l)=>n+l.qty,0)+' 件',56,y+12);ctx.textAlign='right';ctx.fillText(yuan(row.total),844,y+12);y+=67;ctx.textAlign='left';ctx.font='22px sans-serif';if(row.note){ctx.fillStyle='#5c6d87';for(const note of wrapped(ctx,'备注：'+row.note,788)){ctx.fillText(note,56,y);y+=31;}y+=15;}
    ctx.fillStyle='#5c6d87';ctx.textAlign='center';ctx.font='20px sans-serif';ctx.fillText('领取状态以门店系统核销结果为准',450,y+10);ctx.fillText('第 '+(i+1)+' / '+pages.length+' 页',450,y+43);
    result.push({data:canvas.toDataURL('image/png'),filename:'提货凭证-'+row.number+(pages.length>1?'-'+(i+1):'')+'.png',page:i+1,totalPages:pages.length});
   }return result;
  }finally{URL.revokeObjectURL(url);}
 }
 return {images};
})();
