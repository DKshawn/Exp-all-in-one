# 開発・デプロイ・検証

[日本語](../ja/development.md) · [中文](../zh-CN/development.md) · [English](../en/development.md)

確率的進化ゲームは共通マイグレーターと4個の `evolution_` テーブルを使います。`npx tsx --test tests/evolution.test.ts` でエンジンとPGlite、`npx playwright test evolution.spec.ts` で2つの正式実験とデモを検証します。 [ルールとデータ](evolution.md)

## ローカル起動

Codex の「Edit project」では Source folders に `C:\Users\dksha\Documents\project\Exp-all-in-one` だけを登録し、Make primary に設定します。旧 `EMH` と `Judgment_under_Uncertainty` は開発用に追加しません。以前のチャットには旧作業ディレクトリが残る場合があるため、コマンドの作業ディレクトリと `git rev-parse --show-toplevel` を確認してください。教員UIの旧ブランチは [移植元の記録](../../upstream/judgment/teacher-management-20261102/README.md) を参照し、変更は統合リポジトリだけで行います。

ローカルのプロジェクトフォルダーは `Exp-all-in-one` です。このフォルダーを開き、以下のコマンドをルートで実行します。

Node.js 24.xを使用します（`.nvmrc`・CI・Vercel の設定と共通）。`package.json` の `engines.node` も `24.x` に固定し、将来のメジャーバージョンへの自動切り替えを防ぎます。

```sh
npm ci
npm run dev
```

Windows の隔離したローカル検証環境は、`pwsh -NoProfile -File scripts/dev-local.ps1` で起動できます。ポートは3200、保存先は `.data/platform-verification` です。旧 EMH フォルダーは不要です。[整理記録](../../../docs/releases/emh-folder-consolidation.md)を参照してください。

教員入口は `http://localhost:3000/teacher` です。学生の入室画面とは別のURLから開きます。キー設定時は、実験選択の前にログインします。Neonの設定がなければ組み込みPostgreSQL（PGlite）の `.data/auction` に保存されます。同じ保存先を複数サーバーから開かないでください。本番はNeonを使用します。

ローカルで教員用デモを利用するには、Gitに含めない `.env.local` に `TEACHER_ACCESS_KEY` を設定し、サーバーを再起動します。キーが未設定でも正式実験のローカル開発は可能ですが、デモのログインは無効になります。

教員入口と `?entry=teacher` のルームページはサーバーで認証します。`POST /api/teacher/session` はキーを検証して8時間の署名付きHttpOnly・SameSite=Lax Cookieを発行し、HTTPSではSecure属性を付けます。キー自体はCookieやブラウザーストレージに保存しません。`DELETE` はログアウトし、キー変更は既存セッションを無効にします。作成・管理・削除・Judgmentの教員用プレビューAPIはセッションを検証し、既存の認証済みスクリプト向け `accessKey` も受け付けます。追加の環境変数やDB移行は不要です。

サイズ別プレビューの埋め込みは同一オリジンの `/demo` と `/emh/demo` のみ許可し、教員・正式ルームは引き続き禁止します。

## Vercel + Neon

| 環境変数             | 用途                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`       | Neonのpooled PostgreSQL接続文字列。Vercelで必須                              |
| `TEACHER_ACCESS_KEY` | 教員入口の認証・セッション署名に使う共通キー。Vercelで必須。学生に共有しない |
| `PGLITE_DATA_DIR`    | ローカルの任意のデータ保存先                                                 |

GitHubからVercelにデプロイします。関数リージョンは `vercel.json` の `sin1` で、Neon Singaporeと合わせています。テーブルは初回接続で初期化します。手動の場合は `npm run db:migrate`。本番でローカルDBへはフォールバックしません。

`.env*`、`.data`、`work`、テスト成果物をGitに含めません。プレビュー用には別のNeonブランチを用意してください。

## 同期・整合性

SSEで注文・約定の変更を配信します。通常は認可済み表示の差分だけを送り、初回・再接続時には最新のスナップショットを送ります。Double Auction の学生履歴は現在制度で設定した期数に限定し、累積利益と教員の全期記録は保持します。通信が途切れた場合は再接続し、低頻度のHTTP再取得で補います。1人の切断で他の参加者や実験時計を自動停止することはありません。全市場の一時停止は教員の操作で行います。注文の締切判定は引き続きDBの時計を使います。

実験1の取引状態・重複排除ID・操作記録を市場別に保存します。学生の注文は所属市場の行だけを排他ロックし、教員の一時停止・再開などは共通設定のロックで全市場と調整します。状態と監査記録は同じトランザクションで確定します。締切は接続中のサーバーでも進行し、全員が切断していても次回アクセス時に記録済みの時刻から追いつきます。

ローカルPostgreSQLではLISTEN/NOTIFYで別アプリプロセスへ変更を通知します。オンラインの直接通知には追加の `REALTIME_DATABASE_URL`（LISTEN可能な直接接続）が必要です。未設定時はサーバーがルームごとの小さなバージョン一覧を確認して差分を配信します。クラウドでの能力・費用はローカルの実測から保証できません。

認証トークンはHttpOnly Cookie、DBにはハッシュだけを保存します。パスワード・PINはsalt付きscrypt。教員データは認証後のみ返し、学生には他人の価値・費用や他市場の注文を送りません。Callの注文板には本市場の価格・残数量だけを公開します。監査CSVには共通操作／市場を区別する記録スコープを追加しています。

[ローカルPostgreSQLの起動・192人の負荷試験手順](../../../docs/local-capacity-testing.md)を参照してください。`LOCAL_ONLY=1` と `LOCAL_DATABASE_URL` で、クラウド接続を防いだ検証ができます。PGliteの単一プロセス検証と、実際のPostgreSQLによる並行検証を区別します。

## 検証と開発方針

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

自動テストは3制度の取引、1〜5単位の限界価値と逐単位注文、順序の均衡割当、6市場96人のDB入室、並行要求、締切、休止、収束指標、非公開情報、出力、既存ルームとの互換性を確認します。

`tests/e2e` はPlaywrightのブラウザーテストです。`npm run test:e2e` でテスト専用のローカルDBと一時的な教員用キーを使用します。別途起動したローカルサーバーを検証する際は、キーを保存したファイルを `VERIFY_TEACHER_KEY_FILE` で指定します。既存環境を指定する `E2E_BASE_URL` は本番に向けないでください。旧12人CDAの回帰テストと、新規教員フォームの実験1作成テストを含みます。

各モジュールの HTTP 検証は [EMH](emh.md) と [Judgement](judgment.md) を参照してください。

正式な実験は同じ `main` に保ち、短期の機能ブランチで開発し、検証後にマージしてブランチを削除します。共通の入口・ルーム・セッション・DB接続はプラットフォーム、実験のルールとデータは各モジュールが担当します。[構成と開発方針（English）](../../architecture.md)を参照してください。

主要な実装は `src/experiments/double-auction/lib/study-core.ts`（ルール）、`study-view.ts`（表示・統計）、`study-export.ts`（出力）、`src/experiments/double-auction/components/study-room.tsx`（画面）、`study-settings.tsx`（設定）です。写真の出典は [public/fruits/CREDITS.md](../../../public/fruits/CREDITS.md) に記載しています。

## 三語ドキュメントの同期チェック

PR の **Documentation sync** は、PR 全体のコミット済み変更を共通の分岐点から比較し、README と関連ガイドの日中英更新漏れをチェックします。最終コミットだけでは判定しません。チェック画面の警告と実行概要に、未更新または存在しない言語・ファイル、および判定のきっかけとなった変更を表示します。文書の警告はマージを自動で止めません。比較自体に失敗した場合は、検査済みと誤認しないようチェックを失敗させます。

| 変更                                                     | 確認するガイド                                              |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| 各実験モジュール・実験名を含むルートやスタイル           | `double-auction.md`、`emh.md`、`judgment.md` の該当するもの |
| Demo のコード                                            | `demo.md` と該当する実験または共通ガイド                    |
| 共通の画面・入室・ルーム関連コード                       | `classroom.md`                                              |
| 共通サーバーコード                                       | `classroom.md` と `development.md`                          |
| スクリプト・Actions ワークフロー・依存関係・実行環境設定 | `development.md`                                            |

上記の変更では3つの README も確認します。README または `docs/guide/{ja,zh-CN,en}/` の1言語だけを編集した場合も、同じ文書の残りの言語を確認します。新しいガイド名も対象です。1言語だけの削除・改名は警告し、文書だけの変更ではガイド3言語の同時廃止・改名を許容します。テストだけの変更、`AGENTS.md`、保存済みの `docs/upstream` 原資料は機能変更として扱いません。

ローカルでも、コミット後に同じ比較を実行できます。未コミットの編集は対象外です。

```sh
npm run docs:check -- --base origin/main --head HEAD
```

ファイルの変更有無によるリマインダーであり、翻訳の意味・正確さや、リファクタリングに文書変更が必要かどうかは自動判定できません。警告が出たら該当3版の内容とリンクを確認し、必要な修正を同じ PR に含めてください。変更不要と判断した場合はレビューで理由を示し、警告を消すだけの無意味な編集は避けます。

---

[ホーム](../../../README.md) · [授業での使い方](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH 資産市場実験](emh.md) · [Judgement under Uncertainty](judgment.md)
