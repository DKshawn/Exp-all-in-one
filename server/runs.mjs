import { randomBytes, randomUUID } from 'node:crypto';
import { AppError, fingerprint } from './engine.mjs';
import { catalog, createProtocol } from './protocols.mjs';
import { debriefForShown } from '../public/debrief.js';

export const RUN_PROFILE = 'classroom-3';
export const runVersion = () => RUN_PROFILE + '-' + fingerprint(catalog.studies.map(s => [s.id,s.version])).slice(0,12);

const finalStudyId = () => catalog.studies.at(-1).id;
const finalFamiliarity = () => ({
  id:'battery-familiarity',title:'最後の確認',body:'',scope:'run',fields:[{
    id:'known',type:'choice',label:'今回の実験を始める前に、同じ問題やよく似た問題を見たことがありましたか。',
    options:[{value:'no',label:'ない'},{value:'unsure',label:'はっきり覚えていない'},{value:'yes',label:'ある'}]
  }]
});

export function studentProtocol(studyId, seed) {
  // This factory is retained only for pre-teacher run compatibility.
  const protocol = createProtocol(studyId,seed,{legacy:true});
  protocol.version += '/' + RUN_PROFILE;
  protocol.trials=protocol.trials.filter(trial=>trial.id!=='familiarity');
  if(studyId===finalStudyId())protocol.trials.push(finalFamiliarity());
  return protocol;
}

export class Runs {
  constructor(store) { this.store=store; this.db=store.db; }
  upgradeActiveRuns() {
    this.store.transaction(()=>{
      const runs=this.db.prepare("SELECT * FROM runs WHERE status='active' AND (version LIKE 'classroom-1-%' OR version LIKE 'classroom-2-%')").all();
      for(const run of runs){
        const steps=this.steps(run.id),now=this.store.clock();
        // Keep original protocols and the manifest for auditing. Existing responses are never rewritten.
        this.db.prepare('INSERT INTO run_revisions (run_id,created_at,from_version,to_version,reason,snapshot) VALUES (?,?,?,?,?,?)')
          .run(run.id,now,run.version,runVersion(),'Remove remaining retired classroom tasks; preserve answers and original protocols',JSON.stringify({run,steps}));
        let startIndex=0;
        for(const step of steps){
          const protocol=JSON.parse(step.protocol);
          const oldTrial=protocol.trials[step.current_index];
          const retired=catalog.retiredStudies?.find(study=>study.id===step.study_id);
          if(retired&&step.status==='active'){
            const removed=protocol.trials.slice(step.current_index).map(trial=>trial.id);
            if(removed.length){
              protocol.trials=protocol.trials.slice(0,step.current_index);
              protocol.retirement={reason:retired.retirementReason,removedTrialIds:removed,at:now};
              protocol.version=protocol.version.replace(/\/classroom-\d+$/,'/'+RUN_PROFILE+'/retired');
            }
          }else if(run.version.startsWith('classroom-1-')){
            const index=protocol.trials.findIndex(trial=>trial.id==='familiarity');
            if(index>=step.current_index&&index>=0){
              protocol.trials.splice(index,1);
              protocol.version=protocol.version.replace('/classroom-1','/'+RUN_PROFILE);
            }
          }
          if(step.study_id===finalStudyId()&&!protocol.trials.some(trial=>trial.id==='battery-familiarity'))protocol.trials.push(finalFamiliarity());
          const complete=step.status==='completed'||step.current_index===protocol.trials.length;
          const sameTrial=oldTrial?.id===protocol.trials[step.current_index]?.id;
          this.db.prepare('UPDATE sessions SET protocol=?,protocol_hash=?,version=?,status=?,presented_at=?,ended_at=CASE WHEN ended_at IS NULL AND ? THEN ? ELSE ended_at END WHERE id=?')
            .run(JSON.stringify(protocol),fingerprint(protocol),protocol.version,complete?'completed':step.status,
              complete||!sameTrial?null:step.presented_at,Number(complete),now,step.session_id);
          this.db.prepare('UPDATE run_steps SET start_index=?,trial_count=? WHERE run_id=? AND ordinal=?')
            .run(startIndex,protocol.trials.length,run.id,step.ordinal);
          startIndex+=protocol.trials.length;
        }
        this.db.prepare('UPDATE runs SET version=?,manifest_hash=?,updated_at=? WHERE id=?')
          .run(runVersion(),fingerprint(this.manifest(run.id)),now,run.id);
      }
    });
  }
  row(id) {
    const row=this.db.prepare('SELECT * FROM runs WHERE id=?').get(id);
    if(!row)throw new AppError('実験が見つかりません。学生証番号を入力してください。',404);
    return row;
  }
  steps(id) {
    return this.db.prepare(
      'SELECT rs.*,s.study_id,s.status,s.current_index,s.protocol_hash,s.protocol,s.presented_at,s.pair_id '+
      'FROM run_steps rs JOIN sessions s ON s.id=rs.session_id WHERE rs.run_id=? ORDER BY rs.ordinal'
    ).all(id);
  }
  start({studentId}) {
    if(typeof studentId!=='string')throw new AppError('学生証番号を入力してください。');
    const normalized=studentId.normalize('NFKC').trim();
    if(!normalized||normalized.length>80||/[\u0000-\u001f\u007f]/.test(normalized))throw new AppError('学生証番号を確認してください。');
    const version=runVersion();
    const id=this.store.transaction(()=>{
      const existing=this.db.prepare('SELECT id FROM runs WHERE student_id=? AND version=?').get(normalized,version);
      if(existing)return existing.id;
      const runId=randomUUID(), now=this.store.clock(), manifest=[];
      this.db.prepare('INSERT INTO runs (id,student_id,version,manifest_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(runId,normalized,version,'',now,now);
      let start=0;
      catalog.studies.forEach((study,ordinal)=>{
        const seed=this.store.seed(), protocol=studentProtocol(study.id,seed);
        const sessionId=this.store.createSession({participant:'run-'+runId,studyId:study.id,isTest:false,protocolSeed:seed,protocol});
        this.db.prepare('INSERT INTO run_steps VALUES (?,?,?,?,?)').run(runId,ordinal,sessionId,start,protocol.trials.length);
        manifest.push({studyId:study.id,sessionId,startIndex:start,trialCount:protocol.trials.length,protocolHash:fingerprint(protocol)});
        start+=protocol.trials.length;
      });
      this.db.prepare('UPDATE runs SET manifest_hash=? WHERE id=?').run(fingerprint(manifest),runId);
      return runId;
    });
    return this.state(id);
  }
  state(id) {
    let run=this.row(id);
    const steps=this.steps(id);
    const answered=steps.reduce((sum,s)=>sum+s.current_index,0);
    const total=steps.reduce((sum,s)=>sum+s.trial_count,0);
    const next=run.status==='active'?steps.find(s=>s.status==='active'):null;
    if(run.status==='active'&&!next&&answered===total){
      this.db.prepare("UPDATE runs SET status='completed',ended_at=?,updated_at=? WHERE id=?").run(this.store.clock(),this.store.clock(),id);
      run=this.row(id);
    }
    const session=next?this.store.state(next.session_id):null;
    return {
      id:run.id,studentId:run.student_id,status:run.status,currentIndex:answered,totalTrials:total,
      trial:session?.trial || null,
      pairSetup:next?.study_id==='12-01'&&session?.trial?.id==='context',
      pairCode:next?.study_id==='12-01'?session?.pairCode:null,
      debrief:run.status==='active'?null:this.debrief(steps)
    };
  }
  debrief(steps) {
    const shown=(studyId,trialId)=>{
      const step=steps.find(s=>s.study_id===studyId);
      if(!step)return false;
      const index=JSON.parse(step.protocol).trials.findIndex(t=>t.id===trialId);
      return index>=0&&(step.current_index>index||(step.current_index===index&&step.presented_at!==null));
    };
    return debriefForShown(shown);
  }
  submit(id,payload) {
    if(!payload||typeof payload!=='object'||!Number.isInteger(payload.trialIndex)||
      typeof payload.submissionId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(payload.submissionId))throw new AppError('回答を確認してください。');
    this.store.transaction(()=>{
      const run=this.row(id), steps=this.steps(id);
      const selected=steps.find(s=>payload.trialIndex>=s.start_index&&payload.trialIndex<s.start_index+s.trial_count);
      if(!selected)throw new AppError('回答の順番が一致しません。再読み込みしてください。',409);
      const duplicate=this.db.prepare('SELECT 1 FROM responses WHERE session_id=? AND submission_id=?').get(selected.session_id,payload.submissionId || '');
      if(!duplicate){
        if(run.status!=='active')throw new AppError('この実験は終了しています。',409);
        const current=steps.find(s=>s.status==='active');
        if(current?.session_id!==selected.session_id)throw new AppError('表示されている問題に回答してください。',409);
      }
      const pairing=selected.study_id==='12-01'&&payload.trialId==='context';
      if(selected.study_id==='12-01'&&payload.trialId==='conversation'&&payload.answer?.partnerStudentId===run.student_id)throw new AppError('相手の学生証番号を入力してください。');
      const code=typeof payload.pairCode==='string'?payload.pairCode.trim().toUpperCase():'';
      if(payload.pairCode!==undefined&&typeof payload.pairCode!=='string')throw new AppError('ペア番号を確認してください。');
      if(code&&(!pairing||!/^[A-Z0-9]{8}$/.test(code)))throw new AppError('ペア番号は8桁の英数字です。');
      this.store.submit(selected.session_id,{
        trialIndex:payload.trialIndex-selected.start_index,trialId:payload.trialId,submissionId:payload.submissionId,
        answer:payload.answer,metrics:payload.metrics,...(pairing?{context:{pairCode:code}}:{})
      });
      if(!duplicate&&pairing){
        if(payload.answer.cohabit!=='yes'&&code)throw new AppError('同居している相手のペア番号を入力してください。');
        if(payload.answer.cohabit==='yes')this.connectPair(selected.session_id,code);
      }
      if(!duplicate){
        const done=this.steps(id).every(s=>s.status==='completed');
        const now=this.store.clock();
        this.db.prepare('UPDATE runs SET status=?,updated_at=?,ended_at=? WHERE id=?').run(done?'completed':'active',now,done?now:null,id);
      }
    });
    return this.state(id);
  }
  connectPair(sessionId,code) {
    let pairId;
    if(code){
      const pair=this.db.prepare('SELECT * FROM pairs WHERE code=?').get(code);
      if(!pair)throw new AppError('ペア番号が見つかりません。番号を確認してください。');
      const members=this.db.prepare('SELECT id,is_test FROM sessions WHERE pair_id=?').all(pair.id);
      if(members.length>=2||members.some(s=>s.is_test))throw new AppError('このペア番号は利用できません。');
      pairId=pair.id;
    } else {
      pairId=randomUUID();
      let fresh;
      do {fresh=randomBytes(4).toString('hex').toUpperCase();} while(this.db.prepare('SELECT 1 FROM pairs WHERE code=?').get(fresh));
      this.db.prepare('INSERT INTO pairs VALUES (?,?,?)').run(pairId,fresh,this.store.clock());
    }
    this.db.prepare('UPDATE sessions SET pair_id=? WHERE id=?').run(pairId,sessionId);
  }
  withdraw(id) {
    this.store.transaction(()=>{
      const run=this.row(id);
      if(run.status!=='active')return;
      const now=this.store.clock();
      this.db.prepare("UPDATE runs SET status='withdrawn',updated_at=?,ended_at=? WHERE id=?").run(now,now,id);
      this.db.prepare("UPDATE sessions SET status='withdrawn',updated_at=?,ended_at=? WHERE status='active' "+
        'AND id IN (SELECT session_id FROM run_steps WHERE run_id=?)').run(now,now,id);
    });
    return this.state(id);
  }
  list() {
    return this.db.prepare(
      'SELECT r.id,r.student_id AS studentId,r.version,r.status,r.created_at AS createdAt,r.updated_at AS updatedAt,'+
      'SUM(s.current_index) AS answered,SUM(rs.trial_count) AS totalTrials '+
      'FROM runs r JOIN run_steps rs ON rs.run_id=r.id JOIN sessions s ON s.id=rs.session_id '+
      'GROUP BY r.id ORDER BY r.created_at DESC'
    ).all();
  }
  exportRecords() {
    return this.list().map(run=>{
      const finalStep=this.steps(run.id).find(step=>step.study_id===finalStudyId());
      const response=finalStep&&this.store.responses(finalStep.session_id).find(answer=>answer.trialId==='battery-familiarity');
      return {...run,manifestHash:this.row(run.id).manifest_hash,steps:this.manifest(run.id),
        familiarity:response?{scope:'run',known:response.answer.known,sessionId:finalStep.session_id,trialId:response.trialId}:null,
        revisions:this.db.prepare('SELECT created_at,from_version,to_version,reason,snapshot FROM run_revisions WHERE run_id=? ORDER BY id').all(run.id)
          .map(revision=>({...revision,snapshot:JSON.parse(revision.snapshot)}))};
    });
  }
  manifest(id) {
    return this.steps(id).map(s=>({studyId:s.study_id,sessionId:s.session_id,startIndex:s.start_index,trialCount:s.trial_count,protocolHash:s.protocol_hash}));
  }
}
