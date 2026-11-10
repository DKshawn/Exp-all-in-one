# Exp-all-in-one

[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)

Double Auction、EMH、Judgement under Uncertainty を一つの入口から実施する授業用実験プラットフォームです。初期表示は日本語です。

学生の待機画面は共通のカードデザインを使い、実験ごとの情報を表示します。

[教員入口](https://exp-all-in-one.vercel.app/teacher) · [学生入口](https://exp-all-in-one.vercel.app)（教員入口は学生画面とは別のURLです）

## 使い始める

```mermaid
---
config:
  theme: base
  look: classic
  layout: dagre
  htmlLabels: true
  flowchart:
    rankSpacing: 24
    wrappingWidth: 180
---
flowchart LR
    accTitle: 授業での使い方
    accDescr: 教員がルームを作成し、学生がコードで入室。教員が開始し、学生が参加したあと、教員が結果をダウンロードします。
    A["1 · 教員<br/>ログイン・実験選択<br/>ルーム作成・共有"]
    B["2 · 学生<br/>コード・ニックネーム/学生証番号・PIN<br/>入室して待つ"]
    C["3 · 実施<br/>教員が開始<br/>学生が参加"]
    D["4 · 教員<br/>データを保存<br/>授業で振り返る"]
    A --> B --> C --> D
    classDef teacher fill:#eeeefd,stroke:#5456c7,color:#22283d
    classDef shared fill:#f6f7fb,stroke:#6a7287,color:#22283d
    class A,D teacher
    class B,C shared
```

教員がルームを作って共有し、学生はコードで入室し、教員の指示に応じてニックネームまたは学生証番号を入力します。実施する実験とルールは教員が案内し、終了後に教員が結果をダウンロードします。

Double Auction の教員画面では、実験開始後に「学生の割り当て」を折りたたんで表示し、必要なときに開けます。デモでも同様です。デモの設定は黄色系で表示し、操作パネルはヘッダーの下にあります。

教員用キーは教員入口で一度だけ入力します。同じブラウザーでは8時間、再読込・実験切替・ルーム作成・管理で再入力せずに使えます。「ログアウト」、有効期限切れ、キー変更後は再認証します。ルームごとの教員パスワードは別に保持します。

[画面で見る使い方・再入室・ルーム管理](docs/guide/ja/classroom.md) · [Demo Model の使い方](docs/guide/ja/demo.md)

教員はログイン後に **Demo Model** で各実験を試せます。デモや画面サイズ別プレビューを直接開く場合も教員ログインが必要です。

Judgement の教員画面と Demo は課題カード・選択一覧・操作欄を共用します。日中英を切り替えられ、実施中の条件は固定されます。

## 実験

| 実験                        | 内容                                                                          | ガイド                                          | デモ                                                          |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| Double Auction              | CDA・Call Market・Posted Offer の制度比較。実人数に応じた市場・役割の割り当て | [実施とルール](docs/guide/ja/double-auction.md) | [Demo Model](https://exp-all-in-one.vercel.app/demo)          |
| EMH                         | 証券を取引し、配当と情報が価格形成に与える影響を観察（実験1・2）              | [実施とルール](docs/guide/ja/emh.md)            | [Demo Model](https://exp-all-in-one.vercel.app/emh/demo)      |
| Judgement under Uncertainty | 判断・認知バイアスの14課題。条件割り当て、課題順・選択肢順、計時、日中英表示  | [実施と記録](docs/guide/ja/judgment.md)         | [Demo Model](https://exp-all-in-one.vercel.app/judgment/demo) |

## 独立 AI 学生プログラム

[EMH 実験2 AI 学生プログラム](ai-emh/README.md) は、指定した人数の AI が学生として参加し、ローカルモデルまたは OpenAI API で判断します。モデルが応答しない場合にルール型 robot は使いません。

## 開発と資料

Next.js / React / TypeScript、Vercel + Neon PostgreSQL。Node.js 24.x を使います。正式な実験は同じ `main` で独立モジュールとして管理します。

PR の **Documentation sync** チェックは、日中英の README と関連ガイドの更新漏れを警告します。

- [ローカル起動・環境変数・デプロイ・検証](docs/guide/ja/development.md)
- [構成と開発方針（English）](docs/architecture.md)
- [実験資料](material/README.md)
- [EMH の原資料と実施条件](docs/experiments/emh.md)
- [Judgment の原典・実施範囲・制約](docs/upstream/judgment/README.md)
- [移行・検証記録（English）](docs/releases/unified-platform-migration.md)

[GitHub・問い合わせ](https://github.com/DKshawn/Exp-all-in-one/issues) · [Vercel プロジェクト](https://vercel.com/dkshawns-projects/exp-all-in-one)
