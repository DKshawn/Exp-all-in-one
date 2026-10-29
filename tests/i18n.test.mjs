import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { LANGUAGES, TRANSLATION_VERSION, UI_MESSAGES, normalizeLanguage, documentLanguage, translate, translateError, hasTranslation, localizeTrial } from '../public/i18n.js';
import { taskMessages } from '../public/locale-data.js';
import { revisedMessages } from '../public/revised-messages.js';
import { expandedMessages } from '../public/expanded-messages.js';
import { escape, fieldHTML, stimulusHTML } from '../public/task-ui.js';
import { catalog, createProtocol, publicTrial } from '../server/protocols.mjs';
import { studentProtocol } from '../server/runs.mjs';
import { Store } from '../server/store.mjs';
import { validateMetrics, fingerprint } from '../server/engine.mjs';
import { createApp } from '../server/index.mjs';

const textOf=trial=>[
  trial.title,trial.body,
  ...trial.fields.flatMap(field=>[field.label,field.nullLabel,...(field.options||[]).map(option=>option.label)]),
  ...(trial.stimulus?.lines||[]).map(line=>line.text)
].filter(value=>value!==undefined);
function structureOf(trial){
  const copy=structuredClone(trial);copy.title='';copy.body='';
  for(const field of copy.fields){
    field.label='';if(field.nullLabel)field.nullLabel='';
    field.options?.forEach(option=>option.label='');
  }
  copy.stimulus?.lines?.forEach(line=>line.text='');return copy;
}
const metrics=(language='ja',extra={})=>({rtMs:3000,activeMs:3000,focusLosses:0,reloadCount:0,
  language,translationVersion:TRANSLATION_VERSION,languageHistory:[{language,atActiveMs:0}],...extra});
function answerFor(trial){
  const answer={};
  for(const field of trial.fields){
    if(field.when&&answer[field.when.id]!==field.when.equals)continue;
    if(field.type==='choice')answer[field.id]=field.id==='cohabit'?'no':field.options[0].value;
    if(field.type==='number')answer[field.id]=Math.ceil((field.min+field.max)/2);
    if(field.type==='text')answer[field.id]=field.pattern?'0000456':'保留原文 / Keep this text / 原文のまま';
  }
  trial.rankFields?.forEach((id,index)=>answer[id]=index+1);
  trial.sumFields?.forEach((id,index)=>answer[id]=index?0:100);
  return answer;
}

test('Japanese is the default; saved language codes map to valid document languages',()=>{
  for(const value of [undefined,null,'','fr','ja-JP',{},123])assert.equal(normalizeLanguage(value),'ja');
  for(const language of LANGUAGES)assert.equal(normalizeLanguage(language),language);
  assert.equal(documentLanguage('zh'),'zh-CN');
  assert.equal(translate('開始する'),'開始する');
  assert.equal(translate('開始する','zh'),'开始');
  assert.equal(translate('開始する','en'),'Start');
});

test('translations have no conflicting keys, missing text or altered numerical study parameters',()=>{
  const seen=new Map();
  // Small counts can be spelled out (once / third / 一年 / 两年). Numerical
  // bounds and all stimulus values are checked separately by structureOf.
  const digits=text=>(text.replaceAll(',','').match(/\d+(?:\.\d+)?/g)||[]).map(Number).filter(n=>n>=4).sort((a,b)=>a-b);
  for(const row of [...taskMessages,...revisedMessages,...expandedMessages,...UI_MESSAGES]){
    assert.equal(row.length,3);
    for(const text of row)assert.equal(typeof text,'string');
    for(const translated of row.slice(1)){
      assert(translated.length>0,row[0]);
      const words={four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',twelve:'12'};
      const numericText=text=>text.replaceAll('1万2千','12000').replace(/November/g,'11').replace(/\b(four|five|six|seven|eight|nine|ten|twelve)\b/gi,word=>words[word.toLowerCase()]).replace(/[四五六七八九]/g,c=>({四:'4',五:'5',六:'6',七:'7',八:'8',九:'9'}[c])).replaceAll('10代','teenage');
      if(revisedMessages.includes(row)||expandedMessages.includes(row))assert.deepEqual([...new Set(digits(numericText(translated)))],[...new Set(digits(numericText(row[0])))],row[0]);
      else assert.deepEqual(digits(translated),digits(row[0]),row[0]);
    }
    if(seen.has(row[0]))assert.deepEqual(row,seen.get(row[0]),row[0]);
    seen.set(row[0],row);
    assert(!/[\u3040-\u30ff]/.test(row[2]),row[2]);
  }
});

test('all current and archived experiments and condition variants translate without changing assignments, response values or timing',()=>{
  const seen=new Set();
  for(const study of [...catalog.studies,...catalog.retiredStudies])for(let seed=0;seed<120;seed++){
    const canonical=studentProtocol(study.id,seed);
    // Include the old per-task familiarity wording for resuming older saved trials.
    for(const trial of [...canonical.trials,...createProtocol(study.id,seed).trials]){
      for(const source of textOf(trial)){assert(hasTranslation(source),study.id+': '+source);seen.add(source);}
      for(const language of LANGUAGES){
        const localized=localizeTrial(trial,language);
        assert.deepEqual(structureOf(localized),structureOf(trial));
        if(language==='ja')assert.deepEqual(localized,trial);
        if(language==='en')for(const text of textOf(localized))assert(!/[\u3040-\u30ff\u3400-\u9fff]/.test(text),text);
        const rendered=localized.fields.map(field=>fieldHTML(field,language)).join('')+stimulusHTML(localized.stimulus,language);
        if(language==='en')assert(!/[\u3040-\u30ff\u3400-\u9fff]/.test(rendered),study.id+': '+rendered);
      }
    }
  }
  assert(seen.size>=290);
});

test('validation errors use the selected language, including dynamic numerical bounds',()=>{
  assert.equal(translateError('推定：0〜100の数値を入力してください。','en'),'Enter a number from 0 to 100.');
  assert.equal(translateError('-100〜100の数値を入力してください。','zh'),'请输入-100到100之间的数值。');
  assert.equal(translateError('割合は整数で入力してください。','en'),'Enter a whole number.');
  assert.equal(translateError('回答を選択してください。','zh'),'请回答这一项。');
  assert.equal(translateError('未知のエラー','en'),'Could not submit. Please try again.');
});

test('scale fields retain their accessible question and all seven response values in each language',()=>{
  const trial=createProtocol('23-01',1).trials.find(item=>item.id==='relevance');
  for(const language of LANGUAGES){
    const field=localizeTrial(trial,language).fields[0],html=fieldHTML(field,language);
    assert(html.includes('<legend id="label-'+field.id+'" class="sr-only">'+escape(field.label)+'</legend>'));
    assert(html.includes('<span class="scale-label" aria-hidden="true">'+escape(field.label)+'</span>'));
    assert.deepEqual([...html.matchAll(/type="radio" name="fact-0" value="(\d+)" required/g)].map(match=>Number(match[1])),[1,2,3,4,5,6,7]);
  }
});

test('language histories are bounded, monotonic and tied to the submitted presentation',()=>{
  const history=[{language:'ja',atActiveMs:0},{language:'en',atActiveMs:1000},{language:'zh',atActiveMs:1000}];
  const clean=validateMetrics(metrics('zh',{languageHistory:history}));
  assert.deepEqual(clean.languageHistory,history);
  assert.equal(clean.language,'zh');
  for(const invalid of [
    {language:'fr'}, {language:undefined}, {translationVersion:'old'}, {languageHistory:[]},
    {languageHistory:[{language:'ja',atActiveMs:1}]},
    {languageHistory:[{language:'ja',atActiveMs:0},{language:'ja',atActiveMs:3001}]},
    {languageHistory:[{language:'ja',atActiveMs:0},{language:'en',atActiveMs:2000},{language:'ja',atActiveMs:1000}]},
    {languageHistory:[{language:'ja',atActiveMs:0},{language:'en',atActiveMs:1000}]},
    {languageHistory:[{language:'ja',atActiveMs:0.5}]},
    {languageHistory:[null]}
  ])assert.throws(()=>validateMetrics(metrics('ja',invalid)));
  const legacy={rtMs:3000,activeMs:3000,focusLosses:0,reloadCount:0};
  assert.equal(validateMetrics(legacy).language,undefined);
});

for(const language of LANGUAGES)test('complete 101-item battery with '+language+' records language and authoritative translated presentations',()=>{
  let time=Date.parse('2026-10-27T00:00:00Z');
  const store=new Store(':memory:',{clock:()=>time,seed:()=>7});
  try{
    let state=store.runs.start({studentId:'translation-'+language});
    const initial=store.runs.row(state.id).manifest_hash;
    let count=0;
    while(state.status==='active'){
      const trial=localizeTrial(state.trial,language),duration=(trial.minViewMs||0)+100;
      const answer=answerFor(trial);time+=duration+100;
      const history=[{language:'ja',atActiveMs:0},{language,atActiveMs:50}];
      const payload={trialIndex:state.currentIndex,trialId:trial.id,submissionId:randomUUID(),answer,
        metrics:metrics(language,{rtMs:duration,activeMs:duration,languageHistory:history,presentations:[{trial:'untrusted client text'}],
          ...(trial.responseWindowMs?{timed:{limitMs:trial.responseWindowMs,elapsedMs:duration,endReason:'submitted'}}:{})})};
      state=store.runs.submit(state.id,payload);
      assert.equal(store.runs.submit(state.id,payload).currentIndex,state.currentIndex);
      count++;
    }
    assert.equal(count,101);assert.equal(state.status,'completed');
    assert.equal(store.runs.row(state.id).manifest_hash,initial);
    const exported=store.exportJSON({studentsOnly:true});
    assert.equal(exported.schemaVersion,5);assert.deepEqual(exported.localization.languages,LANGUAGES);
    for(const session of exported.sessions)for(const response of session.responses){
      assert.equal(response.metrics.language,language);
      assert.equal(response.metrics.translationVersion,TRANSLATION_VERSION);
      const source=publicTrial(session.protocol,response.trialIndex,session.responses);
      assert.deepEqual(response.answer,answerFor(localizeTrial(source,language)));
      for(const presentation of response.metrics.presentations){
        assert.deepEqual(presentation.trial,localizeTrial(source,presentation.language));
        assert.equal(presentation.hash,fingerprint(presentation.trial));
      }
    }
    const csv=store.exportCSV({studentsOnly:true});
    assert(csv.includes('"language_history_json"'));assert(csv.includes('"presentation_hash"'));
    assert(csv.includes('"'+language+'","'+TRANSLATION_VERSION+'"'));
  }finally{store.close();}
});

test('language changes and exact translated snapshots persist across a database restart',()=>{
  const directory=mkdtempSync(join(tmpdir(),'judgment-i18n-'));
  const filename=join(directory,'local.sqlite');let time=100000;
  let store=new Store(filename,{clock:()=>time,seed:()=>3});
  try{
    const state=store.runs.start({studentId:'language-persistence'});time+=4000;
    const history=[{language:'ja',atActiveMs:0},{language:'en',atActiveMs:500},{language:'zh',atActiveMs:2500}];
    store.runs.submit(state.id,{trialIndex:0,trialId:state.trial.id,submissionId:randomUUID(),answer:answerFor(state.trial),metrics:metrics('zh',{languageHistory:history})});
    const before=store.exportJSON({studentsOnly:true});store.close();
    store=new Store(filename,{clock:()=>time,seed:()=>9});
    const after=store.exportJSON({studentsOnly:true});assert.deepEqual(after,before);
    assert.equal(store.runs.start({studentId:'language-persistence'}).id,state.id);
    assert.equal(store.runs.state(state.id).currentIndex,1);
    const response=after.sessions.find(session=>session.responses.length).responses[0];
    assert.deepEqual(response.metrics.languageHistory,history);
    assert.equal(response.metrics.presentations.length,3);
  }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});

test('HTTP serves translation modules and keeps Japanese as the initial document language',async()=>{
  const store=new Store(':memory:');const server=createApp({store});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    for(const path of ['/i18n.js','/locale-data.js']){
      const response=await fetch(origin+path);assert.equal(response.status,200);
      assert.match(response.headers.get('content-type'),/javascript/);
    }
    assert.match(await (await fetch(origin)).text(),/<html lang="ja">/);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
