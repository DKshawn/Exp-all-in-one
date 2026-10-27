import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {classroomProtocol} from '../server/classroom.mjs';
import {catalog,publicTrial} from '../server/protocols.mjs';
import {validateAnswer} from '../server/engine.mjs';
import {TRANSLATION_VERSION,localizeTrial} from '../public/i18n.js';
import {createApp} from '../server/index.mjs';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';

const plan=(extra={})=>({studyIds:['08-01','03-01','11-06'],randomizeExperiments:false,randomizeChoices:false,requestId:randomUUID(),...extra});
function harness(){let clock=100000,seed=0;const store=new Store(':memory:',{clock:()=>clock,seed:()=>seed++});return {store,advance:ms=>clock+=ms};}

test('seven-digit login preserves leading zeros and waits without creating experimental records',()=>{
  const {store}=harness();try{
    for(const id of ['',1234567,'123456','12345678','abc1234','1e00000'])assert.throws(()=>store.classroom.join({studentId:id}),{status:400});
    const first=store.classroom.join({studentId:'0012345'});
    assert.equal(first.studentId,'0012345');assert.equal(first.phase,'waiting');assert.equal(first.run,null);
    assert.equal(store.classroom.join({studentId:'００１２３４５'}).token,first.token);
    assert.equal(store.list().length,0);assert.equal(store.runs.list().length,0);
  }finally{store.close();}
});
test('teacher start is idempotent, validates reviewed tasks, and lets waiting and late students enter',()=>{
  const {store}=harness();try{
    const student=store.classroom.join({studentId:'0012345'}),settings=plan();
    assert.throws(()=>store.classroom.start(plan({studyIds:[]})),{status:400});
    const held=catalog.studies.find(study=>!study.classroomEnabled);
    assert.throws(()=>store.classroom.start(plan({studyIds:[held.id]})),{status:400});
    const lesson=store.classroom.start(settings);
    assert.equal(store.classroom.start(settings).id,lesson.id);
    assert.throws(()=>store.classroom.start({...settings,randomizeChoices:true}),{status:409});
    assert.throws(()=>store.classroom.start(plan()),{status:409});
    const state=store.classroom.student(student.token);
    assert.equal(state.phase,'running');assert.equal(state.run.trial.id,'eyes');
    assert.deepEqual(store.runs.manifest(state.run.id).map(step=>step.studyId),settings.studyIds);
    assert.equal(store.classroom.join({studentId:'0012346'}).phase,'running');
    assert.equal(store.classroom.student(student.token).run.id,state.run.id);
    assert.equal(store.classroom.exportRecords()[0].assignments.length,2);
  }finally{store.close();}
});
test('random experiment and discrete answer orders persist; scales and internal time order stay intact',()=>{
  const {store}=harness();try{
    store.classroom.start(plan({randomizeExperiments:true,randomizeChoices:true}));
    const orders=new Set(),options=new Set();
    for(let i=0;i<24;i++){
      const student=store.classroom.join({studentId:String(1000000+i)}),before=store.runs.manifest(student.run.id);
      orders.add(before.map(step=>step.studyId).join(','));
      const session=store.runs.steps(student.run.id).find(step=>step.study_id==='08-01');
      options.add(JSON.parse(session.protocol).trials[0].fields[0].options.map(option=>option.value).join(','));
      assert.deepEqual(store.runs.manifest(store.classroom.student(student.token).run.id),before);
    }
    assert(orders.size>1);assert(options.size>1);
    assert.deepEqual(classroomProtocol('08-01',17,false).trials[1].fields[0].options.map(option=>option.value),['reverse','forward','equal']);
    const linda=classroomProtocol('06-01',17,true);assert.deepEqual(linda.trials[0].fields.map(field=>[field.min,field.max]),Array(8).fill([1,8]));
    assert.deepEqual(classroomProtocol('11-06',17,true).trials.map(trial=>trial.id),['ready','product']);
  }finally{store.close();}
});
test('ending a lesson preserves answers, returns students to waiting, and a later start creates a separate run',()=>{
  const h=harness(),{store}=h;try{
    const student=store.classroom.join({studentId:'0012345'}),lesson=store.classroom.start(plan({studyIds:['08-01']}));
    let state=store.classroom.student(student.token).run;h.advance(200);
    const payload={trialIndex:0,trialId:'eyes',submissionId:randomUUID(),answer:{direction:'reverse'},metrics:{rtMs:100,activeMs:100,focusLosses:0,reloadCount:0}};
    state=store.runs.submit(state.id,payload);
    const response=store.exportJSON().sessions[0].responses[0];
    store.classroom.end(lesson.id);store.classroom.end(lesson.id);
    const waiting=store.classroom.student(student.token);assert.equal(waiting.phase,'waiting');assert.equal(waiting.run.status,'withdrawn');
    assert.deepEqual(store.exportJSON().sessions[0].responses[0],response);
    assert.throws(()=>store.runs.submit(state.id,{...payload,trialIndex:1,trialId:'height',submissionId:randomUUID()}),{status:409});
    h.advance(100);store.classroom.start(plan({studyIds:['03-01']}));
    const next=store.classroom.student(student.token);assert.notEqual(next.run.id,state.id);assert.equal(next.run.trial.id,'hospital');
  }finally{store.close();}
});
test('restored height measures relative prediction confidence without a threshold, added premise or numerical confidence scale',()=>{
  const p=classroomProtocol('08-01',0,false);
  assert.deepEqual(p.trials.map(t=>t.id),['eyes','height']);
  assert.equal(p.trials[1].fields.length,1);assert.equal(p.trials[1].fields[0].type,'choice');
  assert(!JSON.stringify(p.trials).includes('180'));assert(!JSON.stringify(p.trials).includes('架空'));
  assert.deepEqual(p.normative,{});assert(!p.trials.some(t=>t.id.includes('familiarity')));
});

test('restored measurement accepts counts above 72, eight unique ranks, multiple completions and fractional 0–1 probabilities',()=>{
  const families=classroomProtocol('03-02',0,false).trials[0];
  assert.deepEqual(validateAnswer(families,{families:120}),{families:120});
  const linda=classroomProtocol('06-01',0,false).trials[0];
  assert.equal(linda.fields.length,8);const ranks=Object.fromEntries(linda.rankFields.map((id,i)=>[id,8-i]));
  assert.deepEqual(validateAnswer(linda,ranks),ranks);
  assert.throws(()=>validateAnswer(linda,{...ranks,bank:8}));
  const jones=classroomProtocol('14-01',0,false).trials[0];
  assert.equal(jones.fields.length,1);assert.deepEqual(validateAnswer(jones,{rewrite:'If only he had left later.\nIf only he had driven another route.'}),{rewrite:'If only he had left later.\nIf only he had driven another route.'});
  const bags=classroomProtocol('25-01',0,false);assert.equal(bags.trials.length,1);
  assert.deepEqual(validateAnswer(bags.trials[0],{posterior:.725}),{posterior:.725});
  assert.throws(()=>validateAnswer(bags.trials[0],{posterior:72.5}));
  assert(Math.abs(bags.normative.bags.posterior-1/(1+(3/7)**4))<1e-12);
  for(const language of ['ja','zh','en']){
    assert.match(localizeTrial(bags.trials[0],language).body,/0\.5/);
    assert(!JSON.stringify(localizeTrial(classroomProtocol('08-01',0,false).trials[1],language)).includes('180'));
  }
});

function answerFor(trial){
  const answer={};
  for(const field of trial.fields){
    if(field.when&&answer[field.when.id]!==field.when.equals)continue;
    if(field.type==='choice')answer[field.id]=field.options[0].value;
    if(field.type==='number')answer[field.id]=field.id==='posterior'?.72:field.exclusiveMin?1:field.min;
    if(field.type==='text')answer[field.id]=field.pattern?'0000456':'If only he had left later.\nIf only the boy had stopped.';
  }
  trial.rankFields?.forEach((id,i)=>answer[id]=i+1);
  trial.sumFields?.forEach((id,i)=>answer[id]=i?0:100);
  trial.ratioFields?.forEach(id=>answer[id]=1);
  return answer;
}
function payload(state,language='ja'){
  return {trialIndex:state.currentIndex,trialId:state.trial.id,submissionId:randomUUID(),answer:answerFor(state.trial),metrics:{
    rtMs:300,activeMs:300,focusLosses:0,reloadCount:0,language,translationVersion:TRANSLATION_VERSION,
    languageHistory:[{language,atActiveMs:0}],...(state.trial.responseWindowMs?{timed:{limitMs:5000,elapsedMs:300,endReason:'submitted'}}:{})}};
}
for(const language of ['ja','zh','en'])test('all fourteen restored teacher tasks complete in '+language+' with durable translations and exported presentation orders',()=>{
  const h=harness(),{store}=h;try{
    const ids=catalog.studies.filter(s=>s.classroomEnabled).map(s=>s.id);
    const lesson=store.classroom.start(plan({studyIds:ids,randomizeExperiments:true,randomizeChoices:true}));
    const student=store.classroom.join({studentId:'0000123'});let state=student.run;
    assert.equal(state.totalTrials,86);
    while(state.status==='active'){h.advance(500);state=store.runs.submit(state.id,payload(state,language));}
    assert.equal(state.status,'completed');assert.equal(store.classroom.student(student.token).phase,'finished');
    const json=store.exportJSON();assert.equal(json.sessions.length,14);assert.equal(json.lessons[0].id,lesson.id);
    assert.equal(json.sessions.flatMap(s=>s.responses).length,86);
    assert(json.sessions.every(s=>s.protocol.version.endsWith('/teacher-1')));
    for(const session of json.sessions)for(const response of session.responses){
      assert.equal(response.metrics.language,language);
      assert.deepEqual(response.metrics.presentations[0].trial,localizeTrial(publicTrial(session.protocol,response.trialIndex,session.responses),language));
    }
    const csv=store.exportCSV();assert.match(csv.split('\n')[0],/"lesson_id","lesson_settings_json","experiment_order_json","choice_order_json"/);
    assert(csv.includes(lesson.id));assert(csv.includes('randomizeExperiments'));assert(csv.includes('reverse'));
  }finally{store.close();}
});

test('server restart preserves active lesson settings, student token and exact assignment',()=>{
  const directory=mkdtempSync(join(tmpdir(),'judgment-teacher-'));
  assert(resolve(directory).startsWith(resolve(tmpdir())+sep));
  let store;try{
    const filename=join(directory,'local.sqlite');store=new Store(filename);
    const settings=plan({randomizeChoices:true,randomizeExperiments:true}),lesson=store.classroom.start(settings);
    const student=store.classroom.join({studentId:'0012345'}),manifest=store.runs.manifest(student.run.id),protocols=store.exportJSON().sessions.map(s=>s.protocol);
    store.close();store=new Store(filename);
    assert.equal(store.classroom.join({studentId:'0012345'}).token,student.token);
    assert.equal(store.classroom.active().id,lesson.id);
    assert.deepEqual(store.runs.manifest(student.run.id),manifest);
    assert.deepEqual(store.exportJSON().sessions.map(s=>s.protocol),protocols);
    assert.equal(store.classroom.start(settings).id,lesson.id);
  }finally{store?.close();rmSync(directory,{recursive:true,force:true});}
});

test('HTTP teacher flow: waiting, controlled start, answer, finish and separate next lesson',async()=>{
  const h=harness(),server=createApp(h.store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const post=(path,data)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  try{
    assert.equal((await post('/api/classroom/join',{studentId:'123456'})).status,400);
    const student=await post('/api/classroom/join',{studentId:'0012345'}).then(r=>r.json());assert.equal(student.phase,'waiting');
    const lesson=await post('/api/classroom/start',plan({studyIds:['08-01']})).then(r=>r.json());
    let state=await fetch(base+'/api/classroom/student/'+student.token).then(r=>r.json());assert.equal(state.phase,'running');
    h.advance(500);const answered=await post('/api/runs/'+state.run.id+'/answers',payload(state.run,'zh')).then(r=>r.json());assert.equal(answered.trial.id,'height');
    const dashboard=await fetch(base+'/api/classroom').then(r=>r.json());assert.equal(dashboard.students[0].answered,1);
    await post('/api/classroom/end/'+lesson.id,{});
    state=await fetch(base+'/api/classroom/student/'+student.token).then(r=>r.json());assert.equal(state.phase,'waiting');assert.equal(state.run.status,'withdrawn');
    await post('/api/classroom/start',plan({studyIds:['03-01']}));
    const next=await fetch(base+'/api/classroom/student/'+student.token).then(r=>r.json());assert.notEqual(next.run.id,state.run.id);
    assert.equal((await fetch(base+'/api/export.json').then(r=>r.json())).lessons.length,2);
    assert.equal((await post('/api/runs',{studentId:'0012345'})).status,410);
    assert.equal((await post('/api/sessions',{studyId:'09-03',isTest:false})).status,410);
  }finally{await new Promise(resolve=>server.close(resolve));h.store.close();}
});
