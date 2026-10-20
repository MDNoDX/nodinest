"use server";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { listResources } from "@/server/catalog";
import {
  addCard,
  deleteCard,
  deleteDeck,
  dueCards,
  generateCards,
  improveCards,
  listCards,
  reviewCard,
  updateCard,
} from "@/server/study-cards";
import { run } from "./_run";

const id = z.string().uuid();
const deck = z.string().trim().min(1).max(120);
const loc = async () => ((await getLocale()) === "en" ? "en" : "uz");

export async function generateCardsAction(input: unknown) {
  return run(async ({ ctx }) => {
    const out = await generateCards(ctx, { ...(input as object), locale: await loc() });
    revalidatePath("/review");
    return out;
  });
}
export async function improveCardsAction(deckName: string, instruction: string) {
  return run(async ({ ctx }) => {
    const out = await improveCards(ctx, {
      deck: deck.parse(deckName),
      instruction: z.string().max(800).parse(instruction),
      locale: await loc(),
    });
    revalidatePath("/review");
    return out;
  });
}
export async function dueCardsAction(deckName: string | null) {
  return run(async ({ ctx }) =>
    dueCards(ctx, { deck: deckName ? deck.parse(deckName) : null, limit: 100 }),
  );
}
export async function listCardsAction(deckName: string) {
  return run(async ({ ctx }) => listCards(ctx, deck.parse(deckName)));
}
export async function reviewCardAction(cardId: string, grade: number) {
  return run(async ({ ctx }) =>
    reviewCard(
      ctx,
      id.parse(cardId),
      z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).parse(grade),
    ),
  );
}
export async function updateCardAction(cardId: string, input: unknown) {
  return run(async ({ ctx }) => updateCard(ctx, id.parse(cardId), input));
}
export async function addCardAction(deckName: string, input: unknown) {
  return run(async ({ ctx }) => {
    await addCard(ctx, deck.parse(deckName), input);
    revalidatePath("/review");
  });
}
export async function deleteCardAction(cardId: string) {
  return run(async ({ ctx }) => deleteCard(ctx, id.parse(cardId)));
}
export async function deleteDeckAction(deckName: string) {
  return run(async ({ ctx }) => {
    await deleteDeck(ctx, deck.parse(deckName));
    revalidatePath("/review");
  });
}
/** Resource picker for "make questions from…": my library first, then the catalog. */
export async function pickResourcesAction(q: string) {
  return run(async ({ ctx, db }) => {
    const query = z.string().max(200).parse(q);
    const mine = await listResources(db, ctx, { q: query, scope: "mine", pageSize: 12 });
    const all =
      query && mine.items.length < 6
        ? await listResources(db, ctx, { q: query, scope: "all", pageSize: 12 })
        : { items: [] };
    const seen = new Set<string>();
    return [...mine.items, ...all.items]
      .filter((r) => !seen.has(r.id) && seen.add(r.id))
      .slice(0, 12)
      .map((r) => ({ id: r.id, title: r.title, type: r.type, authors: r.contributors }));
  });
}
