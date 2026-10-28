import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPreview } from '../server/preview.mjs';
import { classroomProtocol } from '../server/classroom.mjs';
import { createPreviewState, previewRun } from '../public/preview-state.js';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/index.mjs';

test('preview builds the same classroom trials and rejects unavailable or invalid settings',()=>{
  const plan={studyIds:['03-01','11-06','33-03'],randomizeExperiments:false,randomizeChoices:true};
  const data=createPreview(plan,()=>17);
  assert.deepEqual(data.protocols.map(p=>p.studyId),plan.studyIds);
  for(const protocol of data.protocols)assert.deepEqual(protocol.trials,classroomProtocol(protocol.studyId,17,true).trials);
  for(const bad of [{studyIds:[]},{studyIds:['03-01','03-01']},{studyIds:['04-07']},{studyIds:['03-01'],randomizeChoices:'true'}])
    assert.throws(()=>createPreview(bad,()=>17),{status:400});
});

test('skipped ranking can be previewed with a sample reference and answered ranking takes precedence',()=>{
  const {protocols}=createPreview({studyIds:['33-03']},()=>7);
  const preview=createPreviewState(protocols);
  assert.equal(previewRun(preview).trial.id,'risk-ranking');
  preview.index++;
  let ratios=previewRun(preview).trial;
  assert.equal(ratios.id,'risk-ratios');
  assert.equal(ratios.fields.filter(field=>field.readOnly).length,1);
  assert.equal(ratios.fields[0].value,10);
  const ids=protocols[0].trials[0].rankFields;
  preview.answers[0]=Object.fromEntries(ids.map((id,i)=>[id,i===0||i===1?1:i+1]));
  ratios=previewRun(preview).trial;
  assert.deepEqual(ratios.fields.filter(field=>field.readOnly).map(field=>field.id),ids.slice(0,2));
  assert.equal(protocols[0].trials[1].fields.some(field=>field.readOnly),false);
  preview.index=preview.pages.length;
  assert.equal(previewRun(preview).status,'completed');
});

test('preview completion includes debriefs for the pages actually shown',()=>{
  const preview=createPreviewState(createPreview({studyIds:['03-01','23-01']},()=>7).protocols);
  previewRun(preview);
  preview.index=preview.pages.length;
  assert.deepEqual(previewRun(preview).debrief,[]);
  preview.index=preview.pages.findIndex(page=>preview.protocols[page.protocolIndex].studyId==='23-01');
  previewRun(preview);
  preview.index=preview.pages.length;
  assert.match(previewRun(preview).debrief[0],/歴史課題/);
});

test('preview HTTP requests leave existing classroom and response records untouched',async()=>{
  const store=new Store(':memory:');
  const server=createApp(store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    store.classroom.join({studentId:'0012345'});
    const before=store.exportJSON();
    const response=await fetch(base+'/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({studyIds:['03-01','33-03']})});
    assert.equal(response.status,200);assert.equal((await response.json()).protocols.length,2);
    assert.deepEqual({...store.exportJSON(),exportedAt:null},{...before,exportedAt:null});
    assert.equal(store.runs.list().length,0);
    assert.equal(store.db.prepare('SELECT count(*) AS count FROM classroom_students').get().count,1);
    const child=await fetch(base+'/preview/student');
    assert.match(child.headers.get('content-security-policy'),/frame-ancestors 'self'/);
    const student=await fetch(base+'/');
    assert.match(student.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
