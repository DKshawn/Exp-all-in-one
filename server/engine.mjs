import { createHash } from 'node:crypto';
import { LANGUAGES, TRANSLATION_VERSION } from '../public/i18n.js';

export function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ state >>> 15, 1 | state);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
export function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export const choose = (items, random) => items[Math.floor(random() * items.length)];
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function posterior(prior, pRedA, pRedB, red, blue) {
  const a = Math.log(prior) + red * Math.log(pRedA) + blue * Math.log1p(-pRedA);
  const b = Math.log1p(-prior) + red * Math.log(pRedB) + blue * Math.log1p(-pRedB);
  return 1 / (1 + Math.exp(b - a));
}
export const marginal = (weights, outcomes) => weights.reduce((s, w, i) => s + w * outcomes[i], 0);
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateAnswer(trial, answer) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new AppError('回答の形式を確認してください。');
  const fields = trial.fields || [];
  const validIds = new Set(fields.map(f => f.id));
  for (const id of Object.keys(answer)) if (!validIds.has(id)) throw new AppError('未定義の回答項目があります。');
  const clean = {};
  for (const field of fields) {
    if (field.when && answer[field.when.id] !== field.when.equals) {
      if (answer[field.id] !== undefined) throw new AppError('対象外の項目に回答が含まれています。');
      continue;
    }
    const value = answer[field.id];
    if (field.allowNA && value === null) { clean[field.id] = null; continue; }
    if (field.allowTimeout && trial.responseWindowMs && value === null) { clean[field.id] = null; continue; }
    if (field.type === 'choice') {
      if (typeof value !== 'string' || !field.options.some(o => o.value === value)) throw new AppError(field.label + 'を選択してください。');
    } else if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) throw new AppError(field.label + '：' + field.min + '〜' + field.max + 'の数値を入力してください。');
      if (field.step === 1 && !Number.isInteger(value)) throw new AppError(field.label + 'は整数で入力してください。');
      if (field.exclusiveMin && value <= field.min) throw new AppError('0より大きい数値を入力してください。');
    } else if (field.type === 'text') {
      if (typeof value !== 'string' || value.trim().length < (field.minLength || 1) || value.length > (field.maxLength || 2000)) throw new AppError(field.label + 'の文字数を確認してください。');
      if (field.pattern && !new RegExp('^(?:'+field.pattern+')$').test(value.trim())) throw new AppError('学生証番号は7桁の数字で入力してください。');
    } else throw new Error('Unknown field type: ' + field.type);
    clean[field.id] = typeof value === 'string' ? value.trim() : value;
  }
  if (trial.sumFields && Math.abs(trial.sumFields.reduce((sum, id) => sum + clean[id], 0) - 100) > 0.000001) throw new AppError('確率の合計を100%にしてください。');
  if (trial.rankFields && !trial.allowRankTies && new Set(trial.rankFields.map(id => clean[id])).size !== trial.rankFields.length) throw new AppError('順位は重複させず、各順位を一度ずつ使ってください。');
  if (trial.rankFields && trial.allowRankTies && Math.min(...trial.rankFields.map(id=>clean[id]))!==1) throw new AppError('最も低い項目を1位にしてください。');
  if (trial.ratioFields && trial.ratioFields.every(id=>clean[id]===0)) throw new AppError('両方を0にはできません。');
  return clean;
}
export function validateMetrics(metrics = {}, minimum = 0, responseWindowMs = 0) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw new AppError('計測情報の形式が正しくありません。');
  const clean = {};
  for (const key of ['rtMs', 'activeMs', 'focusLosses', 'reloadCount']) {
    const value = metrics[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86400000) throw new AppError('計測情報を再確認してください。');
    clean[key] = Math.round(value);
  }
  if (clean.activeMs < minimum) throw new AppError('刺激を最後まで確認してから進んでください。');
  if (clean.activeMs > clean.rtMs + 100) throw new AppError('表示時間の記録が一致しません。');
  const viewport = metrics.viewport || {};
  clean.viewport = {
    width: Number.isFinite(viewport.width) ? Math.max(0, Math.min(20000, Math.round(viewport.width))) : null,
    height: Number.isFinite(viewport.height) ? Math.max(0, Math.min(20000, Math.round(viewport.height))) : null
  };
  clean.clientStartedAt = typeof metrics.clientStartedAt === 'string' ? metrics.clientStartedAt.slice(0, 40) : null;
  if(responseWindowMs){
    const timed=metrics.timed;
    if(!timed||timed.limitMs!==responseWindowMs||!['submitted','deadline','interrupted'].includes(timed.endReason)||
      !Number.isFinite(timed.elapsedMs)||timed.elapsedMs<0||timed.elapsedMs>86400000||
      (timed.endReason==='submitted'&&timed.elapsedMs>responseWindowMs)||
      (timed.endReason==='deadline'&&timed.elapsedMs<responseWindowMs)||
      (timed.endReason!=='interrupted'&&Math.abs(timed.elapsedMs-clean.rtMs)>100))throw new AppError('制限時間の記録を確認してください。');
    clean.timed={limitMs:responseWindowMs,elapsedMs:Math.round(timed.elapsedMs),endReason:timed.endReason};
  }
  // Old clients may still retry an already prepared Japanese submission.
  if (metrics.language !== undefined || metrics.translationVersion !== undefined || metrics.languageHistory !== undefined) {
    if (!LANGUAGES.includes(metrics.language)) throw new AppError('言語の記録を確認してください。');
    // Earlier pending submissions use unchanged wording for the older tasks.
    if (![TRANSLATION_VERSION,'2026-10-27.1','2026-10-27.2','2026-10-27.3'].includes(metrics.translationVersion) ||
        (responseWindowMs&&metrics.translationVersion==='2026-10-27.1')) throw new AppError('表示内容が更新されました。再読み込みしてください。');
    const history = metrics.languageHistory;
    if (!Array.isArray(history) || history.length < 1 || history.length > 1000) throw new AppError('言語の記録を確認してください。');
    let previous = -1;
    clean.languageHistory = history.map((entry, index) => {
      if (!entry || !LANGUAGES.includes(entry.language) || !Number.isInteger(entry.atActiveMs) ||
          entry.atActiveMs < 0 || entry.atActiveMs > clean.activeMs || entry.atActiveMs < previous ||
          (index === 0 && entry.atActiveMs !== 0)) throw new AppError('言語の記録を確認してください。');
      previous = entry.atActiveMs;
      return { language:entry.language, atActiveMs:entry.atActiveMs };
    });
    if (history.at(-1).language !== metrics.language) throw new AppError('言語の記録を確認してください。');
    clean.language = metrics.language;
    clean.translationVersion = metrics.translationVersion;
  }
  return clean;
}
export function csvCell(value) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (typeof value === 'string' && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export const csv = rows => '\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
