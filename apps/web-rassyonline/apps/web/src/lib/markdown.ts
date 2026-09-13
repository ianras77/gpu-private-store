export type MarkdownBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; depth: 1 | 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "rule" }
  | { type: "image"; alt: string; url: string }
  | { type: "callout"; tone: "note" | "tip" | "warning" | "danger"; text: string }
  | { type: "code"; language: string | null; text: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^(?:---|___|\*\s*\*\s*\*)$/.test(trimmed)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)$/);
    if (image) {
      blocks.push({ type: "image", alt: image[1], url: image[2] });
      index += 1;
      continue;
    }

    const callout = trimmed.match(/^\[!(NOTE|TIP|WARNING|DANGER)\]\s*(.*)$/i);
    if (callout) {
      blocks.push({ type: "callout", tone: callout[1].toLowerCase() as "note" | "tip" | "warning" | "danger", text: callout[2] });
      index += 1;
      continue;
    }

    if (isTableHeader(lines, index)) {
      const headers = parseTableRow(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const fence = trimmed.match(/^(```|~~~)([a-zA-Z0-9_+-]+)?\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence[1])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", language: fence[2] ?? null, text: codeLines.join("\n") });
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", depth: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quoteLines.join("\n").trim() });
      continue;
    }

    const listMatch = trimmed.match(/^((?:[-*+])|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^((?:[-*+])|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) break;
        items.push(item[2].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        !current ||
        /^```|^~~~/.test(current) ||
        /^(?:---|___|\*\s*\*\s*\*)$/.test(current) ||
        /^!\[[^\]]*\]\(https?:\/\/[^)\s]+\)$/.test(current) ||
        /^\[!(?:NOTE|TIP|WARNING|DANGER)\]/i.test(current) ||
        /^#{1,3}\s+/.test(current) ||
        /^>\s?/.test(current) ||
        /^((?:[-*+])|\d+[.)])\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function isTableHeader(lines: string[], index: number): boolean {
  const header = lines[index]?.trim() ?? "";
  const divider = lines[index + 1]?.trim() ?? "";
  return /^\|.+\|$/.test(header) && /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(divider);
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}
