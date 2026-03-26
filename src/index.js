#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { scoreTemple, buildReason, scoreSpot } from "./scoring.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const temples = JSON.parse(readFileSync(join(__dirname, "../data/temples.json"), "utf-8"));
const topics = JSON.parse(readFileSync(join(__dirname, "../data/topics.json"), "utf-8"));
const spotsFile = join(__dirname, "../data/spots.json");

// MCPサーバーを初期化
const server = new McpServer({
  name: "akebono-mcp",
  version: "0.1.0",
});

// ツール1: recommend_temples
server.tool(
  "recommend_temples",
  "自然言語のクエリに基づいて京都の寺院をスコア付きで推薦する。旅行者のプロファイル・希望・条件を自由に入力できる。",
  {
    query: z.string().describe(
      "旅行者のプロファイルや希望（例：「40代夫婦・歴史好き・混雑嫌い・半日」「一人旅・禅・静かな場所」「子供連れ・無料・世界遺産」）"
    ),
    limit: z.number().optional().default(5).describe("返す件数（デフォルト5件）"),
  },
  async ({ query, limit = 5 }) => {
    // 各寺院をスコアリング
    const scored = temples.map((temple) => {
      const { score, reasons } = scoreTemple(temple, query);
      const templeTopics = topics
        .filter((t) => t.temple === temple.id)
        .map((t) => t.topic)
        .slice(0, 3);

      return {
        name: temple.name,
        slug: temple.id,
        score,
        reason: buildReason(temple, reasons, query),
        tags: temple.tags.slice(0, 5),
        crowd_level: temple.crowd_level,
        price: temple.price,
        time_required: temple.time_required,
        highlights: temple.highlights,
        topics: templeTopics,
        url: temple.url,
      };
    });

    // スコア降順でソート
    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              total_results: results.length,
              results,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ツール2: get_temple_detail
server.tool(
  "get_temple_detail",
  "特定の寺院の詳細情報とトピック一覧を取得する。",
  {
    slug: z.string().describe(
      "寺院のスラッグ（toji / enryakuji / chionin / nishihonganji / kenninji / kiyomizudera）"
    ),
  },
  async ({ slug }) => {
    const temple = temples.find((t) => t.id === slug);
    if (!temple) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `寺院が見つかりません: ${slug}` }),
          },
        ],
      };
    }

    const templeTopics = topics
      .filter((t) => t.temple === slug)
      .map((t) => ({ id: t.id, topic: t.topic, hint: t.hint }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ...temple, topics: templeTopics }, null, 2),
        },
      ],
    };
  }
);

// ツール3: find_trending_spots
server.tool(
  "find_trending_spots",
  "日本人SNSでバズっているが外国人にはまだ知られていない京都のスポット（カフェ・レストランなど）を検索する。寺院以外の隠れた名所を探すときに使う。",
  {
    query: z.string().describe(
      "検索クエリ（例：「静かなカフェ 一人旅」「町家 歴史的建造物」「外国人向け 英語メニュー」）"
    ),
    city: z.string().optional().default("京都").describe("都市名（デフォルト: 京都）"),
    category: z.string().optional().describe(
      "カテゴリ絞り込み（cafe / restaurant / bar / shop / activity など）"
    ),
    limit: z.number().optional().default(5).describe("返す件数（デフォルト5件）"),
  },
  async ({ query, city = "京都", category, limit = 5 }) => {
    // spots.json をその都度読み込む（追記に対応するため）
    let spots = [];
    try {
      spots = JSON.parse(readFileSync(spotsFile, "utf-8"));
    } catch {
      spots = [];
    }

    if (spots.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              query,
              message: "まだスポットデータがありません。/project:extract-spots でデータを追加してください。",
              results: [],
            }),
          },
        ],
      };
    }

    const q = query.toLowerCase();

    // 都市フィルタ
    let filtered = spots.filter((s) =>
      s.city === city || s.city?.includes(city)
    );

    // カテゴリフィルタ
    if (category) {
      filtered = filtered.filter((s) => s.category === category);
    }

    // スコアリング
    const scored = filtered.map((spot) => {
      let score = spot.buzz_score ?? 50;

      // クエリとタグのマッチング
      for (const tag of spot.tags ?? []) {
        if (q.includes(tag)) score += 10;
      }
      for (const sf of spot.suitable_for ?? []) {
        if (q.includes(sf)) score += 12;
      }

      // foreign_friendly クエリのボーナス
      if (q.includes("英語") || q.includes("外国人")) {
        score += (spot.foreign_friendly?.score ?? 0) / 10;
      }

      // 静か・混雑なしクエリ
      if (q.includes("静か") || q.includes("穴場") || q.includes("空いて")) {
        if (spot.buzz_type === "local_repeat" || spot.buzz_type === "established") {
          score += 15;
        }
      }

      return {
        name: spot.name,
        name_en: spot.name_en,
        category: spot.category,
        area: spot.area,
        buzz_score: spot.buzz_score,
        buzz_reason: spot.buzz_reason,
        buzz_type: spot.buzz_type,
        foreign_friendly_score: spot.foreign_friendly?.score,
        price_range: spot.price_range?.label,
        best_time: spot.timing?.best_time,
        tags: spot.tags,
        suitable_for: spot.suitable_for,
        pairs_well_with: spot.pairs_well_with,
        routing_notes: spot.routing_notes,
        trivia: spot.trivia?.slice(0, 2),
        verified: spot.verified,
        _score: Math.min(100, Math.round(score)),
      };
    });

    scored.sort((a, b) => b._score - a._score);
    const results = scored.slice(0, limit).map(({ _score, ...rest }) => rest);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              city,
              category: category ?? "all",
              total_results: results.length,
              results,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// サーバー起動
const transport = new StdioServerTransport();
await server.connect(transport);
