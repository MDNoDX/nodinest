/**
 * Server start-up: every server error (render, route, action) and every
 * console.error line goes to the admin's Telegram channel (src/server/monitor).
 * Node-only code lives in instrumentation-node.ts (not bundled for the edge).
 */
import type { Instrumentation } from "next";

type Report = (err: unknown, info?: Record<string, string | undefined>) => void;
declare global {
  var __nnReport: Report | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setupReporting } = await import("./instrumentation-node");
    setupReporting();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./instrumentation-node");
  await reportError(err, {
    where: `${context.routeType} ${context.routePath}`,
    method: request.method,
    path: request.path,
  });
};
