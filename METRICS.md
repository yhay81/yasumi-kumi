# Metrics

許可するイベントは `visited`、`recommended`、`leave_selected`、`plan_copied`、`calendar_downloaded`、`saved`、`returned` です。

各行にはランダムなブラウザUUIDのSHA-256、許可済みイベント名、QAフラグ、時刻だけを保存し、35日後に削除します。年、休暇日数、選択した日付、候補内容、IPアドレス、広告識別子はスキーマにありません。

本番は `npm run metrics`、ローカルは `pwsh -File ops/product-metrics.ps1 -Local` で確認します。利用者数は `is_qa = 0` の異なる端末IDだけを数え、自動QAは利用者に含めません。
