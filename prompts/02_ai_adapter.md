# Prompt: AI Adapter Design

AI連携の土台を設計してください。

## 目的
API従量課金を前提にせず、ユーザー自身が契約しているCLIやローカルLLMを使えるようにする。

## 対応予定
- MockAIAdapter
- CodexCLIAdapter
- ClaudeCodeCLIAdapter
- OllamaAdapter
- FutureApiAdapter

## 要件
- エディタ本体はAIアダプタを直接知らない
- `sendInstruction(documentContext, instruction)` のような共通インターフェイスを定義する
- AI応答は即本文へ反映しない
- AI提案は preview / apply / reject の状態を持つ
- 外部送信の有無をUIで表示できるようにする
