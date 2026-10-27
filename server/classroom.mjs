import { randomUUID } from 'node:crypto';
import { AppError, fingerprint, rng, shuffle } from './engine.mjs';
import { catalog, createProtocol } from './protocols.mjs';

export function classroomProtocol(studyId, seed, randomizeChoices) {
  const protocol=createProtocol(studyId,seed,{randomizeChoices:false});
  protocol.version+='/teacher-1';
  protocol.trials=protocol.trials.filter(trial=>!['familiarity','historical-knowledge'].includes(trial.id));
  const random=rng(seed^0x7341a5c9);
  for(const trial of protocol.trials) for(const field of trial.fields) {
    if(field.type==='choice'&&field.optionOrder!=='fixed'&&randomizeChoices)field.options=shuffle(field.options,random);
  }
  protocol.presentation={randomizeChoices,optionOrders:protocol.trials.map(trial=>({trialId:trial.id,
    fields:trial.fields.filter(field=>field.options).map(field=>({fieldId:field.id,values:field.options.map(option=>option.value)}))}))};
  return protocol;
}

export class Classroom {
  constructor(store) {
    this.store=store;this.db=store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS classroom_students (
        token TEXT PRIMARY KEY, student_id TEXT UNIQUE NOT NULL,
        joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, settings TEXT NOT NULL,
        settings_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL, ended_at INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS one_active_lesson ON lessons(status) WHERE status='active';
      CREATE TABLE IF NOT EXISTS lesson_runs (
        lesson_id TEXT NOT NULL REFERENCES lessons(id), student_token TEXT NOT NULL REFERENCES classroom_students(token),
        run_id TEXT UNIQUE NOT NULL REFERENCES runs(id), order_seed INTEGER NOT NULL,
        PRIMARY KEY(lesson_id,student_token)
      );
    `);
  }
  active() {return this.db.prepare("SELECT * FROM lessons WHERE status='active'").get();}
  lesson(row) {return row?{id:row.id,status:row.status,createdAt:row.created_at,endedAt:row.ended_at,settings:JSON.parse(row.settings)}:null;}
  dashboard() {
    const current=this.active(),now=this.store.clock();
    const students=this.db.prepare(`SELECT s.student_id AS studentId,s.last_seen AS lastSeen,
      r.id AS runId,r.status,COALESCE(SUM(ss.current_index),0) AS answered,COALESCE(SUM(rs.trial_count),0) AS totalTrials
      FROM classroom_students s LEFT JOIN lesson_runs lr ON lr.student_token=s.token AND lr.lesson_id=?
      LEFT JOIN runs r ON r.id=lr.run_id LEFT JOIN run_steps rs ON rs.run_id=r.id LEFT JOIN sessions ss ON ss.id=rs.session_id
      WHERE s.last_seen>=? GROUP BY s.token ORDER BY s.student_id`).all(current?.id||'',now-60000);
    return {lesson:this.lesson(current),students,studies:catalog.studies.map(study=>({id:study.id,names:study.names,
      enabled:study.classroomEnabled===true,description:study.original,changes:study.changes,restoration:study.restoration||null,audit:study.audit||null})),history:this.store.runs.list()};
  }
  join({studentId}) {
    const normalized=typeof studentId==='string'?studentId.normalize('NFKC').trim():'';
    if(!/^\d{7}$/.test(normalized))throw new AppError('学生証番号は7桁の数字で入力してください。');
    const now=this.store.clock();
    let row=this.db.prepare('SELECT * FROM classroom_students WHERE student_id=?').get(normalized);
    if(!row){const token=randomUUID();this.db.prepare('INSERT INTO classroom_students VALUES (?,?,?,?)').run(token,normalized,now,now);row={token};}
    return {token:row.token,...this.student(row.token)};
  }
  start({studyIds,randomizeExperiments=false,randomizeChoices=false,requestId}) {
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId))throw new AppError('開始情報を確認してください。');
    if(!Array.isArray(studyIds)||!studyIds.length||new Set(studyIds).size!==studyIds.length||studyIds.some(id=>!catalog.studies.some(study=>study.id===id&&study.classroomEnabled===true)))throw new AppError('実施できる実験を選択してください。');
    if(typeof randomizeExperiments!=='boolean'||typeof randomizeChoices!=='boolean')throw new AppError('実施設定を確認してください。');
    const settings={studyIds,randomizeExperiments,randomizeChoices,versions:studyIds.map(id=>[id,catalog.studies.find(study=>study.id===id).version])};
    const hash=fingerprint(settings);
    return this.store.transaction(()=>{
      const prior=this.db.prepare('SELECT * FROM lessons WHERE request_id=?').get(requestId);
      if(prior){if(prior.settings_hash!==hash)throw new AppError('開始情報が変更されています。',409);return this.lesson(prior);}
      if(this.active())throw new AppError('実施中の実験を終了してから開始してください。',409);
      const id=randomUUID();this.db.prepare('INSERT INTO lessons (id,request_id,settings,settings_hash,created_at) VALUES (?,?,?,?,?)').run(id,requestId,JSON.stringify(settings),hash,this.store.clock());
      return this.lesson(this.active());
    });
  }
  assign(lesson,student) {
    return this.store.transaction(()=>{
      const existing=this.db.prepare('SELECT run_id FROM lesson_runs WHERE lesson_id=? AND student_token=?').get(lesson.id,student.token);
      if(existing)return existing.run_id;
      const settings=JSON.parse(lesson.settings),orderSeed=this.store.seed();
      const ids=settings.randomizeExperiments?shuffle(settings.studyIds,rng(orderSeed)):settings.studyIds;
      const runId=randomUUID(),now=this.store.clock();
      this.db.prepare('INSERT INTO runs (id,student_id,version,manifest_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(runId,student.student_id,'teacher-1/'+lesson.id,'',now,now);
      let startIndex=0;
      ids.forEach((studyId,ordinal)=>{
        const seed=this.store.seed(),protocol=classroomProtocol(studyId,seed,settings.randomizeChoices);
        const sessionId=this.store.createSession({participant:'run-'+runId,studyId,isTest:false,protocolSeed:seed,protocol});
        this.db.prepare('INSERT INTO run_steps VALUES (?,?,?,?,?)').run(runId,ordinal,sessionId,startIndex,protocol.trials.length);
        startIndex+=protocol.trials.length;
      });
      this.db.prepare('UPDATE runs SET manifest_hash=? WHERE id=?').run(fingerprint(this.store.runs.manifest(runId)),runId);
      this.db.prepare('INSERT INTO lesson_runs VALUES (?,?,?,?)').run(lesson.id,student.token,runId,orderSeed);
      return runId;
    });
  }
  student(token) {
    const student=this.db.prepare('SELECT * FROM classroom_students WHERE token=?').get(token);
    if(!student)throw new AppError('学生証番号でログインしてください。',404);
    this.db.prepare('UPDATE classroom_students SET last_seen=? WHERE token=?').run(this.store.clock(),token);
    const current=this.active();
    if(!current){
      const last=this.db.prepare('SELECT run_id FROM lesson_runs lr JOIN lessons l ON l.id=lr.lesson_id WHERE student_token=? ORDER BY l.created_at DESC,l.rowid DESC LIMIT 1').get(token);
      return {phase:'waiting',studentId:student.student_id,lesson:null,run:last?this.store.runs.state(last.run_id):null};
    }
    const run=this.store.runs.state(this.assign(current,student));
    return {phase:run.status==='active'?'running':'finished',studentId:student.student_id,lesson:this.lesson(current),run};
  }
  end(id) {
    return this.store.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM lessons WHERE id=?').get(id);
      if(!row)throw new AppError('実施情報が見つかりません。',404);
      if(row.status==='active'){
        for(const run of this.db.prepare('SELECT run_id FROM lesson_runs WHERE lesson_id=?').all(id))this.store.runs.withdraw(run.run_id);
        this.db.prepare("UPDATE lessons SET status='ended',ended_at=? WHERE id=?").run(this.store.clock(),id);
      }
      return this.lesson(this.db.prepare('SELECT * FROM lessons WHERE id=?').get(id));
    });
  }
  exportRecords() {
    return this.db.prepare('SELECT * FROM lessons ORDER BY created_at,rowid').all().map(row=>({...this.lesson(row),settingsHash:row.settings_hash,
      assignments:this.db.prepare('SELECT run_id AS runId,order_seed AS orderSeed FROM lesson_runs WHERE lesson_id=?').all(row.id)}));
  }
}
