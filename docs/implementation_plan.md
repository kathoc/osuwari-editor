# Implementation Plan (MVP 第1弾)

## 進め方
当面フロントのみ（Vite + React + TS）。永続化は localStorage。Node/SQLite は後フェーズで追加できる構造を保つ。

## 実装順序
1. プロジェクト初期化（Vite + React + TS、`npm run dev`）
2. レイアウト骨組み：左=Editor、右=Chat、下=StatusBar
3. エディタ最小：`<textarea>` ベース。即入力可。段落文字数表示。
4. 仮想行幅プレビュー（30W×4L、全角=1/半角=0.5、表示折返しのみ）
5. 軽量解析（50文字以降。句読点重複・語尾連続・同一語連続）
6. 差分ログ保存（localStorage、操作キュー）。カーソル/スクロール復帰。
7. AI Mock アダプタ。チャット欄からプレビュー/実行/破棄。本文へ即反映しない。
8. 設定：フォントサイズ・行間・テーマ（light/dark/system）、草稿/編集モード。

## ファイル構成
```
osuwari-editor/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    styles.css
    components/
      Editor.tsx
      ChatPanel.tsx
      StatusBar.tsx
      SettingsBar.tsx
      VirtualPreview.tsx
      HighlightOverlay.tsx
    lib/
      analyze.ts        # 50文字以降の軽量解析
      width.ts          # 全角/半角幅計算
      storage.ts        # 差分ログ＋スナップショット(localStorage)
      ai/mockAdapter.ts # AI Mock 差し替え可能I/F
      types.ts
    hooks/
      useDocument.ts
      useDeferredAnalyze.ts
      useTheme.ts
```

## データモデル骨子（フロント版）
- `Document { id, title, content, mode, updatedAt }`
- `EditOp { id, ts, type, before, after, source }`
- `AIProposal { id, instruction, proposalText, status }`
- `Profile { fontSize, lineHeight, theme, virtual:{ widthChars, maxLines } }`

## 未実装機能のスタブ方針
- IDML/PDF/事実確認/画像キャプション/Ollama: 触らない。UIにも露出させない。
- AI: `AIAdapter` インタフェース。Mockのみ実装。後でCLI/APIに差し替え。
- 永続化: `storage.ts` を `save/load/appendOp` のAPIに閉じる。後でNode/SQLiteに差し替え可。

## 非機能
- 起動時に重い import を持ち込まない。解析は `requestIdleCallback`/debounce で後ろ倒し。
- 入力イベントと AI/解析を同期しない。
