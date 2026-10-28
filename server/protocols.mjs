import { readFileSync } from 'node:fs';
import { rng, choose, shuffle, posterior, marginal } from './engine.mjs';
import { restoredProtocol } from './restored.mjs';
import { expandedProtocol } from './expanded.mjs';
import { publicTrial } from '../public/present-trial.js';

export { publicTrial };

export const catalog = JSON.parse(readFileSync(new URL('../content/catalog.json', import.meta.url), 'utf8'));
export const studyById = id => [...catalog.studies,...(catalog.retiredStudies||[])].find(s => s.id === id);
const option = (value, label) => ({ value, label });
const choice = (id, label, options, extra = {}) => ({ id, type: 'choice', label, options: options.map(o => Array.isArray(o) ? option(...o) : option(o, o)), ...extra });
const number = (id, label, min = 0, max = 100, extra = {}) => ({ id, type: 'number', label, min, max, step: 1, ...extra });
const text = (id, label, extra = {}) => ({ id, type: 'text', label, minLength: 1, maxLength: 1200, ...extra });
const trial = (id, title, body, fields = [], extra = {}) => ({ id, title, body, fields, ...extra });
const familiar = () => trial('familiarity', '課題について', '最後に、これまでの経験を教えてください。', [
  choice('known', 'この問題やよく似た問題を以前に見たことがありますか。', [['no','ない'],['unsure','はっきり覚えていない'],['yes','ある']])
]);
const yesNo = [['yes','はい'],['no','いいえ']];
const shapes = ['三角','円','四角','星','月','波'];
const cards = shapes.map((label, i) => option('card-' + i, label));
const discussion = [
  { speaker: 'A', text: '空いている庭を、近所の人が休める場所にしたいですね。' },
  { speaker: 'B', text: 'いいですね。最初に小さなベンチを二つ置いてみませんか。' },
  { speaker: 'A', text: '日陰があれば夏にも使えそうです。木の近くはどうでしょう。' },
  { speaker: 'B', text: '通り道をふさがないように、少し奥がよさそうです。' },
  { speaker: 'A', text: '管理当番は月ごとに交代して、負担を分けたいです。' },
  { speaker: 'B', text: 'では、その案をまとめて、次の集まりで相談しましょう。' }
];
const teacherDescriptions = [
  '説明の順序が分かりやすく、複数の生徒の疑問に具体例で応えた。授業時間内に予定した内容を終えた。',
  '教材はよく準備されていたが、話す速度が速く、一部の生徒はノートを取るのに苦労した。',
  '導入は魅力的で、多くの生徒が発言した。難しい質問にはその場で答えず、次回までの課題とした。',
  '授業の目的を説明せず、話題が何度も変わった。終了時に生徒から内容を整理してほしいと言われた。',
  '説明は正確だったが、ほぼ教科書の読み上げだった。静かに聞く生徒が多く、質問は少なかった。',
  '生徒の理解を確かめながら説明を調整し、間違いを責めずに考え方を聞いた。予定より少し時間が延びた。',
  '板書の誤りに気づかず、質問に対して話題を変えた。授業の最後まで多くの生徒が戸惑っていた。'
];
const caseStages = [
  'ハルは22歳の大学生。初対面では口数が少ないが、知人とはよく話す。高校時代には音楽を聴くことと散歩が好きだった。',
  '大学では文章を書く課題を好み、休日には友人の催しを手伝う。細かな作業を始める前には、道具を順番に並べることがある。',
  '授業では質問をすることもあるが、大勢の前で意見を述べるのは避けがち。友人からは責任感があると言われる一方、待ち合わせに遅れたこともある。',
  '新しい場所を訪れる前には地図を確認する。ひとりで読書する時間も、仲間と活動する時間も大切にしている。難しい課題には、まず自分で取り組む。'
];
const caseQuestions = [
  ['arts','最終的な専攻は人文系だった。'],
  ['leader','大学の部活動で代表を務めた。'],
  ['english','記録された成績では、英語が数学より高かった。'],
  ['deadline','最後の学期の全課題を期限内に提出した。']
];
const riskItems = ['自転車での通勤','旅客機での旅行','喫煙','スキー','予防接種','外科手術','原子力発電','農薬の使用','医療用X線検査','自動車の運転'];

export function createProtocol(id, seed, presentation = {}) {
  const study = studyById(id);
  if (!study) throw new Error('Unknown study: ' + id);
  const restored=presentation.legacy?null:(expandedProtocol(id,seed)||restoredProtocol(id,seed));
  if(restored){
    restored.trials.push(familiar());
    return {studyId:id,version:study.version,seed,...restored,changes:study.changes.ja};
  }
  const random = rng(seed);
  const trials = [];
  const normative = {};
  let condition = 'standard';
  let explanation = '';
  switch (id) {
    case '01-01': {
      const anchor = choose([10,65], random);
      condition = 'anchor-' + anchor;
      trials.push(trial('comparison', '数字と割合', '1974年頃の国際連合加盟国のうち、アフリカ諸国の割合は、表示された数字より高いと思いますか、低いと思いますか。', [
        choice('comparison','表示された数字と比べてください。',[['higher','高い'],['lower','低い']])
      ], { stimulus: { kind:'wheel', value:anchor }, minViewMs:2200 }));
      trials.push(trial('estimate','割合の推定','同じ1974年頃について、あなたが考える割合を入力してください。',[number('estimate','国連加盟国に占めるアフリカ諸国の割合（%）')]));
      explanation = '最初に提示された数値が、その後の数量推定に影響するかを群間で比較する課題です。ルーレットは条件に応じて10または65で止まるように設定されていました。個人の回答だけで効果の有無は判定できません。';
      break;
    }
    case '01-02': {
      const games = {
        A:'袋A：赤と白が半分ずつ。1回引いて赤なら当たり。',
        B:'袋B：赤90%、白10%。戻してから引く操作を7回行い、7回すべて赤なら当たり。',
        C:'袋C：赤10%、白90%。戻してから引く操作を7回行い、1回以上赤なら当たり。'
      };
      const chances = { A:0.5, B:0.9 ** 7, C:1 - 0.9 ** 7 };
      for (const pair of shuffle([['A','B'],['A','C'],['B','C']], random)) {
        const key = 'pair-' + pair.join('');
        trials.push(trial(key,'二つのくじ','どちらも当たれば同額の仮想賞金です。引くたびに玉を袋へ戻し、各回は独立です。実際の支払いはありません。',[
          choice('game','当たりやすいと思うくじを一つ選んでください。',shuffle(pair,random).map(g=>[g,games[g]]))
        ]));
        normative[key] = { correct: chances[pair[0]] > chances[pair[1]] ? pair[0] : pair[1], probabilities:chances };
      }
      explanation = '客観的な当選確率はA=50%、B≈47.83%、C≈52.17%です。連続してすべて成功する確率と、少なくとも一度成功する確率の判断を比較します。';
      break;
    }
    case '03-01':
      trials.push(trial('hospital','二つの病院','ある町には二つの病院があります。大きい病院では1日に平均45人、小さい病院では平均15人の赤ちゃんが生まれます。男の子が生まれる確率はどちらも約50%です。1年間に「男の子がその日の出生数の60%を超えた日」が多いのはどちらでしょう。',[
        choice('hospital','一つ選んでください。',[['large','大きい病院'],['small','小さい病院'],['same','ほぼ同じ（差は5%以内）']])
      ]));
      normative.hospital={correct:'small'};
      explanation='標本が小さいほど割合は大きく変動しやすく、小さい病院で極端な割合の日が多くなります。事前に分布やシミュレーションを示さずに回答する設計です。';
      break;
    case '03-02':
      trials.push(trial('sequence','コインの並び','公平なコインを独立に6回投げます。Hは表、Tは裏です。ここに書かれた「この順番そのもの」が現れる確率を比べてください。',[
        choice('sequence','どちらの並びが起こりやすいと思いますか。',shuffle([['A','H T H T T H'],['B','H H H H T H']],random).concat([['equal','二つの確率は等しい']]))
      ]));
      normative.sequence={correct:'equal',probabilityEach:1/64};
      explanation='指定された6回の並びはどちらも1/64です。表と裏の数が同じ「どれかの並び」と、特定の一つの並びは別の事象です。この二列は本実装用の改編刺激です。';
      break;
    case '04-01': {
      const engineers=choose([30,70],random);
      const description=choose(['diagnostic','nondiagnostic','none'],random);
      condition='engineers-'+engineers+'-'+description;
      const profiles={
        diagnostic:'ジャックは45歳で、家族と暮らしています。物事を慎重に扱い、政治や社会問題にはあまり関心がありません。余暇には模型作り、数学の問題、木工を楽しんでいます。',
        nondiagnostic:'ディックは30歳です。仕事に意欲があり、職場で周囲から好意的に見られています。将来、仕事で成功したいと考えています。',
        none:'この人物について、追加の記述はありません。'
      };
      trials.push(trial('occupation','職業の推定','技師'+engineers+'人と弁護士'+(100-engineers)+'人、計100人から無作為に1人を選びました。\n\n'+profiles[description],[
        number('engineer','この人物が技師である確率（%）')
      ]));
      if(description==='none') normative.occupation={engineer:engineers};
      explanation='同じ記述に対して基準率だけを変えた群を比較します。記述なし、職業を区別しない記述、技師らしさを示す記述を別条件として保存しています。人物記述の診断性が未知のため、すべての条件に単一の正答確率を付けることはできません。';
      break;
    }
    case '04-07': {
      condition=choose(['current','future','both'],random);
      shuffle(teacherDescriptions.map((body,i)=>({body,index:i})),random).forEach(({body,index})=>{
        const fields=[];
        if(condition!=='future') fields.push(number('current','同じ段階の実習教師100人中で、この授業を何パーセンタイルに位置づけますか。'));
        if(condition!=='current') fields.push(number('future','5年後、同じ経験年数の教師100人中で、この人の総合的な能力は何パーセンタイルになると思いますか。'));
        trials.push(trial('teacher-'+index,'授業の記録 '+(index+1),body+'\n\n0は最下位、100は最上位を表します。',fields));
      });
      explanation='現在の授業評価と、5年後の予測の極端さを比較します。弱い情報から遠い将来を予測するときに、どの程度平均へ近づけるかが研究対象です。本版の7記述は新規作成で、実在する教師の将来成績はありません。';
      break;
    }
    case '06-01': {
      const fields=shuffle([
        number('bank','銀行の窓口係である。',1,3),
        number('feminist','女性の権利を擁護する活動に参加している。',1,3),
        number('conjunction','銀行の窓口係であり、女性の権利を擁護する活動にも参加している。',1,3)
      ],random);
      trials.push(trial('linda','人物と活動','リンダは31歳で独身。率直に話し、知的な印象を与えます。大学では哲学を学び、差別や社会的不平等に関心を持ち、学生時代に社会運動へ参加していました。\n\n三つの記述を、起こりそうな順に並べてください。1が最も可能性が高く、3が最も低い順位です。各順位は一度だけ使ってください。',fields,{rankFields:['bank','feminist','conjunction']}));
      explanation='二つの条件を同時に満たす事象の確率は、それぞれの構成事象の確率を上回りません。本版は3項目に絞った日本語順位課題で、原書の完全な目標リストを復元したものではありません。';
      break;
    }
    case '08-01': {
      condition=choose(['forward-first','reverse-first'],random);
      const cases=[
        ['eyes','架空の集団で、母親世代と成人した娘世代では青い眼の割合が同じだとします。','母親が青い眼のとき、娘も青い眼である確率','娘が青い眼のとき、母親も青い眼である確率'],
        ['height','架空の集団で、父親と成人した息子のうち身長が180cmを超える人の割合は同じだとします。','父親が180cm超のとき、息子も180cm超である確率','息子が180cm超のとき、父親も180cm超である確率']
      ];
      for(const [key,body,a,b] of shuffle(cases,random)){
        const options=[['forward',a],['reverse',b]];
        if(condition==='reverse-first')options.reverse();
        trials.push(trial(key,'二方向の推定',body,[
          choice('direction','どちらの確率が高いと思いますか。',options.concat([['equal','二つの確率は等しい']])),
          number('confidence','この判断への自信（%）')
        ]));
        normative[key]={correct:'equal'};
      }
      explanation='この版では周辺比率が等しいと明記しているので、対応する二方向の条件確率は等しくなります。因果の向きが想像しやすいことと、条件確率の大小は別です。この前提の明示は原課題への追加です。';
      break;
    }
    case '09-03': {
      condition=choose(['success','failure'],random);
      trials.push(trial('initial','最初の見通し','これから、記号の並びが二つの生成法のどちらで作られたかを直感で分類します。練習問題や正答規則の説明はありません。',[
        number('ability','似た分類課題に対する、現在の自分の得意さ（0〜100）')
      ]));
      const patterns=['● ▲ ● ▲ ■','■ ■ ▲ ● ■','▲ ● ▲ ● ▲','● ■ ■ ▲ ●','▲ ▲ ■ ● ■','■ ● ▲ ■ ●'];
      shuffle(patterns,random).forEach((pattern,i)=>trials.push(trial('pattern-'+i,'記号の分類',pattern,[
        choice('class','どちらの生成法だと思いますか。',[['A','生成法A'],['B','生成法B']])
      ],{stimulus:{kind:'symbols',text:pattern}})));
      trials.push(trial('feedback','課題の結果',condition==='success'?'評価結果：6問中5問で正しい分類でした。':'評価結果：6問中1問で正しい分類でした。',[
        number('ability','今、この種類の課題で自分はどのくらい得意だと思いますか。（0〜100）')
      ]));
      trials.push(trial('withdrawal','結果表示についての説明','先ほどの「5問正解」または「1問正解」は、あなたの回答を採点した結果ではありません。研究条件に応じて事前に設定された表示です。実際の能力や成績を示す情報ではないため、その評価を取り消します。',[],{minViewMs:3500}));
      trials.push(trial('reassessment','説明を読んだ後の評価','先ほどの結果表示が採点結果ではなかったことを踏まえて回答してください。',[
        number('ability','今、この種類の課題で自分はどのくらい得意だと思いますか。（0〜100）'),
        choice('understood','先ほどの成績表示は何に基づいていましたか。',[['answers','私の回答の採点'],['assigned','事前に設定された条件'],['unsure','分からない']])
      ]));
      explanation='この課題の成績表示は実際の採点ではなく、条件への割り当てによるものでした。表示を撤回した後にも評価が残るかを集団で比較します。表示はあなたの能力・知能を表していません。中立的な記号に置き換えた概念課題です。';
      break;
    }
    case '09-05': {
      condition=choose(['support-first','oppose-first'],random);
      trials.push(trial('pre','政策への考え','ある自治体が、市内のバスをすべての利用者に無料にする案を検討しています。',[
        number('attitude','この案への立場（−50＝強く反対、0＝中立、50＝強く賛成）',-50,50)
      ]));
      const reports={
        support:['報告A','無料化した12都市では、その後2年間で自動車交通量が平均8%減った。研究者は、無料化が渋滞の緩和に役立つと結論した。','調査は無料化した都市の前後を比較した。都市は無作為に選ばれておらず、同時期の道路工事や燃料価格の変化は完全には調整されていない。'],
        oppose:['報告B','無料化した12都市と、運賃を維持した12都市を比較したところ、自動車交通量に明確な差はなかった。研究者は、無料化の渋滞緩和効果は小さいと結論した。','人口規模が近い都市を比較したが、導入前の交通量やバスの運行頻度は完全には一致していなかった。']
      };
      const order=condition==='support-first'?['support','oppose']:['oppose','support'];
      for(const key of order){
        const [title,summary,method]=reports[key];
        trials.push(trial(key+'-summary',title+'：概要',summary,[number('quality','この結果をどの程度説得的だと感じますか。（0〜100）')]));
        trials.push(trial(key+'-method',title+'：調査方法',summary+'\n\n'+method,[number('quality','方法も踏まえた、この研究への信頼度（0〜100）'),number('change','この報告による立場の変化（−4＝反対方向、0＝変化なし、4＝賛成方向）',-4,4)]));
      }
      trials.push(trial('post','二つの報告を読んだ後', '現在の考えを回答してください。',[
        number('attitude','無料化への立場（−50＝強く反対、0＝中立、50＝強く賛成）',-50,50),
        number('reportedChange','読む前と比べた自覚的変化（−4＝反対方向、0＝変化なし、4＝賛成方向）',-4,4)
      ]));
      explanation='二つの研究報告とその数値は、この試作課題のために作成した架空の情報です。実際の政策効果を示しません。事前の立場と、賛否が異なる報告の評価の関係を調べます。自覚的な変化と、事前・事後の数値差は別々に分析します。';
      break;
    }
    case '09-07':
      trials.push(trial('decision','参加の選択','これは仮想場面です。大学の構内を「新しい学生食堂を利用してください」と書かれた広告板を身に着けて30分歩くよう依頼されました。報酬はなく、断ることもできます。実際に歩いていただくことはありません。',[
        choice('accept','もし依頼されたら、引き受けますか。',[['yes','引き受ける'],['no','引き受けない']])
      ]));
      trials.push(trial('consensus','他の人の選択','同じ立場の大学生100人に同じ依頼をしたとします。',[
        number('acceptRate','何%の人が引き受けると思いますか。')
      ]));
      explanation='自分が引き受けるかどうかによって、他者の承諾率の予測がどう違うかを比較します。多数派だと答えること自体が判定基準ではありません。原研究の実際の行動依頼を、仮想選択に変更しています。';
      break;
    case '11-03':
      trials.push(trial('english','英語の経験','以下では英語の単語について判断します。',[
        choice('experience','英語を読む頻度を教えてください。',[['rare','ほとんど読まない'],['monthly','月に数回'],['weekly','週に数回'],['daily','ほぼ毎日']])
      ]));
      for(const letter of shuffle(['K','L','N','R','V'],random)){
        trials.push(trial('letter-'+letter,'文字 '+letter+' の位置','3文字以上の英単語を考えてください。辞書や検索を使わず、直感で答えてください。',[
          choice('position',letter+'はどちらに多く現れると思いますか。',[['first','単語の最初'],['third','単語の3文字目']]),
          number('ratio','多いと思った位置の数は、少ない位置の何倍ですか。',1,100,{step:0.1})
        ]));
      }
      explanation='単語を思い出す容易さと、実際の文字位置頻度は一致するとは限りません。原研究が用いた英語資料では第三位置が多いとされました。本版は現代の辞書コーパスを実装していないため、個人の正答率を算出せず判断を保存します。';
      break;
    case '11-06': {
      condition=choose(['ascending','descending'],random);
      const factors=Array.from({length:8},(_,index)=>index+1);
      if(condition==='descending')factors.reverse();
      trials.push(trial('ready','積の推定','次の画面に式が表示されます。5秒以内に、およその答えを入力してください。電卓や筆算は使わないでください。',[],{startTimedTask:true}));
      trials.push(trial('product','積の推定','',[
        number('estimate','およその答え',0,Number.MAX_SAFE_INTEGER,{allowTimeout:true,hideRange:true})
      ],{stimulus:{kind:'multiplication',factors},responseWindowMs:5000}));
      normative.product={correct:40320};
      explanation='各参加者は昇順または降順の一方だけを見て、5秒以内に積を推定します。二つの式の大小を同じ人に比較させる課題ではありません。画面入力への変更と、中断・未回答を区別して分析してください。';
      break;
    }
    case '12-01':
      trials.push(trial('context','共同活動について','同居する二人が相談せず、それぞれ独立に回答してください。対象は直近7日間に、あなたと相手の二人で行った活動です。',[
        choice('cohabit','現在、このペアの相手と実際に同居していますか。',yesNo),
        text('recall','この7日間に自分が行った活動を短く思い出して書いてください。名前などの個人情報は書かないでください。',{maxLength:800})
      ]));
      trials.push(trial('shares','自分の寄与','二人の寄与の合計を100%としたとき、自分の割合を回答してください。行っていない活動や、二人以外の寄与が大きい活動は「対象外」を選んでください。',[
        ...['食事の準備','食器の片づけ','掃除','洗濯','買い物','予定や手続きの管理'].map((label,i)=>number('share-'+i,label+'：自分の寄与（%）',0,100,{allowNA:true,nullLabel:'対象外'}))
      ]));
      explanation='二人が独立に答えた自分の寄与を、同じ活動について合計して比較します。100%を超えても、個人の虚偽や能力を意味するとは限りません。活動名と7日間の期間は本版の新規設定です。相手の回答は参加画面には表示しません。';
      break;
    case '13-01':
      condition=choose(['A-salient','B-salient'],random);
      trials.push(trial('conversation','二人の会話','短い会話を最後まで観察してください。音声はありません。表示される二人の発言を読んでください。',[],{stimulus:{kind:'conversation',focus:condition[0],lines:discussion},minViewMs:24000}));
      trials.push(trial('influence','会話についての判断','先ほどの会話について回答してください。',[
        number('influenceA','最終的な案に対するAの影響（0＝全くない、100＝非常に大きい）'),
        number('influenceB','最終的な案に対するBの影響（0＝全くない、100＝非常に大きい）'),
        choice('salient','画面上でより目立って見えた人物はどちらですか。',[['A','A'],['B','B'],['equal','同じくらい']])
      ]));
      explanation='同じ会話で人物の視覚的な顕著性を変え、因果的影響の評価を比較します。実写の座席・視点操作を、人物サイズが異なるSVGアニメーションへ変更した概念課題です。';
      break;
    case '14-01': {
      condition=choose(['routine','exception'],random);
      const story=[
        'ユウは奨学金の面接を午前10時に予約していた。',
        '朝、準備を終えて、余裕のある時刻に家を出た。',
        condition==='routine'?'会場へは、いつも使っている道を選んだ。':'会場へは、気分を変えようと、普段は使わない道を選んだ。',
        '途中で工事による通行止めに出会い、迂回した。',
        '交差点で長い赤信号を待った。',
        '会場の建物を見つけたが、入口が反対側にあった。',
        '受付には10時2分に到着し、面接を受けられなかった。'
      ];
      trials.push(trial('rewrite','出来事を書き換える',story.map((s,i)=>(i+1)+'. '+s).join('\n')+'\n\n結末を避けるために、一か所だけ出来事を書き換えるとしたら、どうしますか。選択肢ではなく、あなた自身の言葉で書いてください。',[
        text('rewrite','変更する出来事と、その変更内容',{minLength:5,maxLength:1200})
      ]));
      trials.push(trial('coding','変更した箇所','先ほどの自由記述を変更せず、対応する出来事の番号を教えてください。',[
        number('event','主に変更した出来事の番号',1,7),
        text('reason','その箇所を選んだ理由',{maxLength:600})
      ]));
      explanation='通常の行動と例外的な行動のどちらが、反実仮想として変更されやすいかを比較します。面接の物語は新規作成です。自由記述は自動で意味判定せず、後から人手で符号化できる形で保存します。';
      break;
    }
    case '16-02':
      condition=choose(['choice','assigned'],random);
      if(condition==='choice') trials.push(trial('ticket','カードを一枚選ぶ','仮想の抽選券を100円で購入したと想像してください。各カードの当選確率は同じです。当選すれば仮想賞金10,000円です。実際の支払い・賞金はありません。',[
        choice('ticket','好きなカードを一枚選んでください。',cards.map(c=>[c.value,c.label]),{style:'cards'})
      ]));
      else {
        const assigned=choose(cards,random).value;
        trials.push(trial('ticket','割り当てられたカード','仮想の抽選券を100円で購入したと想像してください。各カードの当選確率は同じです。当選すれば仮想賞金10,000円です。実際の支払い・賞金はありません。以下のカードが割り当てられました。',[],{stimulus:{kind:'ticket',card:assigned},minViewMs:1200}));
      }
      trials.push(trial('price','交換の申し出','抽選の前に、別の人があなたのカードを買いたいと言っています。',[
        choice('sell','売ることを考えますか。',[['yes','金額によっては売る'],['no','売らない']]),
        number('price','売ってもよい最も低い金額（仮想・円）',0,100000,{when:{id:'sell',equals:'yes'}})
      ],{stimulus:{kind:'owned-ticket'}}));
      explanation='選択したか、割り当てられたかで、転売の希望価格が変わるかを比較します。本版には実際の所有権や賞金がなく、原実地実験の直接再現ではありません。「売らない」は価格0と区別して保存します。';
      break;
    case '17-01': {
      const exposures=[];
      for(const feature of ['eyes','head','ordinary'])for(const label of ['attention','ability'])for(let n=0;n<4;n++)exposures.push({feature,label});
      shuffle(exposures,random).forEach((item,i)=>trials.push(trial('drawing-'+i,'図と記述 '+(i+1)+' / 24','図と、それに添えられた記述を覚えてください。これは架空の教材であり、人物の診断をするものではありません。',[],{stimulus:{kind:'drawing',...item},minViewMs:1600})));
      trials.push(trial('association','組み合わせの記憶','それぞれの絵は8回ずつ提示されました。「周囲の視線が気になる」という記述が付いていたのは、それぞれ何回だったと思いますか。',[
        number('eyes','目を大きく描いた絵',0,8),number('head','頭を大きく描いた絵',0,8),number('ordinary','通常の比率の絵',0,8)
      ]));
      normative.association={eyes:4,head:4,ordinary:4};
      explanation='各特徴には二つの記述が4回ずつ付いており、真の関連はありませんでした。意味的な連想が共現の記憶へ影響するかを調べます。絵も記述も新規作成で、臨床診断には使用できません。';
      break;
    }
    case '20-01':
      for(let i=0;i<4;i++){
        const fields=caseQuestions.flatMap(([key,label])=>[
          choice(key,label,yesNo),
          number(key+'Confidence','その回答が当たっている確率（50〜100%）',50,100)
        ]);
        trials.push(trial('case-'+i,'人物情報：第'+(i+1)+'段階',caseStages.slice(0,i+1).join('\n\n')+'\n\n後で確認された記録について予測してください。各段階で同じ四つの問いに答えます。',fields));
        normative['case-'+i]={arts:'yes',leader:'no',english:'yes',deadline:'no'};
      }
      explanation='情報が増えるにつれて、判断の正確さと自信が同じように変わるかを測ります。学生の人物像と基準回答は本版のために作成した架空の記録です。能力や臨床判断力の検査ではなく、原症例の再現でもありません。';
      break;
    case '23-01': {
      const outcomes=[
        ['british','イギリス側が勝利した。'],
        ['gurkha','グルカ側が勝利した。'],
        ['peace','決着がつかないまま和平が成立した。'],
        ['stalemate','決着も和平も得られなかった。']
      ];
      condition=choose(['foresight',...outcomes.map(o=>o[0])],random);
      let body='1814年、イギリスとネパールのグルカ勢力の間で戦争が始まりました。イギリス軍は兵力と装備で優位でしたが、山岳地帯の地形や補給に困難を抱えていました。グルカ側は土地をよく知り、防御に適した場所を利用できました。';
      if(condition!=='foresight')body+='\n\nこの資料では、結末は「'+outcomes.find(o=>o[0]===condition)[1]+'」とされています。';
      body+='\n\n開戦当時に得られた情報だけで判断すると、各結末はどのくらい起こりそうだったでしょう。合計を100%にしてください。';
      trials.push(trial('history','過去の出来事の予測',body,outcomes.map(o=>number(o[0],o[1])),{sumFields:outcomes.map(o=>o[0])}));
      explanation='結末を告げられた群が、その結末を当初から起こりやすかったと評価するかを比較します。結末情報は実験条件として割り当てられ、一部は実際の歴史と異なります。戦争はイギリス側に有利なスガウリ条約で終結しました。これは短く要約した日本語版で、事前の歴史知識も分析に必要です。';
      break;
    }
    case '25-01': {
      condition=choose(['red-first','blue-first'],random);
      let sequence=['red','red','blue','red','blue','red','red','blue','red','red'];
      if(condition==='blue-first')sequence=sequence.map(x=>x==='red'?'blue':'red');
      let red=0,blue=0;
      trials.push(trial('prior','二つの袋','袋Aには赤70%・青30%、袋Bには赤30%・青70%のチップが入っています。袋はA/B同じ確率で選ばれます。各回はチップを元の袋へ戻す復元抽出です。これから示す標本に基づいて、袋Aだった確率を更新してください。',[],{minViewMs:1200}));
      sequence.forEach((color,i)=>{
        if(color==='red')red++;else blue++;
        trials.push(trial('draw-'+i,'標本 '+(i+1),'今回のチップを見て、これまでの情報から判断してください。袋A：赤70%・青30%、袋B：赤30%・青70%。',[
          number('posterior','選ばれたのが袋Aである確率（%）')
        ],{stimulus:{kind:'chip',color}}));
        normative['draw-'+i]={posterior:posterior(0.5,0.7,0.3,red,blue)*100,red,blue};
      });
      explanation='各観測に応じたベイズ事後確率と、回答の更新幅を比較します。提示列は条件ごとに固定した鏡像の標本列です。累積計数や規範値を課題の途中に表示しない設計です。';
      break;
    }
    case '26-01': {
      condition=choose(['secondary-high','secondary-low'],random);
      const weights=condition==='secondary-high'?[0.6,0.3,0.1]:[0.6,0.1,0.3];
      [[0.7,0.9,0.1],[0.4,0.8,0.2],[0.8,0.2,0.7]].forEach((rates,i)=>{
        trials.push(trial('matrix-'+i,'中間情報からの推定','部品は三つの工場のいずれかで作られています。以下の情報から、無作為に選んだ部品が検査に合格する確率を推定してください。',[
          number('probability','この部品が合格する確率（%）')
        ],{stimulus:{kind:'matrix',weights,rates}}));
        normative['matrix-'+i]={probability:marginal(weights,rates)*100,bestGuess:rates[0]*100};
      });
      explanation='最も可能性の高い工場Aだけを使う推論と、すべての工場の可能性を重み付けする推論を比較します。規範値は各工場の確率×その工場の合格率を合計したものです。行列は本版用の新規刺激です。';
      break;
    }
    case '33-03':
      trials.push(trial('background','知識の背景','リスクに関係する知識の背景を、差し支えない範囲で選んでください。氏名や勤務先は入力しないでください。',[
        choice('background','最も近いものを一つ選んでください。',[['general','特定の専門背景なし'],['health','医療・保健の専門背景'],['engineering','工学・安全の専門背景'],['other','その他の専門背景'],['decline','回答しない']])
      ]));
      shuffle(riskItems.map((label,i)=>({label,i})),random).forEach(({label,i})=>{
        trials.push(trial('risk-'+i,label,'この活動や技術に対する、あなた自身の印象を回答してください。事実についての正誤テストではありません。',[
          number('risk','社会全体に対するリスク（0＝非常に小さい、100＝非常に大きい）'),
          number('benefit','社会全体への便益（0＝非常に小さい、100＝非常に大きい）'),
          number('dread','恐ろしさ（1＝全く恐ろしくない、7＝非常に恐ろしい）',1,7),
          number('familiarity','自分の熟知度（1＝ほぼ知らない、7＝よく知っている）',1,7),
          number('control','本人による制御（1＝ほぼ制御できない、7＝十分制御できる）',1,7),
          number('science','科学的な理解（1＝ほぼ未知、7＝よく分かっている）',1,7),
          number('voluntary','リスクを負うことの自発性（1＝不本意、7＝自分で選べる）',1,7),
          number('immediacy','影響の速さ（1＝ずっと後に現れる、7＝すぐ現れる）',1,7)
        ]));
      });
      explanation='リスク評価を死亡数だけで説明せず、恐ろしさや熟知度などの多面的な特徴と比較する課題です。新しい日本語項目・尺度の試作なので、原研究と同じ因子構造が得られるとは限りません。十分な人数のデータが必要です。';
      break;
    default: throw new Error('Missing protocol: ' + id);
  }
  if(id==='01-01'||id==='23-01')trials.push(trial('historical-knowledge','事前の知識','この課題を始める前の知識について回答してください。',[
    choice('knowledge','この歴史的な話題について、もともとどの程度知っていましたか。',[['none','ほとんど知らなかった'],['some','少し知っていた'],['well','詳しく知っていた']])
  ]));
  trials.push(familiar());
  return { studyId:id, version:study.version, seed, condition, trials, normative, explanation, changes:study.changes.ja };
}

export function analyze(protocol, responses) {
  const result={};
  for(const response of responses){
    const ref=protocol.normative[response.trialId];
    if(ref){
      const entry={reference:ref};
      if(typeof ref.correct==='string'){
        const key=protocol.trials.find(t=>t.id===response.trialId)?.fields.find(f=>f.type==='choice')?.id;
        entry.correct=response.answer[key]===ref.correct;
      }
      if(ref.posterior!==undefined)entry.deviation=response.answer.posterior-ref.posterior;
      if(ref.probability!==undefined&&response.answer.probability!==undefined)entry.deviation=response.answer.probability-ref.probability;
      result[response.trialId]=entry;
    }
  }
  const byId=Object.fromEntries(responses.map(r=>[r.trialId,r.answer]));
  if(protocol.studyId==='04-01'&&protocol.design?.target){
    result.profileProbabilities=Object.fromEntries(['jack','dick','null'].filter(id=>byId[id]).map(id=>[id,{
      target:protocol.design.target,reportedProbability:byId[id].probability,
      engineerProbability:protocol.design.target==='engineer'?byId[id].probability:100-byId[id].probability
    }]));
  }
  if(protocol.studyId==='09-07'&&byId.consensus){
    const self=byId['traits-self'];
    result.consensus={sign:protocol.condition,agreePercent:byId.consensus.agreePercent,refusePercent:byId.consensus.refusePercent,ownDecision:self?.decision||null};
    result.traitExtremity=Object.fromEntries(['self','accepter','refuser'].filter(target=>byId['traits-'+target]).map(target=>{
      const scores=protocol.design.traits.map(key=>byId['traits-'+target][key]);
      return [target,{absoluteDistanceSum:scores.reduce((s,n)=>s+Math.abs(n),0),absoluteDistanceMean:scores.reduce((s,n)=>s+Math.abs(n),0)/scores.length}];
    }));
  }
  if(protocol.studyId==='26-01'&&protocol.design?.ratioDirection){
    const serial=value=>Number.isFinite(value)?value:value===Infinity?'Infinity':'-Infinity';
    for(const response of responses.filter(r=>r.trialId.startsWith('odds-'))){
      const {bagIWeight:a,bagIIWeight:b}=response.answer,reference=protocol.normative[response.trialId].oddsIoverII;
      result[response.trialId]={rawRatio:[a,b],oddsIoverII:serial(a/b),logOddsIoverII:serial(Math.log(a)-Math.log(b)),referenceOddsIoverII:reference,logOddsDeviation:serial(Math.log(a)-Math.log(b)-Math.log(reference))};
    }
  }
  if(protocol.studyId==='33-03'&&protocol.design?.itemOrder){
    result.group=protocol.condition;result.ranks=byId['risk-ranking']||null;result.ratioRatings=byId['risk-ratios']||null;
    result.acceptability=Object.fromEntries(protocol.design.itemOrder.filter(id=>byId['acceptability-'+id]).map(id=>{
      const answer=byId['acceptability-'+id],factor=answer.acceptability==='higherAcceptable'?1/answer.higherMultiplier:answer.acceptability==='lowerNeeded'?answer.lowerMultiplier:1;
      return [id,{...answer,riskAdjustmentFactor:Number.isFinite(factor)?factor:'Infinity'}];
    }));
    result.dimensions=Object.fromEntries(protocol.design.dimensions.filter(id=>byId['dimension-'+id]).map(id=>[id,byId['dimension-'+id]]));
  }
  if(protocol.studyId==='11-06'&&byId.product){
    const response=responses.find(r=>r.trialId==='product');
    result.product={reference:40320,estimate:byId.product.estimate,condition:protocol.condition,
      responded:byId.product.estimate!==null,endReason:response.metrics.timed?.endReason||null};
  }
  if(byId.linda)result.conjunction={violation:byId.linda.conjunction<byId.linda.bank || byId.linda.conjunction<byId.linda.feminist};
  if(protocol.studyId==='20-01'){
    for(let i=0;i<4;i++){
      const answer=byId['case-'+i];
      if(answer)result['case-'+i]={
        accuracy:caseQuestions.filter(([key])=>answer[key]===protocol.normative['case-'+i][key]).length/4*100,
        meanConfidence:caseQuestions.reduce((sum,[key])=>sum+answer[key+'Confidence'],0)/4
      };
    }
  }
  if(byId.pre&&byId.post)result.attitude={pre:byId.pre.attitude,post:byId.post.attitude,difference:byId.post.attitude-byId.pre.attitude,selfReported:byId.post.reportedChange,neutralPre:byId.pre.attitude===0};
  if(protocol.studyId==='09-03')result.ability={before:byId.initial?.ability,afterFeedback:byId.feedback?.ability,afterWithdrawal:byId.reassessment?.ability,understood:byId.reassessment?.understood};
  return result;
}
