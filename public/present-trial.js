export function publicTrial(protocol, index, responses) {
  const current=structuredClone(protocol.trials[index]);
  if(!current)return null;
  if(current.ratioRankingTrial){
    const ranks=responses.find(response=>response.trialId===current.ratioRankingTrial)?.answer;
    if(ranks){
      current.fields.sort((a,b)=>ranks[a.id]-ranks[b.id]);
      const minimum=Math.min(...Object.values(ranks));
      for(const field of current.fields)if(ranks[field.id]===minimum)Object.assign(field,{min:10,max:10,value:10,readOnly:true});
    }
  }
  if(current.stimulus?.kind==='owned-ticket'){
    const previous=responses.find(r=>r.trialId==='ticket');
    current.stimulus={kind:'ticket',card:previous?.answer.ticket || protocol.trials.find(t=>t.id==='ticket').stimulus.card};
  }
  return current;
}
