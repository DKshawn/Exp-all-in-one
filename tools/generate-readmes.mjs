import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const texts={
ja:{
 title:'判断ラボ — Exp-all-in-one',
 intro:'『Judgment under Uncertainty: Heuristics and Biases』（Kahneman, Slovic & Tversky 編、1982）をもとにした、教員が開始を制御する授業用アプリです。日本語・中文・Englishを選択でき、初回は日本語です。Node.jsとSQLiteでローカル動作し、Vercel・Neonは使いません。',
 scope:'21件を原典と照合し、14件を実施できます。掲載資料の部分版・同章の会話先行研究・方法再構成は範囲を明示しています。残る7件は核心刺激または現場条件が不足しています。以前保留した14件の回収結果と必要資料は[復元状況](docs/restoration-status.md)に記載。英語の文字頻度課題は除外し、アンカリングの代表は五秒乗算推定です。',
 start:'起動',flowTitle:'授業での使い方',
 requirement:'Node.js 24.15.0以降。外部npm依存はありません。リポジトリのフォルダで実行します。',
 flow:[
 '学生は http://127.0.0.1:3000/ で7桁の学生証番号を入力して待機します。先頭の0は保持します。',
 '教員は http://127.0.0.1:3000/admin で実験ブロックを選び、実験順と選択肢位置のランダム化をそれぞれ設定して「開始する」を押します。',
 '選んだ課題は「プレビュー」で画面サイズを切り替えて確認できます。回答せずに前後へ移動でき、結果は保存されません。制限時間のある画面は確認できるよう停止し、順位を飛ばした場合の比率画面には仮の基準が表示されます。',
 '待機中の学生は約1秒以内に開始し、選択された課題を連続して回答します。途中参加者も同じ実施に入ります。終了後は待機へ戻れます。教員は現在の実施を終了して次の実施を開始します。',
 '順序ランダム化は学生ごとに行います。無効時は章順です。選択肢のランダム化は選択ボタンだけに適用し、順位の数値尺度、乗算の昇降条件、課題内の段階順は変えません。原研究内の条件割付は別に維持します。',
 '割付・順序・保存済み回答は再読込しても変わりません。言語切替は回答中の入力を保持します。通常の未送信入力は再読込で失われます。送信結果が不明の場合は同じ送信IDで再試行します。',
 '学生画面は問題と必要な操作だけを表示します。共通の既往経験質問・追加の自信評定・技術説明はありません。教員画面からCSV／JSONを書き出せます。'
 ],
 available:'実施できる課題',held:'未復元の課題',heads:['ID','課題','原設計（簡潔）','画面化などの変更','原典'],heldHeads:['ID','課題','原設計（簡潔）','未復元の理由','原典'],
 methodTitle:'原設計との対応',
 method:[
 '身長題は「父から子／子から父の身長を予測する自信」の三択です。眼色の条件付き可能性とは別の測定です。180cm、等しい周辺比率、追加の0～100評定はありません。',
 '八対象のLinda順位、六児家庭の頻数推定、Jonesの経路／時刻版を復元しました。二袋は第25章の例題で、0～1の確率を一回回答します。章内の0.5の手掛かりも維持し、研究全体の再現とは呼びません。',
 '11-06は開始準備後に一方の式だけを5秒提示し、期限時点の有効入力を確定します。未入力・不正入力はnull、中断・再読込・タブ非表示もnullとして記録し、同じ式を再提示しません。黒板から画面とキーボードへの変更です。',
 '翻訳、画面入力、連続実施、教師による順序設定は原研究からの変更です。翻訳の逆翻訳・言語間等価性や心理効果の再現は検証していません。各課題は特定の版を選んだもので、章内の全条件・全研究を含みません。',
 '詳細は[設計監査](docs/design-audit.md)、[前半](docs/audit-early.md)、[中盤](docs/audit-middle.md)、[後半](docs/audit-late.md)を参照。参照PDFのページは598ページの重排版における1始まりのページ番号で、原紙書のページとは異なります。'
 ],
 dataTitle:'保存と検証',
 data:[
 'data/local.sqliteに学生証番号、教員の設定、実施ID、乱数の種、学生ごとの順序、各課題のプロトコル・版・回答・時刻を保存します。同じ番号でも次の実施は別記録です。ログインは番号による識別で、本人認証ではありません。',
 'JSON schemaVersion=5はlessons、runs、sessionsと完全な提示・翻訳スナップショットを含みます。CSVは1回答項目1行で、実施ID、教員設定、実験順、選択肢順、言語、提示ハッシュ、計時記録を含みます。自由記述の符号化は研究者が行います。',
 '旧版の回答・手続きは保持し、新版のteacher-1記録と分けます。過去の誤った刺激を新しい刺激として書き換えません。未提示の割当課題は回答0件のままJSONに含まれます。',
 '動作確認には別のDATA_DIRを指定します。data/、環境ファイル、ログはGit対象外です。停止後にdata全体をコピーしてバックアップできます。.envは自動読込しません。必要ならnode --env-file=.env server/index.mjsを使います。PORTの既定値は3000です。',
 'サーバーは127.0.0.1限定です。現段階の動作確認は同じPCの学生・教員ページで行います。別の学生PCからの接続、教員認証、募集・謝礼・公開配信は未実装です。',
 'npm testで原題の尺度・入力制約、三言語、教員開始／終了、待機・再開、再送、順序保持、書き出し、旧記録保持を検証します。npm run checkは構文・メタデータ・READMEの一致を確認します。テスト用データは実際の回答とは分離します。'
 ],
 structureTitle:'主なファイル',structure:[
 ['content/catalog.json','21件の原設計、文献、監査状態と実施可否'],
 ['server/restored.mjs / public/revised-messages.js','復元した課題と三言語の題面'],
 ['server/classroom.mjs','教員の設定、学生待機、固定された割付'],
 ['server/store.mjs / server/runs.mjs','SQLite、回答の保存と書き出し、旧手続きの互換性'],
 ['public/app.js / public/admin.js','学生画面・教員画面'],
 ['tests/classroom.test.mjs','教員制御と復元内容の回帰テスト']
 ],sourceTitle:'原典',sourceNote:'利用者提供の原書PDFと原論文を照合しました。PDFそのものは配布物に含めません。原題は当該版に限定して復元しています。',sheet:'選定元のGoogle表格'
},
zh:{
 title:'判断实验室 — Exp-all-in-one',
 intro:'基于《Judgment under Uncertainty: Heuristics and Biases》（Kahneman、Slovic、Tversky 主编，1982）的课堂实验应用，由教师控制开始。支持日语、简体中文、英语，首次默认为日语。使用Node.js与本地SQLite，不使用Vercel或Neon。',
 scope:'已逐项核查21项，目前可实施14项，明确区分已刊材料子集、同章谈话先导研究和原方法重建。其余7项缺少核心刺激或现场条件。先前暂缓的14项逐项恢复结果、缺少材料及条件见[恢复清单](docs/restoration-status.md)。这不是全书全部实验的复刻。已去除英语字母频率题，锚定类保留五秒乘积估计。',
 start:'本地运行',flowTitle:'课堂流程',requirement:'需要Node.js 24.15.0或以上，无第三方npm依赖。在仓库目录运行：',
 flow:[
 '学生打开 http://127.0.0.1:3000/ ，输入7位学生证号后等待。保留前导0。',
 '教师打开 http://127.0.0.1:3000/admin ，按实验block选择任务，分别设置实验顺序和选择题按钮位置是否随机，点击开始。',
 '选择任务后可点击“预览”，切换屏幕尺寸并在题目间前后移动或跳过。预览结果不会保存；限时页面会停留，跳过排序后显示的比例基准为示例。',
 '等待中的学生约1秒内进入实验，连续完成所选任务。迟到登录者也进入当前实施。完成后可回到等待页。教师结束当前实施后可以开始下一次。',
 '实验顺序按学生独立随机；关闭时按章节顺序。选项随机只改变选择按钮位置，不打乱排名量尺的数值顺序、乘法升降序条件或任务内部阶段。原研究的组内条件分配单独保留。',
 '刷新不改变分组、顺序和已存回答。切换语言保留当前输入；普通未提交输入刷新会丢失。结果未确认的提交使用同一提交ID重试。',
 '学生界面只呈现题目和必要操作。没有统一接触经历题、额外信心评分或技术说明。教师可导出CSV／JSON。'
 ],available:'可实施的任务',held:'尚未恢复的任务',heads:['ID','实验','原设计（简短）','屏幕化等改动','出处'],heldHeads:['ID','实验','原设计（简短）','尚未恢复的原因','出处'],
 methodTitle:'与原设计的对应',method:[
 '身高题恢复为“由父预测子／由子预测父身高的信心”三选一，与眼色条件概率题区分。删除180厘米、相同边际比例和额外0–100评分。',
 '已恢复Linda八目标排序、六孩家庭数量估计、Jones车祸路线／时间版本。两袋任务是第25章例题，只填写一次0–1概率，保留原文0.5提示；不称为整套原研究复现。',
 '11-06准备后只呈现一种算式5秒，截止时保存此前的有效输入；空白或无效输入记null。中断、刷新、隐藏页面也记null，不再次呈现算式。黑板改为屏幕与键盘输入。',
 '翻译、屏幕作答、连续实验、教师随机设置均是相对原研究的改变。尚未检验三语回译、跨语言等价性或心理效应复现。每项只选择明确版本，不包括该章全部条件与研究。',
 '详见[设计核查](docs/design-audit.md)、[前段](docs/audit-early.md)、[中段](docs/audit-middle.md)、[后段](docs/audit-late.md)。用户PDF页码指598页重排版的文件页面序号，从1计数，不是纸书印刷页码。'
 ],dataTitle:'数据与验证',data:[
 'data/local.sqlite保存学生证号、教师设置、实施ID、随机种子、学生题序、各题协议与版本、回答和计时。同一学生证号参加下一次实施会另存记录。学生证号登录用于身份标记，不校验本人身份。',
 'JSON schemaVersion=5含lessons、runs、sessions及完整题面与翻译快照。CSV每个回答字段一行，包含实施ID、教师设置、实验顺序、选项顺序、语言、题面摘要和计时。自由文本由研究者编码。',
 '保留旧版回答与协议，新版以teacher-1区分，不把历史错误刺激改写成新刺激。已分配但未呈现的任务仍出现在JSON中，回答数为0。',
 '测试请另设DATA_DIR。data/、环境文件、日志不进入Git。停服后复制整个data可备份。.env不会自动加载，需要时使用node --env-file=.env server/index.mjs。PORT默认3000。',
 '服务器目前只绑定127.0.0.1，可在同一PC打开教师和学生页验证。尚未开放其他学生电脑接入、教师身份认证、招募、报酬或公开部署。',
 'npm test验证原题量尺、输入约束、三语、教师启停、等待续做、提交重试、随机顺序保持、导出及旧记录保留。npm run check检查语法、元数据与README同步。测试数据与真实回答分离。'
 ],structureTitle:'主要文件',structure:[
 ['content/catalog.json','21项的原设计、出处、核查与开放状态'],
 ['server/restored.mjs / public/revised-messages.js','已恢复题型与三语题面'],
 ['server/classroom.mjs','教师设置、学生等待、持久化随机分配'],
 ['server/store.mjs / server/runs.mjs','SQLite、回答保存导出及旧流程兼容'],
 ['public/app.js / public/admin.js','学生与教师界面'],
 ['tests/classroom.test.mjs','教师控制与复原内容回归测试']
 ],sourceTitle:'原始出处',sourceNote:'使用用户提供的原书PDF和原始论文核对；不将PDF本身加入仓库。恢复范围限于明确选定的题型版本。',sheet:'选材Google表格'
},
en:{
 title:'Judgment Lab — Exp-all-in-one',
 intro:'A teacher-controlled classroom application based on Judgment under Uncertainty: Heuristics and Biases (Kahneman, Slovic & Tversky, eds., 1982). Japanese, Chinese and English are selectable; Japanese is the initial default. Runs locally with Node.js and SQLite, without Vercel or Neon.',
 scope:'All 21 catalog tasks were audited; 14 are available. Published subsets, the conversation pilot and method reconstructions are labeled explicitly. Seven need core stimuli or field conditions. The [restoration inventory](docs/restoration-status.md) accounts for all 14 previously held tasks. This is not a reproduction of every book experiment. English letter frequency is excluded; five-second multiplication represents anchoring.',
 start:'Run locally',flowTitle:'Classroom flow',requirement:'Requires Node.js 24.15.0 or later. No third-party npm dependencies. Run from the repository:',
 flow:[
 'Students open http://127.0.0.1:3000/ , enter a seven-digit student ID, and wait. Leading zeros are preserved.',
 'The teacher opens http://127.0.0.1:3000/admin , selects experiment blocks, independently enables experiment-order and answer-position randomization, and presses Start.',
 'After selecting tasks, use Preview to change screen sizes and move between or skip questions. Preview results are not saved; timed screens remain visible, and a skipped ranking uses an example reference for the ratio screen.',
 'Waiting students begin within roughly one second and complete the selected tasks consecutively. Late arrivals enter the active lesson. Students can return to waiting after finishing. The teacher ends the active lesson before starting another.',
 'Experiment order is randomized independently per student, or follows chapter order when disabled. Answer randomization affects choice buttons, not ordered numerical scales, multiplication conditions or within-task stages. Original condition assignment is separate.',
 'Reloads preserve assignments, order and saved answers. Language switching preserves current inputs; ordinary unsent inputs are lost on reload. Unconfirmed submissions retry with the same submission ID.',
 'Student pages show questions and necessary controls only. There is no common prior-experience question, additional confidence scale or technical explanation. Teachers can export CSV or JSON.'
 ],available:'Available tasks',held:'Tasks not yet restored',heads:['ID','Task','Original design, briefly','Changes for this implementation','Source'],heldHeads:['ID','Task','Original design, briefly','Restoration gap','Source'],
 methodTitle:'Relationship to source designs',method:[
 'Height compares confidence in predicting father from son versus son from father, with three choices. It is distinct from the eye-color conditional-likelihood question. There is no 180 cm threshold, equal-marginal premise or extra 0–100 rating.',
 'Restored tasks include the eight-target Linda ranking, six-child family-count estimate, and Jones route/time accident versions. The two-bag task is a chapter 25 example with one 0–1 probability judgment, retaining the original 0.5 cues; it is not the full research program.',
 '11-06 shows one expression for five seconds after readiness. The deadline captures the last valid input; blank or invalid input is null. Interruption, reload and hiding the page also produce null, without repeating the expression. Screen and keyboard replace a blackboard.',
 'Translation, screen responses, consecutive administration and teacher-selected ordering are changes from the source studies. Back-translation, cross-language equivalence and psychological effects have not been validated. Each task uses one specified version, not all conditions or studies in its chapter.',
 'See the [design audit](docs/design-audit.md) and [early](docs/audit-early.md), [middle](docs/audit-middle.md), [late](docs/audit-late.md) reports. PDF references count file pages from 1 in the supplied 598-page reflowed edition; they differ from printed book pagination.'
 ],dataTitle:'Data and verification',data:[
 'data/local.sqlite stores student IDs, teacher settings, lesson IDs, seeds, individual task orders, versioned protocols, responses and timing. Another lesson creates separate records for the same student ID. ID entry identifies a record; it does not authenticate the person.',
 'JSON schemaVersion=5 includes lessons, runs, sessions and full stimulus/translation snapshots. CSV has one row per response field, including lesson ID, teacher settings, experiment order, choice order, language, presentation hash and timing. Researchers code free text manually.',
 'Historical responses and protocols remain intact and distinct from new teacher-1 records. Old stimuli are not rewritten as corrected stimuli. Assigned but unseen tasks appear in JSON with zero responses.',
 'Use a separate DATA_DIR for testing. data/, environment files and logs are ignored by Git. Stop the server and copy data to back it up. .env is not automatically loaded; use node --env-file=.env server/index.mjs if needed. PORT defaults to 3000.',
 'The server binds only to 127.0.0.1. Teacher and student flows can currently be checked on the same PC. Access from other student computers, teacher authentication, recruitment, payments and public deployment are not implemented.',
 'npm test covers source scales, input constraints, translations, teacher start/end, waiting/resume, retries, saved random orders, exports and legacy records. npm run check checks syntax, metadata and generated READMEs. Test data is separate from participant records.'
 ],structureTitle:'Key files',structure:[
 ['content/catalog.json','All 21 designs, sources, audit and availability'],
 ['server/restored.mjs / public/revised-messages.js','Restored protocols and trilingual stimuli'],
 ['server/classroom.mjs','Teacher settings, waiting students and durable assignments'],
 ['server/store.mjs / server/runs.mjs','SQLite, response persistence/exports and legacy compatibility'],
 ['public/app.js / public/admin.js','Student and teacher interfaces'],
 ['tests/classroom.test.mjs','Teacher-flow and source-restoration regression tests']
 ],sourceTitle:'Original sources',sourceNote:'Checked against the user-supplied book PDF and original papers. The PDF itself is not bundled. Restoration is limited to the specified task versions.',sheet:'Selection spreadsheet'
}};
for(const [lang,items] of Object.entries({
 ja:[
  '順位課題は上のラベルを下の順位枠へ移動します。ドラッグ、または項目と順位を順に選択して操作できます。ラベルは余白を抑えて並べ、デスクトップでは一覧できる高さまで表示します。元の置き場所を残し、配置による領域の縮小とページ移動を防ぎます。順位表も複数列です。Lindaは1〜8位を一度ずつ使用し、埋まった順位への移動は交換になります。30項目リスク課題は同じ枠に複数置いて同順位にできます。順位の意味・項目順・数値保存は維持し、入力方法の変更をJSON内のmetrics.responseControl = drag-ranking-v1で記録します。',
  '追加した七件は、二対の仮想賭け、Jack・Dick・記述なし、虚偽の合意Study 3、会話先行研究、Gurka実験1、袋・缶の24オッズ判断、30項目リスク研究です。全14件を選ぶと86の準備／回答ページになります。',
  '会話題は同じ実際の会話をした二人が独立回答します。合計100を強制せず、同一実施内で互いを相手と指定した回答だけをconversationPairsに集計。自己評定−相手による本人評定と、その二人平均を出力します。客観的な発言時間の正誤ではありません。',
  'リスク題は原研究と2016年追試で補核した30項目・全段階版です。最低順位項目を10に固定し、同順位と小数を許し、比率の上限100を設けません。9量尺の順と端点方向は保持します。2016年完全版の平均約90分を目安に時間を確保してください。'
 ],
 zh:[
  '排序题将上方标签移到下方名次框，可拖动，也可先选项目再选名次。标签紧凑排列，桌面优先完整展开；保留原标签占位，避免移动后区域收缩或页面跳动。排名表也采用多列布局，减少滚动。Linda使用1至8名且不并列，移到已占用名次时交换位置；30项风险题可把多个标签放在同一名次中，保留并列。名次含义、项目顺序和保存的数值保持不变，输入方式改动记录在JSON的metrics.responseControl = drag-ranking-v1中。',
  '此次新增七项：两对假想下注、Jack／Dick／无描述、虚假共识Study 3、谈话先导研究、Gurka实验1、袋—罐24次赔率判断、30项风险研究。全选14项共86个准备／作答页面。',
  '谈话题要求两人实际参加同一次谈话并独立回答，两个估计不强制合计100。仅同一实施中互指对方学号的记录进入conversationPairs，输出“自己对自己的估计−对方对自己的估计”及两人差值均值，不判定客观发言时间的正误。',
  '风险题由原研究和2016年复现补核，含30项目及全部阶段。最低项固定为10，允许并列和小数，比率评分不设100上限，保持九量尺顺序和方向。请安排长时段：2016年完整版本平均约90分钟。'
 ],
 en:[
  'Ranking tasks move labels from the upper bank into ranks below, by dragging or by selecting an item and then a rank. Compact labels expand to show the full bank on desktop. Original label spaces remain to prevent shrinking and page jumps, and ranks use multiple columns to reduce scrolling. Linda uses each rank from 1 to 8 once; moving into an occupied rank swaps the items. The 30-item risk task allows multiple labels in one rank, preserving ties. Rank meanings, item order and numeric answer storage are unchanged. JSON metrics.responseControl = drag-ranking-v1 records the changed input method.',
  'Seven additions cover two hypothetical bet pairs; Jack, Dick and the null profile; false-consensus Study 3; the conversation pilot; Gurka Experiment 1; 24 bag–can odds judgments; and the full 30-item risk method. Selecting all 14 tasks gives 86 readiness/response pages.',
  'Conversation partners must share a real conversation and answer independently. Estimates need not total 100. Only reciprocal partner IDs within one lesson enter conversationPairs. Exports give each self-estimate minus the partner’s estimate of that person and the pair mean; these are not objective speaking-time accuracy scores.',
  'The 30-item risk task uses the original study plus the 2016 replication. Minimum-ranked items are fixed at 10; ties, decimal responses and ratios above 100 are allowed. All nine scales retain their order and direction. Reserve a long session: the complete 2016 version averaged about 90 minutes.'
 ]
})){
 texts[lang].method.splice(3,0,...items);
 texts[lang].structure.splice(2,0,['server/expanded.mjs / public/expanded-messages.js',lang==='ja'?'追加七件の手続きと三言語刺激':lang==='zh'?'新增七项程序与三语刺激':'Seven expanded protocols and trilingual stimuli']);
}
const cell=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const table=(headers,rows)=>[headers,headers.map(()=>'---'),...rows].map(row=>'| '+row.map(cell).join(' | ')+' |').join('\n');
const bullets=items=>items.map(item=>'- '+item).join('\n\n');
export function renderReadmes(catalog){
 const files={ja:'README.md',zh:'README.zh-CN.md',en:'README.en.md'},out={};
 for(const [lang,file] of Object.entries(files)){
  const t=texts[lang],sourceLinks=s=>s.sourceKeys.map(key=>'['+key+']('+catalog.sources[key].url+')').join(' · ');
  const rows=enabled=>catalog.studies.filter(s=>s.classroomEnabled===enabled).map(s=>[s.id,s.names[lang],s.original[lang],enabled?s.changes[lang]:[s.audit.reason[lang],...s.restoration.missingMaterials[lang],...s.restoration.conditions[lang]].join(' '),sourceLinks(s)]);
  const recovery={
   ja:{title:'実施版の範囲と条件',heads:['ID','実施版','実施条件','研究全体として未取得の資料'],note:'実験画面のカードには、実施可能な課題の名称と短い紹介だけを表示します。実施条件・版の説明・原書との対応・未復元の課題はこのREADMEにまとめます。',font:'画面のフォントはPRPと共通です。日本語はNoto Sans JP Variable（@fontsource-variable/noto-sans-jp 5.3.0）を同梱し、ほかの言語はPingFang SC、Microsoft YaHei、Helvetica Neue、Arialの順です。[フォントライセンス](public/fonts/noto-sans-jp/LICENSE)。'},
   zh:{title:'实施版本与条件',heads:['ID','版本范围','实施条件','完整研究仍缺的材料'],note:'实验界面的卡片只显示可实施任务的名称和简短介绍。实施条件、版本说明、与原书的对应及待补实验集中保留在本README。',font:'界面采用与PRP相同的字体设置。日语内置Noto Sans JP Variable（@fontsource-variable/noto-sans-jp 5.3.0）；其他语言依次使用PingFang SC、Microsoft YaHei、Helvetica Neue、Arial。[字体许可](public/fonts/noto-sans-jp/LICENSE)。'},
   en:{title:'Implemented versions and conditions',heads:['ID','Version scope','Conditions','Materials missing for the full study'],note:'Experiment cards show only the names and brief descriptions of available tasks. Administration conditions, version notes, source comparisons and tasks awaiting materials are documented in this README.',font:'Typography matches PRP. Japanese uses the bundled Noto Sans JP Variable (@fontsource-variable/noto-sans-jp 5.3.0); other languages use PingFang SC, Microsoft YaHei, Helvetica Neue and Arial in that order. [Font license](public/fonts/noto-sans-jp/LICENSE).'}
  }[lang];
  const recoveryRows=catalog.studies.filter(s=>s.classroomEnabled&&s.restoration).map(s=>[s.id,s.restoration.label[lang],s.restoration.conditions[lang].join(' '),s.restoration.missingMaterials[lang].join(' ')]);
  const sections=['# '+t.title,'[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)',t.intro,t.scope,
   '## '+t.start,t.requirement,'~~~sh\nnpm start\n~~~','## '+t.flowTitle,bullets(t.flow),
   '## '+t.available,table(t.heads,rows(true)),'## '+recovery.title,recovery.note,table(recovery.heads,recoveryRows),'## '+t.held,table(t.heldHeads,rows(false)),
   '## '+t.methodTitle,bullets(t.method),'## '+t.dataTitle,bullets(t.data),recovery.font,
   '~~~sh\nnpm test\nnpm run check\nnpm run docs\n~~~','## '+t.structureTitle,table(['File','—'],t.structure),
   '## '+t.sourceTitle,t.sourceNote,
   ...Object.entries(catalog.sources).map(([key,source])=>'- **'+key+'** — '+source.citation+' [Source]('+source.url+')'),
   '['+t.sheet+']('+catalog.selection.sheetUrl+')'];
  out[file]=sections.join('\n\n')+'\n';
 }
 return out;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const catalog=JSON.parse(readFileSync(new URL('../content/catalog.json',import.meta.url),'utf8'));
 for(const [file,content] of Object.entries(renderReadmes(catalog)))writeFileSync(new URL('../'+file,import.meta.url),content);
 console.log('Generated Japanese, Chinese and English READMEs.');
}
