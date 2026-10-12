const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require.resolve('./nas-sync.js'),'utf8');
const jobs=new Map();let id=0,calls=0;
const context={paused:false,timer:null,poll:null,retry:null,liveTimer:null,listen:()=>{},conflict:null,lastCheckAt:0,config:()=>({url:'http://127.0.0.1',open:false}),POSAuth:{user:()=>({role:'staff'})},document:{visibilityState:'visible'},setTimeout:(fn,delay)=>{jobs.set(++id,{fn,delay});return id},clearTimeout:key=>jobs.delete(key),run:async mode=>{assert.equal(mode,'auto');calls++}};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf(' function queueCheck'),source.indexOf(' function wireIndicator')),context);
(async()=>{
 context.onLogin();assert.equal(jobs.size,2);
 const random=[...jobs.values()].find(x=>x.delay!==500);assert(random.delay>=30000&&random.delay<=90000);
 context.onPage();context.onPage();assert.equal([...jobs.values()].filter(x=>x.delay===500).length,1);
 await [...jobs.values()].find(x=>x.delay===500).fn();assert.equal(calls,1);
 await random.fn();assert.equal(calls,2);assert([...jobs.values()].some(x=>x.delay>=30000&&x.delay<=90000));
 context.pause();assert.equal(jobs.size,0);context.onPage();assert.equal(jobs.size,0);
 context.onResume();assert.equal(jobs.size,2);
 context.lastCheckAt=Date.now();context.onPage();context.onPage();assert.equal([...jobs.values()].filter(x=>x.delay>=1900&&x.delay<=2000).length,1);
 context.pause();context.modern=()=>true;context.onResume();assert([...jobs.values()].some(x=>x.delay>=300000&&x.delay<=360000));context.pause();assert.equal(jobs.size,0);
 console.log('PASS: login/resume, coalesced navigation, legacy 30–90 seconds and modern 5–6 minutes recurrence, background cancellation, staff scheduling.');
})().catch(e=>{console.error(e);process.exitCode=1});
