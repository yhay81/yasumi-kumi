# 休み組み

内閣府が公表する2026年・2027年の祝日・休日と週末を重ね、1〜5日の休暇でつくれる連休を組むウェブアプリです。

## 開発

```powershell
npm install
npm run dev
```

公開前の一括確認は `npm run release:check`、`npm run check`、`npm test`、`npm run build` です。

## データと保存

- 祝日・休日は内閣府「国民の祝日について」の公式CSVと公表ページに基づく静的データです。
- 選んだ休暇日はブラウザの `localStorage` に年ごと最大40日保存し、サーバーへ送りません。
- 匿名計測にはランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保存します。

詳細は [SOURCE.md](SOURCE.md)、[PRIVACY.md](PRIVACY.md)、[SECURITY.md](SECURITY.md) を参照してください。

## 公開先

<https://yasumi-kumi.yhay81.com>
