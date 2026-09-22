<div align="center">
  <img src="public/icon-128.png" alt="Jev Tab Order" width="96" height="96">

# Jev Tab Order

[English](README.md) | [日本語](README.ja.md)

</div>

[Jev](https://typesafe.ai/)を利用し、現在のウィンドウのタブとグループを意味や指定した並べ替えルールに沿って整理するChrome拡張機能です。固定タブと既存グループの所属を維持します。

**Jev APIへの呼び出し1回で、ウィンドウ全体を整理。** タブ数にかかわらず、グループ分けと並び順をまとめて判断します。

## 使い始める

1. [手動インストール](#手動インストール)に従って拡張機能を読み込みます。Chrome Web Storeではまだ公開していません。
2. 拡張機能の設定を開き、TypeSafe JevのAPIキーを保存します。
3. 整理したいウィンドウでツールバーのアイコンをクリックします。ポップアップは開かず、アイコンに実行中は「…」、完了時は「✓」を表示し、完了から3秒後にバッジが消えます。ページの右クリックメニューや設定済みショートカットからも実行できます。

[対応言語](locales/)を参照してください。

### 設定

- **Jev APIキー**：この端末だけに保存します。API利用料が発生する場合があります。整理・プレビュー1回につきJevへのリクエストは最大1回です。元に戻す操作では送信しません。
- **並べ替えルール**：空欄なら既定ルールを使用します。入力すると既定ルール全体を置き換えます。例：「公式ドキュメントを先に、その後に解説記事。グループは開発、調査、個人の順。新しいグループは作らない。」
- **新規グループを許可**：この設定とルールの両方で許可され、関連する未所属タブが複数あり、命名用のChrome内蔵AIが利用できる場合に作成します。初回ダウンロードが必要な場合は設定画面の準備ボタンを押してください。

## 仕組み

拡張機能がウィンドウのタブ情報を集め、Jevに判断を依頼し、その回答から配置を組み立ててChromeに反映します。

1. **情報を集める — 拡張機能：** タブのタイトル、URL、現在の位置、グループへの所属を取得し、ルールとグループ名を合わせて準備します。固定タブはJevへの入力から除外し、ページ本文は読みません。URLの認証情報・クエリ・フラグメントは送信前に除去します。
2. **意味を判断する — Jev：** 「未所属タブをどの既存グループに追加するか」「どのタブやグループを隣接させるか」「ルール上、どれを前方・後方に配置するか」「新規グループ作成をルールが許可しているか」を、**1回のAPI呼び出しでまとめて判定**します。選択肢にはドメインやグループ名も添えます。回答は選択結果や優先度の数値で返り、選択確率と確信度も含まれます。
3. **配置を組み立てる — 拡張機能：** 採用した選択結果から未所属タブの追加先を決め、関連する項目を隣接するまとまりにします。その内部とまとまり同士を、Jevの優先度が小さい順に並べます。採用基準を下回る回答は使わず、同順位なら元の順序を維持し、有効な優先度がない項目はそのソート段階での位置を保ちます。この計算は端末内で行い、Jevを追加で呼び出しません。
4. **新規グループに名前を付ける — 有効な場合のみChromeのローカルAI：** 設定とJevの判断の両方が許可していれば、関連する未所属タブから新規グループを作れます。名前はタブのタイトルをもとにChrome内蔵AIが生成します。命名できなければ、新規グループを作らず隣接した状態にします。
5. **検証して反映する — 拡張機能：** タブの欠落や重複がなく、固定タブと既存グループの所属を維持できる計画かを確認し、Chrome APIでタブとグループを移動します。プレビューでは適用前で止まり、元に戻す操作ではJevを呼ばずに保存済みの配置を復元します。

たとえば、Jevが未所属タブの追加先として「GitHub」を選び、その回答が採用基準を満たした場合、拡張機能が既存のGitHubグループへタブを追加します。意味の判断をJevが担当し、ブラウザ上の操作を拡張機能が担当します。

### Jevに送るリクエストの内容

公式の `@typesafe-ai/sdk` を使い、`POST https://api.typesafe.ai/v1/systemone` に、`model: "jev-latest"` を指定してJSONを送ります。本文は共通の判断材料（`state`）と複数の質問（`questions`）で構成します。**API呼び出しは1回ですが、その中に複数の質問をまとめて入れています。**

- **`state` — 判断材料：** 適用するルール、WebタブのID・タイトル・加工済みURL・グループへの所属、既存グループの名前と所属タブのID、グループと未所属タブの現在の並びを渡します。タブの詳細情報は各質問で共有します。
- **`questions` — 判定してほしいこと：** 各質問に、`type`（ChoiceかScore）、`instructions`（ルールに従って何を判断するか）、`criteria`（選択肢または順序付きの評価段階）を指定します。

| 判定内容                                       | 種類                   | 求める回答                                                                                                        |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 各未所属タブの追加先                           | **Choice**（`choice`） | 名前を添えた既存グループのID、または未所属のままにする `none`                                                     |
| 隣接させるタブ                                 | **Choice**（`choice`） | ドメインを添えた前方の候補タブのID、または該当なしの `self`。候補は同じ既存グループ内、または未所属タブ同士に限定 |
| 隣接させるグループ・未所属タブ                 | **Choice**（`choice`） | グループ名やドメインを添えた前方の候補のID、または別々にする `self`                                               |
| 各タブ、およびグループ・未所属タブの配置優先度 | **Score**（`score`）   | 「最も前・前・中間／順序指定なし・後・最も後」の5段階によるスコア                                                 |
| 新規グループ作成の可否（設定で有効な場合）     | **Choice**（`choice`） | ルール上、作成してよいかを `yes` / `no` で回答                                                                    |

Choiceでは選んだIDが `choice` に返り、拡張機能がタブ同士の関連付けや追加先の決定に使います。Scoreでは **0〜4の数値**（小数を含む）が返り、これをソートの優先度として使います。最終的なタブの位置番号ではありません。どちらも `probabilities`（各選択肢・段階の確率）と `confidence`（確信度）が付き、拡張機能が採用前に確認します。Scoreには段階番号と説明を対応させる `legend` も含まれます。

### 最小限のリクエスト・レスポンス例

タブ `1` が既存のGitHubグループに所属し、タブ `2` が未所属のドキュメントページである例です。短いカスタムルールを使い、1回のリクエストから追加先のChoiceと優先度のScoreの2問だけを抜粋しています。実際には、ほかの並び順や隣接関係の質問も必要に応じて含めます。

**リクエスト本文：**

```json
{
  "model": "jev-latest",
  "state": {
    "rules": "Add GitHub tabs to the GitHub group. Put documentation first.",
    "tabs": [
      {
        "id": "1",
        "title": "GitHub",
        "url": "https://github.com/",
        "groupId": 7
      },
      {
        "id": "2",
        "title": "GitHub Docs",
        "url": "https://docs.github.com/",
        "groupId": -1
      }
    ],
    "groups": [
      {
        "key": "group_7",
        "title": "GitHub",
        "tabIds": ["1"]
      }
    ],
    "blocks": [
      {
        "key": "group_7",
        "title": "GitHub",
        "tabIds": ["1"]
      },
      {
        "key": "topic_2",
        "title": "",
        "tabIds": ["2"]
      }
    ]
  },
  "questions": {
    "membership_2": {
      "type": "choice",
      "instructions": "According to state.rules, select an existing group for ungrouped tab 2 (Domain: docs.github.com), or none.",
      "criteria": {
        "none": "Keep ungrouped",
        "group_7": "Group name: \"GitHub\""
      }
    },
    "rank_tab_2": {
      "type": "score",
      "instructions": "Rate the position of tab 2 (Domain: docs.github.com) within its group according to state.rules; earlier is lower. Use the middle level if no order is specified.",
      "criteria": [
        "Earliest priority under the rules",
        "Early priority under the rules",
        "Middle priority or no distinguished order under the rules",
        "Late priority under the rules",
        "Latest priority under the rules"
      ]
    }
  }
}
```

**レスポンス例（`answers` のみ抜粋）：** 数値は形式を説明するための架空の値です。実測結果や、必ず返る回答ではありません。

```json
{
  "answers": {
    "membership_2": {
      "type": "choice",
      "choice": "group_7",
      "confidence": 1,
      "probabilities": {
        "none": 0,
        "group_7": 1
      }
    },
    "rank_tab_2": {
      "type": "score",
      "score": 0,
      "confidence": 1,
      "probabilities": {
        "0": 1,
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0
      },
      "legend": {
        "0": "Earliest priority under the rules",
        "1": "Early priority under the rules",
        "2": "Middle priority or no distinguished order under the rules",
        "3": "Late priority under the rules",
        "4": "Latest priority under the rules"
      }
    }
  }
}
```

拡張機能は質問のキーと回答を対応させます。この例では `membership_2.choice` がグループ `7` を選び、選択確率と確信度が採用基準を満たすため、タブ `2` をそこへ追加します。`rank_tab_2.score: 0` は「最も前」の優先度です。実際の配置はほかのタブへの回答も使ってローカルで計算するため、この値だけで「タブの位置番号0へ移動する」という意味にはなりません。

## プライバシー

[プライバシーポリシー](PRIVACY.md)を参照してください。

## 開発

### 環境構築

[package.json](package.json)の対応範囲のNode.jsを使用してください。[CIワークフロー](.github/workflows/test.yml)ではNode.js 24を使用しています。プロジェクトディレクトリで実行します。

```fish
npm ci
```

### 主なコマンド

```fish
npm run dev          # ホットリロード対応のChrome開発モードを起動
npm run build        # Chrome拡張機能をビルド
npm run typecheck    # TypeScriptの型チェック
npm run lint:check   # ファイルを変更せずlintを確認
npm run format:check # ファイルを変更せず整形を確認
```

### 手動インストール

環境構築を完了してから実施します。

1. `npm run build`を実行します。
2. Chromeで`chrome://extensions`を開き、**デベロッパーモード**を有効にします。
3. **パッケージ化されていない拡張機能を読み込む**から`dist/chrome-mv3`を選択します。
4. 拡張機能の設定を開き、APIキーを入力して**設定を保存**をクリックします。

再ビルド後は、`chrome://extensions`から拡張機能を再読み込みして更新を反映してください。

### 単体テスト

```fish
npm run test:unit
```

### E2Eテスト

初回実行前にPlaywrightのChromiumをインストールします。

```fish
npx playwright install chromium
npm run test:e2e
```

## リリース

準備と公開の手順は[リリースガイド](.agents/skills/jev-tab-order-release/SKILL.md)、変更履歴は[CHANGELOG.md](CHANGELOG.md)を参照してください。
