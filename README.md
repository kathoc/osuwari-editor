# DraftPilot Editor Prototype Spec Pack

## 目的
このリポジトリは、AI支援型の原稿執筆エディタを Codex CLI / Claude Code CLI に試作させるための仕様書・プロンプト集です。

このアプリの核は「AI文章生成ツール」ではありません。爆速で気持ちよく原稿を書き、必要に応じてAI・校正・事実確認・画像キャプション・IDML/PDF照合へ自然に広がる、軽いテキストエディタです。

## アプリ名とアイコン
- アプリ名は「おすわりエディタ」（osuwari editor）
- アイコンはicon/icon.pngを使用

## 最重要コンセプト
- 起動したら、すぐ書ける。
- 書いている最中は邪魔しない。
- AIは勝手に本文を壊さない。
- 草稿では楽しく暴走できる。
- 商用品質の確認工程では根拠と履歴を残す。
- 原稿を専用Vaultへ閉じ込めない。
- 元ファイルを壊さない。
- 落ちても直前状態へ戻る。

## 初期実装方針
最初はローカルWebアプリとして作る。ネイティブアプリ化は後回し。

推奨構成：
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express/Fastify
- DB: SQLite
- Local cache: IndexedDB または browser local storage
- AI連携: まずはモック。後で Codex CLI / Claude Code CLI / Ollama に接続
- 起動: `npm run dev` で localhost 起動

## 第1弾で作るもの
第1弾は「書き心地の検証」が目的です。IDML/PDF/高度AIは仕様だけ残し、実装は後回し。

実装する：
- テキストエディタ画面
- チャット欄
- 段落文字数表示
- 仮想行幅プレビュー（例：30W×4L）
- リアルタイム軽量ハイライト
- 50文字以降からの遅延型解析
- 超高頻度の差分保存
- 起動後すぐ書ける遅延ロード設計
- 文字サイズ・行間・テーマ切替
- 草稿モードと編集モードの分離

後回し：
- IDML編集
- PDF注釈書き出し
- Web事実確認
- 企画書参照
- 画像キャプション管理
- ローカルLLM本接続
- 課金制御

## 使い方
Codex CLI / Claude Code CLI に `prompts/00_master_prompt.md` を最初に渡してください。
その後、`tasks/` 内のタスクを順番に実装させます。

## 注意
この仕様は「完成版」ではありません。まずは手触りを検証するための試作です。機能の多さより、起動速度・入力の軽さ・保存の強さを優先してください。
