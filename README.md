# observer-proto

最小プロトタイプ（Vite + TypeScript + Canvas）

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
