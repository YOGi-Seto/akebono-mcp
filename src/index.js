#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const temples = JSON.parse(readFileSync(join(__dirname, "../data/temples.json"), "utf-8"));
const topics = JSON.parse(readFileSync(join(__dirname, "../data/topics.json"), "utf-8"));

// キーワードマッピング（クエリ語 → 寺院タグ）
const KEYWORD_MAP = {
  // 旅行者タイプ
  "カップル": ["カップル"],
  "夫婦": ["カップル"],
  "一人旅": ["一人旅"],
  "家族": ["家族連れ"],
  "子供": ["家族連れ"],
  "子ども": ["家族連れ"],

  // 興味・好み
  "歴史": ["歴史好き", "歴史"],
  "アート": ["アート好き", "アート"],
  "仏教": ["仏教好き", "禅"],
  "禅": ["禅"],
  "建築": ["建築好き"],
  "自然": ["自然好き", "自然"],
  "庭園": ["庭園"],
  "写真": ["写真好き"],

  // 環境・雰囲気
  "静か": ["静か", "一人旅"],
  "混雑嫌い": ["low"],  // crowd_levelで判断
  "空いている": ["low"],
  "賑やか": ["賑わい"],
  "無料": ["無料"],

  // 季節
  "桜": ["春（桜）", "春"],
  "春": ["春"],
  "紅葉": ["秋（紅葉）", "秋"],
  "秋": ["秋"],
  "夏": ["夏"],
  "冬": ["冬"],
  "除夜の鐘": ["冬（除夜の鐘）"],

  // 時間
  "半日": [],
  "短時間": [],
  "世界遺産": ["世界遺産"],
};

function scoreTemple(temple, query) {
  const q = query.toLowerCase();
  let score = 50; // ベーススコア
  const matchedReasons = [];

  // タグマッチング
  for (const [keyword, tags] of Object.entries(KEYWORD_MAP)) {
    if (q.includes(keyword)) {
      for (const tag of tags) {
        if (tag === "low" || tag === "medium" || tag === "high") {
          // 混雑レベルのマッチング
          if (keyword === "混雑嫌い" || keyword === "空いている") {
            if (temple.crowd_level === "low") {
              score += 20;
              matchedReasons.push("混雑が少ない");
            } else if (temple.crowd_level === "medium") {
              score += 5;
            } else if (temple.crowd_level === "high") {
              score -= 15;
            }
          }
        } else if (temple.tags.includes(tag)) {
          score += 10;
          matchedReasons.push(`「${tag}」に合う`);
        } else if (temple.suitable_for.includes(tag)) {
          score += 12;
          matchedReasons.push(`${tag}におすすめ`);
        }
      }
    }
  }

  // 世界遺産ボーナス
  if (temple.tags.includes("世界遺産") && q.includes("世界遺産")) {
    score += 15;
    matchedReasons.push("世界遺産");
  }

  // 無料ボーナス
  if ((q.includes("無料") || q.includes("お金")) && temple.price.includes("無料")) {
    score += 20;
    matchedReasons.push("無料で拝観できる");
  }

  // スコアを0〜100に収める
  score = Math.min(100, Math.max(0, score));

  return { score, reasons: [...new Set(matchedReasons)] };
}

function buildReason(temple, reasons, query) {
  const baseDesc = temple.notes || `${temple.name}の見どころが充実している`;
  if (reasons.length === 0) {
    return baseDesc;
  }
  return `${reasons.join("・")}。${baseDesc}`;
}

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

// サーバー起動
const transport = new StdioServerTransport();
await server.connect(transport);
