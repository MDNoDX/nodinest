"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";

/**
 * A cover picture shown whole on its own colours (a blurred copy fills what it
 * leaves empty). If it cannot be loaded (a dead link, a file gone) the
 * `fallback` (the title cover) takes its place instead of a broken image.
 */
export function CoverPicture({ src, fallback }: { src: string; fallback: React.ReactNode }) {
  const [bad, setBad] = useState<string | null>(null);
  if (bad === src) return <>{fallback}</>;
  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        referrerPolicy="no-referrer"
        className="absolute inset-0 size-full scale-110 object-cover blur-lg"
      />
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBad(src)}
        className="absolute inset-0 size-full object-contain"
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
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBad(src)}
      className={className}
    />
  );
}
