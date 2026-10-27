import { escape, fieldHTML, stimulusHTML, languageHTML } from './task-ui.js';
import { translate, translateError, format, localizeTrial, normalizeLanguage, documentLanguage, TRANSLATION_VERSION } from './i18n.js';
import { createTimedAttempt, captureTimedInput, finishTimedAttempt } from './timed-response.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const app=$('#app');
const storage={
  get(key,fallback=null){try{return JSON.parse(localStorage.getItem('classroom.'+key))??fallback;}catch{return fallback;}},
  set(key,value){localStorage.setItem('classroom.'+key,JSON.stringify(value));},
  remove(key){localStorage.removeItem('classroom.'+key);}
};
let language=normalizeLanguage(storage.get('language','ja'));
let cleanup=()=>{};
let studentToken=storage.get('studentToken'),studentId='',currentRun=null,view='entry',sending=false,polling=false;
const t=text=>translate(text,language);
const f=(text,values)=>format(text,language,values);
const mark='<span class="brand-icon" aria-hidden="true"><i></i><i></i><i></i></span>';
const header=progress=>'<header class="student-topbar"><span class="student-brand">'+mark+escape(t('実験'))+'</span><div class="header-tools">'+
  (progress?'<span class="student-progress">'+progress+'</span>':'')+languageHTML(language)+'</div></header>';
function setLanguage(next){
  language=normalizeLanguage(next);storage.set('language',language);
  document.documentElement.lang=documentLanguage(language);
  document.title=t('実験');$('.skip-link').textContent=t('本文へ移動');
}
function languageListener(change){
  $('#language-select').addEventListener('change',event=>change(event.target.value));
}
function reportError(element,message=''){
  element.dataset.message=message;element.textContent=message?translateError(message,language):'';
}
async function api(path,data){
  let response;
  try{response=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}
  catch{throw Object.assign(new Error('接続できませんでした。もう一度お試しください。'),{status:0});}
  const result=await response.json();
  if(!response.ok)throw Object.assign(new Error(result.error||'送信できませんでした。もう一度お試しください。'),{status:response.status});
  return result;
}
function reset(){cleanup();cleanup=()=>{};}
function showEntry(message='',studentId=''){
  reset();view='entry';currentRun=null;
  app.innerHTML=header()+'<main id="main" class="student-entry"><section class="entry-card"><h1>'+escape(t('ログイン'))+'</h1>'+
    '<form id="start-form" novalidate><label class="field-label" for="student-id">'+escape(t('学生証番号'))+'</label>'+
    '<input id="student-id" name="studentId" inputmode="numeric" pattern="[0-9]{7}" maxlength="7" autocomplete="off" spellcheck="false" value="'+escape(studentId)+'" required>'+
    '<p id="start-error" class="form-error" role="alert"></p>'+
    '<button class="button primary large" type="submit">'+escape(t('ログイン'))+'</button></form></section></main>';
  reportError($('#start-error'),message);
  $('#student-id').addEventListener('input',()=>reportError($('#start-error')));
  languageListener(next=>{
    const input=$('#student-id').value,currentError=$('#start-error').dataset.message;
    setLanguage(next);showEntry(currentError,input);$('#language-select').focus();
  });
  $('#start-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const studentId=$('#student-id').value.normalize('NFKC').trim();
    if(!/^\d{7}$/.test(studentId)){
      reportError($('#start-error'),'学生証番号は7桁の数字で入力してください。');
      $('#student-id').focus();return;
    }
    const button=$('button[type=submit]');
    button.disabled=true;$('#language-select').disabled=true;reportError($('#start-error'));
    try{
      const state=await api('classroom/join',{studentId});
      studentToken=state.token;storage.set('studentToken',studentToken);applyClassroom(state);
    }catch(error){reportError($('#start-error'),error.message);button.disabled=false;$('#language-select').disabled=false;}
  });
}
async function boot(){
  setLanguage(language);
  $('.loading').textContent=t('読み込み中…');
  if(!studentToken)return showEntry();
  try{
    let state=await api('classroom/student/'+studentToken);
    const id=state.run?.id,pending=id&&storage.get('pending.'+id);
    if(pending){
      try{await api('runs/'+id+'/answers',pending);storage.remove('pending.'+id);}
      catch(error){
        if(error.status===400||error.status===409)storage.remove('pending.'+id);
        else throw error;
      }
      state=await api('classroom/student/'+studentToken);
    }
    applyClassroom(state);
  }catch(error){
    if(error.status===404){studentToken=null;storage.remove('studentToken');}
    showEntry(error.status===404?'':error.message);
  }
}
function showWaiting(message=''){
  reset();view='waiting';currentRun=null;
  app.innerHTML=header(escape(studentId))+'<main id="main" class="waiting-main"><div class="waiting-mark" aria-hidden="true"><i></i><i></i><i></i></div><h1>'+escape(t('開始をお待ちください。'))+'</h1><p id="waiting-error" class="form-error" role="status"></p><button id="logout" class="text-button">'+escape(t('ログアウト'))+'</button></main>';
  reportError($('#waiting-error'),message);
  languageListener(next=>{setLanguage(next);showWaiting(message);$('#language-select').focus();});
  $('#logout').onclick=()=>{studentToken=null;storage.remove('studentToken');showEntry();};
}
function applyClassroom(state){
  studentId=state.studentId;
  if(state.run?.status==='active'&&state.phase==='running'){
    if(currentRun?.id!==state.run.id||currentRun.currentIndex<state.run.currentIndex||view!=='running')render(state.run);
  }else if(state.run&&storage.get('dismissed.'+state.run.id)!==true){
    if(currentRun?.id!==state.run.id||view!=='finished')render(state.run);
  }else if(view!=='waiting')showWaiting();
}
async function pollClassroom(){
  if(!studentToken||polling||sending||view==='entry')return;
  polling=true;const token=studentToken;
  try{
    const state=await api('classroom/student/'+token);
    if(token===studentToken&&!sending){applyClassroom(state);if(view==='waiting')reportError($('#waiting-error'));}
  }catch(error){
    if(error.status===404){studentToken=null;storage.remove('studentToken');showEntry();}
    else if(view==='waiting')reportError($('#waiting-error'),error.message);
  }finally{polling=false;}
}
function captureDraft(form){
  return $$('input,textarea',form).map(input=>({
    key:input.dataset.na?'na:'+input.dataset.na:input.name,
    type:input.type,value:input.value,checked:input.checked
  }));
}
function restoreDraft(form,draft=[]){
  for(const input of $$('input,textarea',form)){
    const key=input.dataset.na?'na:'+input.dataset.na:input.name;
    const previous=draft.find(item=>item.key===key&&item.type===input.type&&(input.type!=='radio'||item.value===input.value));
    if(!previous)continue;
    if(input.type==='radio'||input.type==='checkbox')input.checked=previous.checked;
    else input.value=previous.value;
  }
}
function validateForm(form,error){
  for(const input of $$('input,textarea',form)){
    input.removeAttribute('aria-invalid');
    if(input.disabled||input.checkValidity())continue;
    const validity=input.validity;
    let message='入力内容を確認してください。';
    if(validity.valueMissing)message='この項目に回答してください。';
    else if(input.name==='pairCode')message='ペア番号は8桁の英数字です。';
    else if(validity.rangeUnderflow||validity.rangeOverflow){
      message=format('{min}〜{max}の数値を入力してください。','ja',{min:input.min,max:input.max});
    }
    else if(validity.stepMismatch)message='整数を入力してください。';
    else if(validity.tooShort||validity.tooLong)message='文字数を確認してください。';
    reportError(error,message);input.setAttribute('aria-invalid','true');input.focus();return false;
  }
  return true;
}
function render(state,resume={}){
  reset();
  currentRun=state;view=state.status==='active'?'running':'finished';
  if(state.status!=='active')return finish(state);
  const trial=localizeTrial(state.trial,language);
  const timedKey='timed.'+state.id+'.'+state.currentIndex;
  const reloadedTimed=trial.responseWindowMs&&!resume.runtime?storage.get(timedKey):null;
  const percentage=Math.round(state.currentIndex/state.totalTrials*100);
  const nextLabel=trial.startTimedTask?'開始する':state.currentIndex+1===state.totalTrials?'送信する':'次へ';
  app.innerHTML=header((state.currentIndex+1)+' / '+state.totalTrials)+
    '<main id="main" class="participant-main"><div class="progress-track" role="progressbar" aria-label="'+escape(t('進行状況'))+'" aria-valuenow="'+percentage+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+percentage+'%"></span></div>'+
    '<article class="task-panel"><h1 id="trial-title" tabindex="-1">'+escape(trial.title)+'</h1>'+
    (trial.body?'<p class="task-body">'+escape(trial.body)+'</p>':'')+(reloadedTimed?'<p>'+escape(t('この項目は終了しました。'))+'</p>':stimulusHTML(trial.stimulus,language))+
    '<form id="answer-form" novalidate>'+trial.fields.map(field=>fieldHTML(field,language)).join('')+
    (state.pairSetup?'<div id="pair-field" class="pair-entry" hidden><label class="field-label" for="pair-code">'+escape(t('ペア番号'))+'</label><input id="pair-code" name="pairCode" maxlength="8" pattern="[A-Za-z0-9]{8}" autocomplete="off"><p class="hint">'+escape(t('相手から受け取った番号を入力してください。先に回答する場合は空欄にしてください。'))+'</p></div>':'')+
    (state.pairCode?'<p class="pair-code">'+escape(t('ペア番号'))+' <strong>'+escape(state.pairCode)+'</strong><span>'+escape(t('相手にこの番号を伝えてください。'))+'</span></p>':'')+
    (trial.sumFields?'<p id="sum-indicator" class="sum-indicator" aria-live="polite"></p>':'')+
    '<p id="answer-error" class="form-error" role="alert"></p><div class="submit-row"><span id="exposure-status" class="small muted"></span><button id="next" type="submit" class="button primary large">'+escape(t(nextLabel))+'</button></div></form></article>'+
    '<div class="task-bottom"><button id="withdraw" class="text-button">'+escape(t('中止する'))+'</button></div>'+
    '<dialog id="withdraw-dialog" aria-labelledby="withdraw-title"><h2 id="withdraw-title">'+escape(t('ここで実験を終了しますか。'))+'</h2><div class="dialog-actions"><button id="keep-going" class="button secondary">'+escape(t('戻る'))+'</button><button id="confirm-withdraw" class="button primary">'+escape(t('終了する'))+'</button></div><p id="withdraw-error" class="form-error" role="alert"></p></dialog></main>';
  const form=$('#answer-form'),next=$('#next'),error=$('#answer-error'),dialog=$('#withdraw-dialog');
  restoreDraft(form,resume.draft);reportError(error,resume.error||'');
  let busy=false,frozen=storage.get('pending.'+state.id);
  let runtime=resume.runtime;
  if(!runtime){
    const visits='visits.'+state.id+'.'+state.currentIndex;
    const reloadCount=storage.get(visits,0);storage.set(visits,reloadCount+1);
    runtime={started:performance.now(),last:performance.now(),clientStartedAt:new Date().toISOString(),
      activeMs:0,focusLosses:0,reloadCount,languageHistory:[{language,atActiveMs:0}]};
    if(trial.responseWindowMs){
      runtime.timed=createTimedAttempt(trial.responseWindowMs,runtime.started);
      if(reloadedTimed)runtime.timed.startedAt-=Math.max(0,Math.min(86400000,Date.now()-reloadedTimed.startedAt));
      else storage.set(timedKey,{startedAt:Date.now()});
    }
  }
  function tick(){
    const now=performance.now();
    if(!document.hidden&&!dialog.open)runtime.activeMs+=now-runtime.last;
    runtime.last=now;
    const remaining=runtime.timed?Math.max(0,trial.responseWindowMs-(now-runtime.timed.startedAt)):Math.max(0,(trial.minViewMs||0)-runtime.activeMs);
    next.disabled=busy||Boolean(runtime.interruptPending)||(!runtime.timed&&remaining>0);
    $('#exposure-status').textContent=remaining>0?f('あと{seconds}秒',{seconds:Math.ceil(remaining/1000)}):'';
    if(trial.stimulus?.kind==='wheel'){
      $('#wheel-disk').style.transform='rotate('+Math.min(1,runtime.activeMs/2200)*1080+'deg)';
      if(runtime.activeMs>=2200)$('#wheel-value').textContent=trial.stimulus.value;
    }
    if(trial.stimulus?.kind==='conversation'){
      const index=Math.min(trial.stimulus.lines.length-1,Math.floor(runtime.activeMs/4000));
      const line=trial.stimulus.lines[index];
      $('#speaker').textContent=line.speaker;$('#speech-text').textContent=line.text;
      $('#conversation-position').textContent=(index+1)+' / '+trial.stimulus.lines.length;
      $$('.person').forEach(p=>p.classList.toggle('speaking',p.id==='person-'+line.speaker));
    }
    if(runtime.timed&&!runtime.timed.ended&&!runtime.interruptPending&&remaining===0)completeTimed('deadline');
  }
  function visibility(){
    runtime.last=performance.now();
    if(document.hidden){runtime.focusLosses++;if(runtime.timed&&!runtime.interruptPending)completeTimed('interrupted');}
  }
  document.addEventListener('visibilitychange',visibility);
  const timer=setInterval(tick,25);
  cleanup=()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  function dependencies(){
    const value=key=>form.elements.namedItem(key)?.value;
    for(const field of trial.fields){
      const element=$('[data-field="'+field.id+'"]');
      const on=!field.when||value(field.when.id)===field.when.equals;
      element.hidden=!on;
      $$('input,textarea',element).forEach(input=>input.disabled=!on||busy||Boolean(frozen)||Boolean(runtime.timed?.ended)||Boolean(runtime.interruptPending));
      if(on&&$('[data-na="'+field.id+'"]',element)?.checked)$('input[type=number]',element).disabled=true;
    }
    if(state.pairSetup){
      const on=value('cohabit')==='yes';
      $('#pair-field').hidden=!on;$('#pair-code').disabled=!on||busy||Boolean(frozen);
    }
    if(trial.sumFields){
      const sum=trial.sumFields.reduce((sum,key)=>sum+(Number(value(key))||0),0);
      $('#sum-indicator').textContent=f('合計：{value}%',{value:sum});
      $('#sum-indicator').classList.toggle('valid',sum===100);
    }
    $('#language-select').disabled=busy||Boolean(frozen);
  }
  form.addEventListener('input',event=>{
    if(runtime.timed)captureTimedInput(runtime.timed,form.elements.namedItem('estimate').value,performance.now());
    dependencies();reportError(error);event.target.removeAttribute('aria-invalid');
  });dependencies();
  languageListener(nextLanguage=>{
    if(busy||frozen)return;
    tick();
    if(busy||frozen)return;
    const draft=captureDraft(form),currentError=error.dataset.message,scrollY=window.scrollY;
    setLanguage(nextLanguage);
    runtime.languageHistory.push({language,atActiveMs:Math.floor(runtime.activeMs)});
    render(state,{runtime,draft,error:currentError,scrollY});
  });
  if(resume.runtime){
    $('#language-select').focus({preventScroll:true});window.scrollTo({top:resume.scrollY||0,behavior:'instant'});
  }else{
    (runtime.timed&&!reloadedTimed?$('#field-estimate'):$('#trial-title')).focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  }
  async function save(payload){
    busy=true;sending=true;next.disabled=true;dependencies();$('#withdraw').disabled=true;
    next.textContent=t('送信中…');reportError(error);
    try{
      const updated=await api('runs/'+state.id+'/answers',payload);
      storage.remove('pending.'+state.id);storage.remove(timedKey);render(updated);
    }catch(problem){
      if(problem.status===409){
        try{
          const current=await api('runs/'+state.id);
          storage.remove('pending.'+state.id);storage.remove(timedKey);render(current);return;
        }catch{/* Keep the same submission when the connection is unavailable. */}
      }
      busy=false;$('#withdraw').disabled=false;
      if(problem.status===400&&!runtime.timed){
        frozen=null;storage.remove('pending.'+state.id);next.textContent=t(nextLabel);
      }else{frozen=payload;next.textContent=t('もう一度送信する');}
      dependencies();reportError(error,problem.message);tick();
    }finally{sending=false;}
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;if(frozen)return save(frozen);
    if(runtime.timed){
      if(performance.now()-runtime.timed.startedAt>=trial.responseWindowMs)return completeTimed('deadline');
      if(!validateForm(form,error))return;
      captureTimedInput(runtime.timed,form.elements.namedItem('estimate').value,performance.now());
      return completeTimed('submitted');
    }
    if(!validateForm(form,error))return;
    const values=new FormData(form),answer={};
    for(const field of trial.fields){
      if(field.when&&values.get(field.when.id)!==field.when.equals)continue;
      if(field.allowNA&&$('[data-na="'+field.id+'"]').checked)answer[field.id]=null;
      else if(field.type==='number')answer[field.id]=Number(values.get(field.id));
      else answer[field.id]=values.get(field.id);
    }
    if(trial.sumFields&&Math.abs(trial.sumFields.reduce((sum,key)=>sum+answer[key],0)-100)>0.000001){reportError(error,'確率の合計を100%にしてください。');return;}
    if(trial.rankFields&&!trial.allowRankTies&&new Set(trial.rankFields.map(key=>answer[key])).size!==trial.rankFields.length){reportError(error,'各順位を一度ずつ使ってください。');return;}
    if(trial.rankFields&&trial.allowRankTies&&Math.min(...trial.rankFields.map(key=>answer[key]))!==1){reportError(error,'最も低い項目を1位にしてください。');return;}
    if(trial.ratioFields&&trial.ratioFields.every(key=>answer[key]===0)){reportError(error,'両方を0にはできません。');return;}
    if(trial.fields.some(field=>field.exclusiveMin&&answer[field.id]!==undefined&&answer[field.id]<=field.min)){reportError(error,'0より大きい数値を入力してください。');return;}
    tick();
    submitAnswer(answer,values);
  });
  function submitAnswer(answer,values,timed){
    const payload={trialIndex:state.currentIndex,trialId:trial.id,submissionId:crypto.randomUUID(),answer,
      metrics:{rtMs:Math.round(performance.now()-runtime.started),activeMs:Math.floor(runtime.activeMs),
        focusLosses:runtime.focusLosses,reloadCount:runtime.reloadCount,viewport:{width:innerWidth,height:innerHeight},
        clientStartedAt:runtime.clientStartedAt,language,translationVersion:TRANSLATION_VERSION,languageHistory:runtime.languageHistory,
        ...(timed?{timed}:{})}};
    if(state.pairSetup)payload.pairCode=answer.cohabit==='yes'?(values.get('pairCode')||'').trim().toUpperCase():'';
    storage.set('pending.'+state.id,payload);frozen=payload;save(payload);
  }
  function hideTimedStimulus(){
    const stimulus=$('.multiplication-expression');if(stimulus)stimulus.hidden=true;
  }
  function completeTimed(reason){
    if(!runtime.timed||busy||frozen||runtime.timed.ended)return;
    const result=finishTimedAttempt(runtime.timed,reason,performance.now());if(!result)return;
    hideTimedStimulus();tick();submitAnswer({estimate:result.estimate},null,result.timed);
  }
  $('#withdraw').onclick=()=>{
    if(runtime.timed&&!runtime.timed.ended){runtime.interruptPending=true;hideTimedStimulus();dependencies();}
    dialog.showModal();
  };
  const cancelWithdrawal=()=>{if(runtime.interruptPending){runtime.interruptPending=false;completeTimed('interrupted');}};
  $('#keep-going').onclick=()=>{dialog.close();cancelWithdrawal();};
  dialog.addEventListener('cancel',cancelWithdrawal);
  $('#confirm-withdraw').onclick=async ()=>{
    $('#confirm-withdraw').disabled=true;sending=true;
    try{
      const updated=await api('runs/'+state.id+'/withdraw',{});
      storage.remove('pending.'+state.id);storage.remove(timedKey);render(updated);
    }catch(problem){reportError($('#withdraw-error'),problem.message);$('#confirm-withdraw').disabled=false;}finally{sending=false;}
  };
  if(runtime.timed&&(reloadedTimed||document.hidden))completeTimed('interrupted');else tick();
}
function finish(state){
  app.innerHTML=header()+'<main id="main" class="student-finish"><div class="completion-mark" aria-hidden="true">✓</div>'+
    '<h1 id="finish-title" tabindex="-1">'+escape(t(state.status==='completed'?'回答が完了しました。':'実験を終了しました。'))+'</h1><p class="thanks">'+escape(t('ありがとうございました。'))+'</p>'+
    (state.debrief?.length?'<div class="end-notes">'+state.debrief.map(note=>'<p>'+escape(t(note))+'</p>').join('')+'</div>':'')+
    '<button id="exit" class="button primary large">'+escape(t('待機に戻る'))+'</button></main>';
  languageListener(next=>{setLanguage(next);finish(state);$('#language-select').focus({preventScroll:true});});
  $('#finish-title').focus({preventScroll:true});
  $('#exit').onclick=()=>{
    storage.set('dismissed.'+state.id,true);storage.remove('pending.'+state.id);
    Object.keys(localStorage).filter(key=>key.startsWith('classroom.visits.'+state.id+'.')).forEach(key=>localStorage.removeItem(key));
    showWaiting();pollClassroom();
  };
  window.scrollTo({top:0,behavior:'instant'});
}
boot();
setInterval(pollClassroom,1000);
