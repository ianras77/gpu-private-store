import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { unified } from "unified";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { parseDocument } from "yaml";
import {
  LearningModule,
  LearningSection,
  learningCheckSchema,
  learningModuleMetadataSchema,
  moduleIdPattern,
} from "./schema";
import { readLearningRasterAsset } from "./assets";

export const MAX_LEARNING_MODULE_BYTES = 512 * 1024;
const imageExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
]);
const mdastProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective);

type MarkdownNode = {
  type: string;
  depth?: number;
  value?: string;
  lang?: string | null;
  url?: string;
  alt?: string | null;
  label?: string | null;
  attributes?: Record<string, string | null> | null;
  data?: { directiveLabel?: boolean };
  children?: MarkdownNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

export class LearningValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("; "));
    this.name = "LearningValidationError";
  }
}

export type ParsedLearningModule = {
  module: LearningModule;
  referencedSlugs: string[];
};

export async function parseLearningModuleFile(
  slug: string,
  moduleDir: string,
): Promise<ParsedLearningModule> {
  const markdownPath = path.join(moduleDir, "module.md");
  const stat = await lstat(markdownPath);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new LearningValidationError(["module.md must be a regular file"]);
  if (stat.size > MAX_LEARNING_MODULE_BYTES)
    throw new LearningValidationError(["module.md exceeds the 512 KiB limit"]);
  return parseLearningModule(
    slug,
    await readFile(markdownPath, "utf8"),
    moduleDir,
  );
}

export async function parseLearningModule(
  slug: string,
  source: string,
  moduleDir: string,
): Promise<ParsedLearningModule> {
  if (Buffer.byteLength(source, "utf8") > MAX_LEARNING_MODULE_BYTES) {
    throw new LearningValidationError(["module.md exceeds the 512 KiB limit"]);
  }
  const frontMatter = source.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );
  if (!frontMatter)
    throw new LearningValidationError([
      "module.md must start with a YAML front matter block",
    ]);

  const document = parseDocument(frontMatter[1] ?? "", {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
  });
  if (document.errors.length || document.warnings.length) {
    throw new LearningValidationError(
      [...document.errors, ...document.warnings].map((issue) => issue.message),
    );
  }
  let rawMetadata: unknown;
  try {
    rawMetadata = document.toJS({ maxAliasCount: 0, mapAsMap: false });
  } catch (error) {
    throw new LearningValidationError([
      `invalid YAML: ${error instanceof Error ? error.message : "could not decode front matter"}`,
    ]);
  }
  const metadataResult = learningModuleMetadataSchema.safeParse(rawMetadata);
  if (!metadataResult.success) {
    throw new LearningValidationError(
      metadataResult.error.issues.map(
        (issue) =>
          `${issue.path.join(".") || "front matter"}: ${issue.message}`,
      ),
    );
  }
  const metadata = metadataResult.data;
  if (metadata.slug !== slug)
    throw new LearningValidationError([
      `slug '${metadata.slug}' must match its folder '${slug}'`,
    ]);

  const body = source.slice(frontMatter[0].length);
  const tree = mdastProcessor.parse(body) as unknown as MarkdownNode;
  const issues: string[] = [];
  const ids = new Set<string>();
  const checks: Record<
    string,
    ReturnType<typeof learningCheckSchema.parse>
  > = {};
  const referencedSlugs = new Set<string>();
  const sections: LearningSection[] = [];
  const topLevel = tree.children ?? [];

  const addId = (id: string, description: string) => {
    if (!moduleIdPattern.test(id))
      issues.push(
        `${description} ID '${id}' must use lower-case letters, numbers, and hyphens`,
      );
    if (ids.has(id)) issues.push(`duplicate ID '${id}'`);
    ids.add(id);
  };

  const inspect = (node: MarkdownNode, insideBlock = false) => {
    if (node.type === "html") issues.push("raw HTML is not supported");
    if (node.type === "heading" && node.depth === 1)
      issues.push("H1 is reserved for the generated module title");
    if (node.type === "heading" && node.depth === 2) {
      if (insideBlock)
        issues.push("teaching blocks cannot contain H2 headings");
    }
    if (node.type === "containerDirective") {
      if (insideBlock) issues.push("teaching blocks cannot be nested");
      const name = (node as MarkdownNode & { name?: string }).name ?? "";
      if (!["idea", "reveal", "practice", "reflect"].includes(name)) {
        issues.push(`unsupported teaching block '${name}'`);
      }
      const attributes = node.attributes ?? {};
      const attributeNames = Object.keys(attributes);
      if (attributeNames.some((attribute) => attribute !== "id"))
        issues.push(
          `${name || "teaching block"} only supports the id attribute`,
        );
      const id = attributes.id ?? "";
      if (!id)
        issues.push(`${name || "teaching block"} requires an explicit ID`);
      else addId(id, "teaching block");
      const labelNode = node.children?.[0]?.data?.directiveLabel
        ? node.children[0]
        : null;
      const label = labelNode
        ? inlineText(labelNode.children ?? []).trim()
        : "";
      if (!label)
        issues.push(`${name || "teaching block"} requires a non-empty label`);
      if (
        labelNode &&
        (labelNode.children ?? []).some((child) => child.type !== "text")
      )
        issues.push(`${name || "teaching block"} label must be plain text`);
      for (const child of (node.children ?? []).slice(labelNode ? 1 : 0))
        inspect(child, true);
      return;
    }
    if (node.type === "leafDirective" || node.type === "textDirective")
      issues.push(
        "only the four documented container teaching blocks are supported",
      );
    if (node.type === "code" && node.lang === "rassy-check") {
      if (insideBlock)
        issues.push("knowledge checks cannot appear inside teaching blocks");
      try {
        const checkResult = learningCheckSchema.safeParse(
          JSON.parse(node.value ?? ""),
        );
        if (!checkResult.success) {
          issues.push(
            ...checkResult.error.issues.map(
              (issue) =>
                `rassy-check ${issue.path.join(".") || ""}: ${issue.message}`,
            ),
          );
        } else {
          addId(checkResult.data.id, "knowledge check");
          checks[checkResult.data.id] = checkResult.data;
        }
      } catch {
        issues.push("rassy-check must contain one valid JSON object");
      }
    }
    if (node.type === "image") {
      if (!node.alt?.trim()) issues.push("images require meaningful alt text");
      if (!isLocalAssetReference(node.url ?? ""))
        issues.push(`image '${node.url ?? ""}' must use a local assets/ path`);
    }
    if (node.type === "link") {
      const href = node.url ?? "";
      if (/^\/learn\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.test(href)) {
        const target = href.match(/^\/learn\/([a-z0-9]+(?:-[a-z0-9]+)*)/)?.[1];
        if (target) referencedSlugs.add(target);
      } else if (!href.startsWith("#") && !/^https:\/\//i.test(href)) {
        issues.push(
          `link '${href}' must be an https:// source, a section anchor, or a /learn/<slug> link`,
        );
      }
    }
    for (const child of node.children ?? []) inspect(child, insideBlock);
  };

  for (const child of topLevel) inspect(child);

  const h2Nodes = topLevel.filter(
    (node) => node.type === "heading" && node.depth === 2,
  );
  if (h2Nodes.length < 1 || h2Nodes.length > 24)
    issues.push("a module must contain between 1 and 24 H2 sections");
  const sectionIds = new Set<string>();
  for (const [index, heading] of h2Nodes.entries()) {
    const textNodes = heading.children ?? [];
    const lastText = [...textNodes]
      .reverse()
      .find((node) => node.type === "text");
    const suffix = lastText?.value?.match(
      /\s+\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}\s*$/,
    );
    if (!suffix || !lastText?.value) {
      issues.push(
        "each H2 section needs an explicit trailing ID, for example ## A useful idea {#useful-idea}",
      );
      continue;
    }
    const id = suffix[1] ?? "";
    addId(id, "section");
    sectionIds.add(id);
    const title = inlineText(textNodes)
      .replace(/\s+\{#[a-z0-9]+(?:-[a-z0-9]+)*\}\s*$/, "")
      .trim();
    const start = heading.position?.start?.offset;
    const nextStart = h2Nodes[index + 1]?.position?.start?.offset;
    if (typeof start !== "number") {
      issues.push(`section '${id}' has no source position`);
      continue;
    }
    const end = typeof nextStart === "number" ? nextStart : body.length;
    sections.push({ id, title, markdown: body.slice(start, end).trim() });
  }

  for (const reference of referencedSlugs) {
    if (reference === slug)
      issues.push(`module links cannot link to itself ('${reference}')`);
  }
  for (const node of collectNodes(tree)) {
    if (node.type !== "link" || !(node.url ?? "").startsWith("#")) continue;
    const target = (node.url ?? "").slice(1);
    if (target && !sectionIds.has(target) && !ids.has(target))
      issues.push(
        `section link '#${target}' does not refer to a section or teaching block`,
      );
  }

  const referencedAssets = new Set<string>();
  for (const node of collectNodes(tree)) {
    if (node.type === "image" && node.url) referencedAssets.add(node.url);
  }
  if (metadata.cover) referencedAssets.add(metadata.cover);
  for (const asset of referencedAssets) {
    if (!isLocalAssetReference(asset)) continue;
    if (
      !imageExtensions.has(asset.slice(asset.lastIndexOf(".")).toLowerCase())
    ) {
      issues.push(`image asset '${asset}' has an unsupported raster extension`);
      continue;
    }
    try {
      await readLearningRasterAsset(path.dirname(moduleDir), slug, asset);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "invalid image";
      issues.push(
        `image asset '${asset}' is unavailable or invalid (${reason})`,
      );
    }
  }

  if (issues.length) throw new LearningValidationError(issues);
  const wordCount = body.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const minutes = metadata.minutes ?? Math.max(1, Math.ceil(wordCount / 200));
  return {
    module: {
      metadata: metadata.minutes ? metadata : { ...metadata, minutes },
      intro: body.slice(0, h2Nodes[0]?.position?.start?.offset ?? 0).trim(),
      sections,
      estimatedMinutes: metadata.minutes === undefined,
      checks,
    },
    referencedSlugs: [...referencedSlugs],
  };
}

const inlineText = (nodes: MarkdownNode[]): string =>
  nodes
    .map((node) => {
      if (node.type === "text" || node.type === "inlineCode")
        return node.value ?? "";
      if (node.type === "image") return node.alt ?? "";
      if (node.type === "break") return " ";
      return inlineText(node.children ?? []);
    })
    .join("");

const isLocalAssetReference = (value: string) => {
  if (
    !value.startsWith("assets/") ||
    value.includes("\\") ||
    value.includes("%") ||
    value.includes("?") ||
    value.includes("#")
  )
    return false;
  const parts = value.split("/");
  return (
    parts.length >= 2 &&
    parts.every(
      (part) => part && part !== "." && part !== ".." && !part.startsWith("."),
    )
  );
};

const collectNodes = (root: MarkdownNode) => {
  const nodes: MarkdownNode[] = [];
  const walk = (node: MarkdownNode) => {
    nodes.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(root);
  return nodes;
};
