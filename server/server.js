const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const file=process.env.LEDGER_FILE||'/data/ledger.json',token=process.env.SYNC_TOKEN||'';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,If-Match,Authorization','Access-Control-Expose-Headers':'ETag','Access-Control-Allow-Methods':'GET,PUT,OPTIONS','Cache-Control':'no-store'};
const hash=s=>'"'+crypto.createHash('sha256').update(s).digest('hex')+'"';
function read(){const raw=fs.existsSync(file)?fs.readFileSync(file,'utf8'):JSON.stringify({sales:[],expenses:[],history:[]});return {raw,etag:hash(raw)}}
function send(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...cors,...headers});res.end(JSON.stringify(body))}
function body(req){return new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>2*1024*1024){chunks=[];reject(Error('too large'))}else chunks.push(c)});req.on('error',reject);req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString()))}catch(e){reject(e)}})})}
function valid(d){return d&&['sales','expenses'].every(k=>Array.isArray(d[k])&&new Set(d[k].map(v=>v.id)).size===d[k].length&&d[k].every(v=>typeof v.id==='string'&&v.id&&/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&Number.isFinite(v.a)&&v.a>0&&(k!=='sales'||Number.isFinite(v.r)&&v.r>=0&&v.r<=1&&Number.isFinite(v.f)&&v.f>=0)))&&Array.isArray(d.history)}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,cors);return res.end()}
 if(token){const expected=Buffer.from('Bearer '+token),actual=Buffer.from(req.headers.authorization||'');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return send(res,401,{error:'Unauthorized'})}
 if(req.url==='/api/health'&&req.method==='GET')return send(res,200,{ok:true,service:'generic-ledger-sync',syncVersion:2});
 if(req.url==='/api/backup'&&req.method==='GET'){try{const state=read();return send(res,200,JSON.parse(state.raw),{ETag:state.etag})}catch{return send(res,500,{error:'读取数据失败'})}}
 if(req.url==='/api/backup'&&req.method==='PUT'){
  try{
   const next=await body(req);if(!valid(next))return send(res,400,{error:'账本格式不正确'});
   const current=read();if(!req.headers['if-match'])return send(res,428,{error:'请更新客户端'});
   if(req.headers['if-match']!==current.etag)return send(res,412,{error:'版本冲突'});
   fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file))fs.copyFileSync(file,file+'.previous');
   const raw=JSON.stringify({...next,updatedAt:new Date().toISOString()},null,2);
   fs.writeFileSync(file+'.tmp',raw);fs.renameSync(file+'.tmp',file);
   return send(res,200,{ok:true},{ETag:hash(raw)});
  }catch{return send(res,400,{error:'保存数据失败'})}
 }
 send(res,404,{error:'Not found'});
});
if(require.main===module)server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Generic sync v2 listening'));
module.exports=server;
