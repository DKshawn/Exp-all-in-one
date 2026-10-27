import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTimedAttempt, captureTimedInput, finishTimedAttempt } from '../public/timed-response.js';
import { createProtocol } from '../server/protocols.mjs';
import { Store } from '../server/store.mjs';
import { fieldHTML } from '../public/task-ui.js';
import { validateMetrics } from '../server/engine.mjs';

test('multiplication assigns only one fixed expression per participant, with the original five-second window',()=>{
  const conditions=new Set();
  for(let seed=0;seed<120;seed++){
    const protocol=createProtocol('11-06',seed),trials=protocol.trials.filter(trial=>trial.stimulus?.kind==='multiplication');
    assert.equal(trials.length,1);conditions.add(protocol.condition);
    const trial=trials[0];assert.equal(trial.responseWindowMs,5000);
    assert.deepEqual(trial.stimulus.factors,protocol.condition==='ascending'?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1]);
    assert.equal(trial.stimulus.factors.reduce((a,b)=>a*b),40320);
    assert(protocol.trials[0].startTimedTask);assert(!fieldHTML(trial.fields[0]).includes('class="number-range"'));
  }
  assert.deepEqual([...conditions].sort(),['ascending','descending']);
});

test('late input cannot replace the value present before the deadline, and a timed attempt only finishes once',()=>{
  const attempt=createTimedAttempt(5000,100);
  captureTimedInput(attempt,'512',5099);
  captureTimedInput(attempt,'40320',5100);
  assert.equal(finishTimedAttempt(attempt,'deadline',5099),null);
  const result=finishTimedAttempt(attempt,'deadline',5300);
  assert.equal(result.estimate,512);assert.equal(result.timed.elapsedMs,5200);
  captureTimedInput(attempt,'999',5400);assert.equal(attempt.value,512);
  assert.equal(finishTimedAttempt(attempt,'submitted',5400),null);
});

test('zero, blank, incomplete input and interrupted attempts are distinguished',()=>{
  for(const [input,expected] of [['0',0],['',null],['-',null],['1.5',null],['-20',null],['1000',1000]]){
    const attempt=createTimedAttempt(5000,0);captureTimedInput(attempt,input,1000);
    assert.equal(finishTimedAttempt(attempt,'deadline',5000).estimate,expected);
  }
  const interrupted=createTimedAttempt(5000,0);captureTimedInput(interrupted,'2500',1000);
  assert.equal(finishTimedAttempt(interrupted,'interrupted',1100).estimate,null);
  const lateClick=createTimedAttempt(5000,0);captureTimedInput(lateClick,'2000',3000);
  assert.equal(finishTimedAttempt(lateClick,'submitted',5001).timed.endReason,'deadline');
});

function harness(){
  let time=100000;
  const store=new Store(':memory:',{clock:()=>time,seed:()=>4});
  let state=store.start({studyId:'11-06',participant:'timed-test',acknowledged:true});
  time+=200;
  state=store.submit(state.id,{trialIndex:0,trialId:'ready',submissionId:randomUUID(),answer:{},
    metrics:{rtMs:100,activeMs:100,focusLosses:0,reloadCount:0}});
  return {store,state,advance:ms=>time+=ms,payload:(estimate,endReason,elapsedMs)=>({
    trialIndex:1,trialId:'product',submissionId:randomUUID(),answer:{estimate},
    metrics:{rtMs:elapsedMs,activeMs:elapsedMs,focusLosses:0,reloadCount:0,timed:{limitMs:5000,elapsedMs,endReason}}
  })};
}

test('the server rejects incomplete or impossible timing records and a deadline claimed before wall time elapsed',()=>{
  const h=harness();
  try{
    assert.throws(()=>h.store.submit(h.state.id,h.payload(null,'submitted',100)),{status:400});
    assert.throws(()=>h.store.submit(h.state.id,h.payload(2000,'submitted',5001)),{status:400});
    assert.throws(()=>h.store.submit(h.state.id,h.payload(2000,'interrupted',100)),{status:400});
    assert.throws(()=>h.store.submit(h.state.id,h.payload(null,'deadline',4999)),{status:400});
    assert.throws(()=>h.store.submit(h.state.id,h.payload(null,'deadline',5000)),{status:400});
    assert.equal(h.store.responses(h.state.id).length,1);
    h.advance(5000);const payload=h.payload(null,'deadline',5000);
    h.store.submit(h.state.id,payload);h.store.submit(h.state.id,payload);
    const record=h.store.exportJSON().sessions[0];
    assert.equal(record.responses.length,2);assert.equal(record.responses[1].answer.estimate,null);
    assert.equal(record.analysis.product.responded,false);assert.equal(record.analysis.product.endReason,'deadline');
    assert(h.store.exportCSV().includes('timed_response_json'));
  }finally{h.store.close();}
});

test('a submitted estimate and a refresh interruption retain separate timing and missingness records',()=>{
  for(const [value,reason,elapsed] of [[2250,'submitted',2300],[null,'interrupted',200]]){
    const h=harness();
    try{
      h.advance(elapsed);h.store.submit(h.state.id,h.payload(value,reason,elapsed));
      const record=h.store.exportJSON().sessions[0];
      assert.equal(record.analysis.product.estimate,value);assert.equal(record.analysis.product.endReason,reason);
    }finally{h.store.close();}
  }
  const metrics={rtMs:100,activeMs:100,focusLosses:0,reloadCount:0,language:'ja',translationVersion:'2026-10-27.1',languageHistory:[{language:'ja',atActiveMs:0}]};
  assert.equal(validateMetrics(metrics).translationVersion,'2026-10-27.1','Unchanged older pending responses remain acceptable');
});
