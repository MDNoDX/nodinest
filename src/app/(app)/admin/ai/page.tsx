import { getTranslations } from "next-intl/server";
import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { pageContext } from "@/lib/page";
import { AI_TOOL_NAMES, getAiSettings } from "@/server/settings";
import { aiModel, isAiConfigured } from "@/server/ai/gemini";

export async function generateMetadata() {
  return { title: (await getTranslations("admin"))("ai") };
}

export default async function AdminAi() {
  const { db } = await pageContext({ admin: true });
  const s = await getAiSettings(db);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">
        Gemini: {isAiConfigured() ? "configured" : "GEMINI_API_KEY missing"} · model{" "}
        <code className="bg-surface-2 rounded px-1">{aiModel()}</code>
      </p>
      <AiSettingsForm initial={s} tools={AI_TOOL_NAMES} />
    </div>
  );
}
