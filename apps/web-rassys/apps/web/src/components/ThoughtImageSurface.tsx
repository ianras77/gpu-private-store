"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const HEIF_PATTERN = /\.(heic|heif)(?:$|[?#])/i;

type ThoughtImageSurfaceProps = {
  src: string;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
};

export function ThoughtImageSurface({
  src,
  alt,
  sizes,
  className,
  priority = false,
}: ThoughtImageSurfaceProps) {
  const [convertedSrc, setConvertedSrc] = useState<string | null>(null);
  const [conversionFailed, setConversionFailed] = useState(false);

  useEffect(() => {
    if (!HEIF_PATTERN.test(src)) {
      setConvertedSrc(null);
      setConversionFailed(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    setConvertedSrc(null);
    setConversionFailed(false);

    void (async () => {
      try {
        const response = await fetch(src, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`thought_image_fetch_failed_${response.status}`);
        }

        const blob = await response.blob();
        const { default: heic2any } = await import("heic2any");
        const converted = await heic2any({
          blob,
          toType: "image/jpeg",
          quality: 0.92,
        });
        const imageBlob = Array.isArray(converted) ? converted[0] : converted;

        objectUrl = URL.createObjectURL(imageBlob as Blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        setConvertedSrc(objectUrl);
      } catch {
        if (!active) return;
        setConversionFailed(true);
      }
    })();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (HEIF_PATTERN.test(src)) {
    if (convertedSrc) {
      return (
        <Image
          src={convertedSrc}
          alt={alt}
          fill
          sizes={sizes}
          className={className}
          unoptimized
          priority={priority}
        />
      );
    }

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/35 px-4 text-center text-[10px] uppercase tracking-[0.28em] text-cloud/60">
        {conversionFailed ? "Image preview unavailable" : "Preparing image"}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={className}
      unoptimized
      priority={priority}
    />
  );
}
