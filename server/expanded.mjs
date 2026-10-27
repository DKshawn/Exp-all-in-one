import {expandedText,expandedFacts} from '../public/expanded-messages.js';
import {rng,choose,shuffle} from './engine.mjs';
const t=key=>expandedText[key][0];
const number=(id,label,min=0,max=100,extra={})=>({id,type:'number',label,min,max,step:'any',...extra});
const choice=(id,label,options)=>({id,type:'choice',label,options:options.map(([value,label])=>({value,label}))});
const trial=(id,title,body,fields,extra={})=>({id,title,body,fields,...extra});

export function expandedProtocol(id,seed){
  const random=rng(seed),trials=[],normative={};let condition,explanation,design={};
  if(id==='01-02'){
    condition='chapter-two-hypothetical-bets';
    for(const other of ['conjunctive','disjunctive'])trials.push(trial('simple-'+other,t('compound.title'),t('compound.question'),[
      choice('bet','一つ選んでください。',[['simple',t('compound.simple')],[other,t('compound.'+other)]])
    ]));
    design={pairOrder:['simple-conjunctive','simple-disjunctive'],incentives:'hypothetical; no cash promise',eventProbabilities:{simple:.5,conjunctive:.9**7,disjunctive:1-.9**7}};
    explanation='原書の二つの比較を仮想の賭け選択として提示します。書中の叙述を問句にしたもので、全研究の逐語質問票や報酬手続きを再現したものではありません。勝率の回答や個人の正誤得点には変換しません。';
  }else if(id==='04-01'){
    const engineers=choose([30,70],random),target=choose(['engineer','lawyer'],random),targetCount=target==='engineer'?engineers:100-engineers;
    condition=engineers+'-engineers-'+target;design={engineers,lawyers:100-engineers,target,profiles:['jack','dick','null'],incentives:'none'};
    for(const profile of design.profiles){
      const key='base.'+engineers+'.'+target+'.'+profile;
      trials.push(trial(profile,t('base.title'),t(key+'.body'),[number('probability',t(key+'.question'))]));
    }
    normative.null={probability:targetCount};
    explanation='原書に掲載されたJack・Dickと記述なしの設問を用います。基準率二条件と職業質問二条件を交差し、各人に三問を同じ順序で提示します。未掲載の三人物と報酬手続きを省いた部分復元です。';
  }else if(id==='09-07'){
    condition=choose(['restaurant','repent'],random);
    const blockOrder=shuffle(['self','accepter','refuser'],random);design={sign:condition,blockOrder,traits:expandedFacts.traits,assignment:'independent seeded randomization; no fixed quotas'};
    trials.push(trial('consensus',t('consensus.studentTitle'),t('consensus.body.'+condition),[
      number('agreePercent',t('consensus.agreePercent')),number('refusePercent',t('consensus.refusePercent'))
    ],{sumFields:['agreePercent','refusePercent']}));
    for(const target of blockOrder){
      const fields=expandedFacts.traits.map(key=>number(key,t('trait.'+key),-50,50));
      if(target==='self')fields.unshift(choice('decision',t('consensus.choicePrompt'),[['agree',t('consensus.agree')],['refuse',t('consensus.refuse')]]));
      trials.push(trial('traits-'+target,t('consensus.studentTitle'),t('consensus.rating.'+target),fields));
    }
    explanation='1977年Study 3の仮想携牌場面を用い、他者の承諾・拒否率、本人の選択、三対象の八特性を記録します。実行を伴うStudy 4ではありません。数値入力と三対象の無作為順は明記した画面化です。';
  }else if(id==='12-01'){
    condition='conversation-pilot';design={sourceVersion:'Ross–Sicoly 1979 conversation pilot',requiresRealConversation:true,requiresReciprocalPair:true,forceSum100:false};
    trials.push(trial('conversation',t('conversation.studentTitle'),t('conversation.prompt'),[
      {id:'partnerStudentId',type:'text',label:t('conversation.partnerLabel'),minLength:7,maxLength:7,pattern:'[0-9]{7}',singleLine:true,inputMode:'numeric'},
      number('selfSpeakingPercent',t('conversation.selfLabel')),number('partnerSpeakingPercent',t('conversation.partnerEstimateLabel'))
    ],{pairStudentField:'partnerStudentId',metadataFields:['partnerStudentId']}));
    explanation='同章の実際の二人の会話を対象にした先行研究です。自己と相手の発言時間を別々に推定し、合計100を強制しません。学生証番号は照合用です。夫妻の家事寄与実験とは別版で、実際の同じ会話が必要です。';
  }else if(id==='23-01'){
    condition=choose(['before',...expandedFacts.historyOutcomes],random);
    trials.push(trial('history',t('history.title'),t('history.body.'+condition),expandedFacts.historyOutcomes.map(key=>number(key,t('history.outcome.'+key))),{sumFields:expandedFacts.historyOutcomes}));
    trials.push(trial('relevance',t('history.title'),t('history.relevance'),Array.from({length:12},(_,i)=>number('fact-'+i,t('history.fact.'+i),1,7,{step:1,control:'scale'}))));
    design={sourceVersion:'Fischhoff 1975 Experiment 1, event A',outcome:condition,factCount:12,relevanceScale:'1–7; higher=more relevant; no invented endpoint wording'};
    explanation='原論文の実験1・グルカ戦争版を用います。五群、四結末の確率合計100、十二事実の七点関連性評定を復元しました。文章は事実を維持した転述・翻訳で、未掲載の尺度端点を原文として追加していません。';
  }else if(id==='26-01'){
    condition='all-three-matrices';const core=expandedFacts.odds,schedule=[];
    for(let round=1;round<=2;round++)for(const entry of shuffle(core.conditions,random))for(const color of shuffle(core.colorOrder,random)){
      const trialId='odds-'+round+'-'+entry.id+'-'+color,row=entry.matrix[core.colorOrder.indexOf(color)];
      const sums=core.bagCanCounts.map(counts=>counts.reduce((sum,n,i)=>sum+n*row[i],0));
      normative[trialId]={oddsIoverII:sums[0]/sums[1]};schedule.push({trialId,round,condition:entry.id,color});
      trials.push(trial(trialId,t('odds.title'),t('odds.body.'+color),[
        number('bagIWeight',t('odds.I'),0,Number.MAX_VALUE,{hideRange:true}),number('bagIIWeight',t('odds.II'),0,Number.MAX_VALUE,{hideRange:true})
      ],{ratioFields:['bagIWeight','bagIIWeight'],stimulus:{kind:'bag-cans',bagCanCounts:core.bagCanCounts,discMatrix:entry.matrix},sourceCondition:{round,condition:entry.id,color}}));
    }
    design={schedule,orderUnit:'individual',groupingChange:'Original groups of 4–6 replaced with individual saved schedules',priorExperience:'Original participants had roughly two hours of prior related practice; no equivalent training claimed',ratioDirection:'I:II'};
    explanation='原書の袋・缶・円片行列を使い、三条件×四色×二巡の24回、袋I対IIのオッズを判断します。百分率への変更はありません。二つの入力欄、個人別の順序、元の約二時間の先行経験がない点は画面化・対象者の差です。';
  }else if(id==='33-03'){
    condition=choose(['risk','benefit'],random);
    const offset=Math.floor(random()*5),blocks=Array.from({length:5},(_,i)=>expandedFacts.riskItems.slice(i*6,i*6+6));
    const itemOrder=Array.from({length:5},(_,i)=>blocks[(i+offset)%5]).flat();
    trials.push(trial('risk-ranking',t('risk.title'),t('risk.'+condition+'.ranking'),itemOrder.map(key=>number(key,t('risk.item.'+key),1,30,{step:1,hideRange:true})),{rankFields:itemOrder,allowRankTies:true}));
    trials.push(trial('risk-ratios',t('risk.title'),t('risk.'+condition+'.ratio'),itemOrder.map(key=>number(key,t('risk.item.'+key),10,Number.MAX_VALUE,{hideRange:true})),{ratioRankingTrial:'risk-ranking'}));
    for(const key of itemOrder)trials.push(trial('acceptability-'+key,t('risk.item.'+key),t('risk.acceptabilityPrompt'),[
      choice('acceptability','一つ選んでください。',expandedFacts.riskAcceptability.map(value=>[value,t('risk.acceptable.'+value)])),
      number('higherMultiplier',t('risk.higherMultiplier'),0,Number.MAX_VALUE,{exclusiveMin:true,hideRange:true,when:{id:'acceptability',equals:'higherAcceptable'}}),
      number('lowerMultiplier',t('risk.lowerMultiplier'),0,Number.MAX_VALUE,{exclusiveMin:true,hideRange:true,when:{id:'acceptability',equals:'lowerNeeded'}})
    ]));
    for(const dimension of expandedFacts.riskDimensions)trials.push(trial('dimension-'+dimension,t('risk.title'),t('risk.dimension.'+dimension),itemOrder.map(key=>number(key,t('risk.item.'+key),1,7,{step:1,control:'scale'}))));
    design={sourceBasis:'Fischhoff et al. 1978 + Fox-Glassman and Weber 2016 primary replication',group:condition,itemOrder,blockOffset:offset,rankTies:true,dimensions:expandedFacts.riskDimensions,referenceDurationMinutes:90};
    explanation='30項目の原リスト、リスクまたは便益の群分け、順位と最小10の比率評価、許容リスク、九つの七点尺度を復元します。1978年報告とFox-Glassman・Weberによる2016年の追試を資料にした方法再構成で、元の紙質問票の逐語複製ではありません。';
  }else return null;
  return {condition,trials,normative,explanation,design};
}
