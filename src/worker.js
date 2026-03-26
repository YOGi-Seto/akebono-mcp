import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scoreTemple, buildReason, scoreSpot } from "./scoring.js";
import temples from "../data/temples.json";
import topics from "../data/topics.json";

// spots.json は GitHub から毎回取得（週次で更新されるため）
const SPOTS_URL =
  "https://raw.githubusercontent.com/YOGi-Seto/akebono-mcp/main/data/spots.json";

export class AkebonoMCP extends McpAgent {
  server = new McpServer({ name: "akebono-mcp", version: "0.1.0" });

  async init() {
    // ツール1: recommend_temples
    this.server.tool(
      "recommend_temples",
      "自然言語のクエリに基づいて京都の寺院をスコア付きで推薦する。旅行者のプロファイル・希望・条件を自由に入力できる。",
      {
        query: z.string().describe(
          "旅行者のプロファイルや希望（例：「40代夫婦・歴史好き・混雑嫌い・半日」「一人旅・禅・静かな場所」「子供連れ・無料・世界遺産」）"
        ),
        limit: z.number().optional().default(5).describe("返す件数（デフォルト5件）"),
      },
      async ({ query, limit = 5 }) => {
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

        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ query, total_results: results.length, results }, null, 2),
            },
          ],
        };
      }
    );

    // ツール2: get_temple_detail
    this.server.tool(
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
    this.server.tool(
      "find_trending_spots",
      "日本人SNSでバズっているが外国人にはまだ知られていない京都のスポット（カフェ・レストランなど）を検索する。",
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
        let spots = [];
        try {
          const res = await fetch(SPOTS_URL);
          spots = await res.json();
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
                  message: "まだスポットデータがありません。",
                  results: [],
                }),
              },
            ],
          };
        }

        let filtered = spots.filter((s) => s.city === city || s.city?.includes(city));
        if (category) filtered = filtered.filter((s) => s.category === category);

        const scored = filtered.map((spot) => ({
          ...spot,
          _score: scoreSpot(spot, query),
        }));

        scored.sort((a, b) => b._score - a._score);
        const results = scored.slice(0, limit).map(({ _score, ...rest }) => ({
          name: rest.name,
          category: rest.category,
          area: rest.area,
          buzz_score: rest.buzz_score,
          buzz_reason: rest.buzz_reason,
          buzz_type: rest.buzz_type,
          foreign_friendly_score: rest.foreign_friendly?.score,
          price_range: rest.price_range?.label,
          best_time: rest.timing?.best_time,
          tags: rest.tags,
          suitable_for: rest.suitable_for,
          pairs_well_with: rest.pairs_well_with,
          routing_notes: rest.routing_notes,
          trivia: rest.trivia?.slice(0, 2),
          verified: rest.verified,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { query, city, category: category ?? "all", total_results: results.length, results },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  }
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({ name: "akebono-mcp", version: "0.1.0", status: "running" }),
        { headers: { "content-type": "application/json" } }
      );
    }
    return AkebonoMCP.serve("/mcp")(request, env, ctx);
  },
};
