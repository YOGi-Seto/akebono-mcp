#!/usr/bin/env node
import { TwitterApi } from "twitter-api-v2";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env を読み込む（akebono-mcp/.env があればそちら、なければ kyoto-history-site/x-bot/.env を使う）
const localEnv = join(__dirname, "../.env");
const fallbackEnv = join(__dirname, "../../kyoto-history-site/x-bot/.env");
if (existsSync(localEnv)) {
  config({ path: localEnv });
} else if (existsSync(fallbackEnv)) {
  config({ path: fallbackEnv });
  console.log("[collect-buzz] fallback: kyoto-history-site/.env を使用");
} else {
  console.log("[collect-buzz] .env なし — 環境変数から読み込みます");
}

const RAW_BUZZ_FILE = join(__dirname, "../data/raw_buzz.json");

// 検索するハッシュタグ・キーワード（京都フォーカス）
const SEARCH_QUERIES = [
  "#京都カフェ",
  "#京都グルメ",
  "#京都喫茶店",
  "京都 絶景 穴場",
  "京都 観光 空いてる",
  "#名古屋カフェ",
  "#名古屋グルメ",
  "名古屋 観光 穴場",
  "名古屋 地元民おすすめ",
  "名古屋 外国人に教えたくない",
];

// 最小いいね数
const MIN_LIKES = 15;

function loadRawBuzz() {
  if (!existsSync(RAW_BUZZ_FILE)) return [];
  return JSON.parse(readFileSync(RAW_BUZZ_FILE, "utf-8"));
}

function saveRawBuzz(data) {
  writeFileSync(RAW_BUZZ_FILE, JSON.stringify(data, null, 2), "utf-8");
}

async function searchQuery(client, query) {
  console.log(`[collect-buzz] 検索中: "${query}"`);
  try {
    const result = await client.v2.search(query + " lang:ja -is:retweet", {
      max_results: 20,
      "tweet.fields": ["public_metrics", "created_at", "author_id", "text"],
    });

    const tweets = result.data?.data ?? [];
    return tweets
      .filter((t) => (t.public_metrics?.like_count ?? 0) >= MIN_LIKES)
      .map((t) => ({
        tweet_id: t.id,
        text: t.text,
        like_count: t.public_metrics?.like_count ?? 0,
        retweet_count: t.public_metrics?.retweet_count ?? 0,
        created_at: t.created_at,
        search_query: query,
        collected_at: new Date().toISOString().split("T")[0],
      }));
  } catch (err) {
    console.error(`[collect-buzz] エラー (query: "${query}"):`, err.message);
    return [];
  }
}

async function main() {
  const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });

  const existing = loadRawBuzz();
  const existingIds = new Set(existing.map((t) => t.tweet_id));

  let newCount = 0;
  for (const query of SEARCH_QUERIES) {
    const tweets = await searchQuery(client, query);
    for (const tweet of tweets) {
      if (!existingIds.has(tweet.tweet_id)) {
        existing.push(tweet);
        existingIds.add(tweet.tweet_id);
        newCount++;
      }
    }
    // API レート制限対策: 1秒待機
    await new Promise((r) => setTimeout(r, 1000));
  }

  saveRawBuzz(existing);
  console.log(
    `[collect-buzz] 完了: ${newCount} 件追加 / 合計 ${existing.length} 件`
  );
}

main().catch((err) => {
  console.error("[collect-buzz] 致命的エラー:", err.message);
  process.exit(1);
});
