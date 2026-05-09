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
          "overflow-hidden rounded-[1.4rem] border border-ink/10 bg-cream shadow-soft ring-4 ring-[#f5e5cf] dark:border-white/15 dark:bg-white/10 dark:ring-white/5",
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
        "flex items-center justify-center rounded-[1.4rem] border border-ink/10 bg-story text-ink shadow-soft ring-4 ring-[#f5e5cf] dark:border-white/15 dark:ring-white/5",
        anonymous &&
          "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(255,255,255,0.56)),linear-gradient(135deg,_rgba(255,214,165,0.98),_rgba(243,139,92,0.92)_42%,_rgba(132,215,214,0.9))]",
        sizeClasses[size],
        className,
      )}
    >
      <span className="font-display tracking-[0.18em]">{initials}</span>
    </div>
  );
}
