/** Jira Cloud açıklama alanı Atlassian Document Format → düz metin (basit çıkarım). */
type AdfNode = {
  type?: string;
  text?: string;
  content?: AdfNode[];
};

function walk(node: unknown, depth: number): string {
  if (!node || typeof node !== "object" || depth > 80) return "";
  const n = node as AdfNode;
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (n.type === "hardBreak") return "\n";
  if (!Array.isArray(n.content)) return "";
  const sep =
    n.type === "paragraph" || n.type === "heading"
      ? "\n"
      : n.type === "bulletList" || n.type === "orderedList"
        ? "\n"
        : "";
  return n.content.map((c) => walk(c, depth + 1)).join(sep);
}

export function adfToPlainText(description: unknown): string {
  if (description == null) return "";
  const text = walk(description, 0).replace(/\n{3,}/g, "\n\n").trim();
  return text;
}
