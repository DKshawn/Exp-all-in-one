import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {classroomProtocol} from '../server/classroom.mjs';
import {catalog,publicTrial,analyze} from '../server/protocols.mjs';
import {validateAnswer} from '../server/engine.mjs';
import {expandedText} from '../public/expanded-messages.js';
import {fieldHTML} from '../public/task-ui.js';

const protocol=(id,seed=0)=>classroomProtocol(id,seed,true);
const settings=studyIds=>({studyIds,randomizeExperiments:false,randomizeChoices:false,requestId:randomUUID()});
const metrics={rtMs:100,activeMs:100,focusLosses:0,reloadCount:0};
function fixture(){let now=10000;const store=new Store(':memory:',{clock:()=>now,seed:()=>2});return {store,send(state,answer){now+=200;return store.runs.submit(state.id,{trialIndex:state.currentIndex,trialId:state.trial.id,submissionId:randomUUID(),answer,metrics});}};}

test('each of the 14 formerly held tasks has specific scope, missing materials and conditions in all languages',()=>{
 const ids=['01-02','04-01','04-07','09-03','09-05','09-07','12-01','13-01','16-02','17-01','20-01','23-01','26-01','33-03'];
 assert.equal(catalog.studies.filter(s=>s.classroomEnabled).length,14);
 assert.deepEqual(catalog.studies.filter(s=>!s.classroomEnabled).map(s=>s.id),['04-07','09-03','09-05','13-01','16-02','17-01','20-01']);
 for(const id of ids)for(const lang of ['ja','zh','en']){
  const s=catalog.studies.find(s=>s.id===id);assert(s.original[lang].length>20);assert(s.restoration.missingMaterials[lang][0].length>10);assert(s.restoration.conditions[lang][0].length>10);
 }
});

test('compound bets retain two published preference pairs without an invented correctness score',()=>{
 const p=protocol('01-02');assert.equal(p.trials.length,2);assert.deepEqual(p.normative,{});
 assert.deepEqual(p.trials.map(t=>t.id),['simple-conjunctive','simple-disjunctive']);
 assert(p.trials.every(t=>t.fields.length===1&&t.fields[0].id==='bet'));
 assert(Math.abs(p.design.eventProbabilities.conjunctive-.4782969)<1e-12);
 assert(Math.abs(p.design.eventProbabilities.disjunctive-.5217031)<1e-12);
});

test('published profile subset crosses base rate and target without inventing posterior keys',()=>{
 const conditions=new Set();
 for(let seed=0;seed<60;seed++){
  const p=protocol('04-01',seed);conditions.add(p.condition);
  assert.deepEqual(p.trials.map(t=>t.id),['jack','dick','null']);assert.deepEqual(Object.keys(p.normative),['null']);
  assert.deepEqual(validateAnswer(p.trials[0],{probability:35.5}),{probability:35.5});
  const value=analyze(p,[{trialId:'jack',answer:{probability:35.5}}]).profileProbabilities.jack.engineerProbability;
  assert.equal(value,p.design.target==='engineer'?35.5:64.5);
 }
 assert.equal(conditions.size,4);
});

test('false consensus restores consensus before self decision and all three eight-trait targets',()=>{
 const p=protocol('09-07');assert.equal(p.trials.length,4);assert.equal(p.trials[0].id,'consensus');
 assert.throws(()=>validateAnswer(p.trials[0],{agreePercent:60,refusePercent:50}),/100/);
 for(const t of p.trials.slice(1)){
  const traits=t.fields.filter(f=>f.type==='number');assert.equal(traits.length,8);assert(traits.every(f=>f.min===-50&&f.max===50));
 }
 assert.equal(p.trials.find(t=>t.id==='traits-self').fields[0].id,'decision');
 assert.equal(p.trials.flatMap(t=>t.fields).filter(f=>f.id==='confidence').length,0);
});

test('real-conversation pairing is reciprocal within a lesson and preserves independent non-complementary estimates',()=>{
 const h=fixture(),{store}=h;try{
  const lesson=store.classroom.start(settings(['12-01']));
  const a=store.classroom.join({studentId:'0000001'}),b=store.classroom.join({studentId:'0000002'}),c=store.classroom.join({studentId:'0000003'});
  assert.throws(()=>h.send(a.run,{partnerStudentId:'0000001',selfSpeakingPercent:70,partnerSpeakingPercent:35}),/相手/);
  assert.throws(()=>h.send(a.run,{partnerStudentId:'abcdefg',selfSpeakingPercent:70,partnerSpeakingPercent:35}),/7桁/);
  h.send(a.run,{partnerStudentId:'0000002',selfSpeakingPercent:70,partnerSpeakingPercent:35});
  h.send(b.run,{partnerStudentId:'0000001',selfSpeakingPercent:60,partnerSpeakingPercent:50});
  h.send(c.run,{partnerStudentId:'0000002',selfSpeakingPercent:40,partnerSpeakingPercent:60});
  const result=store.exportJSON().conversationPairs;
  assert.equal(result.paired.length,1);assert.equal(result.unpaired.length,1);
  assert.equal(result.paired[0].lessonId,lesson.id);assert.deepEqual(result.paired[0].relativeSelfEstimates,[20,25]);
  assert.equal(result.paired[0].meanRelativeSelfEstimate,22.5);assert.equal(result.paired[0].selfEstimateSumExcess,30);
  assert.deepEqual(result.paired[0].withinResponseSums,[105,110]);
  store.classroom.end(lesson.id);store.classroom.start(settings(['12-01']));
  h.send(store.classroom.student(a.token).run,{partnerStudentId:'0000002',selfSpeakingPercent:20,partnerSpeakingPercent:80});
  const later=store.exportJSON().conversationPairs;assert.equal(later.paired.length,1);assert.equal(later.unpaired.length,2);
 }finally{store.close();}
});

test('Gurka Experiment 1 has five groups, four probabilities and twelve seven-point relevance judgments',()=>{
 const groups=new Set();
 for(let seed=0;seed<40;seed++){
  const p=protocol('23-01',seed);groups.add(p.condition);assert.equal(p.trials.length,2);
  assert.equal(p.trials[0].sumFields.length,4);assert.equal(p.trials[1].fields.length,12);
  assert(p.trials[1].fields.every(f=>f.min===1&&f.max===7&&f.step===1));
  assert(!p.trials.some(t=>t.id==='historical-knowledge'));
 }
 assert.equal(groups.size,5);
});

test('bag–can task retains source matrices, all 24 odds judgments and condition boundaries',()=>{
 const p=protocol('26-01');assert.equal(p.trials.length,24);
 for(let round=1;round<=2;round++){
  const trials=p.trials.filter(t=>t.sourceCondition.round===round);assert.equal(trials.length,12);
  for(let start=0;start<12;start+=4){const block=trials.slice(start,start+4);assert.equal(new Set(block.map(t=>t.sourceCondition.condition)).size,1);assert.equal(new Set(block.map(t=>t.sourceCondition.color)).size,4);}
 }
 const red=p.trials.find(t=>t.sourceCondition.condition==='80-18'&&t.sourceCondition.color==='red');
 assert.deepEqual(red.stimulus.bagCanCounts,[[8,3,6,1],[1,6,3,8]]);
 assert.deepEqual(red.stimulus.discMatrix,[[80,1,1,18],[1,80,18,1],[18,1,80,1],[1,18,1,80]]);
 assert(Math.abs(p.normative[red.id].oddsIoverII-667/233)<1e-12);
 assert.throws(()=>validateAnswer(red,{bagIWeight:0,bagIIWeight:0}),/0/);
 assert.deepEqual(validateAnswer(red,{bagIWeight:1000.5,bagIIWeight:2}),{bagIWeight:1000.5,bagIIWeight:2});
 assert.equal(analyze(p,[{trialId:red.id,answer:{bagIWeight:1,bagIIWeight:0}}])[red.id].oddsIoverII,'Infinity');
 assert.equal(analyze(p,[{trialId:red.id,answer:{bagIWeight:0,bagIIWeight:1}}])[red.id].logOddsIoverII,'-Infinity');
});

test('risk task restores all 30 items, ratio reference, acceptability and nine ordered scales',()=>{
 const p=protocol('33-03');assert.equal(p.trials.length,41);assert.equal(p.trials[0].fields.length,30);assert.equal(p.trials[1].fields.length,30);
 assert.equal(p.trials.filter(t=>t.id.startsWith('acceptability-')).length,30);
 const scales=p.trials.filter(t=>t.id.startsWith('dimension-'));assert.equal(scales.length,9);
 assert.deepEqual(scales.map(t=>t.id),['dimension-voluntariness','dimension-immediacy','dimension-exposedKnowledge','dimension-scientificKnowledge','dimension-control','dimension-newness','dimension-catastrophic','dimension-dread','dimension-fatality']);
 assert(scales.every(t=>t.fields.length===30&&t.fields.every(f=>f.min===1&&f.max===7&&f.control==='scale')));
 assert.match(expandedText['risk.dimension.control'][2],/1:.*uncontroll/i);assert.match(expandedText['risk.dimension.newness'][2],/1:.*new/i);
 const tied=Object.fromEntries(p.trials[0].fields.map(f=>[f.id,1]));assert.deepEqual(validateAnswer(p.trials[0],tied),tied);
 const shown=publicTrial(p,1,[{trialId:'risk-ranking',answer:tied}]);assert(shown.fields.every(f=>f.readOnly&&f.min===10&&f.max===10));
 assert.match(fieldHTML(shown.fields[0]),/value="10" readonly/);
 const accept=p.trials.find(t=>t.id.startsWith('acceptability-'));
 assert.throws(()=>validateAnswer(accept,{acceptability:'higherAcceptable',higherMultiplier:0}),/0/);
 const key=accept.id.slice('acceptability-'.length);
 assert.equal(analyze(p,[{trialId:accept.id,answer:{acceptability:'higherAcceptable',higherMultiplier:4}}]).acceptability[key].riskAdjustmentFactor,.25);
 assert.equal(analyze(p,[{trialId:accept.id,answer:{acceptability:'lowerNeeded',lowerMultiplier:4}}]).acceptability[key].riskAdjustmentFactor,4);
});

test('server enforces risk minimum reference from the saved ranking, while allowing larger ratio responses',()=>{
 const h=fixture(),{store}=h;try{
  store.classroom.start(settings(['33-03']));let state=store.classroom.join({studentId:'0123456'}).run;
  const ranks=Object.fromEntries(state.trial.fields.map((f,i)=>[f.id,i<2?1:i+1]));state=h.send(state,ranks);
  const answers=Object.fromEntries(state.trial.fields.map(f=>[f.id,f.readOnly?10:1000.5]));
  assert.equal(state.trial.fields.filter(f=>f.readOnly).length,2);
  const tampered={...answers,[state.trial.fields[0].id]:11};assert.throws(()=>h.send(state,tampered),/数値/);
  assert.equal(store.exportJSON().sessions[0].responses.length,1);
  state=h.send(state,answers);assert(state.trial.id.startsWith('acceptability-'));
 }finally{store.close();}
});
