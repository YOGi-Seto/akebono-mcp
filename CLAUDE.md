# akebono-mcp 運用メモ

## 自動化の全体構成

```
Twitter/X
    ↓（毎日 00:00 JST）
GitHub Actions（collect-buzz.yml）
    ↓ raw_buzz.json に追記・コミット
GitHub リポジトリ
    ↓（火・木・土 09:00 JST）
Claude Schedule（CCR）
    ↓ スポット抽出・レポート生成・コミット
GitHub リポジトリ
```

### GitHub Actions（.github/workflows/collect-buzz.yml）
- **役割**: Twitter/X からバズ投稿を収集して `data/raw_buzz.json` に追記
- **スケジュール**: 毎日 00:00 JST（cron: `0 15 * * *`）
- **認証**: GitHub Secrets に X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET を設定済み
- **注意**: `permissions: contents: write` が必要（ないと git push で403エラー）

### Claude Schedule（CCR）
- **トリガーID**: `trig_01DHV3wZYAmbpBkNJ8d5YeYr`
- **役割**: スポット情報の抽出・週次サマリー・SNS下書き生成
- **スケジュール**: 火・木・土 09:00 JST（cron: `0 0 * * 2,4,6`）
- **管理画面**: https://claude.ai/code/scheduled

---

## CCR の重要な注意事項

### git clone は使わない

CCRの環境からGitHubへのgit cloneが原因不明でハングする（エラーにならず無限待機）。
ローカルや GitHub Actions からは問題なくアクセスできるが、CCRのネットワーク環境固有の問題。

**解決策: GitHub REST API（curl）ですべて完結させる**

```bash
# ファイル取得（base64デコード）
curl -s -H "Authorization: token $PAT" \
  "https://api.github.com/repos/$REPO/contents/data/spots.json" > /tmp/resp.json
python3 -c "
import json, base64
with open('/tmp/resp.json') as f: d = json.load(f)
sha = d['sha']  # 更新時に必要
content = base64.b64decode(d['content'].replace('\n', '')).decode('utf-8')
"

# ファイルコミット（新規）
ENCODED=$(python3 -c "import base64; print(base64.b64encode(open('/tmp/file').read().encode()).decode())")
curl -s -X PUT -H "Authorization: token $PAT" -H "Content-Type: application/json" \
  "https://api.github.com/repos/$REPO/contents/PATH" \
  -d "{\"message\": \"コミットメッセージ\", \"content\": \"$ENCODED\"}"

# ファイルコミット（既存ファイルの更新 → sha 必須）
curl -s -X PUT ... -d "{\"message\": \"msg\", \"content\": \"$ENCODED\", \"sha\": \"$SHA\"}"
```

### CCRのトリガープロンプトの構造
- `sources: []`（空）にしてgit cloneさせない
- プロンプト内でcurlを使ってファイルを取得・コミット
- Claudeが「考える」部分（スポット分析など）と「実行する」部分（curl）を混在させてOK

---

## エージェントの役割

| ファイル | 役割 |
|---|---|
| `.claude/agents/buzz-researcher.md` | SNSリサーチ担当（手動呼び出し用） |
| `.claude/agents/manager.md` | 全体調整・週次サマリー |
| `.claude/agents/operations.md` | データ品質管理・MCP保守 |
| `.claude/agents/biz-planner.md` | ビジネス戦略・ロードマップ |
| `.claude/agents/pr-comms.md` | SNS発信・Smithery最適化 |
| `.claude/commands/extract-spots.md` | raw_buzz.json → spots.json 変換手順 |

---

## データファイル

| ファイル | 内容 |
|---|---|
| `data/raw_buzz.json` | 収集したツイート（`structured:true` で処理済み） |
| `data/spots.json` | 構造化済みスポット情報 |
| `data/temples.json` | 寺院データ |
| `reports/weekly/` | 週次サマリー（CCRが自動生成） |
| `reports/pr-drafts/` | SNS投稿下書き（CCRが自動生成） |

---

## フェーズ2移行の条件（biz-plannerより）

以下がそろった時点でCloudflare D1へのDB移行を検討：
- spots.json が 50件超
- verified率が 30%超
- temples.json が 30件超
- Smithery経由のAPI利用が月100call超
