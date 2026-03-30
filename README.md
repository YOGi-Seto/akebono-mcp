# akebono-mcp

**Agent-ready Japanese travel spots — hidden gems, curated from SNS buzz, optimized for AI travel agents.**

エージェント時代の旅行情報インフラ。SNSのバズから「一般的すぎない特別な体験スポット」を厳選し、AIエージェントが直接使える形で提供するMCPサーバー。

**現在のフォーカスエリア:** 名古屋（大須・栄・金山・久屋大通・矢場町）
昭和レトロ・古民家リノベ・隠れ家など、非日常体験のできる穴場スポットを収集中。

## ツール

### `recommend_temples`

自然言語クエリに基づいて京都の寺院をスコア付きで推薦する。

**入力例:**
- `"40代夫婦・歴史好き・混雑嫌い・半日"`
- `"一人旅・禅・静かな場所・アート好き"`
- `"子供連れ・無料・世界遺産"`

**出力例:**
```json
{
  "query": "40代夫婦・歴史好き・混雑嫌い・半日",
  "results": [
    {
      "name": "建仁寺",
      "slug": "kenninji",
      "score": 88,
      "reason": "混雑が少ない・歴史好きにおすすめ。京都最古の禅寺。双龍図は2002年作の現代アートで驚きがある。",
      "tags": ["禅", "アート", "歴史", "静か", "双龍図"],
      "crowd_level": "medium",
      "price": "600円",
      "topics": ["天井を埋め尽くす「双龍図」は実は21世紀のアート", "日本初の「禅」と「お茶」の聖地"]
    }
  ]
}
```

### `get_temple_detail`

特定の寺院の詳細情報とトピック一覧を取得する。

**入力:** `slug`（例: `"kenninji"`）

## セットアップ

```bash
git clone https://github.com/YOGi-Seto/akebono-mcp
cd akebono-mcp
npm install
```

### Claude Desktop に追加

`~/.claude/claude_desktop_config.json` に追記:

```json
{
  "mcpServers": {
    "akebono": {
      "command": "node",
      "args": ["/path/to/akebono-mcp/src/index.js"]
    }
  }
}
```

## 対応寺院（6件）

| スラッグ | 寺院名 |
|---------|--------|
| toji | 東寺 |
| enryakuji | 延暦寺 |
| chionin | 知恩院 |
| nishihonganji | 西本願寺 |
| kenninji | 建仁寺 |
| kiyomizudera | 清水寺 |

## ロードマップ

- [ ] 名古屋エリアのスポットを50件以上に拡充
- [ ] 他都市への展開（大阪・京都・福岡など）
- [ ] リアルタイム混雑情報
- [ ] 利用データによるスコア精度向上
- [ ] 日本全国展開
