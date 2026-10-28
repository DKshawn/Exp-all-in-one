import { randomBytes } from 'node:crypto';
import { AppError, rng, shuffle } from './engine.mjs';
import { catalog } from './protocols.mjs';
import { classroomProtocol } from './classroom.mjs';

// Preview generates the same presentation as a classroom run, without a Store.
export function createPreview({studyIds,randomizeExperiments=false,randomizeChoices=false},seed=()=>randomBytes(4).readUInt32LE()) {
  if(!Array.isArray(studyIds)||!studyIds.length||new Set(studyIds).size!==studyIds.length||
    studyIds.some(id=>!catalog.studies.some(study=>study.id===id&&study.classroomEnabled===true)))throw new AppError('実施できる実験を選択してください。');
  if(typeof randomizeExperiments!=='boolean'||typeof randomizeChoices!=='boolean')throw new AppError('実施設定を確認してください。');
  const ids=randomizeExperiments?shuffle(studyIds,rng(seed())):studyIds;
  return {protocols:ids.map(studyId=>{
    const {trials}=classroomProtocol(studyId,seed(),randomizeChoices);
    return {studyId,trials};
  })};
}
