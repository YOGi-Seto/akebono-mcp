# /project:extract-spots — raw_buzz.json → spots.json に構造化して追記

`data/raw_buzz.json` に収集された生ツイートデータを読み込み、
スポット情報として `data/spots.json` に構造化して追記する。

---

## ステップ

### Step 1: raw_buzz.json を読む

`data/raw_buzz.json` を全件読む。
まだ `structured: true` になっていないエントリだけを対象にする。
（ない場合は全件を対象にする）

### Step 2: ツイートからスポットを特定する

各ツイートを読んで、以下を判断する：

1. **スポット名が特定できるか？**
   - 明確な店名・施設名があればそのまま使う
   - ない場合は「仮名」をつける（例: 「祇園の路地裏カフェ（仮）」）
   - 複数のツイートが同じ店を指している場合は1件にまとめる

2. **カテゴリを判断する**
   - cafe / restaurant / bar / shop / shrine / temple / park / activity / other

3. **buzz_type を判断する**
   - `local_repeat`: 地元民がリピートしている（「毎週行く」「地元民に愛される」など）
   - `instagram`: 映え目的（「インスタ映え」「フォトジェニック」など）
   - `viral`: 急に話題になった（「話題の」「最近オープン」など）
   - `established`: 老舗・長年の人気（「創業〇〇年」「老舗」など）

### Step 3: spots.json の形式で構造化する

以下の JSON フォーマットで出力する。
不明な情報は `null` にする（推測で埋めない）。

```json
{
  "id": "spot_XXX",
  "name": "スポット名（日本語）",
  "name_en": "Spot Name (英語・分かる場合のみ)",
  "category": "cafe",
  "city": "京都",
  "area": "祇園",
  "buzz_type": "local_repeat",
  "buzz_score": 85,
  "buzz_reason": "地元民が週2で通う静かな町家カフェ。観光客がまだ少ない。",

  "foreign_friendly": {
    "score": 70,
    "english_menu": true,
    "english_staff": false,
    "visual_ordering": true,
    "notes": "身振りで対応してくれる"
  },

  "timing": {
    "peak_hours": ["12:00-13:00"],
    "off_peak": ["10:00-11:00"],
    "reservation_required": false,
    "wait_time_peak": null,
    "best_time": "平日午前"
  },

  "price_range": {
    "min": null,
    "max": null,
    "currency": "JPY",
    "label": null
  },

  "pairs_well_with": [],
  "routing_notes": null,

  "heritage": {
    "building_age": null,
    "designation": null,
    "historical_notes": null
  },

  "trivia": [],

  "tags": ["町家", "静か", "コーヒー"],
  "suitable_for": ["一人旅", "カップル"],
  "source": "x_buzz",
  "source_tweet_ids": ["ツイートIDをここに入れる"],
  "collected_at": "YYYY-MM-DD",
  "verified": false
}
```

**buzz_score の目安：**
- 90以上: 非常に高いバズ（いいね500件以上 + 地元ファン多数）
- 75-89: 高いバズ（いいね200件以上）
- 60-74: 中程度のバズ（いいね100件以上）
- 50-59: 低めのバズ（いいね50-100件）

### Step 4: 既存の spots.json に追記する

1. `data/spots.json` を読む
2. 既存の `id` の最大番号を確認する（例: spot_003 → 次は spot_004）
3. 新しいスポットを配列に追記する
4. 保存する

### Step 5: raw_buzz.json を更新する

処理済みのツイートに `"structured": true` を追加して保存する。

### Step 6: 結果をサマリーで報告する

「〇件のスポットを追加しました」という形で報告する。
追加したスポット名とカテゴリを一覧で表示する。
不明情報が多い場合は「この情報は手動で補完が必要です」と案内する。

---

## 注意事項

- **推測で埋めない**: 分からない情報は null のままにする
- **重複チェック**: 既存の spots.json に同じ店がないか確認する
- **verified は常に false**: 手動確認が取れた時だけ true にする
- **trivia**: ツイートの文体から読み取れる「なぜ人気か」のユニークな理由を書く

## スキップ基準（一般的すぎる場所は記録しない）

以下に該当する場合は `spot_id: null`、`skip_reason` を記録してスキップする：

- **チェーン店・フランチャイズ**: スタバ、マクドナルド、サイゼリヤ等
- **誰もが知っている定番観光地**: 名古屋城、テレビ塔等（新しい体験の切り口がない場合）
- **体験の具体性がない**: 「行ってきた」「美味しかった」だけで場所・体験の特徴が分からないもの
- **宣伝・PR的な内容**: 明らかに広告やPR投稿と判断できるもの
- **実店舗でない**: お取り寄せ、通販、デリバリー専門等
