import { translate, format } from './i18n.js';
import { expandedText } from './expanded-messages.js';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function languageHTML(language) {
  return '<div class="language-switch"><label class="sr-only" for="language-select">'+escape(translate('言語',language))+'</label><select id="language-select" class="language-select">'+
    [['ja','日本語'],['zh','中文'],['en','English']].map(([value,label])=>'<option value="'+value+'" lang="'+(value==='zh'?'zh-CN':value)+'"'+(value===language?' selected':'')+'>'+label+'</option>').join('')+'</select></div>';
}
export function fieldHTML(field,language='ja') {
  const id='field-'+field.id;
  const labelId='label-'+field.id;
  let input='';
  if(field.type==='choice')input='<div class="choice-list '+(field.style==='cards'?'card-choices':'')+'">'+field.options.map(o=>'<label class="choice"><input type="radio" name="'+escape(field.id)+'" value="'+escape(o.value)+'" required><span>'+(field.style==='cards'?ticketSVG(o.value):'')+escape(o.label)+'</span></label>').join('')+'</div>';
  if(field.type==='number'){
    if(field.control==='scale')input='<div class="scale-choices">'+Array.from({length:field.max-field.min+1},(_,i)=>i+field.min).map(n=>'<label class="choice"><input type="radio" name="'+escape(field.id)+'" value="'+n+'" required><span>'+n+'</span></label>').join('')+'</div>';
    else input='<div class="number-line"><input id="'+id+'" aria-labelledby="'+labelId+'" type="number" name="'+escape(field.id)+'" min="'+field.min+'" max="'+field.max+'" step="'+field.step+'"'+(field.value!==undefined?' value="'+field.value+'"':'')+(field.readOnly?' readonly':'')+' inputmode="'+(field.step===1?'numeric':'decimal')+'" required autocomplete="off">'+(field.hideRange?'':'<span class="number-range">'+format('{min}〜{max}',language,{min:field.min,max:field.max})+'</span>')+'</div>'+(field.allowNA?'<label class="na-choice"><input type="checkbox" data-na="'+escape(field.id)+'">'+escape(field.nullLabel || translate('対象外',language))+'</label>':'');
  }
  if(field.type==='text')input=field.singleLine?'<input id="'+id+'" aria-labelledby="'+labelId+'" type="text" name="'+escape(field.id)+'" minlength="'+field.minLength+'" maxlength="'+field.maxLength+'" pattern="'+escape(field.pattern||'.*')+'" inputmode="'+escape(field.inputMode||'text')+'" required autocomplete="off">':'<textarea id="'+id+'" aria-labelledby="'+labelId+'" name="'+escape(field.id)+'" minlength="'+field.minLength+'" maxlength="'+field.maxLength+'" rows="4" required></textarea>';
  return '<fieldset class="answer-field'+(field.control==='scale'?' scale-field':'')+'" data-field="'+escape(field.id)+'"><legend id="'+labelId+'">'+escape(field.label)+'</legend>'+input+'</fieldset>';
}
function ticketSVG(card) {
  const index=Number(String(card).replace('card-',''))||0;
  const paths=['<path d="M50 22L79 76H21Z"/>','<circle cx="50" cy="50" r="27"/>','<rect x="25" y="25" width="50" height="50" rx="2"/>','<path d="M50 17L59 40L84 41L64 57L70 82L50 68L30 82L36 57L16 41L41 40Z"/>','<path d="M62 20A32 32 0 1 0 77 70A30 30 0 0 1 62 20Z"/>','<path d="M18 40Q34 14 50 40T82 40M18 64Q34 38 50 64T82 64" fill="none" stroke-width="7"/>'];
  return '<svg viewBox="0 0 100 100" aria-hidden="true" class="ticket-symbol">'+paths[index]+'</svg>';
}
export function stimulusHTML(stimulus,language='ja') {
  if(!stimulus)return '';
  const t=text=>escape(translate(text,language));
  switch(stimulus.kind){
    case 'bag-cans':{
      const e=key=>t(expandedText['odds.'+key][0]);
      const head='<thead><tr><th></th>'+['A','B','C','D'].map(c=>'<th scope="col">'+e('can')+' '+c+'</th>').join('')+'</tr></thead>';
      return '<div class="stimulus bag-tables"><table><caption>'+e('bagContents')+'</caption>'+head+'<tbody>'+stimulus.bagCanCounts.map((row,i)=>'<tr><th scope="row">'+e(i?'II':'I')+'</th>'+row.map(n=>'<td>'+n+'</td>').join('')+'</tr>').join('')+'</tbody></table><table><caption>'+e('canContents')+'</caption>'+head+'<tbody>'+stimulus.discMatrix.map((row,i)=>'<tr><th scope="row">'+e(['red','green','yellow','blue'][i])+'</th>'+row.map(n=>'<td>'+n+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
    }
    case 'multiplication':return '<div class="stimulus multiplication-expression">'+stimulus.factors.map(escape).join(' × ')+'</div>';
    case 'wheel':return '<div class="stimulus wheel-stimulus"><svg class="wheel-svg" viewBox="0 0 200 200" aria-hidden="true"><g id="wheel-disk"><circle cx="100" cy="100" r="85" fill="#e9c98a"/><path d="M100 15A85 85 0 0 1 185 100H100ZM100 185A85 85 0 0 1 15 100H100Z" fill="#35766e"/><circle cx="100" cy="100" r="62" fill="none" stroke="#fff9eb" stroke-width="2" stroke-dasharray="3 14"/><circle cx="100" cy="100" r="18" fill="#fff9eb"/></g><path d="M90 2H110L100 26Z" fill="#243d38"/></svg><p id="wheel-value" class="wheel-number" aria-live="polite">'+t('回転中')+'</p></div>';
    case 'symbols':return '<div class="stimulus symbol-sequence" aria-label="'+t('記号の並び')+'">'+escape(stimulus.text)+'</div>';
    case 'ticket':return '<div class="stimulus single-ticket">'+ticketSVG(stimulus.card)+'<span>'+t('あなたのカード')+'</span></div>';
    case 'chip':return '<div class="stimulus"><div class="chip '+stimulus.color+'">'+t(stimulus.color==='red'?'赤':'青')+'</div></div>';
    case 'matrix':return '<div class="stimulus matrix"><table><caption>'+t('製造元と検査の情報')+'</caption><thead><tr><th>'+t('製造元')+'</th><th>'+t('この工場で作られた確率')+'</th><th>'+t('この工場の合格率')+'</th></tr></thead><tbody>'+stimulus.weights.map((w,i)=>'<tr><th>'+escape(format('工場{label}',language,{label:['A','B','C'][i]}))+'</th><td>'+Math.round(w*100)+'%</td><td>'+Math.round(stimulus.rates[i]*100)+'%</td></tr>').join('')+'</tbody></table></div>';
    case 'drawing': {
      const big=stimulus.feature==='head',eyes=stimulus.feature==='eyes';
      return '<div class="stimulus drawing"><svg viewBox="0 0 280 250" role="img" aria-label="'+t(big?'頭を大きく描いた人物':eyes?'目を大きく描いた人物':'通常の比率の人物')+'"><g fill="none" stroke="#394f49" stroke-width="3" stroke-linecap="round"><ellipse cx="140" cy="74" rx="'+(big?57:36)+'" ry="'+(big?55:38)+'" fill="#fffefa"/><circle cx="127" cy="70" r="'+(eyes?11:3)+'"/><circle cx="153" cy="70" r="'+(eyes?11:3)+'"/><path d="M133 91Q140 96 147 91M140 '+(big?129:112)+'V180M140 130L98 163M140 130L182 163M140 180L110 231M140 180L170 231"/></g></svg><p class="drawing-caption">'+t(stimulus.label==='attention'?'周囲の視線が気になる':'自分の能力が気になる')+'</p></div>';
    }
    case 'conversation':return '<div class="stimulus conversation"><div class="conversation-stage">'+['A','B'].map(person=>'<div class="person '+(stimulus.focus===person?'salient':'subtle')+'" id="person-'+person+'"><svg viewBox="0 0 100 120" aria-hidden="true"><circle cx="50" cy="30" r="20"/><path d="M18 110V77Q18 58 50 58T82 77V110Z"/></svg><strong>'+person+'</strong></div>').join('')+'</div><div class="speech" role="status"><span id="speaker"></span><p id="speech-text"></p></div><p class="small muted" id="conversation-position"></p></div>';
    default:return '';
  }
}
