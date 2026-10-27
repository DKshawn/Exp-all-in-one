import { restoredText } from '../public/revised-messages.js';
import { posterior, rng, choose } from './engine.mjs';

const t=key=>restoredText[key][0];
const choice=(id,label,options)=>({id,type:'choice',label,options:options.map(([value,label])=>({value,label}))});
const number=(id,label,min,max,extra={})=>({id,type:'number',label,min,max,step:1,...extra});
const trial=(id,title,body,fields,extra={})=>({id,title,body,fields,...extra});

export function restoredProtocol(id,seed){
  const trials=[],normative={};let condition='source-questionnaire',explanation='';
  if(id==='03-01'){
    trials.push(trial('hospital','二つの病院',t('hospitalBody'),[choice('hospital','一つ選んでください。',[
      ['large','大きい病院'],['small','小さい病院'],['same','ほぼ同じ（差は5%以内）']
    ])]));
    condition='more-than-60-percent';normative.hospital={correct:'small'};
    explanation='原題の「60%を超える日」の版です。原研究の別の閾値版や、他の標本量課題まで再現したものではありません。';
  }else if(id==='03-02'){
    trials.push(trial('sequence',t('familyTitle'),t('familyBody'),[number('families',t('familyCount'),0,Number.MAX_SAFE_INTEGER,{hideRange:true})]));
    normative.sequence={referenceCount:72,referenceType:'approximate symmetry; not an individual correctness score'};
    explanation='六人きょうだいの出生順序に関する原題の頻数推定です。原文での比較基準は約72世帯ですが、等確率・独立という追加条件を学生に与えず、厳密な正誤採点は行いません。';
  }else if(id==='06-01'){
    const items=[['school','lindaSchool'],['books','lindaBooks'],['feminist','lindaRights'],['social','lindaSocial'],['league','lindaLeague'],['bank','lindaBank'],['insurance','lindaInsurance'],['conjunction','lindaBoth']];
    trials.push(trial('linda','人物と活動',t('lindaBody'),items.map(([key,label])=>number(key,t(label),1,8)),{rankFields:items.map(([key])=>key)}));
    condition='within-subject-probability-ranking';
    explanation='原書第6章のLindaの八対象・確率順位版を用います。三対象への短縮、追加の確信度、途中の合取規則の説明はありません。';
  }else if(id==='08-01'){
    trials.push(trial('eyes','二方向の推定',t('eyesBody'),[choice('direction','一つ選んでください。',[
      ['forward',t('eyesForward')],['reverse',t('eyesReverse')],['equal',t('eyesEqual')]
    ])]));
    trials.push(trial('height',t('heightTitle'),t('heightBody'),[choice('direction',t('heightQuestion'),[
      ['reverse',t('heightReverse')],['forward',t('heightForward')],['equal',t('heightEqual')]
    ])]));
    explanation='原論文の問題1・2を区別します。眼の色は条件付き事象の可能性の比較、身長は予測方向に対する相対的な自信の比較です。180cmの閾値、周辺比率の追加前提、数値の自信評定はありません。個人の正誤得点は付けません。';
  }else if(id==='11-06'){
    condition=choose(['ascending','descending'],rng(seed));
    const factors=Array.from({length:8},(_,i)=>i+1);
    if(condition==='descending')factors.reverse();
    trials.push(trial('ready','積の推定',t('multiplyReady'),[],{startTimedTask:true}));
    trials.push(trial('product','積の推定','',[number('estimate','およその答え',0,Number.MAX_SAFE_INTEGER,{allowTimeout:true,hideRange:true})],
      {stimulus:{kind:'multiplication',factors},responseWindowMs:5000}));
    normative.product={correct:40320};
    explanation='各参加者は昇順または降順の一方だけを見て、5秒以内に積を推定します。原文にない計算手段の禁止指示は加えず、画面入力への変更と、中断・未回答を区別して記録します。';
  }else if(id==='14-01'){
    condition=choose(['route','time'],rng(seed));
    trials.push(trial('rewrite','出来事を書き換える',t('jones'+condition),[
      {id:'rewrite',type:'text',label:t('jonesAnswer'),minLength:1,maxLength:12000}
    ]));
    explanation='原書第14章のJones氏の事故について、経路版か時刻版の一方を提示します。一つ以上の「もし」の続きを自由記述で保存し、研究者が最初の続きを符号化します。学生への分類・理由の追加質問はありません。';
  }else if(id==='25-01'){
    condition='chapter-bag-example';
    trials.push(trial('bags','二つの袋',t('urnBody'),[number('posterior',t('urnQuestion'),0,1,{step:'any'})]));
    normative.bags={posterior:posterior(0.5,0.7,0.3,8,4),red:8,blue:4,unit:'probability-0-1'};
    explanation='原書第25章の二袋の例題を用います。12回中赤8・青4の一括標本で一度だけ事後確率を回答します。原研究全体の逐次更新実験を復元したものではありません。';
  }else return null;
  return {condition,trials,normative,explanation};
}
