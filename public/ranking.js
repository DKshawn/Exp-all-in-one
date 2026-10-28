import { escape } from './task-ui.js';
import { translate, format } from './i18n.js';

export const RANKING_CONTROL = 'drag-ranking-v1';

// Moving to an occupied unique rank exchanges the two items. Returning an item
// to the bank leaves its rank empty; tied ranks never displace another item.
export function moveRank(values, id, rank, allowTies=false) {
  const ids=Object.keys(values);
  if(!Object.hasOwn(values,id)||!(rank===null||(Number.isInteger(rank)&&rank>=1&&rank<=ids.length)))throw new Error('Invalid rank assignment');
  const next={...values},previous=next[id];
  if(rank!==null&&!allowTies){
    const other=ids.find(key=>key!==id&&next[key]===rank);
    if(other)next[other]=previous;
  }
  next[id]=rank;return next;
}

export function rankingHTML(trial,language='ja') {
  const fields=trial.fields.filter(field=>trial.rankFields.includes(field.id));
  const t=text=>escape(translate(text,language));
  const rankName=rank=>escape(format('第{rank}位',language,{rank}));
  return '<section class="ranking-board'+(fields.length>12?' ranking-many':'')+(trial.allowRankTies?' allows-ties':'')+'" aria-label="'+t('順位')+'">'+
    '<p class="ranking-instruction">'+t('項目を下の順位へ移動してください。')+'</p>'+
    '<p class="sr-only" id="ranking-help">'+t('ドラッグするか、項目を選んでから順位を選んでください。選択を解除するにはEscキーを押してください。')+'</p>'+
    '<div class="ranking-bank" data-rank-target="bank" role="group" aria-label="'+t('未配置の項目')+'">'+fields.map(field=>
      '<div class="ranking-bank-slot" data-rank-home="'+escape(field.id)+'"><span class="ranking-reserve" aria-hidden="true">'+escape(field.label)+'</span><button type="button" class="ranking-token" data-rank-item="'+escape(field.id)+'" aria-pressed="false" aria-describedby="ranking-help"><span class="ranking-grip" aria-hidden="true">⠿</span><span>'+escape(field.label)+'</span></button></div>').join('')+'</div>'+
    '<button type="button" class="ranking-return" disabled>'+t('選んだ項目を戻す')+'</button>'+
    '<div class="ranking-table" role="group" aria-label="'+t('順位')+'">'+fields.map((_,i)=>
      '<div class="ranking-row" data-rank-target="'+(i+1)+'" role="group" aria-label="'+rankName(i+1)+'"><button type="button" class="ranking-place" data-rank-place="'+(i+1)+'" aria-label="'+rankName(i+1)+'">'+(i+1)+'</button><div class="ranking-items"><button type="button" class="ranking-empty" data-rank-place="'+(i+1)+'" aria-label="'+rankName(i+1)+'"></button></div></div>').join('')+'</div>'+
    '<span class="sr-only ranking-status" role="status" aria-live="polite"></span>'+
    fields.map(field=>'<span hidden data-field="'+escape(field.id)+'"><input type="hidden" name="'+escape(field.id)+'" value=""></span>').join('')+'</section>';
}

export function mountRanking(board,trial,{language='ja',scroll={}}={}) {
  const bank=board.querySelector('.ranking-bank'),table=board.querySelector('.ranking-table');
  const status=board.querySelector('.ranking-status'),back=board.querySelector('.ranking-return');
  const tokens=new Map([...board.querySelectorAll('[data-rank-item]')].map(token=>[token.dataset.rankItem,token]));
  const homes=new Map([...board.querySelectorAll('[data-rank-home]')].map(home=>[home.dataset.rankHome,home]));
  const rows=new Map([...board.querySelectorAll('.ranking-row')].map(row=>[Number(row.dataset.rankTarget),row]));
  const inputs=new Map([...board.querySelectorAll('input')].map(input=>[input.name,input]));
  let values=Object.fromEntries([...inputs].map(([id,input])=>[id,input.value===''?null:Number(input.value)]));
  let selected=null,disabled=false,drag=null,frame=null,ignoreClick=false,highlight=null;
  const events=new AbortController(),options={signal:events.signal};
  const label=id=>tokens.get(id).textContent.replace('⠿','').trim();
  const say=text=>{status.textContent=text;};

  function paint() {
    const bankTop=bank.scrollTop,tableTop=table.scrollTop;
    for(const [id,token] of tokens){
      const rank=values[id],parent=rank===null?homes.get(id):rows.get(rank).querySelector('.ranking-items');
      if(token.parentElement!==parent)parent.append(token);
      inputs.get(id).value=rank===null?'':String(rank);
      token.setAttribute('aria-pressed',String(id===selected));
      homes.get(id).classList.toggle('is-empty',rank!==null);
    }
    for(const row of rows.values())row.querySelector('.ranking-empty').hidden=Boolean(row.querySelector('.ranking-token'));
    board.classList.toggle('has-selection',selected!==null);
    back.disabled=disabled||selected===null||values[selected]===null;
    bank.scrollTop=bankTop;table.scrollTop=tableTop;
  }
  function select(id) {
    selected=selected===id?null:id;paint();
    say(selected===null?'':format('「{item}」を選択しました。順位を選んでください。',language,{item:label(id)}));
  }
  function place(id,rank) {
    if(disabled)return;
    values=moveRank(values,id,rank,Boolean(trial.allowRankTies));selected=null;paint();
    say(format(rank===null?'「{item}」を未配置に戻しました。':'「{item}」を第{rank}位に置きました。',language,{item:label(id),rank}));
    inputs.get(id).dispatchEvent(new Event('input',{bubbles:true}));
  }
  function clearHighlight() {
    highlight?.classList.remove('is-drop-target');highlight=null;
  }
  function targetAt(x,y) {
    const target=document.elementFromPoint(x,y)?.closest('[data-rank-target]');
    return target&&board.contains(target)?target:null;
  }
  function showTarget(target) {
    if(target===highlight)return;
    clearHighlight();highlight=target;highlight?.classList.add('is-drop-target');
  }
  function endDrag() {
    if(frame!==null)cancelAnimationFrame(frame);frame=null;
    if(drag){
      drag.ghost?.remove();drag.token.classList.remove('is-dragging');
      if(drag.token.hasPointerCapture(drag.pointerId))drag.token.releasePointerCapture(drag.pointerId);
    }
    drag=null;clearHighlight();board.classList.remove('is-dragging');
  }
  function scrollDuringDrag() {
    if(!drag?.ghost)return;
    // Only scroll a fixed panel under the pointer, never the page.
    const hit=document.elementFromPoint(drag.x,drag.y);
    const panel=hit?.closest('.ranking-items,.ranking-table,.ranking-bank');
    let scroller=panel;
    if(scroller?.classList.contains('ranking-items')&&scroller.scrollHeight<=scroller.clientHeight)scroller=table;
    let speed=0;
    if(scroller&&board.contains(scroller)){
      const rect=scroller.getBoundingClientRect(),edge=Math.min(32,rect.height/4);
      speed=drag.y<rect.top+edge?-7:drag.y>rect.bottom-edge?7:0;
    }
    if(!speed){drag.scrollPanel=null;}
    else if(drag.scrollPanel!==scroller||drag.scrollDirection!==speed){
      drag.scrollPanel=scroller;drag.scrollDirection=speed;drag.scrollSince=performance.now();
    }else if(performance.now()-drag.scrollSince>=300){
      scroller.scrollTop+=speed;
    }
    showTarget(targetAt(drag.x,drag.y));
    frame=requestAnimationFrame(scrollDuringDrag);
  }
  board.addEventListener('pointerdown',event=>{
    const token=event.target.closest('[data-rank-item]');
    if(disabled||drag||!token||event.button!==0||!event.isPrimary)return;
    drag={id:token.dataset.rankItem,token,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY};
    token.setPointerCapture(event.pointerId);
  },options);
  board.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.ghost&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6)return;
    event.preventDefault();
    if(!drag.ghost){
      const rect=drag.token.getBoundingClientRect();
      const ghost=document.createElement('div');ghost.className='ranking-token ranking-ghost';ghost.textContent=label(drag.id);
      ghost.setAttribute('aria-hidden','true');ghost.style.width=rect.width+'px';ghost.style.minHeight=rect.height+'px';
      document.body.append(ghost);drag.ghost=ghost;
      drag.token.classList.add('is-dragging');board.classList.add('is-dragging');
      frame=requestAnimationFrame(scrollDuringDrag);
    }
    drag.ghost.style.left=(drag.x-drag.ghost.offsetWidth/2)+'px';
    drag.ghost.style.top=(drag.y-28)+'px';
    showTarget(targetAt(drag.x,drag.y));
  },options);
  board.addEventListener('pointerup',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    const {id,ghost,token}=drag,target=ghost&&targetAt(event.clientX,event.clientY);
    if(ghost){event.preventDefault();ignoreClick=true;setTimeout(()=>{ignoreClick=false;},0);}
    endDrag();
    if(target){place(id,target.dataset.rankTarget==='bank'?null:Number(target.dataset.rankTarget));token.focus({preventScroll:true});}
  },options);
  board.addEventListener('pointercancel',endDrag,options);
  board.addEventListener('lostpointercapture',()=>{if(drag)endDrag();},options);
  window.addEventListener('blur',endDrag,options);
  board.addEventListener('click',event=>{
    if(disabled||ignoreClick)return;
    const token=event.target.closest('[data-rank-item]');
    if(token){select(token.dataset.rankItem);return;}
    if(selected===null)return;
    if(event.target.closest('.ranking-return')){place(selected,null);return;}
    const target=event.target.closest('[data-rank-target]');
    if(target)place(selected,target.dataset.rankTarget==='bank'?null:Number(target.dataset.rankTarget));
  },options);
  board.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();endDrag();selected=null;paint();say('');}
  },options);
  paint();bank.scrollTop=scroll.bank||0;table.scrollTop=scroll.table||0;
  return {
    setDisabled(value){
      disabled=value;board.setAttribute('aria-disabled',String(value));
      if(disabled){endDrag();selected=null;}
      board.querySelectorAll('button').forEach(button=>button.disabled=value);paint();
    },
    validate(){
      const missing=Object.keys(values).find(id=>values[id]===null);
      if(!missing)return true;
      const home=homes.get(missing),rect=bank.getBoundingClientRect(),itemRect=home.getBoundingClientRect();
      if(itemRect.top<rect.top||itemRect.bottom>rect.bottom)bank.scrollTop+=itemRect.top-rect.top-12;
      tokens.get(missing).focus({preventScroll:true});return false;
    },
    scrollState:()=>({bank:bank.scrollTop,table:table.scrollTop}),
    destroy(){events.abort();endDrag();}
  };
}
