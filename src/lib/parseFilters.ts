import type { CommentFilters } from "./db";

/** อ่าน filter จาก query string ให้ /api/comments และ /api/export ใช้ร่วมกัน */
export function parseFilters(sp: URLSearchParams): CommentFilters {
  const num = (k: string) => (sp.get(k) != null ? Number(sp.get(k)) : undefined);
  const sort = sp.get("sort") as CommentFilters["sort"] | null;
  return {
    brand: sp.get("brand") || undefined,
    product: sp.get("product") || undefined,
    sentiment: sp.get("sentiment") || undefined,
    category: sp.get("category") || undefined,
    status: sp.get("status") || undefined,
    assignee: sp.get("assignee") || undefined,
    urgentOnly: sp.get("urgent") === "1" || sp.get("urgent") === "true",
    replied: sp.get("replied") === "yes" ? "yes" : sp.get("replied") === "no" ? "no" : undefined,
    minSeverity: num("minSeverity"),
    q: sp.get("q") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    sort: sort || undefined,
    page: num("page"),
    pageSize: num("pageSize"),
  };
}
