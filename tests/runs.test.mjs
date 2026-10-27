import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';
import { catalog, createProtocol } from '../server/protocols.mjs';
import { studentProtocol } from '../server/runs.mjs';
import { fingerprint } from '../server/engine.mjs';

function answerFor(trial) {
  const answer={};
  for(const field of trial.fields){
    if(field.when&&answer[field.when.id]!==field.when.equals)continue;
    if(field.type==='choice')answer[field.id]=field.id==='cohabit'?'no':field.options[0].value;
    if(field.type==='number')answer[field.id]=Math.ceil((field.min+field.max)/2);
    if(field.type==='text')answer[field.id]='動作確認用の架空の回答です。';
  }
  trial.rankFields?.forEach((key,index)=>answer[key]=index+1);
  trial.sumFields?.forEach((key,index)=>answer[key]=index?0:100);
  return answer;
}
function harness(seed=1,filename=':memory:'){
  let time=Date.parse('2026-10-27T00:00:00Z');
  const store=new Store(filename,{seed:()=>seed,clock:()=>time});
  function payload(state,answer=answerFor(state.trial),extra={}){
    const min=state.trial.minViewMs||0;time+=min+200;
    return {trialIndex:state.currentIndex,trialId:state.trial.id,submissionId:randomUUID(),answer,
      metrics:{rtMs:min+100,activeMs:min+100,focusLosses:0,reloadCount:0,viewport:{width:1280,height:800},
        ...(state.trial.responseWindowMs?{timed:{limitMs:state.trial.responseWindowMs,elapsedMs:min+100,endReason:'submitted'}}:{})},...extra};
  }
  const step=(state,answer,extra)=>store.runs.submit(state.id,payload(state,answer,extra));
  const until=(state,condition)=>{
    while(state.status==='active'&&!condition(state))state=step(state);
    assert(condition(state),'Target trial must be reachable');return state;
  };
  return {store,payload,step,until};
}

function legacyRun(h,profile,studentId){
  const store=h.store,id=randomUUID(),now=store.clock();
  store.db.prepare('INSERT INTO runs (id,student_id,version,manifest_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run(id,studentId,profile+'-test','',now,now);
  const studies=[...catalog.studies.filter(study=>study.id!=='11-06'),...catalog.retiredStudies].sort((a,b)=>a.id.localeCompare(b.id));
  let offset=0;
  for(const [ordinal,study] of studies.entries()){
    const protocol=createProtocol(study.id,1,{legacy:true});protocol.version+='/'+profile;
    if(profile==='classroom-1'){
      const familiarity=protocol.trials.find(trial=>trial.id==='familiarity');familiarity.title='これまでの経験';familiarity.body='';
    }else{
      protocol.trials=protocol.trials.filter(trial=>trial.id!=='familiarity');
      if(study.id==='33-03')protocol.trials.push(studentProtocol('33-03',1).trials.at(-1));
    }
    const sessionId=store.createSession({participant:'run-'+id,studyId:study.id,isTest:false,protocolSeed:1,protocol});
    store.db.prepare('INSERT INTO run_steps VALUES (?,?,?,?,?)').run(id,ordinal,sessionId,offset,protocol.trials.length);
    offset+=protocol.trials.length;
  }
  store.db.prepare('UPDATE runs SET manifest_hash=? WHERE id=?').run(fingerprint(store.runs.manifest(id)),id);
  return store.runs.state(id);
}

test('student ID starts one durable 21-task run with no mode or acknowledgment; manifest is fixed',()=>{
  const h=harness();
  try{
    for(const studentId of [null,undefined,'  ','x'.repeat(81),'a\nb'])assert.throws(()=>h.store.runs.start({studentId}),/学生証番号/);
    const state=h.store.runs.start({studentId:'  Ｓ２０２６０１  '});
    assert.equal(state.studentId,'S202601');
    assert.equal(state.currentIndex,0);
    const records=h.store.exportJSON({studentsOnly:true});
    assert.equal(records.sessions.length,21);
    assert.deepEqual(records.runs[0].steps.map(s=>s.studyId),catalog.studies.map(s=>s.id));
    assert.equal(records.runs[0].manifestHash,fingerprint(records.runs[0].steps));
    assert(records.sessions.every(s=>s.isTest===false&&s.studentId==='S202601'&&s.runId===state.id));
    assert.equal(state.totalTrials,records.runs[0].steps.reduce((n,s)=>n+s.trialCount,0));
    assert.equal(h.store.runs.start({studentId:'S202601'}).id,state.id);
    assert.equal(h.store.runs.list().length,1);
    for(const key of ['studyId','condition','sources','protocol','isTest','title'])assert(!(key in state));
    assert.equal(state.debrief,null);
    assert.equal(h.store.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE presented_at IS NOT NULL').get().n,1);
  }finally{h.store.close();}
});

test('complete battery advances over all 21 boundaries and discloses only at the overall end',()=>{
  for(const seed of [0,7,19]){
    const h=harness(seed);
    try{
      let state=h.store.runs.start({studentId:'complete-'+seed}),lastPayload;
      const total=state.totalTrials;
      for(let index=0;index<total;index++){
        assert.equal(state.currentIndex,index);
        assert.equal(state.status,'active');
        assert.equal(state.debrief,null);
        lastPayload=h.payload(state);state=h.store.runs.submit(state.id,lastPayload);
      }
      assert.equal(state.status,'completed');
      assert.equal(state.trial,null);
      assert.equal(state.debrief.length,3);
      assert.match(state.debrief[0],/回答に関係なく/);
      assert.match(state.debrief[1],/架空/);
      assert.match(state.debrief[2],/歴史/);
      assert.equal(h.store.runs.submit(state.id,lastPayload).currentIndex,total);
      assert.equal(h.store.runs.start({studentId:'complete-'+seed}).status,'completed');
      assert.equal(h.store.db.prepare('SELECT COUNT(*) AS n FROM responses').get().n,total);
      const exported=h.store.exportJSON({studentsOnly:true});
      assert(exported.sessions.every(s=>s.status==='completed'&&s.protocolHash===fingerprint(s.protocol)));
      assert.equal(exported.runs[0].answered,total);
      assert.equal(exported.runs[0].familiarity.scope,'run');
      assert.equal(exported.runs[0].familiarity.known,'no');
      assert.equal(exported.pairs.length,0,'Non-cohabitants should not create pairs');
    }finally{h.store.close();}
  }
});

test('cross-task retries are idempotent and future trials cannot be skipped',()=>{
  const h=harness();
  try{
    let state=h.store.runs.start({studentId:'boundary-01'});
    const steps=h.store.runs.steps(state.id),boundary=steps[1].start_index;
    assert.throws(()=>h.store.runs.submit(state.id,{...h.payload(state),trialIndex:boundary}),{status:409});
    assert.throws(()=>h.store.runs.submit(state.id,{...h.payload(state),submissionId:{bad:true}}),{status:400});
    while(state.currentIndex<boundary-1)state=h.step(state);
    const payload=h.payload(state);
    state=h.store.runs.submit(state.id,payload);
    assert.equal(state.currentIndex,boundary);
    assert.equal(h.store.runs.submit(state.id,payload).currentIndex,boundary);
    assert.equal(h.store.runs.state(state.id).debrief,null);
    assert.equal(h.store.runs.start({studentId:'boundary-01'}).currentIndex,boundary);
    assert.throws(()=>h.store.runs.submit(state.id,{...payload,answer:{}}),{status:409});
    assert.throws(()=>h.store.runs.submit(state.id,{...payload,submissionId:randomUUID()}),{status:409});
    assert.equal(h.store.db.prepare('SELECT COUNT(*) AS n FROM responses').get().n,boundary);
    const pending=h.payload(state);h.store.runs.submit(state.id,pending);
    assert.equal(h.store.runs.submit(state.id,payload).currentIndex,boundary+1);
  }finally{h.store.close();}
});

test('database migration preserves standalone data and saved runs survive server restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'judgment-run-test-')),filename=join(directory,'test.sqlite');
  let h=harness(7,filename);
  try{
    h.store.start({studyId:'03-01',participant:'old-test',acknowledged:true,isTest:true});
    h.store.db.exec('DROP TABLE run_steps; DROP TABLE runs; PRAGMA user_version=1');
    h.store.close();h=harness(7,filename);
    assert.equal(h.store.db.prepare('PRAGMA user_version').get().user_version,4);
    let state=h.store.runs.start({studentId:'restart-01'});
    for(let i=0;i<5;i++)state=h.step(state);
    const manifest=h.store.runs.exportRecords()[0];
    h.store.close();h=harness(99,filename);
    const resumed=h.store.runs.start({studentId:'restart-01'});
    assert.equal(resumed.id,state.id);assert.equal(resumed.currentIndex,5);
    assert.deepEqual(resumed.trial,state.trial);
    assert.equal(h.store.runs.exportRecords()[0].manifestHash,manifest.manifestHash);
    assert.equal(h.store.exportJSON().sessions.length,22);
    assert.equal(h.store.exportJSON({studentsOnly:true}).sessions.length,21);
    const csv=h.store.exportCSV({studentsOnly:true});
    assert.match(csv,/student_id/);assert.match(csv,/restart-01/);assert(!csv.includes('old-test'));
  }finally{h.store.close();rmSync(directory,{recursive:true,force:true});}
});

test('withdrawal retires all unfinished tasks and discloses only previously presented fiction',()=>{
  const h=harness();
  try{
    const early=h.store.runs.start({studentId:'withdraw-early'});
    const ended=h.store.runs.withdraw(early.id);
    assert.equal(ended.status,'withdrawn');assert.equal(ended.trial,null);assert.deepEqual(ended.debrief,[]);
    assert(h.store.runs.steps(early.id).every(s=>s.status==='withdrawn'));
    assert.equal(h.store.runs.start({studentId:'withdraw-early'}).status,'withdrawn');
    assert.throws(()=>h.store.runs.submit(early.id,h.payload(early)),{status:409});
    let state=h.store.runs.start({studentId:'withdraw-feedback'});
    state=h.until(state,s=>s.trial.id==='feedback');
    const disclosed=h.store.runs.withdraw(state.id);
    assert.equal(disclosed.debrief.length,1);assert.match(disclosed.debrief[0],/成績/);
    assert.equal(disclosed.currentIndex,state.currentIndex);
    assert(h.store.runs.steps(state.id).every(s=>s.status!=='active'));
  }finally{h.store.close();}
});

test('cohabitant pairing happens only at its question, rolls back on errors and rejects a third member',()=>{
  const h=harness();
  try{
    const enter=id=>h.until(h.store.runs.start({studentId:id}),s=>s.pairSetup);
    let a=enter('pair-student-A'),b=enter('pair-student-B'),c=enter('pair-student-C');
    const context={cohabit:'yes',recall:'食器を片付けました。'};
    const first=h.payload(a,context,{pairCode:''});
    a=h.store.runs.submit(a.id,first);
    assert.match(a.pairCode,/^[A-Z0-9]{8}$/);
    assert.equal(h.store.runs.submit(a.id,first).pairCode,a.pairCode);
    assert.equal(h.store.pairs().length,1);
    const invalid=h.payload(b,context,{pairCode:'NOEXISTS'});
    assert.throws(()=>h.store.runs.submit(b.id,invalid),/見つかりません/);
    assert.equal(h.store.runs.state(b.id).currentIndex,b.currentIndex);
    const pairStep=h.store.runs.steps(b.id).find(s=>s.study_id==='12-01');
    assert.equal(h.store.responses(pairStep.session_id).length,0);
    assert.equal(h.store.session(pairStep.session_id).pair_id,null);
    const join=h.payload(b,context,{pairCode:a.pairCode.toLowerCase()});
    b=h.store.runs.submit(b.id,join);
    assert.equal(b.pairCode,a.pairCode);
    assert.equal(h.store.runs.submit(b.id,join).currentIndex,b.currentIndex);
    assert.throws(()=>h.store.runs.submit(b.id,{...join,pairCode:''}),{status:409});
    assert.throws(()=>h.store.runs.submit(c.id,h.payload(c,context,{pairCode:a.pairCode})),/利用できません/);
    assert.equal(h.store.runs.state(c.id).currentIndex,c.currentIndex);
    const aa=answerFor(a.trial),bb=answerFor(b.trial);
    aa['share-0']=70;bb['share-0']=60;aa['share-1']=null;
    h.step(a,aa);h.step(b,bb);
    const [pair]=h.store.pairs({studentsOnly:true});
    assert.equal(pair.bothCohabit,true);
    assert.deepEqual(pair.sessions.map(s=>s.studentId).sort(),['pair-student-A','pair-student-B']);
    assert.equal(pair.totals['share-0'].sum,130);
    assert.equal(pair.totals['share-1'].sum,null);
    assert(!JSON.stringify(a).includes('pair-student-B'));
  }finally{h.store.close();}
});

test('student requests and export routes use the continuous workflow, with a separate teacher page',async()=>{
  const h=harness(),server=createApp(h.store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  try{
    const start=await post('/api/runs',{studentId:'HTTP-2026'});
    assert.equal(start.status,410);
    let state=h.store.runs.start({studentId:'HTTP-2026'});
    const submitted=await post('/api/runs/'+state.id+'/answers',h.payload(state));
    assert.equal(submitted.status,200);state=await submitted.json();assert.equal(state.currentIndex,1);
    assert.equal((await fetch(base+'/api/runs/'+state.id).then(r=>r.json())).currentIndex,1);
    assert.equal((await fetch(base+'/api/runs').then(r=>r.json())).runs[0].studentId,'HTTP-2026');
    const old=await fetch(base+'/experiment/03-01',{redirect:'manual'});
    assert.equal(old.status,302);assert.equal(old.headers.get('location'),'/');
    const home=await fetch(base).then(r=>r.text());
    assert.match(home,/<title>実験<\/title>/);assert(!home.includes('/admin'));
    assert.match(await fetch(base+'/admin').then(r=>r.text()),/実験の管理/);
    for(const file of ['task-ui.js','admin.js'])assert.equal((await fetch(base+'/'+file)).status,200);
    assert.equal((await fetch(base+'/api/runs',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    const json=await fetch(base+'/api/export.json?scope=students').then(r=>r.json());
    assert.equal(json.runs.length,1);assert.equal(json.sessions.length,21);
    assert(json.sessions.every(s=>s.studentId==='HTTP-2026'));
    const csv=await fetch(base+'/api/export.csv?scope=students').then(r=>r.text());
    assert.match(csv,/HTTP-2026/);
    const withdrawn=await post('/api/runs/'+state.id+'/withdraw',{});
    assert.equal((await withdrawn.json()).status,'withdrawn');
  }finally{await new Promise(resolve=>server.close(resolve));h.store.close();}
});
test('prior exposure is asked once at the end; task-specific knowledge and risk measures remain',()=>{
  const protocols=catalog.studies.map(study=>studentProtocol(study.id,1));
  const trials=protocols.flatMap(protocol=>protocol.trials);
  assert.equal(trials.length,101);
  assert.equal(trials.filter(trial=>trial.id==='familiarity').length,0);
  assert.equal(trials.filter(trial=>trial.id==='battery-familiarity').length,1);
  assert.equal(trials.at(-1).id,'battery-familiarity');
  assert.equal(trials.at(-1).scope,'run');
  assert.match(trials.at(-1).fields[0].label,/実験を始める前/);
  assert.equal(trials.filter(trial=>trial.id==='historical-knowledge').length,1);
  assert.equal(protocols.at(-1).trials.filter(trial=>trial.fields.some(field=>field.id==='familiarity')).length,10);
});

test('an ongoing old run drops only unanswered checks, preserves answers and archives the original protocol',()=>{
  const h=harness();
  try{
    const initial=legacyRun(h,'classroom-1','ongoing-old-run');
    let state=h.store.runs.state(initial.id);
    for(let index=0;index<7;index++)state=h.step(state);
    assert.equal(state.trial.id,'familiarity');
    const pending=h.payload(state);
    const before=h.store.db.prepare('SELECT * FROM responses ORDER BY session_id,trial_index').all();
    const oldManifest=h.store.runs.row(state.id).manifest_hash;
    const oldSteps=h.store.runs.steps(state.id);
    h.store.runs.upgradeActiveRuns();
    const current=h.store.runs.state(state.id);
    assert.equal(current.id,initial.id);assert.equal(current.currentIndex,7);
    assert.equal(current.totalTrials,103);
    assert.equal(current.trial.id,'hospital');
    assert.deepEqual(h.store.db.prepare('SELECT * FROM responses ORDER BY session_id,trial_index').all(),before);
    assert.equal(h.store.runs.start({studentId:'ongoing-old-run'}).id,initial.id);
    assert.throws(()=>h.store.runs.submit(state.id,pending),{status:409});
    const exported=h.store.runs.exportRecords()[0];
    assert.equal(exported.revisions.length,1);
    assert.equal(exported.revisions[0].snapshot.run.manifest_hash,oldManifest);
    assert.deepEqual(exported.revisions[0].snapshot.steps,JSON.parse(JSON.stringify(oldSteps)));
    assert.equal(exported.manifestHash,fingerprint(exported.steps));
    h.store.runs.upgradeActiveRuns();
    assert.equal(h.store.runs.exportRecords()[0].revisions.length,1);
    let remaining=current,familiarityShown=0;
    while(remaining.status==='active'){
      if(remaining.trial.id==='battery-familiarity')familiarityShown++;
      assert.notEqual(remaining.trial.id,'familiarity');
      remaining=h.step(remaining);
    }
    assert.equal(familiarityShown,1);
    assert.equal(remaining.currentIndex,103);
    assert.equal(h.store.runs.exportRecords()[0].familiarity.known,'no');
  }finally{h.store.close();}
});

for(const answeredLetters of [0,3,6])test('active old classroom run retains '+answeredLetters+' answered English items and skips the rest',()=>{
  const h=harness();
  try{
    let state=legacyRun(h,'classroom-2','english-retirement-'+answeredLetters);
    state=h.until(state,s=>s.trial.id==='english');
    for(let index=0;index<answeredLetters;index++)state=h.step(state);
    const pending=h.payload(state),answered=state.currentIndex;
    const rows=h.store.db.prepare('SELECT * FROM responses ORDER BY session_id,trial_index').all();
    const ended=h.store.db.prepare("SELECT * FROM sessions WHERE status='completed' ORDER BY id").all();
    h.store.runs.upgradeActiveRuns();state=h.store.runs.state(state.id);
    assert.equal(state.trial.id,'context');assert.equal(state.currentIndex,answered);
    assert.equal(state.totalTrials,102+answeredLetters);
    assert.deepEqual(h.store.db.prepare('SELECT * FROM responses ORDER BY session_id,trial_index').all(),rows);
    for(const original of ended)assert.deepEqual(h.store.session(original.id),original);
    const retired=h.store.runs.steps(state.id).find(step=>step.study_id==='11-03');
    assert.equal(retired.status,'completed');assert.equal(JSON.parse(retired.protocol).trials.length,answeredLetters);
    if(answeredLetters<6)assert.throws(()=>h.store.runs.submit(state.id,pending),{status:409});
    assert.equal(h.store.runs.start({studentId:'english-retirement-'+answeredLetters}).id,state.id);
    assert(!h.store.runs.steps(state.id).some(step=>step.study_id==='11-06'),'Do not add a second anchor after an old participant saw the wheel');
    assert.equal(h.store.runs.exportRecords()[0].revisions.length,1);
    h.store.runs.upgradeActiveRuns();assert.equal(h.store.runs.exportRecords()[0].revisions.length,1);
  }finally{h.store.close();}
});

test('ended old runs remain unchanged and new students get multiplication without wheel or English word knowledge',()=>{
  const h=harness();
  try{
    const old=legacyRun(h,'classroom-2','ended-old');h.store.runs.withdraw(old.id);
    const before=h.store.exportJSON();h.store.runs.upgradeActiveRuns();assert.deepEqual(h.store.exportJSON(),before);
    const state=h.store.runs.start({studentId:'new-classroom'});
    const steps=h.store.runs.steps(state.id),ids=steps.map(step=>step.study_id);
    assert.equal(ids.length,21);assert(ids.includes('11-06'));
    assert(!ids.includes('01-01'));assert(!ids.includes('11-03'));assert.equal(state.totalTrials,101);
    for(const id of ['01-01','11-03'])assert.throws(()=>h.store.start({studyId:id,participant:'retired',acknowledged:true}),{status:410});
  }finally{h.store.close();}
});
