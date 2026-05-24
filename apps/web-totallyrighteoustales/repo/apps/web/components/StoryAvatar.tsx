import Image from "next/image";
import clsx from "clsx";

const sizeClasses = {
  sm: "h-10 w-10 text-sm",
  md: "h-14 w-14 text-base",
  lg: "h-20 w-20 text-xl",
};

const pixelSizes = {
  sm: 40,
  md: 56,
  lg: 80,
};

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "?";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default function StoryAvatar({
  name,
  src,
  anonymous = false,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  anonymous?: boolean;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  const label = anonymous ? "Anonymous storyteller" : name;
  const initials = anonymous ? "?" : initialsFromName(name);

  if (src && !anonymous) {
    return (
      <div
        className={clsx(
          "overflow-hidden rounded-lg border border-press-ink/10 bg-press-paper shadow-soft ring-2 ring-press-gold/20 dark:border-white/15 dark:bg-white/10 dark:ring-white/5",
          sizeClasses[size],
          className,
        )}
      >
        <Image
          src={src}
          alt={label}
          width={pixelSizes[size]}
          height={pixelSizes[size]}
          unoptimized
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      className={clsx(
        "flex items-center justify-center rounded-lg border border-press-ink/10 bg-[linear-gradient(135deg,#f8f1df,#d8a23f,#2f7d73)] text-press-ink shadow-soft ring-2 ring-press-gold/20 dark:border-white/15 dark:ring-white/5",
        anonymous && "bg-[linear-gradient(135deg,#f8f1df,#d8a23f,#315f8d)]",
        sizeClasses[size],
        className,
      )}
    >
      <span className="font-display tracking-[0.18em]">{initials}</span>
    </div>
  );
}
