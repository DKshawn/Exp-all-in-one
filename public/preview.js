import { translate, normalizeLanguage, documentLanguage } from './i18n.js';

const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search),language=normalizeLanguage(params.get('lang'));
const t=text=>translate(text,language);
const sizes=[
  ['phone-small','スマートフォン',360,800],['phone','スマートフォン',390,844],
  ['tablet','タブレット',768,1024],['tablet-wide','タブレット',1024,768],
  ['laptop','ノートパソコン',1366,768],['desktop','デスクトップ',1920,1080]
];
document.documentElement.lang=documentLanguage(language);document.title=t('プレビュー');
document.querySelectorAll('[data-i18n]').forEach(element=>element.textContent=t(element.dataset.i18n));
$('#preview-frame').title=t('プレビュー');
$('.preview-navigation').setAttribute('aria-label',t('プレビュー'));
const selector=$('#screen-size');
selector.innerHTML=sizes.map(([id,label,width,height])=>'<option value="'+id+'">'+t(label)+' · '+width+' × '+height+'</option>').join('')+
  '<option value="custom">'+t('カスタム')+'</option>';
selector.value='phone';
const frame=$('#preview-frame'),box=$('#preview-frame-box'),stage=$('#preview-stage');
let width=390,height=844;
function fit(){
  const scale=Math.min(1,Math.max(1,stage.clientWidth-48)/width,Math.max(1,stage.clientHeight-48)/height);
  box.style.width=width*scale+'px';box.style.height=height*scale+'px';
  frame.style.width=width+'px';frame.style.height=height+'px';frame.style.transform='scale('+scale+')';
}
function resize(){
  const selected=sizes.find(item=>item[0]===selector.value);
  $('#custom-size').hidden=Boolean(selected);
  if(selected)[,,width,height]=selected;
  else{
    const w=$('#screen-width'),h=$('#screen-height');
    if(!w.checkValidity()||!h.checkValidity())return;
    width=Number(w.value);height=Number(h.value);
  }
  fit();
}
selector.addEventListener('change',resize);
$('#screen-width').addEventListener('change',resize);$('#screen-height').addEventListener('change',resize);
new ResizeObserver(fit).observe(stage);
$('#preview-previous').onclick=()=>frame.contentWindow.postMessage({type:'preview:previous'},location.origin);
$('#preview-skip').onclick=()=>frame.contentWindow.postMessage({type:'preview:skip'},location.origin);
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='preview:state'){
    const {index,total,status}=event.data;
    $('#preview-previous').disabled=index===0;
    $('#preview-skip').disabled=status!=='active';
    $('#preview-progress').textContent=Math.min(index+1,total)+' / '+total;
  }else if(event.data?.type==='preview:error'){
    $('#preview-progress').textContent=t('プレビューを読み込めませんでした。');
  }
});
fit();frame.src='/preview/student?'+params;
