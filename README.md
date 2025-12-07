# lambda-durable-functions-human-in-loop

![img](architecture.drawio.png)

## Slack Webhook を処理するサーバー Lambda の作成

- Slack からのボタン押下（webhook）を受け取る
- Durable Function のコールバックに結果を返す

```bash
# Durable Functionが利用可能なオハイオリージョンを選択
export AWS_REGION=us-east-2

# CDKオハイオ使ってない場合が多いと思いますので、初期化
pnpm cdk bootstrap

export AWS_REGION=us-east-2
# AWS資格情報取得

export SLACK_BOT_TOKEN="xoxb-xxx"
pnpm run deploy
```


