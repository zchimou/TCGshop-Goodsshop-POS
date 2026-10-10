const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict');
const shell=fs.readFileSync(path.join(__dirname,'publish-release.sh'),'utf8');
const code=shell.split("<<'NODE'\n")[1].split('\nNODE')[0];
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pos-publisher-')),stage=path.join(root,'stage'),target=path.join(root,'published');
fs.mkdirSync(stage);fs.mkdirSync(target);
const ledger=path.join(root,'shop.json');fs.writeFileSync(ledger,'{"untouched":true}');
function fixture(version,bytes=Buffer.from('test-apk-'+version)){
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const m={schema:1,packageName:'com.tcgshop.pos',versionCode:version,versionName:'2.0.'+version,sha256,size:bytes.length,notes:'test'};
 fs.writeFileSync(path.join(stage,sha256+'.apk'),bytes);fs.writeFileSync(path.join(stage,'latest.json'),JSON.stringify(m));return m;
}
const mapped=value=>{if(typeof value!=='string')return value;const normalized=value.replace(/\\/g,'/');return normalized==='/data/updates'||normalized.startsWith('/data/updates/')?path.join(target,normalized.slice('/data/updates'.length)):value;};
const disk=new Proxy(fs,{get(o,k){const v=o[k];return typeof v==='function'?(...args)=>v.apply(o,args.map(mapped)):v;}});
function run(){vm.runInNewContext(code,{require:name=>name==='fs'?disk:name==='/app/updates'?require('./updates'):require(name),process:{argv:['node','-',stage],pid:12345},console:{log(){}}});}
const first=fixture(27);run();assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target,'latest.json'))),first);
assert.equal(fs.readFileSync(path.join(target,first.sha256+'.apk'),'utf8'),'test-apk-27');
run();assert.equal(fs.existsSync(path.join(target,'.publish.lock')),false);
fixture(26);assert.throws(run,/downgrade/);assert.equal(JSON.parse(fs.readFileSync(path.join(target,'latest.json'))).versionCode,27);
fixture(27,Buffer.from('different-same-version'));assert.throws(run,/same versionCode/);
const bad=fixture(28);fs.writeFileSync(path.join(stage,bad.sha256+'.apk'),Buffer.from('bad-apk-28!'));assert.throws(run);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target,'latest.json'))),first);
const next=fixture(28);run();assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target,'latest.json'))),next);
assert.equal(fs.readFileSync(ledger,'utf8'),'{"untouched":true}');
assert.equal(fs.existsSync(path.join(target,first.sha256+'.apk')),true);
console.log('PASS: publish, repeat publish, upgrade, downgrade rejection, same-version replacement rejection, damaged APK leaves old version, old APK and ledger retained.');
