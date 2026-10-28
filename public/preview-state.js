import { publicTrial } from './present-trial.js';
import { debriefForShown } from './debrief.js';

export function createPreviewState(protocols) {
  const pages=protocols.flatMap((protocol,protocolIndex)=>protocol.trials.map((_,trialIndex)=>({protocolIndex,trialIndex})));
  return {protocols,pages,index:0,answers:[],drafts:[],seen:new Set()};
}

export function previewRun(preview) {
  const {index,pages,protocols,answers,seen}=preview;
  if(index>=pages.length){
    const shown=(studyId,trialId)=>pages.some((page,i)=>seen.has(i)&&protocols[page.protocolIndex].studyId===studyId&&
      protocols[page.protocolIndex].trials[page.trialIndex].id===trialId);
    return {id:'preview',status:'completed',currentIndex:pages.length,totalTrials:pages.length,trial:null,debrief:debriefForShown(shown)};
  }
  seen.add(index);
  const page=pages[index],protocol=protocols[page.protocolIndex],source=protocol.trials[page.trialIndex];
  const responses=pages.flatMap((item,i)=>item.protocolIndex===page.protocolIndex&&i<index&&answers[i]?
    [{trialId:protocol.trials[item.trialIndex].id,answer:answers[i]}]:[]);
  // A skipped ranking still needs a representative minimum on its later ratio page.
  if(source.ratioRankingTrial&&!responses.some(response=>response.trialId===source.ratioRankingTrial)){
    const ranking=protocol.trials.find(trial=>trial.id===source.ratioRankingTrial);
    if(ranking)responses.push({trialId:ranking.id,answer:Object.fromEntries(ranking.rankFields.map((id,i)=>[id,i+1]))});
  }
  const trial=publicTrial(protocol,page.trialIndex,responses);
  return {id:'preview',status:'active',currentIndex:index,totalTrials:pages.length,trial,
    pairSetup:protocol.studyId==='12-01'&&trial.id==='context',pairCode:null};
}
