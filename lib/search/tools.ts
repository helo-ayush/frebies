import { tools, type Tool } from "@/lib/registry/tools";

const HAYSTACK = new Map<string, string>(
  tools.map((tool) => [
    tool.path,
    [tool.name, tool.shortName, tool.tagline, tool.category, ...tool.keywords, ...tool.limits.formats]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  ]),
);

const STOP = new Set(["to", "a", "an", "the", "my", "into", "file", "files"]);

/** Ranks tools for a free-text query such as "heic to jpg" or "trim mp3". */
export function searchTools(query: string, limit = 5): Tool[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOP.has(token));
  if (tokens.length === 0) return [];

  return tools
    .map((tool) => {
      const text = HAYSTACK.get(tool.path) ?? "";
      const name = tool.name.toLowerCase();
      let score = 0;
      let hits = 0;
      for (const token of tokens) {
        if (name.includes(token)) score += 6;
        else if (text.includes(token)) score += 2;
        else continue;
        hits += 1;
      }
      // Someone typing "heic to jpg" wants the tool that covers both words.
      score *= hits / tokens.length;
      if (text.includes(query.trim().toLowerCase())) score += 8;
      if (tool.status === "live") score += 0.5;
      return { tool, score };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.tool);
}
