"use client";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

/** Hands the one-time code back to the Mac app (the sign-in sheet closes itself). */
export function OpenApp({ href, name }: { href: string; name: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <CheckCircle2 className="text-success mx-auto size-10" />
        <p className="mt-3 text-lg font-semibold">{name}</p>
        <a href={href} className="text-primary mt-2 inline-block text-sm hover:underline">
          NodiNote ilovasini ochish →
        </a>
      </div>
    </main>
  );
}
