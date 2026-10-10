const fs=require('fs'),os=require('os'),path=require('path'),http=require('http'),zlib=require('zlib'),{spawnSync,spawn}=require('child_process');
(async()=>{
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/bad/api/shop'){res.writeHead(200,{'Content-Encoding':'gzip'});return res.end('invalid');}
  if(req.url==='/large/api/shop'){res.writeHead(200,{'Content-Encoding':'gzip'});return res.end(zlib.gzipSync(Buffer.alloc(20*1024*1024+1,65)));}
  if(req.method==='GET'&&req.headers['if-none-match']==='"native-test"'){res.writeHead(304,{ETag:'"native-test"'});return res.end();}
  let marker='gzip-roundtrip';if(req.method==='PUT'){const chunks=[];for await(const c of req)chunks.push(c);const gzip=req.headers['content-encoding']==='gzip',raw=Buffer.concat(chunks);if(JSON.parse((gzip?zlib.gunzipSync(raw):raw).toString()).data!=='x'.repeat(4096)){res.writeHead(400);return res.end('{}');}marker='compressed-'+gzip;}
  res.writeHead(200,{'Content-Encoding':'gzip',ETag:'"native-test"'});res.end(zlib.gzipSync(Buffer.from(JSON.stringify({marker}))));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const root=path.resolve(__dirname,'../tcgshop-android'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pos-native-zip-')),jdk=path.join(root,'tools',fs.readdirSync(path.join(root,'tools')).find(n=>n.startsWith('jdk-21')));
  const built=spawnSync(path.join(jdk,'bin/javac.exe'),['-encoding','UTF-8','-d',tmp,path.join(root,'app/src/main/java/com/tcgshop/pos/NasTransport.java'),path.join(root,'test/org/json/JSONObject.java'),path.join(root,'test/NasCompressionTest.java')],{encoding:'utf8'});if(built.status!==0)throw Error(built.stderr);
  const child=spawn(path.join(jdk,'bin/java.exe'),['-cp',tmp,'NasCompressionTest','http://127.0.0.1:'+server.address().port]);let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const status=await new Promise(r=>child.on('exit',r));if(status!==0)throw Error(output);console.log(output.trim());
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
