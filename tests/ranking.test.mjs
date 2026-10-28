import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { moveRank, rankingHTML, RANKING_CONTROL } from '../public/ranking.js';
import { classroomProtocol } from '../server/classroom.mjs';
import { publicTrial } from '../server/protocols.mjs';
import { validateAnswer } from '../server/engine.mjs';
import { Store } from '../server/store.mjs';
import { localizeTrial, TRANSLATION_VERSION } from '../public/i18n.js';

const linda=classroomProtocol('06-01',12,false).trials.find(trial=>trial.rankFields);
const blank=trial=>Object.fromEntries(trial.rankFields.map(id=>[id,null]));

test('unique drag ranks exchange occupied places without losing items or changing the measurement',()=>{
  let values=blank(linda);
  linda.rankFields.forEach((id,i)=>values=moveRank(values,id,i+1));
  const before={...values};
  values=moveRank(values,'bank',values.feminist);
  assert.equal(values.bank,before.feminist);assert.equal(values.feminist,before.bank);
  assert.deepEqual(Object.values(values).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(validateAnswer(linda,values),values);
  assert.equal(before.bank,6);
});

test('bank moves do not assign untouched options and displaced labels can be ranked again',()=>{
  const empty=blank(linda);
  let values=moveRank(empty,'bank',1);
  assert.equal(empty.bank,null);
  values=moveRank(values,'feminist',1);
  assert.equal(values.bank,null);assert.equal(values.feminist,1);
  assert.throws(()=>validateAnswer(linda,values));
  values=moveRank(values,'feminist',null);
  assert.deepEqual(values,empty);
  assert.throws(()=>moveRank(values,'missing',1));
  for(const rank of [0,9,1.5,NaN,'1'])assert.throws(()=>moveRank(values,'bank',rank));
});

test('risk ranking retains ties and downstream ratio references for all minimum-ranked items',()=>{
  const protocol=classroomProtocol('33-03',12,false),trial=protocol.trials.find(trial=>trial.rankFields);
  let values=blank(trial);
  trial.rankFields.forEach((id,i)=>values=moveRank(values,id,i<2?1:i+1,true));
  values=moveRank(values,trial.rankFields[2],1,true);
  assert.equal(Object.values(values).filter(rank=>rank===1).length,3);
  assert.deepEqual(validateAnswer(trial,values),values);
  const ratioIndex=protocol.trials.findIndex(item=>item.ratioRankingTrial===trial.id);
  const ratios=publicTrial(protocol,ratioIndex,[{trialId:trial.id,answer:values}]);
  assert.deepEqual(ratios.fields.filter(field=>field.readOnly).map(field=>field.id).sort(),trial.rankFields.slice(0,3).sort());
});

test('ranking labels retain all original text and order in three languages without numeric entry fields',()=>{
  for(const language of ['ja','zh','en']){
    const trial=localizeTrial(linda,language),html=rankingHTML(trial,language);
    assert(!html.includes('type="number"'));
    assert.equal((html.match(/data-rank-home=/g)||[]).length,8);
    assert.equal((html.match(/data-rank-place=/g)||[]).length,16);
    for(const field of trial.fields)assert(html.includes(field.label));
    assert(html.indexOf('ranking-bank')<html.indexOf('ranking-table'));
  }
});

test('submitted drag rankings and their input-method marker survive storage and export',()=>{
  const store=new Store(':memory:');
  try{
    store.classroom.start({studyIds:['06-01'],randomizeExperiments:false,randomizeChoices:false,requestId:randomUUID()});
    const student=store.classroom.join({studentId:'9999901'}),run=student.run;
    assert.equal(run.trial.id,'linda');
    let answer=blank(run.trial);
    run.trial.rankFields.forEach((id,i)=>answer=moveRank(answer,id,8-i));
    store.runs.submit(run.id,{trialIndex:run.currentIndex,trialId:run.trial.id,submissionId:randomUUID(),answer,
      metrics:{rtMs:1000,activeMs:1000,focusLosses:0,reloadCount:0,language:'ja',translationVersion:TRANSLATION_VERSION,
        languageHistory:[{language:'ja',atActiveMs:0}],responseControl:RANKING_CONTROL}});
    const record=store.db.prepare('SELECT answer,metrics FROM responses').get();
    assert.deepEqual(JSON.parse(record.answer),answer);
    assert.equal(JSON.parse(record.metrics).responseControl,RANKING_CONTROL);
    const exported=store.exportJSON().sessions.find(session=>session.studyId==='06-01').responses[0];
    assert.deepEqual(exported.answer,answer);
    assert.equal(exported.metrics.responseControl,RANKING_CONTROL);
  }finally{store.close();}
});
