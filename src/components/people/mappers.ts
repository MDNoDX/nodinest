import type { ComboOption } from "@/components/ui/combobox";

export function mapPerson(raw: Record<string, unknown>): ComboOption {
  const years = [raw.birthDate, raw.deathDate]
    .filter(Boolean)
    .map((d) => String(d).slice(0, 4))
    .join("–");
  const detail = [
    raw.matchedAlias ? `“${raw.matchedAlias}”` : null,
    raw.shortDescription,
    years || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { id: String(raw.id), label: String(raw.fullName), detail: detail || null };
}

export function mapResource(raw: Record<string, unknown>): ComboOption {
  return {
    id: String(raw.id),
    label: String(raw.title),
    detail: [raw.type, raw.publicationDate].filter(Boolean).join(" · ") || null,
  };
}
