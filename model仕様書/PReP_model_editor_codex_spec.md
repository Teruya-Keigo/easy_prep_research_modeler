# PRePモデルエディタ MVP 実装仕様書

## 0. この仕様書の使い方

この文書は、Codex に渡してそのまま実装を開始できる粒度で、PRePモデルを自作するための小規模なWebエディタを定義したものである。

実装対象は、既存の PReP Studio の完全な再現ではない。今回の研究で必要な次の作業を、短時間で行えることを目的とする。

- PRePモデルを新規作成する
- 成果物、プロセス、ゴールを配置する
- 入力関係と同期関係を結ぶ
- 研究用の意味関係を付与する
- 成果物の状態と属性を記録する
- 保証連鎖と変更影響を確認する
- モデルを保存、復元、画像出力する

この仕様書の最後に、Codexへそのまま渡す実装依頼文を記載する。

---

## 1. 作成するツール

### 1.1 仮称

**PReP Research Modeler**

### 1.2 一文説明

PRePの成果物中心記法に基づいて、プロセスゴール、成果物、成果物間関係を視覚的に編集し、保証連鎖と変更影響を確認できる、ブラウザ完結型の研究用モデルエディタである。

### 1.3 想定利用者

- PRePを用いて研究プロセスやテスト設計プロセスを記述する研究者
- 今回の研究で、制約付き多ラベル分類システムのテスト設計モデルを作成する本人

### 1.4 初版の到達点

初版では、以下を満たせば完成とする。

1. ゼロからモデルを作成できる
2. PRePの4種類の成果物を配置できる
3. 入力関係と同期関係を描ける
4. 成果物の状態、属性、説明、内外区分を編集できる
5. 研究用の6種類の意味関係を関係線に付与できる
6. モデルの妥当性を検査できる
7. 保証連鎖と変更影響をハイライトできる
8. JSONによる保存・読込ができる
9. PNGまたはSVGで図を出力できる
10. 「制約付き多ラベル分類システムのテスト設計」テンプレートを読み込める

---

## 2. 情報源から固定した設計原則

### 2.1 成果物中心で記述する

PRePは、処理手順ではなく、業務の目的から見た意味的なまとまりである成果物を中心にプロセスを記述する。

したがって、初版ではタスク、分岐、イベントを中心にしたBPMN風エディタにはしない。キャンバス上の主役は成果物とその関係である。

根拠：

- `EA演習（Day02）.pdf`, pp.24-32：タスク視点と成果物視点の比較
- `EA演習（Day02）.pdf`, pp.35-39：成果物を「業務の目的的観点から見た意味的なまとまり」「管理されているもの」と定義
- `01-prep_goal_reframed.md`, §3：テスト設計研究を成果物ネットワークとして扱う方針

### 2.2 PReP標準の線種と研究用意味関係を分離する

講義資料で示される成果物間関係は、次の2種類である。

| PReP標準関係 | 表示 | 意味 |
|---|---|---|
| 入力関係 | 実線・有向 | 入力元から入力先へパラメータ値が入力される |
| 同期関係 | 点線・双方向 | 両成果物のパラメータ値が相互に関係して決定される |

一方、研究メモでは、保証連鎖や変更影響を表す6種類の関係が定義されている。

- `derives-from`
- `justifies`
- `mitigates`
- `approves`
- `monitors`
- `requires-revalidation-of`

これらを同じ列挙型へ混在させると、PReP標準記法と研究上の拡張を区別できなくなる。そのため、関係データは次の2階層で保持する。

- `prepType`: PReP標準の線種
- `semanticType`: 研究上の意味ラベル

根拠：

- `EA演習（Day02）.pdf`, p.41：入力関係と同期関係
- `02-prep_research_reframed_plan.md`, §7, §14.4：研究で用いる6種類の関係

### 2.3 成果物の種類を見た目で区別する

成果物は次の4種類を持つ。

| 種類 | 用途 | 表示規則 |
|---|---|---|
| 中間成果物 | プロセス内部で生成・利用される通常成果物 | 実線枠、白背景 |
| 最終成果物 | 対象プロセス外へ出力される成果物 | 実線枠、灰色背景 |
| マイルストーン成果物 | 品質管理ゲート、確認・承認、チェックポイント | 実線枠、上部に青い帯 |
| 無実体成果物 | 判断・知見など、管理されていない状態の成果物 | 点線枠、白背景 |

根拠：

- `EA演習（Day02）.pdf`, p.40：4種類の成果物と定義
- `04-PReP-.md`, §6.1-6.2：サブゴールとマイルストーン成果物の対応

### 2.4 成果物の状態は時系列ではなく質的変化として扱う

成果物の状態は、時間の経過ではなく、別の成果物が入力されることによる情報の質的変化を表す。

したがって、状態は自由記述の単一フィールドに限定せず、同一成果物について複数の状態を並べられる構造にする。ただし初版UIでは、ノード右側のプロパティ欄で状態を追加・削除する簡易操作でよい。

根拠：

- `EA演習（Day02）.pdf`, p.42：成果物の状態の定義

### 2.5 システム、プロセス、成果物の階層を持つ

モデル全体にはシステム名とシステムゴールがあり、システムは1つ以上のプロセスから構成され、プロセスは1つ以上の成果物を持つ。

処理モデルの詳細はPRePモデルから切り離す。初版でタスクフロー、業務ロジック、BPMNイベントを実装しない理由はここにある。

根拠：

- `EA演習（Day02）.pdf`, p.43：システム、プロセス、成果物、処理モデルの基本構成
- `EA演習（Day03）.pdf`, p.6：プロセスゴール、要求、出力、入力先プロセスの基本構造

### 2.6 リスク分析、As-is、To-beをモデルの表示モードとして扱う

リスク分析では、無実体成果物や同期関係など、点線で表現される箇所に潜在リスクが存在するという考え方が示されている。また、As-isモデルから問題箇所を分析し、To-beモデルとシステム要件へ接続する流れが示されている。

初版では完全なAs-is/To-be差分管理は行わないが、次の属性と表示機能を設ける。

- モデルの `phase`: `as-is | to-be | unspecified`
- 成果物または関係の `riskLevel`: `none | low | medium | high`
- リスク表示モード：リスクがある要素だけを強調

根拠：

- `EA演習（Day02）.pdf`, pp.45-47：リスクの可視化、原因分析、As-isからTo-beへの改善
- `EA演習（Day04）.pdf`, pp.8-15：As-isモデル、リスク分析、To-be設計、システム追加

---

## 3. 初版で実装しないもの

短期間で完成させるため、以下は初版の対象外とする。

- ユーザアカウント
- クラウド保存
- 同時共同編集
- コメント、承認ワークフロー
- BPMNファイルのインポート・変換
- PReP Studio独自ファイルとの互換性
- IPM作成
- 制約充足判定
- 組み合わせテストケース生成
- テストスイート選定
- 実テスト実行
- 自然言語からのモデル自動生成
- 完全なAs-is/To-be差分管理

`05-tool_and_reducible_artifacts_summary.md` に記載されたIPM作成、制約検査、テストケース生成、選定支援は、PRePモデルを利用する後続のドメインツールである。本エディタ初版へ混在させない。

---

## 4. 画面構成

### 4.1 全体レイアウト

デスクトップ利用を優先し、次の3カラム構成とする。

| 領域 | 幅の目安 | 内容 |
|---|---:|---|
| 左サイドバー | 240px | ノード追加、テンプレート、表示モード |
| 中央キャンバス | 可変 | モデル編集 |
| 右プロパティ | 320px | 選択要素の編集、検証結果 |

画面上部にツールバーを置く。

### 4.2 上部ツールバー

左から次の操作を配置する。

- 新規
- 元に戻す
- やり直す
- 自動整列
- 検証
- 保証連鎖
- 変更影響
- JSON読込
- JSON保存
- PNG出力
- SVG出力

モデル名と保存状態も表示する。

### 4.3 左サイドバー

#### モデル要素

- プロセス
- 中間成果物
- 最終成果物
- マイルストーン成果物
- 無実体成果物
- 外部プロセス

クリックまたはドラッグ＆ドロップで追加する。

#### テンプレート

- 空のモデル
- 制約付き多ラベル分類システムのテスト設計
- コーヒーを淹れるプロセス

初版で完全な内容が必要なのは、最初の2つである。コーヒー例は最小の動作確認用でよい。

#### 表示

- 通常
- リスク
- 保証連鎖
- 変更影響

### 4.4 中央キャンバス

必要な操作は次のとおり。

- ノードの移動
- 複数選択
- Deleteキーによる削除
- 端点ドラッグによる関係作成
- ズーム
- パン
- 全体表示
- ミニマップ
- スナップグリッド
- ノードのリサイズ

接続時には関係作成ダイアログを開き、次を選択する。

1. PReP標準関係
   - 入力関係
   - 同期関係
2. 研究用意味ラベル
   - なし
   - `derives-from`
   - `justifies`
   - `mitigates`
   - `approves`
   - `monitors`
   - `requires-revalidation-of`
3. 説明

### 4.5 右プロパティパネル

#### モデル未選択時

- モデル名
- システム名
- システムゴール
- フェーズ
- 作成者
- 更新日

#### プロセス選択時

- 名称
- ゴール
- 責任主体
- 技術
- リソース
- 説明

#### 成果物選択時

- 名称
- 種類
- 説明
- 内外区分
- 状態一覧
- 属性一覧
- 責任主体
- リスクレベル
- リスク説明
- 次工程名

`次工程名` は最終成果物のときだけ表示する。

#### 関係選択時

- PReP標準関係
- 研究用意味ラベル
- 説明
- リスクレベル
- リスク説明

---

## 5. 視覚表現

### 5.1 成果物ノード

共通仕様：

- 角丸矩形
- 上段：名称
- 下段：現在状態
- 下端：成果物であることを示す短い水平線
- 選択時は青いアウトライン
- リスクレベルが高い場合は右上に警告アイコン

種類別仕様：

```text
中間成果物：
  border: 1.5px solid #374151
  background: #ffffff

最終成果物：
  border: 1.5px solid #111827
  background: #e5e7eb

マイルストーン成果物：
  border: 1.5px solid #2563eb
  background: #ffffff
  header: #dbeafe

無実体成果物：
  border: 1.5px dashed #6b7280
  background: #ffffff
```

### 5.2 プロセス

- 成果物を内包するグループノード
- ヘッダーにプロセス名
- ヘッダー下にゴール
- 薄い背景色
- 折り畳み可能

### 5.3 外部プロセス

- 円形またはカプセル型
- 名称のみ表示
- 対象モデルの外部であることを示す

### 5.4 関係線

| 関係 | 線 | 矢印 | ラベル |
|---|---|---|---|
| 入力関係 | 実線 | 入力先側に1つ | `semanticType` がある場合のみ中央表示 |
| 同期関係 | 点線 | 両端 | `semanticType` がある場合のみ中央表示 |

リスク表示モードでは、`medium` は橙、`high` は赤で線を強調する。

---

## 6. データモデル

### 6.1 TypeScript型

以下の型を基準に実装する。React Flow固有の座標や選択状態は、保存時に `layout` へ分離する。

```ts
export type ModelPhase = 'as-is' | 'to-be' | 'unspecified';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export type ArtifactType =
  | 'intermediate'
  | 'final'
  | 'milestone'
  | 'intangible';

export type ArtifactScope = 'internal' | 'external-input' | 'external-output';

export type PrepRelationType = 'input' | 'sync';

export type SemanticRelationType =
  | 'derives-from'
  | 'justifies'
  | 'mitigates'
  | 'approves'
  | 'monitors'
  | 'requires-revalidation-of';

export interface KeyValueAttribute {
  id: string;
  key: string;
  value: string;
}

export interface ArtifactState {
  id: string;
  name: string;
  description?: string;
  isCurrent: boolean;
}

export interface RiskInfo {
  level: RiskLevel;
  description?: string;
}

export interface PrepSystem {
  id: string;
  name: string;
  goal: string;
  phase: ModelPhase;
  author?: string;
}

export interface PrepProcess {
  id: string;
  name: string;
  goal: string;
  responsibleActor?: string;
  technology?: string;
  resources?: string[];
  description?: string;
}

export interface PrepArtifact {
  id: string;
  processId?: string;
  name: string;
  type: ArtifactType;
  scope: ArtifactScope;
  description?: string;
  states: ArtifactState[];
  attributes: KeyValueAttribute[];
  responsibleActor?: string;
  nextProcessName?: string;
  risk: RiskInfo;
}

export interface ExternalProcess {
  id: string;
  name: string;
  description?: string;
}

export interface PrepRelation {
  id: string;
  sourceId: string;
  targetId: string;
  prepType: PrepRelationType;
  semanticType?: SemanticRelationType;
  description?: string;
  risk: RiskInfo;
}

export interface NodeLayout {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface PrepModelFile {
  schemaVersion: '1.0.0';
  metadata: {
    modelId: string;
    modelName: string;
    createdAt: string;
    updatedAt: string;
  };
  system: PrepSystem;
  processes: PrepProcess[];
  artifacts: PrepArtifact[];
  externalProcesses: ExternalProcess[];
  relations: PrepRelation[];
  layout: {
    nodes: NodeLayout[];
    viewport: ViewportState;
  };
}
```

### 6.2 保存形式の方針

- 拡張子は `.prep.json`
- UTF-8
- JSONは2スペースインデント
- `schemaVersion` を必須とする
- 未知の将来フィールドは読込時に無視する
- 必須フィールド欠落時は、壊れた状態で読まずエラー一覧を表示する
- ブラウザの `localStorage` に5秒以内のデバウンスで自動保存する
- 明示的なJSON保存はブラウザからファイルをダウンロードする

React Flowはノード・エッジ・ビューポートをJSON互換形式として保存できるため、編集状態の保存・復元に適している。ただし、ドメインモデルをReact Flowの内部表現へ直接依存させず、上記 `PrepModelFile` を正とする。技術的な保存・復元方法は [React Flow公式のSave and Restore](https://reactflow.dev/examples/interaction/save-and-restore) と [ReactFlowJsonObject](https://reactflow.dev/api-reference/types/react-flow-json-object) を参照する。

---

## 7. バリデーション

### 7.1 エラー

保存は許可するが、「検証済み」とは扱わない。

| ID | 条件 | メッセージ |
|---|---|---|
| E001 | システム名が空 | システム名を入力してください |
| E002 | システムゴールが空 | システムゴールを入力してください |
| E003 | プロセスが0件 | 1つ以上のプロセスが必要です |
| E004 | プロセス名が空 | プロセス名を入力してください |
| E005 | プロセスゴールが空 | プロセスゴールを入力してください |
| E006 | 成果物が0件 | 1つ以上の成果物が必要です |
| E007 | 最終成果物が0件 | 1つ以上の最終成果物が必要です |
| E008 | 関係の参照先が存在しない | 関係が存在しない要素を参照しています |
| E009 | 同期関係の始点と終点が同一 | 同一成果物には同期関係を作成できません |
| E010 | 状態の `isCurrent` が複数 | 現在状態は1つだけ指定できます |
| E011 | JSONスキーマ不正 | 読み込んだモデル形式が正しくありません |

### 7.2 警告

| ID | 条件 | メッセージ |
|---|---|---|
| W001 | 最終成果物の次工程名が空 | 最終成果物の入力先プロセスを指定してください |
| W002 | 入力関係がない内部成果物 | この成果物には入力元がありません |
| W003 | 出力関係がない中間成果物 | この成果物は後続成果物に利用されていません |
| W004 | 無実体成果物にリスク説明がない | 管理されていない知見に伴うリスクを確認してください |
| W005 | 同期関係にリスク説明がない | 同期不整合のリスクを確認してください |
| W006 | マイルストーン成果物に入力がない | 品質ゲートの確認対象がありません |
| W007 | 高リスク要素に後続対策がない | 高リスク要素から `mitigates` または再検証関係を確認してください |
| W008 | 孤立ノード | 他の成果物との関係がありません |
| W009 | 循環した入力関係 | 入力関係に循環があります。意図した構造か確認してください |

### 7.3 検証結果の表示

- 右パネルにエラー、警告の件数を表示する
- 項目クリックで該当ノードまたは関係へ移動する
- エラーは赤、警告は黄で表示する
- 検証結果をJSONへ保存する必要はない

---

## 8. 保証連鎖表示

### 8.1 目的

研究で固定された保証連鎖を、キャンバス上で追跡できるようにする。

基本形：

```text
信頼性要求
  → 制約定義
  → テストケース集合
  → 評価基準
  → 評価結果
  → 残余リスク評価
  → 引継ぎ条件
```

根拠：

- `02-prep_research_reframed_plan.md`, §8：保証連鎖の定義

### 8.2 操作

1. ユーザが成果物を1つ選択する
2. 「保証連鎖」を押す
3. 選択成果物から上流・下流へ辿れる成果物と関係を強調する
4. それ以外を30%の不透明度にする
5. 右パネルに到達順の一覧を表示する

### 8.3 探索対象

保証連鎖では、次の `semanticType` を優先して辿る。

- `derives-from`
- `justifies`
- `mitigates`
- `monitors`

`semanticType` が付いていない場合は、`prepType = input` の向きを利用する。

### 8.4 出力

右パネルに次を表示する。

- 上流成果物
- 下流成果物
- 通過した関係
- 最終成果物まで到達できたか
- 経路上の高リスク要素

---

## 9. 変更影響表示

### 9.1 目的

要求、制約、リスク、評価基準が変更されたとき、再確認すべき成果物を特定する。

根拠：

- `02-prep_research_reframed_plan.md`, RQ3, §14.5.3：変更影響追跡性と変更シナリオ

### 9.2 操作

1. ユーザが変更元の成果物を選択する
2. 「変更影響」を押す
3. `requires-revalidation-of` を優先して下流探索する
4. 明示的な再検証関係がない場合は、入力関係の下流を「推定影響」として表示する

### 9.3 表示区分

| 区分 | 表示 |
|---|---|
| 明示的影響 | 赤 |
| 推定影響 | 橙 |
| 影響なし | 薄い灰色 |

明示的影響と推定影響を混同しない。

---

## 10. テンプレート

### 10.1 制約付き多ラベル分類システムのテスト設計

次の8成果物を初期配置する。

1. 信頼性要求
2. 制約定義
3. リスクシナリオ
4. テストケース集合
5. 評価基準
6. 評価結果
7. 残余リスク評価
8. 引継ぎ条件

定義は `02-prep_research_reframed_plan.md`, §14.3 に従う。

初期関係は、研究上の判断を固定しすぎないため、基本保証連鎖だけを入力関係として作成する。

```text
信頼性要求
  → 制約定義
  → テストケース集合
  → 評価基準
  → 評価結果
  → 残余リスク評価
  → 引継ぎ条件
```

リスクシナリオは、次の2本を追加する。

```text
リスクシナリオ → テストケース集合
リスクシナリオ → 評価基準
```

意味ラベルは空で開始し、ユーザがモデルケースに応じて決定する。

### 10.2 コーヒーを淹れるプロセス

動作確認用に次の簡単なモデルを用意する。

- システムゴール：要求品質を満たすコーヒーを提供する
- プロセス：コーヒーを淹れる
- 外部入力成果物：コーヒーの要求
- 中間成果物：計量済みコーヒー豆
- 中間成果物：抽出済みコーヒー
- 最終成果物：提供用コーヒー
- 外部プロセス：コーヒーを受け取るプロセス

根拠：

- `EA演習（Day02）.pdf`, p.50
- `EA演習（Day03）.pdf`, p.4

---

## 11. 技術構成

### 11.1 採用技術

| 用途 | 技術 |
|---|---|
| ビルド | Vite |
| UI | React + TypeScript |
| グラフ編集 | `@xyflow/react` |
| 状態管理 | Zustand |
| スキーマ検証 | Zod |
| 自動整列 | `@dagrejs/dagre` |
| アイコン | `lucide-react` |
| 画像出力 | `html-to-image` |
| テスト | Vitest + React Testing Library |
| E2E | Playwright |

React Flowは、ドラッグ、ズーム、パン、選択、要素追加・削除、カスタムノード、カスタムエッジなど、ノードベースエディタに必要な基本機能を提供するため、本MVPに適している。機能の範囲は [React Flow公式サイト](https://reactflow.dev/) と [公式Examples](https://reactflow.dev/examples) を根拠とする。

ViteはReactとTypeScriptを用いた小規模な静的Webアプリを構成できる。導入方法とビルド方法は [Vite公式ガイド](https://vite.dev/guide/) と [Static Deployガイド](https://vite.dev/guide/static-deploy) に従う。

画像出力はReact Flow公式例が使用する `html-to-image` を用いる。公式例では新しい版で出力できない既知問題が示されているため、初回実装では公式例に合わせて `html-to-image@1.11.11` を固定する。[React Flow公式Download Image例](https://reactflow.dev/examples/misc/download-image)

### 11.2 バックエンド

初版ではバックエンドを作らない。

- 静的ホスティング可能
- 個人情報を外部送信しない
- モデルはブラウザ内とダウンロードファイルで管理する
- 将来クラウド保存を追加できるよう、保存処理は `ModelRepository` インターフェースで分離する

### 11.3 ブラウザ

最新版のChromeを主対象とする。Safariでも基本編集とJSON保存・読込が動くことを確認する。

---

## 12. 推奨ファイル構成

```text
prep-research-modeler/
├── README.md
├── package.json
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/
│   │   └── global.css
│   ├── domain/
│   │   ├── model.ts
│   │   ├── schema.ts
│   │   ├── validation.ts
│   │   ├── assuranceTrace.ts
│   │   └── impactAnalysis.ts
│   ├── store/
│   │   └── modelStore.ts
│   ├── editor/
│   │   ├── ModelCanvas.tsx
│   │   ├── nodeTypes.ts
│   │   ├── edgeTypes.ts
│   │   ├── nodes/
│   │   │   ├── ProcessNode.tsx
│   │   │   ├── ArtifactNode.tsx
│   │   │   └── ExternalProcessNode.tsx
│   │   └── edges/
│   │       ├── InputEdge.tsx
│   │       └── SyncEdge.tsx
│   ├── components/
│   │   ├── Toolbar.tsx
│   │   ├── Palette.tsx
│   │   ├── PropertyPanel.tsx
│   │   ├── ValidationPanel.tsx
│   │   └── RelationDialog.tsx
│   ├── services/
│   │   ├── modelRepository.ts
│   │   ├── localStorageRepository.ts
│   │   ├── jsonFileService.ts
│   │   ├── imageExportService.ts
│   │   └── autoLayoutService.ts
│   ├── templates/
│   │   ├── constrainedMlcTesting.ts
│   │   └── coffeeProcess.ts
│   └── test/
│       └── fixtures.ts
├── e2e/
│   └── editor.spec.ts
└── public/
```

---

## 13. 実装順序

### Phase 1：モデルと最低限のキャンバス

1. Vite + React + TypeScriptを初期化
2. `PrepModelFile` とZodスキーマを実装
3. React Flowキャンバスを表示
4. 成果物ノード4種類を実装
5. 入力関係と同期関係を実装
6. ノードと関係の追加、移動、削除を実装

完了条件：

- 空のキャンバスから3つの成果物を作り、入力関係と同期関係を結べる

### Phase 2：編集と保存

1. プロパティパネルを実装
2. システムとプロセスのゴールを編集可能にする
3. 状態と属性を編集可能にする
4. JSON保存・読込を実装
5. `localStorage` 自動保存を実装
6. Undo/Redoを実装

完了条件：

- ページ再読込後も編集内容を復元できる
- ダウンロードした `.prep.json` を再読込できる

### Phase 3：研究支援機能

1. 研究用意味ラベルを実装
2. バリデーションを実装
3. 保証連鎖表示を実装
4. 変更影響表示を実装
5. リスク表示モードを実装
6. テンプレートを実装

完了条件：

- 8成果物テンプレートから保証連鎖と変更影響を確認できる

### Phase 4：出力と仕上げ

1. 自動整列
2. PNG出力
3. SVG出力
4. キーボード操作
5. E2Eテスト
6. README

完了条件：

- 研究資料へ貼り付け可能な画像を出力できる
- 新規作成から保存・復元までのE2Eテストが通る

---

## 14. 受入条件

### AC01：新規モデル

Given：アプリを初めて開いた  
When：「空のモデル」を選ぶ  
Then：システム名、ゴール、1つの空プロセスを持つ編集画面が開く

### AC02：4種類の成果物

Given：編集画面を開いている  
When：4種類の成果物を1つずつ追加する  
Then：種類ごとに指定された枠線と背景で表示される

### AC03：入力関係

Given：成果物Aと成果物Bがある  
When：AからBへ入力関係を作る  
Then：AからBへの実線矢印が表示される

### AC04：同期関係

Given：成果物Aと成果物Bがある  
When：AとBへ同期関係を作る  
Then：AとBの間に点線の双方向矢印が表示される

### AC05：意味ラベル

Given：入力関係がある  
When：`requires-revalidation-of` を選ぶ  
Then：線の中央に意味ラベルが表示され、JSONにも保存される

### AC06：保存と復元

Given：5ノード、4関係のモデルがある  
When：JSON保存後に新規モデルを開き、保存JSONを読み込む  
Then：名称、種類、状態、属性、関係、座標、ズームが復元される

### AC07：バリデーション

Given：最終成果物がない  
When：「検証」を押す  
Then：`E007` が表示され、クリックするとモデル全体へフォーカスする

### AC08：保証連鎖

Given：8成果物テンプレートを開いている  
When：「信頼性要求」を選択して「保証連鎖」を押す  
Then：「引継ぎ条件」までの関係要素が強調される

### AC09：変更影響

Given：「制約定義」から「テストケース集合」へ `requires-revalidation-of` がある  
When：「制約定義」を選択して「変更影響」を押す  
Then：「テストケース集合」が明示的影響として赤く表示される

### AC10：画像出力

Given：モデルを編集している  
When：PNGまたはSVG出力を押す  
Then：キャンバス全体を含む画像がダウンロードされる

---

## 15. テスト方針

### 15.1 単体テスト

最低限、次をテストする。

- Zodスキーマの正常・異常入力
- 最終成果物がない場合の `E007`
- 孤立成果物の `W008`
- 入力関係の循環検出
- 保証連鎖の上流・下流探索
- `requires-revalidation-of` の推移的探索
- 明示的影響と推定影響の区別
- テンプレートのノード数と関係数

### 15.2 コンポーネントテスト

- 成果物種別ごとの見た目
- プロパティ変更がストアへ反映される
- 関係作成ダイアログ
- 検証項目クリック時のフォーカス

### 15.3 E2E

1. 空モデルを開く
2. 成果物を追加する
3. 関係を作る
4. 名称を編集する
5. JSONを保存する
6. 新規モデルへ切り替える
7. JSONを読み込む
8. 復元を確認する
9. テンプレートを開く
10. 保証連鎖と変更影響を確認する

---

## 16. 実装時の判断ルール

1. 資料にない独自記号を勝手に追加しない
2. PReP標準の `prepType` と研究用の `semanticType` を分離する
3. タスクフローを中心にしない
4. 保存データの正は `PrepModelFile` とする
5. React Flow固有のデータをドメイン層へ漏らさない
6. 明示的関係と推定関係をUI上で区別する
7. 入力不足はエラーまたは警告として見せ、暗黙に補完しない
8. テンプレートは通常のモデルデータとして持ち、専用コードを増やさない
9. 研究用サンプルの文言は日本語で用意する
10. READMEに起動方法、操作方法、保存形式を記載する

---

## 17. Codexへそのまま渡す実装依頼文

以下を新しいCodexセッションへ貼り付け、この仕様書を添付する。

```text
添付した「PReP_model_editor_codex_spec.md」に従い、PReP Research Modeler のMVPを実装してください。

目的は、PRePの成果物中心記法に基づいてモデルを作成し、保証連鎖と変更影響を確認できるブラウザ完結型Webエディタを作ることです。

作業方針：
1. 最初にリポジトリ内を確認し、既存コードがなければ Vite + React + TypeScript で初期化してください。
2. 仕様書のPhase 1から順に実装してください。
3. PReP標準の prepType と、研究用拡張の semanticType は必ず別フィールドにしてください。
4. 保存形式の正は仕様書の PrepModelFile とし、React Flow内部表現へ直接依存させないでください。
5. 初版ではバックエンド、ログイン、共同編集、BPMN変換、テストケース生成は実装しないでください。
6. 各Phaseの完了時に、型チェック、単体テスト、ビルドを実行してください。
7. 最後にPlaywrightで主要操作を確認し、READMEへ起動方法と操作方法を記載してください。
8. 仕様に曖昧さがある場合は、短期間で完成できる方を選び、その判断をREADMEの「設計判断」に記録してください。

必須受入条件：
- 4種類の成果物ノード
- 入力関係と同期関係
- 6種類の研究用意味ラベル
- システム、プロセス、成果物の編集
- 状態、属性、リスク情報の編集
- JSON保存・読込と自動保存
- バリデーション
- 保証連鎖表示
- 変更影響表示
- 制約付き多ラベル分類システムのテンプレート
- PNGまたはSVG出力
- 単体テスト、E2E、ビルド成功

まず実装計画と作成・変更予定ファイルを示し、その後は承認待ちにせず実装と検証まで進めてください。
```

---

## 18. 参照情報源

### 提供資料

- `EA演習（Day02）.pdf`
  - pp.24-32：業務プロセス記述法、タスク視点と成果物視点
  - pp.34-43：PRePモデルの構成、成果物、成果物種別、関係、状態、基本構成
  - pp.45-47：リスク可視化、原因分析、As-is/To-be
  - p.50：コーヒーを淹れるプロセス
- `EA演習（Day03）.pdf`
  - p.4：コーヒープロセス課題
  - p.6：生産的活動プロセスの基本構造
  - p.9：プロセスゴール、要求、入力先、リソースの分析観点
- `EA演習（Day04）.pdf`
  - pp.8-15：As-isモデル、リスク分析、To-be設計、システム要件とシステム追加
- `01-prep_goal_reframed.md`
  - 研究目的、成果物ネットワーク、RQ
- `02-prep_research_reframed_plan.md`
  - 最小成果物集合、6種類の関係、保証連鎖、変更影響評価
- `04-PReP-.md`
  - 単一アクター版モデル、外部入力、内部生成成果物、マイルストーン
- `05-tool_and_reducible_artifacts_summary.md`
  - 将来のテストスイート生成・選定支援ツールと、独立管理する成果物の整理

### 実装技術の公式資料

- [React Flow公式](https://reactflow.dev/)
- [React Flow Examples](https://reactflow.dev/examples)
- [React Flow Save and Restore](https://reactflow.dev/examples/interaction/save-and-restore)
- [React Flow Download Image](https://reactflow.dev/examples/misc/download-image)
- [Vite公式ガイド](https://vite.dev/guide/)
- [Vite Static Deploy](https://vite.dev/guide/static-deploy)

