"use client";

import React from "react";

export const PageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <div className="page-shell">{children}</div>;
};

export const Section: React.FC<{ title?: string; children: React.ReactNode; key?: React.Key }> = ({
  title,
  children
}) => {
  return (
    <section className="astro-section">
      {title ? <h2 className="astro-section-title">{title}</h2> : null}
      {children}
    </section>
  );
};

export const Heading: React.FC<{ children: React.ReactNode; level?: 1 | 2 | 3 }> = ({
  children,
  level = 1
}) => {
  const Tag = `h${level}` as const;
  return (
    <Tag className={`astro-heading astro-heading-${level}`}>
      {children}
    </Tag>
  );
};

export const Text: React.FC<
  React.HTMLAttributes<HTMLParagraphElement> & { muted?: boolean }
> = ({ children, muted, className, ...props }) => (
  <p
    {...props}
    className={[
      "astro-text",
      muted ? "astro-text-muted" : "",
      className
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </p>
);

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }
> = ({ variant = "primary", style, className, ...props }) => (
  <button
    {...props}
    className={[
      "astro-button",
      variant === "ghost" ? "astro-button-ghost" : "astro-button-primary",
      className
    ]
      .filter(Boolean)
      .join(" ")}
    style={style}
  />
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => (
  <input
    {...props}
    className={["astro-input", className].filter(Boolean).join(" ")}
  />
);

export const Card: React.FC<{ children: React.ReactNode; key?: React.Key }> = ({ children }) => (
  <div className="astro-card">{children}</div>
);
