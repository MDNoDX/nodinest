"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { coverSrcSet, sharperCover } from "@/lib/cover-url";

/**
 * A cover picture, never cut: the whole cover with its title always shows.
 * When its shape is close to the frame's (a book cover on a book, ≤ 15 % off)
 * it is fitted to the frame exactly, edge to edge, stretched by that little;
 * a picture of another shape is shown whole on a blurred copy of itself.
 * (YouTube thumbnails carry black bands around a 16:9 picture: those fill.) Our own files come
 * in the width the screen needs (sharp on Retina). If it cannot be loaded the
 * `fallback` (the title cover) takes its place instead of a broken image.
 * The picture stays invisible until its fit is known and then fades in once
 * over the title cover, so a cover never switches between "whole" and
 * "filled" in front of you and is never an empty box while it loads.
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
  const [fit, setFit] = useState<"exact" | "whole" | "crop" | null>(null);
  const big = sharperCover(src);
  const url = plain === src ? src : big;
  const decide = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete || !img.naturalWidth) return;
      const box = img.parentElement;
      if (/i\.ytimg\.com\//.test(img.currentSrc || url)) return setFit("crop");
      if (!box?.clientHeight) return setFit("exact");
      const r = img.naturalWidth / img.naturalHeight;
      const frame = box.clientWidth / box.clientHeight;
      setFit(Math.abs(r - frame) / frame <= 0.15 ? "exact" : "whole");
    },
    [url],
  );
  if (bad === src) return <>{fallback}</>;
  const srcSet = coverSrcSet(src);
  return (
    <>
      {/* Until the picture is here (a slow connection), the title cover stands in. */}
      {fit === null && fallback}
      {fit === "whole" && (
        <img
          src={url}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full scale-110 object-cover blur-lg"
        />
      )}
      <img
        // A picture already in the cache may finish before React listens: the
        // ref looks at it once more.
        ref={decide}
        src={url}
        srcSet={srcSet}
        sizes={srcSet ? (sizes ?? "(min-width: 1024px) 260px, 50vw") : undefined}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => (url !== src ? setPlain(src) : setBad(src))}
        onLoad={(e) => decide(e.currentTarget)}
        className={cn(
          "absolute inset-0 size-full transition-opacity duration-300",
          fit === "whole" ? "object-contain" : fit === "crop" ? "object-cover" : "object-fill",
          fit === null && "opacity-0",
        )}
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
