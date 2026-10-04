import Image from "next/image";
import ReactMarkdown, { type Components } from "react-markdown";
import type { ReactNode } from "react";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { KnowledgeCheckCard, TeachingBlock } from "./learning/LearningBlocks";
import type { LearningCheck } from "../lib/learning/schema";
import { ThoughtImageSurface } from "./ThoughtImageSurface";

type MarkdownVariant = "editorial" | "learning";
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
    variant === "editorial" &&
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
  const notebook = variant === "editorial";
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
          className="rassy-markdown__link"
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
        >
          {children}
        </a>
      );
    },
    p: ({ children }) => (
      <p className="rassy-markdown__paragraph">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="rassy-markdown__list rassy-markdown__list--unordered">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="rassy-markdown__list rassy-markdown__list--ordered">
        {children}
      </ol>
    ),
    li: ({ children }) => <li>{children}</li>,
    h1: ({ children }) => (
      <h2 className="rassy-markdown__heading rassy-markdown__heading--1">
        {children}
      </h2>
    ),
    h2: ({ node, children, id }) => {
      const headingId = typeof id === "string" ? id : undefined;
      return (
        <h2
          id={headingId}
          className="rassy-markdown__heading rassy-markdown__heading--2"
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }) => (
      <h3 className="rassy-markdown__heading rassy-markdown__heading--3">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="rassy-markdown__heading rassy-markdown__heading--4">
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="rassy-markdown__heading rassy-markdown__heading--5">
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="rassy-markdown__heading rassy-markdown__heading--6">
        {children}
      </h6>
    ),
    blockquote: ({ children }) => (
      <blockquote className="rassy-markdown__quote">{children}</blockquote>
    ),
    pre: ({ children }) => (
      <pre className="rassy-markdown__pre">{children}</pre>
    ),
    code: ({ children, className }) => (
      <code className={`rassy-markdown__code ${className ?? ""}`}>
        {children}
      </code>
    ),
    hr: () => <hr className="rassy-markdown__rule" />,
    table: ({ children }) => (
      <div className="rassy-markdown__table-wrap">
        <table className="rassy-markdown__table">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="rassy-markdown__table-head">{children}</thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr className="rassy-markdown__table-row">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="rassy-markdown__table-cell rassy-markdown__table-header">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="rassy-markdown__table-cell">{children}</td>
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
          <figure className="rassy-markdown__figure rassy-markdown__figure--editorial">
            <div className="relative aspect-[16/10] overflow-hidden">
              <ThoughtImageSurface
                src={resolved}
                alt={alt}
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
              />
            </div>
            {alt ? (
              <figcaption className="rassy-markdown__caption">{alt}</figcaption>
            ) : null}
          </figure>
        );
      return (
        <figure className="rassy-markdown__figure rassy-markdown__figure--learning">
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
          {alt ? (
            <figcaption className="rassy-markdown__caption">{alt}</figcaption>
          ) : null}
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
    <div className={`rassy-markdown rassy-markdown--${variant}`}>
      <ReactMarkdown
        remarkPlugins={
          notebook
            ? [remarkGfm]
            : [remarkGfm, remarkDirective, addLearningNodes]
        }
        skipHtml
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
