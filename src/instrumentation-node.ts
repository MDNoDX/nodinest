/** Node-only start-up (see instrumentation.ts): errors → the admin's Telegram channel. */
import { format } from "node:util";
import { reportError } from "./server/monitor/report";

export function setupReporting() {
  globalThis.__nnReport = (err, info) => void reportError(err, info);
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    // toActionError reports the full error itself; this line is only its log copy.
    if (typeof args[0] === "string" && args[0].startsWith("[nodinest] internal error")) return;
    // Node's own warnings (e.g. ExperimentalWarning) are not errors of the site.
    const first = String(args[0] ?? "");
    if (/ExperimentalWarning|DeprecationWarning|--trace-warnings/.test(first)) return;
    const err = args.find((a) => a instanceof Error);
    void reportError(err ?? format(...args), {
      where: "console.error",
      extra: err ? format(...args.filter((a) => a !== err)).slice(0, 500) : undefined,
    });
  };
}

export { reportError };
