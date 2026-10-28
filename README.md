# 判断ラボ — Exp-all-in-one

[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)

『Judgment under Uncertainty: Heuristics and Biases』（Kahneman, Slovic & Tversky 編、1982）をもとにした、教員が開始を制御する授業用アプリです。日本語・中文・Englishを選択でき、初回は日本語です。Node.jsとSQLiteでローカル動作し、Vercel・Neonは使いません。

21件を原典と照合し、14件を実施できます。掲載資料の部分版・同章の会話先行研究・方法再構成は範囲を明示しています。残る7件は核心刺激または現場条件が不足しています。以前保留した14件の回収結果と必要資料は[復元状況](docs/restoration-status.md)に記載。英語の文字頻度課題は除外し、アンカリングの代表は五秒乗算推定です。

## 起動

Node.js 24.15.0以降。外部npm依存はありません。リポジトリのフォルダで実行します。

~~~sh
npm start
~~~

## 授業での使い方

- 学生は http://127.0.0.1:3000/ で7桁の学生証番号を入力して待機します。先頭の0は保持します。

- 教員は http://127.0.0.1:3000/admin で実験ブロックを選び、実験順と選択肢位置のランダム化をそれぞれ設定して「開始する」を押します。

- 選んだ課題は「プレビュー」で画面サイズを切り替えて確認できます。回答せずに前後へ移動でき、結果は保存されません。制限時間のある画面は確認できるよう停止し、順位を飛ばした場合の比率画面には仮の基準が表示されます。

- 待機中の学生は約1秒以内に開始し、選択された課題を連続して回答します。途中参加者も同じ実施に入ります。終了後は待機へ戻れます。教員は現在の実施を終了して次の実施を開始します。

- 順序ランダム化は学生ごとに行います。無効時は章順です。選択肢のランダム化は選択ボタンだけに適用し、順位の数値尺度、乗算の昇降条件、課題内の段階順は変えません。原研究内の条件割付は別に維持します。

- 割付・順序・保存済み回答は再読込しても変わりません。言語切替は回答中の入力を保持します。通常の未送信入力は再読込で失われます。送信結果が不明の場合は同じ送信IDで再試行します。

- 学生画面は問題と必要な操作だけを表示します。共通の既往経験質問・追加の自信評定・技術説明はありません。教員画面からCSV／JSONを書き出せます。

## 実施できる課題

| ID | 課題 | 原設計（簡潔） | 画面化などの変更 | 原典 |
| --- | --- | --- | --- | --- |
| 01-02 | 合取・析取の賭け選択 | 一回の赤球抽出を、七回すべて赤・七回中少なくとも一回赤の出来事と比較し、賭けたい方を選びます。 | 書中の二つの比較を復元。第三の比較、勝率判断、架空の同額賞金を削除。同じ人に二問を固定順で示すのは実装上の選択です。 | [BH73](https://doi.org/10.1016/0030-5073(73)90061-5) · [TK74](https://doi.org/10.1126/science.185.4157.1124) |
| 03-01 | 標本サイズの無視 | 日平均45人／15人が生まれる病院で、1年間に男児が60%を超える日が多い方を三択で判断する。 | 60%超の原題を三言語で提示。日ごとの変動と「差5%以内」の選択肢を復元。画面で個別回答する。 | [KT72](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf) |
| 03-02 | 局所的な代表性 | 六人きょうだいの出生順序GBGBBGが72世帯と分かっているとき、BGBBBBの世帯数を推定する。Gは女子、Bは男子。 | コイン選択を廃し、原題の世帯数推定を復元。独立・等確率の追加前提や72の入力上限はない。三言語・画面入力。 | [KT72](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf) |
| 04-01 | エンジニア・弁護士の推定 | 二種類の基準率のもとでJack・Dick・記述なしの人物がエンジニア／弁護士である確率を答えます。 | 基準率二条件×質問職業二条件、0～100の確率を復元。掲載二人物と記述なしに限定し、元の五人物・専門家ボーナスを全再現とはしません。 | [KT73](https://doi.org/10.1037/h0034747) |
| 06-01 | リンダの合取判断 | Lindaの原記述を読み、八つの職業・活動を確率の高い順に1～8位にする組内版。 | 八対象と1～8順位を復元。三対象への短縮と追加の外見情報はない。三言語・数値順位入力。Billや別群の版は含めない。 | [TK82R](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/judgments-of-and-by-representativeness/7565F5DCBEC82B58C6428ABE8F7304AB) |
| 08-01 | 因果方向と診断方向 | 母娘の青い眼の条件付き可能性を三択で比較し、別問では高校最終学年男子と父親の身長の予測方向に対する自信を三択で比較する。 | 180cm、架空集団、同じ周辺比率、追加の0～100自信評定を削除。二問を三言語で復元し、身長回答を数学的正誤として採点しない。 | [TK80](https://amsr.contentdm.oclc.org/digital/api/collection/p21050coll5/id/3872/download) |
| 09-07 | 虚偽の合意効果：仮想の携牌場面 | 広告または宗教的な看板を持つ仮想場面で、他者の承諾率、自分の選択、自己・承諾者・拒否者の八特性を評価します。 | 1977年Study 3。二つの割合の合計100、三対象×八特性の−50～+50を復元。場面は忠実な転述・翻訳。六通りの対象順を個別無作為割付し、元の定数割付とは異なります。 | [RGH77](https://doi.org/10.1016/0022-1031(77)90049-X) |
| 11-06 | 五秒間の乗算推定 | 二つの高校生群に1×2×…×8または8×7×…×1を提示し、5秒以内に積を推定させた。各参加者は一方の式だけを見る。 | 黒板を画面表示へ変更。準備画面後に5秒で回答を確定し、未入力はnull、中断は別記録とする。入力速度・機器・言語の差が加わる。 原文にない計算手段の禁止指示を削除。 | [TK74](https://doi.org/10.1126/science.185.4157.1124) |
| 12-01 | 会話での自己と相手の寄与 | 同じ会話をした二人が、自分と相手の発言時間の割合を独立に推定し、互いの見積りを比較します。 | 同章の26人の会話先行研究を選択。夫妻の家事項目とは別版です。合計100を強制せず、余分な回想・自信・七日間条件を削除。学籍番号は同一実施内の照合用。 | [RS79](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Negotiation_and_Conflict_Management/Ross_Sicoly_1979_Egocentric_biases.pdf) |
| 14-01 | 反実仮想の生成 | Jones氏の死亡事故の経路版／時刻版を群間提示。「もし…」の続きを一つ以上記述し、研究者が最初の続きを分類する。 | 面接物語を原事故物語に戻し、一つだけという制限・分類・理由質問を削除。三言語の自由記述を保存し、人手で符号化する。 | [KT82S](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/simulation-heuristic/9C6ED91A6429A8443641641DC41A52FE) |
| 23-01 | 結末情報と歴史判断 | グルカ戦争の十二事実を読み、四結末の確率と各事実の関連性を評価します。結末を知らない群と、四種類の結末を示す群を比較します。 | 1975年実験1の事件A。四確率合計100と十二項目の七点評定を復元。英語も事実を保った転述で、紙質問票の逐語複製ではありません。関連性の高低以外の端点語を加えません。 | [F75](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Fischhoff_1975_Hindsight_is_not_equal_to_foresight.pdf) |
| 25-01 | 二袋の確率推定（章内例題） | 各1000個のチップを含む二袋（赤700／300個）から硬貨で一袋を選び、復元抽出12回で赤8・青4。赤700個の袋を選んだ確率を一度判断する章内例題。 | 自作の10回逐次更新を削除し、原例題の一括標本と一回の確率回答を復元。小数も可。三言語・画面入力で、元研究全体の再現ではない。 原文の0～1の確率表記と0.5の手掛かりを維持。 | [ED68](https://pages.ucsd.edu/~mckenzie/Edwards1968excerpts.pdf) |
| 26-01 | 袋・缶からの多段階推論 | 袋、缶、円片の構成表から、見えた色を手掛かりに袋I対IIのオッズを推定します。三条件・四色を二巡して24回答します。 | 元の行列・24題・オッズを復元。二数値の比で入力し、無限大も保持。元の4～6人共通順を個別固定順に変更。原参加者の約二時間の先行経験とは一致しません。 | [GKP73](https://deepblue.lib.umich.edu/handle/2027.42/33759) |
| 33-03 | リスク・便益と危険特性（30項目） | 30の活動・技術をリスクまたは便益で順位付けし、最小10の比率で評価。その後、許容リスクと九つの七点尺度を全項目について答えます。 | 1978年報告とFox-Glassman・Weberの2016年追試で方法を補核。十項目短版を廃止。比率上限100を設けず同順位可。五ブロックの循環順を個別割付し、翻訳・現代の教室標本を明示します。 | [FSLRC78](https://doi.org/10.1007/BF00143739) · [FGW16](https://elke-u-weber.com/media/2016_journal_of_mathematical_psychology_fox-glassman.pdf) · [SFL82](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/facts-versus-fears-understanding-perceived-risk/F2E2E20E89E2121C7BCB43672D590EB8) |

## 実施版の範囲と条件

実験画面のカードには、実施可能な課題の名称と短い紹介だけを表示します。実施条件・版の説明・原書との対応・未復元の課題はこのREADMEにまとめます。

| ID | 実施版 | 実施条件 | 研究全体として未取得の資料 |
| --- | --- | --- | --- |
| 01-02 | 掲載された二つの比較 | 仮想の選好判断として実施。実際の金銭賭博は行いません。 | 研究全体の問題冊子・報酬・割付表は未取得。 |
| 04-01 | Jack・Dick・記述なしの掲載資料版 | 同じ学生に三問。条件は学生ごとに固定されます。 | 残る三人物の原記述と専門家比較による報酬の手続き。 |
| 09-07 | 原論文Study 3 | 仮想場面のみ。実際の街頭活動や単位付与は行いません。 | 元の紙質問票の版面と正確な順序割付表は未取得。主要場面・特性・量尺は確認済み。 |
| 12-01 | 同章の会話先行研究 | 実際に同じ会話をした二人が独立回答。話題・時間は指定せず、相互に相手の学生証番号を入力します。 | 選択した先行研究の主要材料に欠落なし。夫妻版の20活動は取得済みですが別手続きです。 |
| 23-01 | 原論文の実験1・事件A | 一人一条件。提示された結末には実際と異なるものがあり、終了後に説明します。 | 1975年質問票の完全な版面は未取得。十二事実・結末・測定範囲は原論文で補核済み。 |
| 26-01 | 原書の三行列・24題 | オッズの表し方を理解できる学生が対象。画面には比の定義のみ示し、数値例や正解の練習は追加しません。 | 主要行列・条件は取得済み。元の先行経験で使った課題と個々の割付表は未取得。 |
| 33-03 | 30項目の方法再構成 | 長時間枠が必要です。2016年の完全版は平均約90分。活動名を勝手に日本向けへ置換しません。 | 1978年紙質問票の逐語影印は未取得。30項目と九量尺・全段階は原研究と2016年追試で確認済み。 |

## 未復元の課題

| ID | 課題 | 原設計（簡潔） | 未復元の理由 | 原典 |
| --- | --- | --- | --- | --- |
| 04-07 | 予測における回帰不足 | 実習教師の一授業を評価する群、5年後の能力を予測する群、両方を行う群を比較した。 | PDF 72–73頁には方法だけがあり、七段の刺激はありません。70頁の大学新生例題は回収済みですが、別の対象・測定であり、この教師研究の復元とは区別します。 実習授業の原記述七段すべて。質問の正確な文言と評価・予測の提示順。 100名の小学教師を参照した百分位評価。五年前の記録を評価／予測／両方の三群で扱います。 | [KT73](https://doi.org/10.1037/h0034747) |
| 09-03 | 取り消された情報と信念 | 新奇な判別課題で虚偽の成否フィードバックを示し、それを撤回した後も評価が残るか測った。 | PDF 163–167頁の消防員版もケース刺激が未掲載です。六つの記号分類問題では原刺激を置き換えられません。 本物・架空の遺書25対、選択版に対応する虚偽成績の順序と後測質問。 フィードバックの撤回と終了後説明が必要。能力の診断と扱いません。 | [RLH75](https://doi.org/10.1037/0022-3514.32.5.880) |
| 09-05 | 偏った同化と態度 | 死刑への立場が異なる人に賛否両方向の研究を読ませ、評価と態度変化を測った。 | PDF 161–162頁は概要。原論文の短い結果カードは取得済みですが、最初の要約後反応だけでは詳細証拠を伴う元の極化手続きを測れません。 詳細な研究報告、方法批判と反論、刺激の表・図。 事前の死刑態度を測り、賛否双方の証拠と評価順を保存する必要があります。 | [LRL79](https://fbaum.unc.edu/teaching/articles/jpsp-1979-Lord-Ross-Lepper.pdf) |
| 13-01 | 視点と因果帰属 | 観察者の座席や視点を変えて同じ会話を見せ、話者の因果的影響を評価させた。 | PDF 155–156・212–213頁の概要から台本は復元できません。SVG人物の拡大と自作0～100影響度は別設計になります。 統制された会話の台本・映像、視点ごとの観察手順、元の帰属質問票。 内容を共通にし、観察位置だけを操作する対面または同等の映像配置が必要です。 | [TF75](https://doi.org/10.1037/h0077095) |
| 16-02 | 選択権と統制の錯覚 | 実物のフットボールカードのくじを1ドルで購入し、自分で選ぶ／対応するカードを割り当てられる群に分け、後日に転売価格を聞く。 | PDF 256–257頁から手続きと三言語の詢価は回収済みです。残るのは現場材料と実際の所有・購入条件であり、架空の100円設問では代替しません。 227種類の球星カード二組と対応する割当記録。 実際の1ドル購入と約50ドル賞金、選択者に対応した非選択者のカード、抽選前の要価。初期の売却拒否も別記録します。 | [L75](https://nuovoeutile.it/wp-content/uploads/2014/10/Langer1975_IllusionofControl.pdf) |
| 17-01 | 錯覚相関 | 絵の特徴と症状の統計的な組み合わせを制御し、後から関連性を評価させた。 | PDF 261–264頁から六症状・枚数・時間は復元済みです。核心の45図がなく、三種のSVGや別研究の語連想尺度では補えません。 45枚の原人物画、各絵への症状割当表、完全な後測。 各絵に二症状、15対を各三回、各絵30秒。診断に用いる課題ではありません。 | [CC67](https://pubmed.ncbi.nlm.nih.gov/4859731/) |
| 20-01 | 情報量と判断の自信 | 32名の判断者が4段階の症例情報を読み、判断と自信を繰り返し回答した。 | PDF 308–311頁の第一段階と五つの例題は取得済みですが、情報増加の操作を単独の初回例題だけでは実施できません。 第二～第四段階の完全なケース記録、25問中20問と選択肢・事実キー。 同じ25問を四段階で反復。各題五択と20～100%の信頼度を記録します。 | [O65](https://doi.org/10.1037/h0022125) |

## 原設計との対応

- 身長題は「父から子／子から父の身長を予測する自信」の三択です。眼色の条件付き可能性とは別の測定です。180cm、等しい周辺比率、追加の0～100評定はありません。

- 八対象のLinda順位、六児家庭の頻数推定、Jonesの経路／時刻版を復元しました。二袋は第25章の例題で、0～1の確率を一回回答します。章内の0.5の手掛かりも維持し、研究全体の再現とは呼びません。

- 11-06は開始準備後に一方の式だけを5秒提示し、期限時点の有効入力を確定します。未入力・不正入力はnull、中断・再読込・タブ非表示もnullとして記録し、同じ式を再提示しません。黒板から画面とキーボードへの変更です。

- 順位課題は上のラベルを下の順位枠へ移動します。ドラッグ、または項目と順位を順に選択して操作できます。ラベルは余白を抑えて並べ、デスクトップでは一覧できる高さまで表示します。元の置き場所を残し、配置による領域の縮小とページ移動を防ぎます。順位表も複数列です。Lindaは1〜8位を一度ずつ使用し、埋まった順位への移動は交換になります。30項目リスク課題は同じ枠に複数置いて同順位にできます。順位の意味・項目順・数値保存は維持し、入力方法の変更をJSON内のmetrics.responseControl = drag-ranking-v1で記録します。

- 追加した七件は、二対の仮想賭け、Jack・Dick・記述なし、虚偽の合意Study 3、会話先行研究、Gurka実験1、袋・缶の24オッズ判断、30項目リスク研究です。全14件を選ぶと86の準備／回答ページになります。

- 会話題は同じ実際の会話をした二人が独立回答します。合計100を強制せず、同一実施内で互いを相手と指定した回答だけをconversationPairsに集計。自己評定−相手による本人評定と、その二人平均を出力します。客観的な発言時間の正誤ではありません。

- リスク題は原研究と2016年追試で補核した30項目・全段階版です。最低順位項目を10に固定し、同順位と小数を許し、比率の上限100を設けません。9量尺の順と端点方向は保持します。2016年完全版の平均約90分を目安に時間を確保してください。

- 翻訳、画面入力、連続実施、教師による順序設定は原研究からの変更です。翻訳の逆翻訳・言語間等価性や心理効果の再現は検証していません。各課題は特定の版を選んだもので、章内の全条件・全研究を含みません。

- 詳細は[設計監査](docs/design-audit.md)、[前半](docs/audit-early.md)、[中盤](docs/audit-middle.md)、[後半](docs/audit-late.md)を参照。参照PDFのページは598ページの重排版における1始まりのページ番号で、原紙書のページとは異なります。

## 保存と検証

- data/local.sqliteに学生証番号、教員の設定、実施ID、乱数の種、学生ごとの順序、各課題のプロトコル・版・回答・時刻を保存します。同じ番号でも次の実施は別記録です。ログインは番号による識別で、本人認証ではありません。

- JSON schemaVersion=5はlessons、runs、sessionsと完全な提示・翻訳スナップショットを含みます。CSVは1回答項目1行で、実施ID、教員設定、実験順、選択肢順、言語、提示ハッシュ、計時記録を含みます。自由記述の符号化は研究者が行います。

- 旧版の回答・手続きは保持し、新版のteacher-1記録と分けます。過去の誤った刺激を新しい刺激として書き換えません。未提示の割当課題は回答0件のままJSONに含まれます。

- 動作確認には別のDATA_DIRを指定します。data/、環境ファイル、ログはGit対象外です。停止後にdata全体をコピーしてバックアップできます。.envは自動読込しません。必要ならnode --env-file=.env server/index.mjsを使います。PORTの既定値は3000です。

- サーバーは127.0.0.1限定です。現段階の動作確認は同じPCの学生・教員ページで行います。別の学生PCからの接続、教員認証、募集・謝礼・公開配信は未実装です。

- npm testで原題の尺度・入力制約、三言語、教員開始／終了、待機・再開、再送、順序保持、書き出し、旧記録保持を検証します。npm run checkは構文・メタデータ・READMEの一致を確認します。テスト用データは実際の回答とは分離します。

画面のフォントはPRPと共通です。日本語はNoto Sans JP Variable（@fontsource-variable/noto-sans-jp 5.3.0）を同梱し、ほかの言語はPingFang SC、Microsoft YaHei、Helvetica Neue、Arialの順です。[フォントライセンス](public/fonts/noto-sans-jp/LICENSE)。

~~~sh
npm test
npm run check
npm run docs
~~~

## 主なファイル

| File | — |
| --- | --- |
| content/catalog.json | 21件の原設計、文献、監査状態と実施可否 |
| server/restored.mjs / public/revised-messages.js | 復元した課題と三言語の題面 |
| server/expanded.mjs / public/expanded-messages.js | 追加七件の手続きと三言語刺激 |
| server/classroom.mjs | 教員の設定、学生待機、固定された割付 |
| server/store.mjs / server/runs.mjs | SQLite、回答の保存と書き出し、旧手続きの互換性 |
| public/app.js / public/admin.js | 学生画面・教員画面 |
| tests/classroom.test.mjs | 教員制御と復元内容の回帰テスト |

## 原典

利用者提供の原書PDFと原論文を照合しました。PDFそのものは配布物に含めません。原題は当該版に限定して復元しています。

- **TK74** — Tversky & Kahneman (1974). Judgment under Uncertainty: Heuristics and Biases. Science, 185, 1124–1131. [Source](https://doi.org/10.1126/science.185.4157.1124)

- **KT72** — Kahneman & Tversky (1972). Subjective probability: A judgment of representativeness. Cognitive Psychology, 3, 430–454. [Source](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf)

- **KT73** — Kahneman & Tversky (1973). On the psychology of prediction. Psychological Review, 80, 237–251. [Source](https://doi.org/10.1037/h0034747)

- **TK82R** — Tversky, A., & Kahneman, D. (1982). Judgments of and by representativeness. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 84–98). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/judgments-of-and-by-representativeness/7565F5DCBEC82B58C6428ABE8F7304AB)

- **TK80** — Tversky & Kahneman (1980). Causal schemas in judgments under uncertainty. In Fishbein (Ed.), Progress in Social Psychology, Vol. 1, 49–72. [Source](https://amsr.contentdm.oclc.org/digital/api/collection/p21050coll5/id/3872/download)

- **RLH75** — Ross, L., Lepper, M. R., & Hubbard, M. (1975). Perseverance in self-perception and social perception: Biased attributional processes in the debriefing paradigm. Journal of Personality and Social Psychology, 32(5), 880–892. [Source](https://doi.org/10.1037/0022-3514.32.5.880)

- **LRL79** — Lord, Ross & Lepper (1979). Biased assimilation and attitude polarization: The effects of prior theories on subsequently considered evidence. Journal of Personality and Social Psychology, 37, 2098–2109. [Source](https://fbaum.unc.edu/teaching/articles/jpsp-1979-Lord-Ross-Lepper.pdf)

- **RGH77** — Ross, L., Greene, D., & House, P. (1977). The “false consensus effect”: An egocentric bias in social perception and attribution processes. Journal of Experimental Social Psychology, 13(3), 279–301. [Source](https://doi.org/10.1016/0022-1031(77)90049-X)

- **TK73A** — Tversky & Kahneman (1973). Availability: A heuristic for judging frequency and probability. Cognitive Psychology, 5, 207–232. [Source](https://noorsiddiqui.com/papers/TverskyKahneman.pdf)

- **RS79** — Ross & Sicoly (1979). Egocentric biases in availability and attribution. Journal of Personality and Social Psychology, 37, 322–336. [Source](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Negotiation_and_Conflict_Management/Ross_Sicoly_1979_Egocentric_biases.pdf)

- **TF75** — Taylor, S. E., & Fiske, S. T. (1975). Point of view and perceptions of causality. Journal of Personality and Social Psychology, 32(3), 439–445. [Source](https://doi.org/10.1037/h0077095)

- **KT82S** — Kahneman, D., & Tversky, A. (1982). The simulation heuristic. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 201–208). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/simulation-heuristic/9C6ED91A6429A8443641641DC41A52FE)

- **L75** — Langer (1975). The illusion of control. Journal of Personality and Social Psychology, 32, 311–328. [Source](https://nuovoeutile.it/wp-content/uploads/2014/10/Langer1975_IllusionofControl.pdf)

- **CC67** — Chapman & Chapman (1967). Genesis of popular but erroneous psychodiagnostic observations. Journal of Abnormal Psychology, 72, 193–204. [Source](https://pubmed.ncbi.nlm.nih.gov/4859731/)

- **O65** — Oskamp (1965). Overconfidence in case-study judgments. Journal of Consulting Psychology, 29, 261–265. [Source](https://doi.org/10.1037/h0022125)

- **F75** — Fischhoff (1975). Hindsight ≠ foresight: The effect of outcome knowledge on judgment under uncertainty. Journal of Experimental Psychology: Human Perception and Performance, 1, 288–299. [Source](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Fischhoff_1975_Hindsight_is_not_equal_to_foresight.pdf)

- **ED68** — Edwards (1968). Conservatism in human information processing. In Formal Representation of Human Judgment, 17–52. [Source](https://pages.ucsd.edu/~mckenzie/Edwards1968excerpts.pdf)

- **GKP73** — Gettys, Kelly & Peterson (1973). The best guess hypothesis in multistage inference. Organizational Behavior and Human Performance, 10, 364–373. [Source](https://deepblue.lib.umich.edu/handle/2027.42/33759)

- **SFL82** — Slovic, P., Fischhoff, B., & Lichtenstein, S. (1982). Facts versus fears: Understanding perceived risk. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 463–490). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/facts-versus-fears-understanding-perceived-risk/F2E2E20E89E2121C7BCB43672D590EB8)

- **BH73** — Bar-Hillel, M. (1973). On the subjective probability of compound events. Organizational Behavior and Human Performance, 9(3), 396–406. [Source](https://doi.org/10.1016/0030-5073(73)90061-5)

- **FSLRC78** — Fischhoff, B., Slovic, P., Lichtenstein, S., Read, S., & Combs, B. (1978). How safe is safe enough? A psychometric study of attitudes towards technological risks and benefits. Policy Sciences, 9, 127–152. [Source](https://doi.org/10.1007/BF00143739)

- **FGW16** — Fox-Glassman, K. T., & Weber, E. U. (2016). What makes risk acceptable? Revisiting the 1978 psychological dimensions of perceptions of technological risks. Journal of Mathematical Psychology, 75, 157–169. [Source](https://elke-u-weber.com/media/2016_journal_of_mathematical_psychology_fox-glassman.pdf)

[選定元のGoogle表格](https://docs.google.com/spreadsheets/d/1E6j0l_dqVMttijLAn5mud7CvreEPOiTsKCHZV-zfaYI/edit)
