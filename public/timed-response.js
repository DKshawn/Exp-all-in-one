// A timed estimate accepts only input made before the deadline. A delayed timer
// callback must not accidentally capture input made after the five-second window.
export function createTimedAttempt(limitMs,now){
  return {limitMs,startedAt:now,value:null,ended:false};
}
export function captureTimedInput(attempt,text,now){
  if(attempt.ended||now-attempt.startedAt>=attempt.limitMs)return;
  const value=String(text).trim()===''?null:Number(text);
  attempt.value=Number.isSafeInteger(value)&&value>=0?value:null;
}
export function finishTimedAttempt(attempt,reason,now){
  if(attempt.ended)return null;
  const elapsed=Math.max(0,now-attempt.startedAt);
  if(reason==='deadline'&&elapsed<attempt.limitMs)return null;
  if(reason==='submitted'&&elapsed>=attempt.limitMs)reason='deadline';
  attempt.ended=true;
  return {estimate:reason==='interrupted'?null:attempt.value,
    timed:{limitMs:attempt.limitMs,elapsedMs:Math.min(86400000,Math.round(elapsed)),endReason:reason}};
}
