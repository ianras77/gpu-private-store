import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({
  breaks: true,
  gfm: true,
});

const allowedTags = [
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];

export function renderMarkdown(input: string) {
  const html = marked.parse(input);
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {},
  });
}
