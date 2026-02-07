# observer-proto

最小プロトタイプ（Vite + TypeScript + Canvas）

## TL;DR
- 操作できるが、世界は応答しない
- クリックは「接続／切断」のみ
- 進行・攻略・成功は存在しない

## Where to touch
- src/runtime/app.ts        // 挙動・遷移・観測ロジック
- src/runtime/audio.ts      // 音（環境音／接続ノイズ）

## Usually don't touch
- src/runtime/noise.ts      // 映像ノイズ（調整時のみ）
- index.html                // 構造は固定

## Current invariants
- 前の視点には戻れない
- 進行はリンクのみ（背景クリック無効）
- 音は説明しない／意味を持たせない
- 視点移動時のみ暗転＋ノイズ

## Non-goals
- スコア / ゴール
- 分かりやすいUIフィードバック
- アニメーションらしいアニメ
- ユーザーへの説明文

## Current state (2026-02-xx)
- 接続感は成立
- ノイズは仮（後で詰める）
- 世界は1つ、拡張予定

## 目的
- メインページ：文字化けリンクだけ（境界）
- 観測地点：画像5枚（視点プリセット）を順に遷移
- 各視点：数秒ロック → 文字化けリンクが出現
- 前の視点へは戻れない
- 最終視点：メインページへ戻るしかない
- 音：籠った環境音（常時）＋ チューニング単音（音程だけ、控えめ）

## 起動
```bash
npm install
npm run dev
```

## 画像差し替え
`public/views/000.jpg` 〜 `004.jpg` を置き換える。
形式は jpg / png / webp でもOK（拡張子を合わせるか、`src/runtime/app.ts` の VIEW_URLS を変更）。

## キー
- Space / Enter：次の視点（ロック解除後）
- Esc：メインに戻る
