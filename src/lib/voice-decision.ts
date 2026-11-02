/**
 * A short spoken answer to a card waiting for confirmation: "yes", "no", or not
 * an answer at all. Plain rules on purpose, so the AI never decides it.
 */
export function voiceDecision(heard: string): "yes" | "no" | null {
  const t = heard
    .toLowerCase()
    .replace(/[ʻʼ‘’`']/g, "'")
    .replace(/[.!?,…]/g, " ")
    .trim();
  if (!t || t.split(/\s+/).length > 5) return null;
  // Whole words only (\b does not know Cyrillic letters).
  const starts = (words: string) => new RegExp(`^(${words})(?=\\s|$)`, "u").test(t);
  if (starts("yo'?q|bekor(?: qil)?|rad et|kerakmas|kerak emas|to'xta|no|nope|нет|отмена|не надо"))
    return "no";
  if (
    starts(
      "ha+|xa+|xo'p|mayli|tasdiq\\S*|roziman|bajar\\S*|ok|okay|yes|sure|да|подтвержда\\S*|давай",
    )
  )
    return "yes";
  return null;
}
