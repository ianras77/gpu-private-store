import Image from "next/image";
import clsx from "clsx";

export default function StoryImage({
  src,
  alt,
  className,
  sizes = "100vw",
  fill = false,
  width = 1200,
  height = 720,
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes={sizes}
        priority={priority}
        className={clsx("object-cover", className)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      sizes={sizes}
      priority={priority}
      className={clsx("h-auto w-full object-cover", className)}
    />
  );
}
