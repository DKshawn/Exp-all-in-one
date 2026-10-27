import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppError, fingerprint, validateAnswer, validateMetrics, csv } from './engine.mjs';
import { catalog, studyById, createProtocol, publicTrial, analyze } from './protocols.mjs';
import { Runs } from './runs.mjs';
import { Classroom } from './classroom.mjs';
import { localizeTrial, LANGUAGES, TRANSLATION_VERSION } from '../public/i18n.js';

export class Store {
  constructor(filename, { clock = Date.now, seed = () => randomBytes(4).readUInt32LE() } = {}) {
    this.clock = clock;
    this.seed = seed;
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 4) throw new Error('Database version is newer than this application.');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pairs (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, participant TEXT NOT NULL, study_id TEXT NOT NULL, version TEXT NOT NULL,
        is_test INTEGER NOT NULL, seed INTEGER NOT NULL, condition TEXT NOT NULL,
        protocol TEXT NOT NULL, protocol_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
        current_index INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        presented_at INTEGER, ended_at INTEGER, pair_id TEXT REFERENCES pairs(id),
        UNIQUE(participant, study_id, version)
      );
      CREATE TABLE IF NOT EXISTS responses (
        session_id TEXT NOT NULL REFERENCES sessions(id), trial_index INTEGER NOT NULL, trial_id TEXT NOT NULL,
        submission_id TEXT NOT NULL, payload_hash TEXT NOT NULL, answer TEXT NOT NULL, metrics TEXT NOT NULL,
        presented_at INTEGER NOT NULL, received_at INTEGER NOT NULL,
        PRIMARY KEY(session_id, trial_index), UNIQUE(session_id, submission_id)
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, student_id TEXT NOT NULL, version TEXT NOT NULL, manifest_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        ended_at INTEGER, UNIQUE(student_id, version)
      );
      CREATE TABLE IF NOT EXISTS run_steps (
        run_id TEXT NOT NULL REFERENCES runs(id), ordinal INTEGER NOT NULL,
        session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id),
        start_index INTEGER NOT NULL, trial_count INTEGER NOT NULL,
        PRIMARY KEY(run_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS run_revisions (
        id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), created_at INTEGER NOT NULL,
        from_version TEXT NOT NULL, to_version TEXT NOT NULL, reason TEXT NOT NULL, snapshot TEXT NOT NULL
      );
      PRAGMA user_version=4;
    `);
    this.runs = new Runs(this);
    this.runs.upgradeActiveRuns();
    this.classroom = new Classroom(this);
  }
  close() { this.db.close(); }
  transaction(fn) {
    if (this.inTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { this.inTransaction = false; }
  }
  createSession({ participant, studyId, isTest, pairId = null, protocolSeed = this.seed(), protocol = createProtocol(studyId, protocolSeed) }) {
    const sessionId = randomUUID(), now = this.clock();
    this.db.prepare(`INSERT INTO sessions
      (id,participant,study_id,version,is_test,seed,condition,protocol,protocol_hash,created_at,updated_at,pair_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(sessionId,participant,studyId,protocol.version,Number(isTest),protocolSeed,
        protocol.condition,JSON.stringify(protocol),fingerprint(protocol),now,now,pairId);
    return sessionId;
  }
  session(id) {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
    if (!row) throw new AppError('セッションが見つかりません。研究者画面から開始してください。', 404);
    return row;
  }
  responses(id) {
    return this.db.prepare('SELECT * FROM responses WHERE session_id=? ORDER BY trial_index').all(id).map(r => ({
      trialIndex:r.trial_index, trialId:r.trial_id, submissionId:r.submission_id,
      answer:JSON.parse(r.answer), metrics:JSON.parse(r.metrics), presentedAt:r.presented_at, receivedAt:r.received_at
    }));
  }
  start({ studyId, participant, acknowledged, isTest = true, pairCode = '' }) {
    const study = studyById(studyId);
    if (!study) throw new AppError('実験が見つかりません。', 404);
    if (study.retired) throw new AppError('この課題は現在の実施対象ではありません。',410);
    if (acknowledged !== true) throw new AppError('説明を確認してから開始してください。');
    if (typeof participant !== 'string' || !/^[a-zA-Z0-9_-]{3,80}$/.test(participant)) throw new AppError('参加者コードは3〜80文字の英数字・ハイフンで入力してください。');
    if (typeof isTest !== 'boolean') throw new AppError('保存区分が正しくありません。');
    if (typeof pairCode !== 'string' || (pairCode && !/^[A-Z0-9]{8}$/.test(pairCode))) throw new AppError('ペアコードは8桁の英数字です。');
    const id = this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM sessions WHERE participant=? AND study_id=? AND version=?').get(participant, studyId, study.version);
      if (existing) {
        const pair = existing.pair_id && this.db.prepare('SELECT code FROM pairs WHERE id=?').get(existing.pair_id);
        if (pairCode && pair?.code !== pairCode) throw new AppError('この参加者コードは別のペアで登録済みです。', 409);
        return existing.id;
      }
      let pairId = null;
      if (studyId === '12-01') {
        if (pairCode) {
          const pair = this.db.prepare('SELECT * FROM pairs WHERE code=?').get(pairCode);
          if (!pair) throw new AppError('ペアコードが見つかりません。');
          const partners = this.db.prepare('SELECT is_test FROM sessions WHERE pair_id=?').all(pair.id);
          if (partners.length >= 2) throw new AppError('このペアにはすでに2名が登録されています。', 409);
          if (partners.some(p => Boolean(p.is_test) !== isTest)) throw new AppError('ペアの保存区分を同じにしてください。');
          pairId = pair.id;
        } else {
          pairId = randomUUID();
          const code = randomBytes(4).toString('hex').toUpperCase();
          this.db.prepare('INSERT INTO pairs VALUES (?, ?, ?)').run(pairId, code, this.clock());
        }
      } else if (pairCode) throw new AppError('この実験ではペアコードを使用しません。');
      return this.createSession({participant,studyId,isTest,pairId});
    });
    return this.state(id);
  }
  state(id) {
    let row = this.session(id);
    if (row.status === 'active' && row.presented_at === null) {
      this.db.prepare('UPDATE sessions SET presented_at=? WHERE id=? AND presented_at IS NULL').run(this.clock(), id);
      row = this.session(id);
    }
    const protocol = JSON.parse(row.protocol);
    const study = studyById(row.study_id);
    const responses = this.responses(id);
    const pair = row.pair_id && this.db.prepare('SELECT code FROM pairs WHERE id=?').get(row.pair_id);
    return {
      id:row.id, participant:row.participant, studyId:row.study_id, version:row.version, isTest:Boolean(row.is_test),
      status:row.status, currentIndex:row.current_index, totalTrials:protocol.trials.length,
      title:study?.participantTitle || row.study_id, pairCode:pair?.code || null,
      createdAt:row.created_at, updatedAt:row.updated_at,
      trial:row.status === 'active' ? publicTrial(protocol,row.current_index,responses) : null,
      debrief:row.status === 'active' ? null : {
        title:study?.title || row.study_id, explanation:protocol.explanation, changes:protocol.changes,
        sources:(study?.sourceKeys || []).map(key => catalog.sources[key]),
        warning:'この課題だけで個人の能力やバイアスを診断することはできません。条件間の集団比較を想定した日本語試作版です。'
      }
    };
  }
  submit(id, payload) {
    if (!payload || typeof payload !== 'object') throw new AppError('回答データがありません。');
    const { trialIndex, trialId, submissionId, answer, metrics, context } = payload;
    if (!Number.isInteger(trialIndex) || trialIndex < 0 || typeof trialId !== 'string' || typeof submissionId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(submissionId)) throw new AppError('回答識別子を確認してください。');
    const payloadHash = fingerprint({ trialIndex, trialId, answer, metrics, context });
    this.transaction(() => {
      const row = this.session(id);
      const duplicate = this.db.prepare('SELECT * FROM responses WHERE session_id=? AND submission_id=?').get(id,submissionId);
      if (duplicate) {
        if (duplicate.payload_hash !== payloadHash) throw new AppError('同じ送信IDの内容が変更されています。画面を再読み込みしてください。',409);
        return;
      }
      if (row.status !== 'active') throw new AppError('このセッションは終了しています。',409);
      if (row.current_index !== trialIndex) throw new AppError('回答済みの項目は変更できません。再読み込みで現在の項目に戻れます。',409);
      const protocol = JSON.parse(row.protocol);
      const trial = publicTrial(protocol,trialIndex,this.responses(id));
      if (!trial || trial.id !== trialId) throw new AppError('表示中の項目と回答が一致しません。',409);
      const cleanAnswer = validateAnswer(trial,answer);
      const cleanMetrics = validateMetrics(metrics,trial.minViewMs || 0,trial.responseWindowMs || 0);
      if(trial.responseWindowMs){
        if(cleanMetrics.timed.endReason==='submitted'&&cleanAnswer.estimate===null)throw new AppError('この項目に回答してください。');
        if(cleanMetrics.timed.endReason==='interrupted'&&cleanAnswer.estimate!==null)throw new AppError('制限時間の記録を確認してください。');
      }
      if (cleanMetrics.language) {
        const presented = publicTrial(protocol,trialIndex,this.responses(id));
        cleanMetrics.presentations = [...new Set(cleanMetrics.languageHistory.map(entry=>entry.language))].map(language=>{
          const localized = localizeTrial(presented,language);
          return { language, translationVersion:cleanMetrics.translationVersion, trial:localized, hash:fingerprint(localized) };
        });
      }
      const now = this.clock();
      if(trial.responseWindowMs&&cleanMetrics.timed.endReason==='deadline'&&
        (row.presented_at===null||now-row.presented_at+100<trial.responseWindowMs))throw new AppError('制限時間の記録を確認してください。');
      if (row.presented_at === null || now - row.presented_at + 100 < (trial.minViewMs || 0)) throw new AppError('刺激を確認してから進んでください。');
      this.db.prepare('INSERT INTO responses VALUES (?,?,?,?,?,?,?,?,?)').run(id,trialIndex,trialId,submissionId,payloadHash,
        JSON.stringify(cleanAnswer),JSON.stringify(cleanMetrics),row.presented_at,now);
      const complete = trialIndex + 1 === protocol.trials.length;
      this.db.prepare('UPDATE sessions SET current_index=?,status=?,updated_at=?,presented_at=NULL,ended_at=? WHERE id=?')
        .run(trialIndex+1,complete?'completed':'active',now,complete?now:null,id);
    });
    return this.state(id);
  }
  withdraw(id) {
    const row = this.session(id);
    if (row.status === 'active') this.db.prepare("UPDATE sessions SET status='withdrawn', ended_at=?,updated_at=? WHERE id=?").run(this.clock(),this.clock(),id);
    return this.state(id);
  }
  list() {
    return this.db.prepare(`SELECT id,participant,study_id AS studyId,version,is_test AS isTest,condition,status,
      current_index AS answered,created_at AS createdAt,updated_at AS updatedAt,pair_id AS pairId FROM sessions ORDER BY created_at DESC`).all();
  }
  pairs({ studentsOnly = false } = {}) {
    return this.db.prepare('SELECT * FROM pairs ORDER BY created_at DESC').all().map(pair => {
      const sessions = this.db.prepare(`SELECT s.id,s.participant,s.status,r.student_id AS studentId,r.id AS runId
        FROM sessions s LEFT JOIN run_steps rs ON rs.session_id=s.id LEFT JOIN runs r ON r.id=rs.run_id
        WHERE s.pair_id=? ORDER BY s.created_at`).all(pair.id);
      const shares = sessions.map(s => this.responses(s.id).find(r => r.trialId === 'shares')?.answer);
      const contexts = sessions.map(s => this.responses(s.id).find(r => r.trialId === 'context')?.answer);
      const totals = {};
      if (sessions.length === 2 && shares.every(Boolean)) for (const key of Object.keys(shares[0])) {
        const values = shares.map(s => s[key]);
        totals[key] = values.every(x => typeof x === 'number') ? { values, sum:values[0]+values[1], excess:values[0]+values[1]-100 } : { values, sum:null, excess:null };
      }
      return { code:pair.code, sessions, totals, bothCohabit:contexts.length===2 && contexts.every(c=>c?.cohabit==='yes'),
        note:'同居・同一期間・同一活動の2名の独立回答のみ比較してください。該当なしは合計から除外します。' };
    }).filter(pair => !studentsOnly || pair.sessions.some(s => s.runId));
  }
  conversationPairs() {
    const records=this.db.prepare(`SELECT s.id AS sessionId,r.student_id AS studentId,lr.lesson_id AS lessonId
      FROM sessions s JOIN run_steps rs ON rs.session_id=s.id JOIN runs r ON r.id=rs.run_id
      JOIN lesson_runs lr ON lr.run_id=r.id WHERE s.study_id='12-01' ORDER BY lr.lesson_id,r.student_id`).all()
      .flatMap(row=>{const response=this.responses(row.sessionId).find(r=>r.trialId==='conversation');return response?[{...row,...response.answer}]:[];});
    const byStudent=new Map(records.map(row=>[row.lessonId+':'+row.studentId,row])),paired=[],unpaired=[],used=new Set();
    for(const a of records){
      if(used.has(a.sessionId))continue;
      const b=byStudent.get(a.lessonId+':'+a.partnerStudentId);
      if(!b||b.partnerStudentId!==a.studentId||b.studentId===a.studentId){unpaired.push({...a,reason:!b?'partner-response-missing':'nonreciprocal-partner-id'});continue;}
      used.add(a.sessionId);used.add(b.sessionId);
      const relativeSelfEstimates=[a.selfSpeakingPercent-b.partnerSpeakingPercent,b.selfSpeakingPercent-a.partnerSpeakingPercent];
      paired.push({lessonId:a.lessonId,members:[a,b],relativeSelfEstimates,
        meanRelativeSelfEstimate:(relativeSelfEstimates[0]+relativeSelfEstimates[1])/2,
        selfEstimateSumExcess:a.selfSpeakingPercent+b.selfSpeakingPercent-100,
        withinResponseSums:[a.selfSpeakingPercent+a.partnerSpeakingPercent,b.selfSpeakingPercent+b.partnerSpeakingPercent]});
    }
    return {paired,unpaired,note:'Pairs require reciprocal IDs within the same lesson. The teacher must ensure a shared real conversation. Cross-person differences are not objective accuracy scores; no sum-to-100 constraint is imposed.'};
  }
  exportJSON({ studentsOnly = false } = {}) {
    const rows = this.db.prepare(`SELECT s.*,r.student_id AS student_id,r.id AS run_id FROM sessions s
      LEFT JOIN run_steps rs ON rs.session_id=s.id LEFT JOIN runs r ON r.id=rs.run_id
      ${studentsOnly ? 'WHERE r.id IS NOT NULL' : ''} ORDER BY s.created_at`).all();
    return { schemaVersion:5, appVersion:catalog.version, exportedAt:new Date(this.clock()).toISOString(), catalog,
      localization:{defaultLanguage:'ja',languages:LANGUAGES,translationVersion:TRANSLATION_VERSION},
      runs:this.runs.exportRecords(),
      lessons:this.classroom.exportRecords(),
      sessions:rows.map(row => {
        const protocol=JSON.parse(row.protocol), responses=this.responses(row.id);
        return { id:row.id,participant:row.participant,studentId:row.student_id,runId:row.run_id,studyId:row.study_id,version:row.version,isTest:Boolean(row.is_test),
          seed:row.seed,condition:row.condition,protocolHash:row.protocol_hash,status:row.status,
          createdAt:row.created_at,endedAt:row.ended_at,pairId:row.pair_id,protocol,responses,analysis:analyze(protocol,responses) };
      }), pairs:this.pairs({studentsOnly}),conversationPairs:this.conversationPairs() };
  }
  exportCSV(options = {}) {
    const rows = [['session_id','student_id','run_id','participant_code','study_id','version','is_test','condition','seed','protocol_hash','status','pair_id',
      'trial_index','trial_id','field','answer','rt_ms','active_ms','focus_losses','reload_count','presented_at','received_at','stimulus_json',
      'language','translation_version','language_history_json','presentation_hash','timed_response_json',
      'lesson_id','lesson_settings_json','experiment_order_json','choice_order_json']];
    const data=this.exportJSON(options),lessonByRun=new Map();
    for(const lesson of data.lessons)for(const assignment of lesson.assignments)lessonByRun.set(assignment.runId,lesson);
    for (const s of data.sessions) for (const r of s.responses) {
      const lesson=lessonByRun.get(s.runId);
      const t=publicTrial(s.protocol,r.trialIndex,s.responses);
      const presentation=r.metrics.presentations?.find(item=>item.language===r.metrics.language);
      for (const [field,answer] of Object.entries(r.answer).length ? Object.entries(r.answer) : [['__exposure__',null]]) {
        rows.push([s.id,s.studentId,s.runId,s.participant,s.studyId,s.version,s.isTest,s.condition,s.seed,s.protocolHash,s.status,s.pairId,
          r.trialIndex,r.trialId,field,answer,r.metrics.rtMs,r.metrics.activeMs,r.metrics.focusLosses,r.metrics.reloadCount,
          new Date(r.presentedAt).toISOString(),new Date(r.receivedAt).toISOString(),(presentation?.trial||t).stimulus || null,
          r.metrics.language||'ja',r.metrics.translationVersion||'legacy-ja',r.metrics.languageHistory||null,presentation?.hash||null,r.metrics.timed||null,
          lesson?.id||null,lesson?.settings||null,lesson?this.runs.manifest(s.runId).map(step=>step.studyId):null,
          s.protocol.presentation?.optionOrders||null]);
      }
    }
    return csv(rows);
  }
}
