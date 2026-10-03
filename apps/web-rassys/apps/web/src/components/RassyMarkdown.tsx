import Image from "next/image";
import ReactMarkdown, { type Components } from "react-markdown";
import type { ReactNode } from "react";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { KnowledgeCheckCard, TeachingBlock } from "./learning/LearningBlocks";
import type { LearningCheck } from "../lib/learning/schema";
import { ThoughtImageSurface } from "./ThoughtImageSurface";

type MarkdownVariant = "notebook" | "learning";
type Props = {
  markdown: string;
  variant: MarkdownVariant;
  assetBasePath?: string;
  learningSlug?: string;
};

type AstNode = {
  type: string;
  depth?: number;
  value?: string;
  lang?: string | null;
  name?: string;
  label?: string | null;
  attributes?: Record<string, string | null> | null;
  data?: {
    directiveLabel?: boolean;
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  children?: AstNode[];
};

const safeUrl = (value: string | undefined, variant: MarkdownVariant) => {
  if (!value) return "";
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(value) || value.startsWith("#"))
    return value;
  if (
    variant === "learning" &&
    /^\/learn\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(value)
  )
    return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "";
};

const resolveImage = (
  src: string | undefined,
  variant: MarkdownVariant,
  assetBasePath: string | undefined,
  slug: string | undefined,
) => {
  if (!src) return "";
  if (/^https:\/\//i.test(src)) return src;
  if (
    variant === "learning" &&
    slug &&
    /^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:png|jpe?g|webp|avif|gif)$/i.test(
      src,
    )
  ) {
    return `/api/learn/assets/${slug}/${src}`;
  }
  if (
    variant === "notebook" &&
    assetBasePath &&
    !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)
  ) {
    const base = new URL(assetBasePath, "https://notebook.local");
    const resolved = new URL(src, base);
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  }
  return "";
};

function addLearningNodes() {
  return (tree: AstNode) => {
    const walk = (node: AstNode) => {
      if (node.type === "heading" && node.depth === 2) {
        const lastText = [...(node.children ?? [])]
          .reverse()
          .find((child) => child.type === "text");
        const suffix = lastText?.value?.match(
          /\s+\{#([a-z0-9]+(?:-[a-z0-9]+)*)\}\s*$/,
        );
        if (suffix && lastText?.value) {
          lastText.value = lastText.value.slice(0, suffix.index).trimEnd();
          node.data = { ...node.data, hProperties: { id: suffix[1] } };
        }
      }
      if (
        node.type === "containerDirective" &&
        ["idea", "reveal", "practice", "reflect"].includes(node.name ?? "")
      ) {
        const labelNode = node.children?.[0]?.data?.directiveLabel
          ? node.children[0]
          : undefined;
        const label =
          labelNode?.children
            ?.map((child) => child.value ?? "")
            .join("")
            .trim() ?? "";
        if (labelNode) node.children = node.children?.slice(1);
        node.data = {
          hName: "rassy-block",
          hProperties: {
            kind: node.name,
            id: node.attributes?.id ?? "",
            label,
          },
        };
      }
      if (node.type === "code" && node.lang === "rassy-check") {
        node.data = {
          hName: "rassy-check",
          hProperties: { payload: node.value ?? "{}" },
        };
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}

export function RassyMarkdown({
  markdown,
  variant,
  assetBasePath,
  learningSlug,
}: Props) {
  const notebook = variant === "notebook";
  const components: Components = {
    a: ({ node: _node, href, children }) => {
      const safeHref = safeUrl(
        typeof href === "string" ? href : undefined,
        variant,
      );
      if (!safeHref) return <span>{children}</span>;
      const external = /^https?:\/\//i.test(safeHref);
      return (
        <a
          href={safeHref}
          className={
            notebook
              ? "text-sunrise transition hover:text-white"
              : "text-violet-800 underline decoration-violet-300 underline-offset-4 hover:text-fuchsia-800"
          }
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
        >
          {children}
        </a>
      );
    },
    p: ({ children }) => <p>{children}</p>,
    ul: ({ children }) => (
      <ul
        className={
          notebook ? "list-disc space-y-2 pl-6" : "list-disc space-y-2 pl-6"
        }
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal space-y-2 pl-6">{children}</ol>
    ),
    li: ({ children }) => <li>{children}</li>,
    h1: ({ children }) =>
      notebook ? (
        <h3 className="text-2xl font-semibold text-white">{children}</h3>
      ) : (
        <h2 className="learning-subheading">{children}</h2>
      ),
    h2: ({ node, children, id }) => {
      const headingId = typeof id === "string" ? id : undefined;
      return notebook ? (
        <h3 id={headingId} className="text-2xl font-semibold text-white">
          {children}
        </h3>
      ) : (
        <h2 id={headingId} className="learning-section-heading">
          {children}
        </h2>
      );
    },
    h3: ({ children }) =>
      notebook ? (
        <h4 className="text-xl font-semibold text-white">{children}</h4>
      ) : (
        <h3 className="learning-subheading">{children}</h3>
      ),
    h4: ({ children }) =>
      notebook ? (
        <h5 className="text-lg font-semibold text-white">{children}</h5>
      ) : (
        <h4 className="learning-small-heading">{children}</h4>
      ),
    h5: ({ children }) => (
      <h5
        className={
          notebook
            ? "text-base font-semibold text-white"
            : "learning-small-heading"
        }
      >
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="learning-small-heading">{children}</h6>
    ),
    blockquote: ({ children }) => (
      <blockquote
        className={
          notebook
            ? "border-l-2 border-sunrise/70 pl-4 italic text-cloud/70"
            : "learning-quote"
        }
      >
        {children}
      </blockquote>
    ),
    pre: ({ children }) => (
      <pre
        className={
          notebook
            ? "overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs text-cloud/90"
            : "learning-code-block"
        }
      >
        {children}
      </pre>
    ),
    code: ({ children, className }) => (
      <code
        className={`${notebook ? "rounded bg-white/10 px-1.5 py-0.5 text-[0.95em] text-white" : "learning-inline-code"} ${className ?? ""}`}
      >
        {children}
      </code>
    ),
    hr: () => <hr className={notebook ? "border-white/10" : "learning-rule"} />,
    table: ({ children }) => (
      <div className={notebook ? "overflow-x-auto" : "learning-table-wrap"}>
        <table
          className={
            notebook
              ? "min-w-full border-collapse text-left text-sm"
              : "learning-table"
          }
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead
        className={
          notebook
            ? "border-b border-white/10 text-cloud/60"
            : "learning-table-head"
        }
      >
        {children}
      </thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr
        className={notebook ? "border-b border-white/5" : "learning-table-row"}
      >
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th
        className={
          notebook
            ? "px-3 py-2 font-semibold text-white"
            : "learning-table-cell learning-table-header-cell"
        }
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={notebook ? "px-3 py-2" : "learning-table-cell"}>
        {children}
      </td>
    ),
    img: ({ src, alt = "" }) => {
      const resolved = resolveImage(
        typeof src === "string" ? src : undefined,
        variant,
        assetBasePath,
        learningSlug,
      );
      if (!resolved) return null;
      if (notebook)
        return (
          <figure className="overflow-hidden rounded-3xl border border-white/10 bg-black/30">
            <div className="relative aspect-[16/10] overflow-hidden">
              <ThoughtImageSurface
                src={resolved}
                alt={alt}
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
              />
            </div>
            {alt ? (
              <figcaption className="px-4 py-3 text-xs text-cloud/60">
                {alt}
              </figcaption>
            ) : null}
          </figure>
        );
      return (
        <figure className="learning-image">
          <div className="relative aspect-[16/10] overflow-hidden">
            <Image
              src={resolved}
              alt={alt}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-contain"
              unoptimized
            />
          </div>
          {alt ? <figcaption>{alt}</figcaption> : null}
        </figure>
      );
    },
    ...(variant === "learning"
      ? {
          "rassy-block": ({
            id,
            kind,
            label,
            children,
          }: {
            id?: string;
            kind?: string;
            label?: string;
            children?: ReactNode;
          }) => (
            <TeachingBlock id={id} kind={kind} label={label}>
              {children}
            </TeachingBlock>
          ),
          "rassy-check": ({ payload }: { payload?: string }) => {
            try {
              return (
                <KnowledgeCheckCard
                  check={JSON.parse(payload ?? "") as LearningCheck}
                />
              );
            } catch {
              return null;
            }
          },
        }
      : {}),
  };

  return (
    <ReactMarkdown
      remarkPlugins={
        notebook ? [remarkGfm] : [remarkGfm, remarkDirective, addLearningNodes]
      }
      skipHtml
      components={components}
    >
      {markdown}
    </ReactMarkdown>
  );
}
