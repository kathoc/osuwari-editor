# Architecture

## 初期構成
ローカルWebアプリとして実装する。

```
Browser UI (React)
  ↓
Local Web Server (Node.js)
  ↓
SQLite / File System / AI adapters
```

## 設計原則
- エディタ本体は最優先で軽くする
- AI、PDF、IDML、画像処理はオンデマンド読込
- 保存処理は最軽量で常時実行
- 重い解析はバックグラウンドキューへ回す
- 入力イベントとAI処理を絶対に同期させない

## AIアダプタ
将来的に以下を差し替え可能にする。
- Mock AI
- Codex CLI
- Claude Code CLI
- Ollama
- OpenAI API / Claude API（任意）

## 保存設計
- 原稿本文：ファイルまたはSQLite
- 編集操作ログ：SQLite
- AI提案：SQLite
- UI状態：SQLiteまたはlocalStorage
- 一時キャッシュ：IndexedDB

## ファイル設計
原稿ファイルをアプリ内に強制集約しない。開いた単一ファイルは単一ファイルとして扱う。周辺に関連ファイルがあれば候補提示する。
