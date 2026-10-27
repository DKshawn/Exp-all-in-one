import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { catalog, createProtocol, publicTrial, analyze } from '../server/protocols.mjs';
import { validateAnswer, validateMetrics, posterior, marginal, csvCell, fingerprint } from '../server/engine.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';

function answerFor(trial) {
  const answer={};
  for(const f of trial.fields) {
    if(f.when && answer[f.when.id]!==f.when.equals)continue;
    if(f.type==='choice')answer[f.id]=f.options[0].value;
    if(f.type==='number')answer[f.id]=Math.ceil((f.min+f.max)/2);
    if(f.type==='text')answer[f.id]=f.pattern?'0000456':'動作確認用の架空の回答です。';
  }
  if(trial.rankFields)trial.rankFields.forEach((id,i)=>answer[id]=i+1);
  if(trial.sumFields)trial.sumFields.forEach((id,i)=>answer[id]=i===0?100:0);
  return answer;
}
const metrics = min => ({rtMs:min+100,activeMs:min+100,focusLosses:0,reloadCount:0,viewport:{width:1280,height:800},clientStartedAt:'2026-10-27T00:00:00.000Z'});
function harness(seed=1,filename=':memory:') {
  let time=Date.parse('2026-10-27T00:00:00Z');
  const store=new Store(filename,{seed:()=>seed,clock:()=>time});
  const step=(state,answer=answerFor(state.trial))=>{
    const min=state.trial.minViewMs || 0; time+=min+200;
    const payload={trialIndex:state.currentIndex,trialId:state.trial.id,submissionId:randomUUID(),answer,metrics:metrics(min)};
    if(state.trial.responseWindowMs)payload.metrics.timed={limitMs:state.trial.responseWindowMs,elapsedMs:min+100,endReason:'submitted'};
    return {state:store.submit(state.id,payload),payload};
  };
  return {store,step,advance:ms=>{time+=ms;}};
}
function start(store,studyId,extra={}) {
  return store.start({studyId,participant:'P-test',acknowledged:true,isTest:true,...extra});
}
function finish(h,state) { while(state.status==='active')state=h.step(state).state;return state; }

test('selection contains exactly 21 unique included representatives; high difficulty 09-01 excluded',()=>{
  assert.equal(catalog.studies.length,21);
  assert.equal(new Set(catalog.studies.map(s=>s.id)).size,21);
  assert(!catalog.studies.some(s=>s.id==='09-01'||s.difficulty==='high'));
  assert(catalog.selection.excluded.some(s=>s.id==='09-01'));
});
for(const study of catalog.studies) {
  test(study.id+' — all trials complete, deterministic protocol, durable answers across 12 seeds',()=>{
    for(let seed=0;seed<12;seed++){
      const p=createProtocol(study.id,seed);
      assert.deepEqual(p,createProtocol(study.id,seed));
      assert.equal(new Set(p.trials.map(t=>t.id)).size,p.trials.length);
      assert(p.explanation.length>20);
      const h=harness(seed);
      try {
        let state=start(h.store,study.id);
        assert.equal(state.debrief,null);
        assert(!('condition' in state));
        assert(!('normative' in state));
        assert(!('protocol' in state));
        while(state.status==='active'){
          assert.equal(state.trial.id,p.trials[state.currentIndex].id);
          const resumed=h.store.state(state.id);
          assert.deepEqual(resumed.trial,state.trial);
          state=h.step(state).state;
        }
        assert.equal(state.status,'completed');
        assert.equal(state.currentIndex,p.trials.length);
        assert(state.debrief.sources.every(s=>s.url.startsWith('https://')));
        const [exported]=h.store.exportJSON().sessions;
        assert.equal(exported.responses.length,p.trials.length);
        assert.equal(exported.protocolHash,fingerprint(exported.protocol));
        assert.equal(exported.seed,seed);
        assert.equal(start(h.store,study.id).id,state.id);
        assert.match(h.store.exportCSV(),new RegExp(study.id));
      } finally {h.store.close();}
    }
  });
}
test('randomization visits every condition without rerandomizing a saved participant',()=>{
  const expected={'11-06':2,'01-01':2,'04-01':4,'04-07':3,'08-01':1,'09-03':2,'09-05':2,'13-01':2,'14-01':2,'16-02':2,'23-01':5,'25-01':1,'26-01':1};
  for(const [id,count] of Object.entries(expected)){
    const conditions=new Set(Array.from({length:120},(_,seed)=>createProtocol(id,seed).condition));
    assert.equal(conditions.size,count,id);
  }
});
test('lottery probability references, exact sequences and Bayes updates are correct',()=>{
  assert(Math.abs(0.9**7-0.4782969)<1e-9);
  assert(Math.abs(posterior(.5,.7,.3,1,0)-.7)<1e-12);
  assert(Math.abs(posterior(.5,.7,.3,7,3)-(.7**4/(.7**4+.3**4)))<1e-12);
  assert.equal(posterior(.5,.7,.3,5,5),.5);
  assert(Math.abs(marginal([.6,.3,.1],[.7,.9,.1])-.7)<1e-12);
  assert.equal(createProtocol('03-02',1).normative.sequence.referenceCount,72);
  for(const seed of [1,2,3,4]){
    const p=createProtocol('25-01',seed);
    for(const ref of Object.values(p.normative))assert(Math.abs(ref.posterior-posterior(.5,.7,.3,ref.red,ref.blue))<1e-12);
  }
});
test('illusory correlation exposes every feature/label pair exactly four times',()=>{
  for(let seed=0;seed<10;seed++){
    const p=createProtocol('17-01',seed),counts={};
    for(const t of p.trials.filter(t=>t.stimulus?.kind==='drawing')){
      const key=t.stimulus.feature+':'+t.stimulus.label;counts[key]=(counts[key]||0)+1;
      assert.equal(t.minViewMs,1600);
    }
    assert.equal(Object.keys(counts).length,6);
    assert(Object.values(counts).every(n=>n===4));
  }
});
test('invalid answers: missing, out of range, NaN, unknown, duplicate ranks, totals',()=>{
  const rank=createProtocol('06-01',0).trials[0];
  const ranked=answerFor(rank);
  assert.throws(()=>validateAnswer(rank,{...ranked,bank:ranked.feminist}),/順位/);
  assert.throws(()=>validateAnswer(rank,{...ranked,bank:0}),/数値/);
  assert.throws(()=>validateAnswer(rank,{...ranked,bank:NaN}),/数値/);
  assert.throws(()=>validateAnswer(rank,{...ranked,extra:1}),/未定義/);
  assert.throws(()=>validateAnswer(rank,{}));
  assert.throws(()=>validateAnswer(rank,{...ranked,bank:1.5}),/整数/);
  const history=createProtocol('23-01',0).trials[0];
  assert.throws(()=>validateAnswer(history,Object.fromEntries(history.sumFields.map(key=>[key,50]))),/100/);
});
test('conditional price distinguishes refusing to sell from zero price and NA is distinct from zero',()=>{
  const p=createProtocol('16-02',0),t=p.trials.find(t=>t.id==='price');
  assert.deepEqual(validateAnswer(t,{sell:'no'}),{sell:'no'});
  assert.deepEqual(validateAnswer(t,{sell:'yes',price:0}),{sell:'yes',price:0});
  assert.throws(()=>validateAnswer(t,{sell:'no',price:0}),/対象外/);
  assert.throws(()=>validateAnswer(t,{sell:'yes'}));
  const share=createProtocol('12-01',0,{legacy:true}).trials.find(t=>t.id==='shares');
  const answer=answerFor(share);answer['share-0']=null;answer['share-1']=0;
  assert.equal(validateAnswer(share,answer)['share-0'],null);
  assert.equal(validateAnswer(share,answer)['share-1'],0);
});
test('measured exposure requires both visible time and sufficient wall time',()=>{
  assert.throws(()=>validateMetrics(metrics(0),2200),/刺激/);
  assert.throws(()=>validateMetrics({...metrics(0),activeMs:500}),/一致/);
  const h=harness();
  try {
    const state=start(h.store,'13-01');
    const payload={trialIndex:0,trialId:state.trial.id,submissionId:randomUUID(),answer:{},metrics:metrics(24000)};
    assert.throws(()=>h.store.submit(state.id,payload),/刺激/);
    assert.equal(h.store.responses(state.id).length,0);
    h.advance(25000);
    assert.equal(h.store.submit(state.id,payload).currentIndex,1);
  } finally {h.store.close();}
});
test('idempotent resend; reject changed payload, skipped trial and old answer rewrite',()=>{
  const h=harness();
  try {
    const first=start(h.store,'03-01');
    const {state:second,payload}=h.step(first);
    assert.equal(h.store.submit(first.id,payload).currentIndex,second.currentIndex);
    assert.equal(h.store.responses(first.id).length,1);
    assert.throws(()=>h.store.submit(first.id,{...payload,answer:{hospital:'small'}}),/変更/);
    assert.throws(()=>h.store.submit(first.id,{...payload,submissionId:randomUUID()}),/回答済み/);
    assert.throws(()=>h.store.submit(first.id,{...payload,trialIndex:5,submissionId:randomUUID()}),/回答済み/);
  } finally {h.store.close();}
});
test('file database survives close/reopen and preserves exact assignment and responses',()=>{
  const directory=mkdtempSync(join(tmpdir(),'judgment-test-'));
  const filename=join(directory,'test.sqlite');
  let h=harness(7,filename);
  let state;
  try {
    state=start(h.store,'11-06');
    state=h.step(state).state;
    const exported=h.store.exportJSON().sessions[0];
    h.store.close();h=null;
    const reopened=new Store(filename,{seed:()=>99});
    try {
      assert.equal(start(reopened,'11-06').id,state.id);
      assert.deepEqual(reopened.state(state.id).trial,state.trial);
      assert.equal(reopened.exportJSON().sessions[0].protocolHash,exported.protocolHash);
      assert.equal(reopened.responses(state.id).length,1);
    } finally {reopened.close();}
  } finally {if(h)h.store.close();rmSync(directory,{recursive:true,force:true});}
});
test('withdrawal always discloses fictitious feedback and permanently ends the session',()=>{
  const h=harness();
  try {
    let state=start(h.store,'09-03');
    while(state.trial.id!=='feedback')state=h.step(state).state;
    const ended=h.store.withdraw(state.id);
    assert.equal(ended.status,'withdrawn');
    assert.match(ended.debrief.explanation,/実際の採点ではなく/);
    assert.equal(ended.trial,null);
    assert.equal(start(h.store,'09-03').status,'withdrawn');
  } finally {h.store.close();}
});
test('paired independent answers: two members, matched totals and missingness',()=>{
  const h=harness();
  try {
    let a=start(h.store,'12-01',{participant:'pair-A'});
    let b=start(h.store,'12-01',{participant:'pair-B',pairCode:a.pairCode});
    assert.equal(a.pairCode,b.pairCode);
    assert.throws(()=>start(h.store,'12-01',{participant:'pair-C',pairCode:a.pairCode}),/2名/);
    // Preserve coverage of the old pair-record format using explicit archived protocols.
    const archived=createProtocol('12-01',1,{legacy:true});
    for(const state of [a,b])h.store.db.prepare('UPDATE sessions SET protocol=?,protocol_hash=? WHERE id=?').run(JSON.stringify(archived),fingerprint(archived),state.id);
    a=h.store.state(a.id);b=h.store.state(b.id);
    a=h.step(a,{cohabit:'yes',recall:'食事を用意しました。'}).state;
    b=h.step(b,{cohabit:'yes',recall:'食器を片付けました。'}).state;
    const answersA=answerFor(a.trial),answersB=answerFor(b.trial);
    answersA['share-0']=70;answersB['share-0']=60;
    answersA['share-1']=null;
    a=h.step(a,answersA).state;b=h.step(b,answersB).state;
    assert(!JSON.stringify(a).includes('pair-B'));
    const [pair]=h.store.pairs();
    assert.equal(pair.bothCohabit,true);
    assert.equal(pair.totals['share-0'].sum,130);
    assert.equal(pair.totals['share-0'].excess,30);
    assert.equal(pair.totals['share-1'].sum,null);
  } finally {h.store.close();}
});
test('analysis uses target fields and distinguishes neutral attitudes',()=>{
  const p=createProtocol('08-01',1);
  assert.deepEqual(analyze(p,[{trialId:'eyes',answer:{direction:'equal'}}]),{});
  const l=createProtocol('06-01',1);
  assert.equal(analyze(l,[{trialId:'linda',answer:{bank:3,feminist:1,conjunction:2}}]).conjunction.violation,true);
  const a=createProtocol('09-05',1);
  assert.deepEqual(analyze(a,[{trialId:'pre',answer:{attitude:0}},{trialId:'post',answer:{attitude:20,reportedChange:2}}]).attitude,{pre:0,post:20,difference:20,selfReported:2,neutralPre:true});
});
test('CSV protects text formulas, quotes, Japanese and preserves numeric negative answers',()=>{
  assert.equal(csvCell('=1+1'),'"\'=1+1"');
  assert.equal(csvCell('-CMD'),'"\'-CMD"');
  assert.equal(csvCell(-50),'"-50"');
  assert.equal(csvCell('日本語,"例"'),'"日本語,""例"""');
});
test('HTTP routes, invalid bodies, security boundaries and export formats',async ()=>{
  const h=harness();
  const server=createApp(h.store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try {
    const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/lang="ja"/);
    assert.equal((await fetch(base,{headers:{'sec-fetch-site':'cross-site'}})).status,200);
    assert.equal((await fetch(base+'/api/sessions',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    for(const file of ['app.js','styles.css','favicon.svg'])assert.equal((await fetch(base+'/'+file)).status,200);
    assert.equal((await fetch(base+'/api/catalog').then(r=>r.json())).studies.length,21);
    assert.equal((await fetch(base+'/server/store.mjs')).status,404);
    assert.equal((await fetch(base+'/data/local.sqlite')).status,404);
    assert.equal((await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.invalid'},body:'{}'})).status,403);
    const rejectedHost=await new Promise((resolve,reject)=>{
      const req=request(base+'/api/sessions',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    assert.equal(rejectedHost,403);
    assert.equal((await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
    assert.equal((await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);
    assert.equal((await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(70000)})})).status,413);
    const response=await fetch(base+'/api/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studyId:'03-01',participant:'http-test',acknowledged:true,isTest:true})});
    assert.equal(response.status,200);
    const state=await response.json();assert.equal(state.trial.id,'hospital');
    assert.equal((await fetch(base+'/api/export.json').then(r=>r.json())).sessions.length,1);
    const csv=await fetch(base+'/api/export.csv');assert.match(csv.headers.get('content-disposition'),/attachment/);assert.match(await csv.text(),/session_id/);
  } finally {await new Promise(resolve=>server.close(resolve));h.store.close();}
});
