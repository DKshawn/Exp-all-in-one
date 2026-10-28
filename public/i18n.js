import { taskMessages } from './locale-data.js';
import { revisedMessages } from './revised-messages.js';
import { expandedMessages } from './expanded-messages.js';

export const LANGUAGES = Object.freeze(['ja','zh','en']);
export const TRANSLATION_VERSION = '2026-10-27.4';
export const normalizeLanguage = language => LANGUAGES.includes(language) ? language : 'ja';
export const documentLanguage = language => language==='zh' ? 'zh-CN' : normalizeLanguage(language);
export const UI_MESSAGES = [
  ['プレビュー','预览','Preview'],
  ['プレビュー・結果は保存されません','预览 · 不保存结果','Preview · Results are not saved'],
  ['画面サイズ','屏幕尺寸','Screen size'],
  ['スマートフォン','手机','Phone'],
  ['タブレット','平板','Tablet'],
  ['ノートパソコン','笔记本','Laptop'],
  ['デスクトップ','桌面','Desktop'],
  ['カスタム','自定义','Custom'],
  ['幅','宽度','Width'],
  ['高さ','高度','Height'],
  ['前へ','上一题','Previous'],
  ['回答せずに進む','跳过本题','Skip'],
  ['管理画面に戻る','返回管理页','Back to control'],
  ['最初に戻る','返回开头','Start again'],
  ['プレビューを読み込めませんでした。','无法加载预览。','Could not load the preview.'],
  ['順位','名次','Rank'],
  ['第{rank}位','第{rank}名','Rank {rank}'],
  ['未配置の項目','待排序选项','Unranked items'],
  ['項目を下の順位へ移動してください。','把选项移到下方的名次中。','Move each item to a rank below.'],
  ['ドラッグするか、項目を選んでから順位を選んでください。選択を解除するにはEscキーを押してください。','拖动选项，或先选择选项再选择名次。按Esc取消选择。','Drag an item, or select it and then choose a rank. Press Escape to cancel the selection.'],
  ['選んだ項目を戻す','放回所选选项','Return selected item'],
  ['すべての項目を順位に配置してください。','请为所有选项安排好名次。','Place every item in a rank.'],
  ['「{item}」を選択しました。順位を選んでください。','已选择“{item}”，请选择名次。','Selected “{item}”. Choose a rank.'],
  ['「{item}」を未配置に戻しました。','已把“{item}”放回待排序区。','Returned “{item}” to unranked items.'],
  ['「{item}」を第{rank}位に置きました。','已把“{item}”放到第{rank}名。','Placed “{item}” in rank {rank}.'],
  ["0より大きい数値を入力してください。","请输入大于0的数值。","Enter a number greater than 0."],
  ["最も低い項目を1位にしてください。","请把最低的项目排为第1位。","Assign rank 1 to the lowest item."],
  ["両方を0にはできません。","两项不能同时为0。","Both values cannot be 0."],
  ["相手の学生証番号を入力してください。","请输入对方的学生证号。","Enter your partner’s student ID."],
  ['学生ページ','学生页面','Student page'],
  ['不足している資料','缺少的材料','Missing materials'],
  ['必要な実施条件','需要的实施条件','Required conditions'],
  ['原書との対応','与原书的对应','Relation to the source'],
  ['資料・実施条件を確認（{count}）','待补材料与条件（{count}）','Materials and conditions needed ({count})'],
  ['ログイン','登录','Log in'],
  ['ログアウト','退出登录','Log out'],
  ['待機に戻る','返回等待','Return to waiting'],
  ['開始をお待ちください。','请等待实验开始。','Please wait for the experiment to start.'],
  ['学生証番号は7桁の数字で入力してください。','请输入7位数字学生证号。','Enter your 7-digit student ID.'],
  ['学生証番号でログインしてください。','请使用学生证号登录。','Please log in with your student ID.'],
  ['実験の管理','实验管理','Experiment control'],
  ['実験を選択','选择实验','Choose experiments'],
  ['学生','学生','Students'],
  ['実施中','进行中','Running'],
  ['待機中','等待中','Waiting'],
  ['ログインを待っています。','等待学生登录。','Waiting for students to log in.'],
  ['学生ごとに実験順をランダム化','每位学生的实验顺序随机','Randomize experiment order for each student'],
  ['選択肢の位置をランダム化','选择题选项位置随机','Randomize answer positions'],
  ['未復元（{count}）','尚未恢复（{count}）','Not yet restored ({count})'],
  ['教師が実験を開始してください。','请由教师开始实验。','The teacher must start the experiment.'],
  ['{count}件選択','已选{count}项','{count} selected'],
  ['実験を終了','结束实验','End experiments'],
  ['実施中の実験を終了しますか。','确定结束正在进行的实验吗？','End the experiments currently running?'],
  ['開始情報を確認してください。','请检查启动信息。','Please check the start request.'],
  ['実施できる実験を選択してください。','请选择可实施的实验。','Select available experiments.'],
  ['実施設定を確認してください。','请检查实验设置。','Please check the experiment settings.'],
  ['開始情報が変更されています。','启动信息发生变化，请刷新。','The start request has changed. Please reload.'],
  ['実施中の実験を終了してから開始してください。','请先结束正在进行的实验。','End the current experiments before starting another session.'],
  ['実施情報が見つかりません。','未找到本次实验。','Experiment session not found.'],
  ["実験","实验","Experiment"],
  ["実験を始める","开始实验","Start the experiment"],
  ["学生証番号","学生证号","Student ID"],
  ["開始する","开始","Start"],
  ["次へ","下一题","Next"],
  ["送信する","提交","Submit"],
  ["送信中…","正在提交…","Submitting…"],
  ["もう一度送信する","重新提交","Retry submission"],
  ["中止する","中止实验","Stop experiment"],
  ["ここで実験を終了しますか。","确定在此结束实验吗？","End the experiment here?"],
  ["戻る","返回","Go back"],
  ["終了する","结束实验","End experiment"],
  ["終了","结束","Finish"],
  ["回答が完了しました。","已完成作答。","Your responses are complete."],
  ["実験を終了しました。","实验已结束。","The experiment has ended."],
  ["ありがとうございました。","感谢你的参与。","Thank you for participating."],
  ["言語","语言","Language"],
  ["制限時間の記録を確認してください。","限时记录异常，请刷新页面。","The time-limit record is invalid. Please reload the page."],
  ["この項目は終了しました。","本题已结束。","This item has ended."],
  ["この課題は現在の実施対象ではありません。","此任务已不再纳入当前实验。","This task is no longer included in the current experiment."],
  ["本文へ移動","跳到主要内容","Skip to content"],
  ["読み込み中…","正在加载…","Loading…"],
  ["進行状況","进度","Progress"],
  ["あと{seconds}秒","剩余{seconds}秒","{seconds} seconds remaining"],
  ["合計：{value}%","合计：{value}%","Total: {value}%"],
  ["{min}〜{max}","{min}～{max}","{min}–{max}"],
  ["ペア番号","配对编号","Pair number"],
  ["相手から受け取った番号を入力してください。先に回答する場合は空欄にしてください。","请输入对方给你的编号。如果你先作答，请留空。","Enter the number given by the other person. Leave it blank if you are answering first."],
  ["相手にこの番号を伝えてください。","请把这个编号告诉对方。","Give this number to the other person."],
  ["回転中","转动中","Spinning"],
  ["記号の並び","符号排列","Sequence of symbols"],
  ["あなたのカード","你的卡片","Your card"],
  ["赤","红","Red"],
  ["青","蓝","Blue"],
  ["製造元と検査の情報","生产来源与检验信息","Factory and inspection information"],
  ["製造元","生产来源","Factory"],
  ["この工場で作られた確率","由该工厂生产的概率","Probability of coming from this factory"],
  ["この工場の合格率","该工厂的合格率","Pass rate at this factory"],
  ["工場{label}","工厂{label}","Factory {label}"],
  ["頭を大きく描いた人物","头部画得较大的人物","A figure drawn with a large head"],
  ["目を大きく描いた人物","眼睛画得较大的人物","A figure drawn with large eyes"],
  ["通常の比率の人物","正常比例的人物","A figure with ordinary proportions"],
  ["周囲の視線が気になる","在意周围人的目光","Concerned about other people watching"],
  ["自分の能力が気になる","在意自己的能力","Concerned about their own ability"],
  ["これまでの経験","以往经历","Prior experience"],
  ["分類課題で示した成績は、回答に関係なく設定された値です。あなたの能力を評価したものではありません。","分类任务中显示的成绩是预先设定的，与答案无关，并不是对你能力的评价。","The classification score was predetermined independently of your answers. It was not an assessment of your ability."],
  ["バス無料化についての研究報告と数値は、この課題のために作成した架空の情報です。","关于免费公交的研究报告和数字均为本任务编写的虚构信息。","The research reports and numbers about free buses were fictional information created for this task."],
  ["歴史課題の結末は実験条件による表示で、一部は実際の歴史と異なります。英・グルカ戦争はイギリス側に有利な条約で終結しました。","历史任务中显示的结局由实验条件决定，部分与真实历史不同。英廓战争最终以有利于英国一方的条约结束。","The historical outcomes shown were assigned by the experimental condition, and some differ from actual history. The Anglo-Gurkha War ended with a treaty favorable to the British side."],
  ["接続できませんでした。もう一度お試しください。","连接失败，请重试。","Could not connect. Please try again."],
  ["送信できませんでした。もう一度お試しください。","提交失败，请重试。","Could not submit. Please try again."],
  ["学生証番号を確認してください。","请检查学生证号。","Please check your student ID."],
  ["学生証番号を入力してください。","请输入学生证号。","Enter your student ID."],
  ["確率の合計を100%にしてください。","请使概率合计为100%。","The probabilities must total 100%."],
  ["各順位を一度ずつ使ってください。","每个名次只能使用一次。","Use each rank exactly once."],
  ["順位は重複させず、各順位を一度ずつ使ってください。","名次不能重复，每个名次只能使用一次。","Do not repeat ranks; use each rank exactly once."],
  ["この項目に回答してください。","请回答这一项。","Please answer this item."],
  ["{min}〜{max}の数値を入力してください。","请输入{min}到{max}之间的数值。","Enter a number from {min} to {max}."],
  ["整数を入力してください。","请输入整数。","Enter a whole number."],
  ["文字数を確認してください。","请检查输入字数。","Please check the length of your response."],
  ["入力内容を確認してください。","请检查填写的内容。","Please check your entry."],
  ["ペア番号は8桁の英数字です。","配对编号应为8位英文字母或数字。","A pair number has 8 letters or digits."],
  ["ペア番号を確認してください。","请检查配对编号。","Please check the pair number."],
  ["ペア番号が見つかりません。番号を確認してください。","未找到配对编号，请检查。","Pair number not found. Please check it."],
  ["このペア番号は利用できません。","无法使用这个配对编号。","This pair number cannot be used."],
  ["同居している相手のペア番号を入力してください。","请输入与你共同居住者的配对编号。","Enter the pair number of the person you live with."],
  ["実験が見つかりません。学生証番号を入力してください。","未找到实验记录，请输入学生证号。","Experiment not found. Please enter your student ID."],
  ["回答を確認してください。","请检查答案。","Please check your response."],
  ["回答の順番が一致しません。再読み込みしてください。","作答顺序不一致，请刷新页面。","The response order does not match. Please reload the page."],
  ["この実験は終了しています。","这次实验已经结束。","This experiment has already ended."],
  ["表示されている問題に回答してください。","请回答当前显示的题目。","Please answer the question currently shown."],
  ["回答の形式を確認してください。","请检查答案内容。","Please check your response."],
  ["未定義の回答項目があります。","答案包含未识别的项目。","The response contains an unrecognized item."],
  ["対象外の項目に回答が含まれています。","答案中包含不适用的项目。","The response includes an item that does not apply."],
  ["計測情報の形式が正しくありません。","计时记录异常，请刷新页面。","The timing record is invalid. Please reload the page."],
  ["計測情報を再確認してください。","计时记录异常，请刷新页面。","The timing record is invalid. Please reload the page."],
  ["刺激を最後まで確認してから進んでください。","请完整看完材料后再继续。","View the material to the end before continuing."],
  ["刺激を確認してから進んでください。","请看完材料后再继续。","View the material before continuing."],
  ["表示時間の記録が一致しません。","显示时间记录不一致，请刷新页面。","The display-time record does not match. Please reload the page."],
  ["回答データがありません。","未收到答案，请重试。","No response was received. Please try again."],
  ["回答識別子を確認してください。","无法确认这次提交，请刷新页面。","This submission could not be verified. Please reload the page."],
  ["同じ送信IDの内容が変更されています。画面を再読み込みしてください。","这次提交的内容已改变，请刷新页面。","The content of this submission has changed. Please reload the page."],
  ["このセッションは終了しています。","这次作答已经结束。","This session has ended."],
  ["回答済みの項目は変更できません。再読み込みで現在の項目に戻れます。","已提交的答案不能修改。刷新可返回当前题目。","Submitted answers cannot be changed. Reload to return to the current item."],
  ["表示中の項目と回答が一致しません。","答案与当前题目不一致，请刷新页面。","The response does not match the current item. Please reload the page."],
  ["保存できませんでした。サーバーの状態を確認して、同じ回答を再送してください。","保存失败，请检查本地服务后重新提交。","Could not save. Check the local server and retry the submission."],
  ["送信データを読み取れません。","无法读取提交内容，请重试。","Could not read the submission. Please try again."],
  ["送信データが大きすぎます。","提交内容过长。","The submission is too large."],
  ["言語の記録を確認してください。","语言记录异常，请刷新页面。","The language record is invalid. Please reload the page."],
  ["表示内容が更新されました。再読み込みしてください。","显示内容已更新，请刷新页面。","The displayed content has been updated. Please reload the page."],
  ["回答一覧","作答记录","Response records"],
  ["学生の回答","学生作答记录","Student responses"],
  ["実験を開く","打开实验","Open experiment"],
  ["更新","刷新","Refresh"],
  ["進捗","进度","Progress"],
  ["状態","状态","Status"],
  ["更新日時","更新时间","Updated"],
  ["回答中","作答中","In progress"],
  ["完了","已完成","Completed"],
  ["中止","已中止","Stopped"],
  ["まだ回答はありません。","暂无作答记录。","No responses yet."],
  ["回答一覧を取得できませんでした。","无法获取作答记录。","Could not load response records."],
  ["接続できませんでした。","连接失败。","Could not connect."],
];
const messages = new Map([...taskMessages,...revisedMessages,...expandedMessages,...UI_MESSAGES].map(row=>[row[0],{ja:row[0],zh:row[1],en:row[2]}]));

export function hasTranslation(text) {
  return !text || !/[\u3040-\u30ff\u3400-\u9fff]/.test(text) || messages.has(text);
}
export function translate(text,language='ja') {
  if(text===undefined||text===null)return text;
  return messages.get(text)?.[normalizeLanguage(language)] ?? text;
}
export function format(text,language,values={}) {
  return translate(text,language).replace(/\{(\w+)\}/g,(match,key)=>String(values[key]??match));
}
export function localizeTrial(trial,language='ja') {
  if(!trial)return null;
  const localized=structuredClone(trial), t=text=>translate(text,language);
  localized.title=t(localized.title);localized.body=t(localized.body);
  for(const field of localized.fields){
    field.label=t(field.label);
    if(field.nullLabel)field.nullLabel=t(field.nullLabel);
    if(field.options)for(const option of field.options)option.label=t(option.label);
  }
  if(localized.stimulus?.lines)for(const line of localized.stimulus.lines)line.text=t(line.text);
  return localized;
}
export function translateError(message,language='ja') {
  if(normalizeLanguage(language)==='ja'||messages.has(message))return translate(message,language);
  const range=message.match(/(?:^|：)(-?[\d.]+)〜(-?[\d.]+)の数値を入力してください。$/);
  if(range)return format('{min}〜{max}の数値を入力してください。',language,{min:range[1],max:range[2]});
  if(message.endsWith('を選択してください。'))return translate('この項目に回答してください。',language);
  if(message.endsWith('は整数で入力してください。'))return translate('整数を入力してください。',language);
  if(message.endsWith('の文字数を確認してください。'))return translate('文字数を確認してください。',language);
  return translate('送信できませんでした。もう一度お試しください。',language);
}
