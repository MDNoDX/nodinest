"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { coverSrcSet, sharperCover } from "@/lib/cover-url";

/**
 * A cover picture. When its shape is close to the frame's (a book cover on a
 * book) it fills the frame edge to edge like a printed cover; a picture of
 * another shape is shown whole on a blurred copy of itself. Our own files come
 * in the width the screen needs (sharp on Retina). If it cannot be loaded the
 * `fallback` (the title cover) takes its place instead of a broken image.
 */
export function CoverPicture({
  src,
  fallback,
  sizes,
}: {
  src: string;
  fallback: React.ReactNode;
  /** How wide it is shown (the browser picks the copy), e.g. "240px". */
  sizes?: string;
}) {
  const [bad, setBad] = useState<string | null>(null);
  // The other site has no large size: back to the picture as it was given.
  const [plain, setPlain] = useState<string | null>(null);
  const [fill, setFill] = useState<boolean | null>(null);
  if (bad === src) return <>{fallback}</>;
  const big = sharperCover(src);
  const url = plain === src ? src : big;
  const srcSet = coverSrcSet(src);
  return (
    <>
      {!fill && (
        <img
          src={url}
          alt=""
          aria-hidden
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-110 object-cover blur-lg"
        />
      )}
      <img
        src={url}
        srcSet={srcSet}
        sizes={srcSet ? (sizes ?? "(min-width: 1024px) 260px, 50vw") : undefined}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => (url !== src ? setPlain(src) : setBad(src))}
        onLoad={(e) => {
          const img = e.currentTarget;
          const box = img.parentElement;
          if (!img.naturalWidth || !box?.clientHeight) return;
          const r = img.naturalWidth / img.naturalHeight;
          const frame = box.clientWidth / box.clientHeight;
          // Within ~20 % of the frame's shape: cropping a sliver beats blurred bands.
          // YouTube's 4:3 thumbnails carry black bands around a 16:9 picture: always fill.
          setFill(/i\.ytimg\.com\//.test(url) || Math.abs(r - frame) / frame < 0.2);
        }}
        className={cn("absolute inset-0 size-full", fill ? "object-cover" : "object-contain")}
      />
    </>
  );
}

/** A picture that simply disappears when it cannot be loaded. */
export function SafeImg({ src, className }: { src: string; className?: string }) {
  const [bad, setBad] = useState<string | null>(null);
  if (bad === src) return null;
  return (
    <img
      src={sharperCover(src)}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        if (e.currentTarget.src !== src) e.currentTarget.src = src;
        else setBad(src);
      }}
      className={className}
    />
  );
}
