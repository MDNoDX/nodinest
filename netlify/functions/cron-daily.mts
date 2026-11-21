/**
 * The daily job (was a Vercel cron): 04:00 UTC = 09:00 in Tashkent. A scheduled
 * function may run 30 s, the route up to 60 s, so this only starts the route
 * and returns; the route keeps going on its own after this one stops waiting.
 */
export default async () => {
  const site = process.env.URL ?? "https://nodinest.netlify.app";
  await fetch(`${site}/api/cron/daily`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    signal: AbortSignal.timeout(25_000),
  }).catch(() => {});
  return new Response("started");
};

export const config = { schedule: "0 4 * * *" };
