# lambda-durable-functions-human-in-loop

![img](architecture.drawio.png)

ソース解説記事はこちら

https://dev.classmethod.jp/articles/shuntaka-durable-functions-slack-approval/

```bash
# Durable Functionが利用可能なオハイオリージョンを選択
export AWS_REGION=us-east-2

# CDKオハイオ使ってない場合が多いと思いますので、初期化
pnpm cdk bootstrap

export AWS_REGION=us-east-2
# AWS資格情報取得

export SLACK_BOT_TOKEN="xoxb-xxx"
pnpm run deploy
# → NodejsFunctionがまだDurable Functionをサポートしていないため、`pnpm run deploy `時に turboで lambda/durable のビルドがデプロイ前に実行されるようにしています
```


