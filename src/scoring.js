// キーワードマッピング（クエリ語 → 寺院タグ）
export const KEYWORD_MAP = {
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
  "混雑嫌い": ["low"],
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

export function scoreTemple(temple, query) {
  const q = query.toLowerCase();
  let score = 50;
  const matchedReasons = [];

  for (const [keyword, tags] of Object.entries(KEYWORD_MAP)) {
    if (q.includes(keyword)) {
      for (const tag of tags) {
        if (tag === "low" || tag === "medium" || tag === "high") {
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

  if (temple.tags.includes("世界遺産") && q.includes("世界遺産")) {
    score += 15;
    matchedReasons.push("世界遺産");
  }

  if ((q.includes("無料") || q.includes("お金")) && temple.price.includes("無料")) {
    score += 20;
    matchedReasons.push("無料で拝観できる");
  }

  score = Math.min(100, Math.max(0, score));
  return { score, reasons: [...new Set(matchedReasons)] };
}

export function buildReason(temple, reasons, query) {
  const baseDesc = temple.notes || `${temple.name}の見どころが充実している`;
  if (reasons.length === 0) return baseDesc;
  return `${reasons.join("・")}。${baseDesc}`;
}

export function scoreSpot(spot, query) {
  const q = query.toLowerCase();
  let score = spot.buzz_score ?? 50;

  for (const tag of spot.tags ?? []) {
    if (q.includes(tag)) score += 10;
  }
  for (const sf of spot.suitable_for ?? []) {
    if (q.includes(sf)) score += 12;
  }
  if (q.includes("英語") || q.includes("外国人")) {
    score += (spot.foreign_friendly?.score ?? 0) / 10;
  }
  if (q.includes("静か") || q.includes("穴場") || q.includes("空いて")) {
    if (spot.buzz_type === "local_repeat" || spot.buzz_type === "established") {
      score += 15;
    }
  }

  return Math.min(100, Math.round(score));
}
