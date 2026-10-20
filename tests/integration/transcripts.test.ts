import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteTranscript,
  listTranscripts,
  startTranscript,
  transcriptText,
} from "@/server/ai/transcripts";
import { submitResource } from "@/server/suggestions";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
let u: Awaited<ReturnType<typeof makeUser>>;
let other: Awaited<ReturnType<typeof makeUser>>;
let rid: string;

beforeAll(async () => {
  u = await makeUser(db);
  other = await makeUser(db);
  rid = (
    (await submitResource(db, u, { type: "lecture", title: `Transcript test ${Date.now()}` })) as {
      id: string;
    }
  ).id;
});
afterAll(async () => {
  await db.$client.end();
});

describe("full transcripts", () => {
  it("are private, validated and not exportable before they are done", async () => {
    const t = await startTranscript(u, {
      resourceId: rid,
      source: { kind: "youtube", id: "M7lc1UVf-VE" },
      mode: "notes",
      durationSeconds: 600,
    });
    expect(t).toMatchObject({ status: "running", done: 0, studied: false, mode: "notes" });
    expect((await listTranscripts(u, rid)).map((x) => x.id)).toContain(t.id);
    expect(await listTranscripts(other, rid)).toHaveLength(0);
    await expect(transcriptText(u, t.id)).rejects.toThrow();
    await expect(transcriptText(other, t.id)).rejects.toThrow();
    await expect(
      startTranscript(u, {
        resourceId: rid,
        source: { kind: "youtube", id: "not a video id" },
        mode: "notes",
        durationSeconds: 600,
      }),
    ).rejects.toThrow();
    // Someone else's file can never be the source.
    await expect(
      startTranscript(u, {
        resourceId: rid,
        source: { kind: "file", fileId: "00000000-0000-4000-8000-000000000000" },
        mode: "transcript",
        durationSeconds: 60,
      }),
    ).rejects.toThrow();
    await deleteTranscript(other, t.id);
    expect(await listTranscripts(u, rid)).toHaveLength(1);
    await deleteTranscript(u, t.id);
    expect(await listTranscripts(u, rid)).toHaveLength(0);
  });
});

describe("resume points", () => {
  it("are saved per account, merged field by field and private", async () => {
    const { saveResume, getResume, lastResume } = await import("@/server/resume");
    await saveResume(db, u, {
      resourceId: rid,
      place: "taqriz",
      doc: { pos: 42, anchor: "b:hello" },
    });
    await saveResume(db, u, {
      resourceId: rid,
      media: {
        source: { kind: "youtube", id: "M7lc1UVf-VE", title: "x", resourceId: rid },
        seconds: 125.7,
      },
    });
    const r = await getResume(db, u, rid);
    expect(r).toMatchObject({
      docPos: 42,
      docAnchor: "b:hello",
      mediaSeconds: 125,
      place: "taqriz",
    });
    expect(r?.media).toMatchObject({ kind: "youtube", id: "M7lc1UVf-VE" });
    expect((await lastResume(db, u))?.resourceId).toBe(rid);
    expect(await getResume(db, other, rid)).toBeNull();
    await expect(
      saveResume(db, u, {
        resourceId: rid,
        media: {
          source: {
            kind: "file",
            src: "javascript:alert(1)",
            video: false,
            title: "x",
            resourceId: rid,
          },
          seconds: 1,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("study cards", () => {
  it("are private, reviewed on schedule and editable", async () => {
    const m = await import("@/server/study-cards");
    await m.addCard(u, "Test deck", { question: "Q1?", answer: "A1" });
    await m.addCard(u, "Test deck", { question: "Q2?", answer: "A2" });
    const decks = await m.listDecks(u);
    expect(decks.find((d) => d.deck === "Test deck")).toMatchObject({ total: 2, due: 2 });
    expect((await m.listDecks(other)).find((d) => d.deck === "Test deck")).toBeUndefined();
    const due = await m.dueCards(u, { deck: "Test deck" });
    expect(due).toHaveLength(2);
    await m.reviewCard(u, due[0].id, 3);
    expect(await m.dueCards(u, { deck: "Test deck" })).toHaveLength(1);
    await expect(m.reviewCard(other, due[1].id, 3)).rejects.toThrow();
    await m.updateCard(u, due[1].id, { question: "Q2 better?", answer: "A2" });
    expect((await m.listCards(u, "Test deck")).map((c) => c.question)).toContain("Q2 better?");
    await m.deleteDeck(other, "Test deck");
    expect(await m.listCards(u, "Test deck")).toHaveLength(2);
    await m.deleteDeck(u, "Test deck");
    expect(await m.listCards(u, "Test deck")).toHaveLength(0);
  });
});

describe("publishers & channels", () => {
  it("links a video's channel to an entry and counts what I learned there", async () => {
    const { getPublisherDetail } = await import("@/server/publishers");
    const { setLearningStatus } = await import("@/server/records");
    const name = `Shifo ${Date.now()}`;
    const r = (await submitResource(db, u, {
      type: "lecture",
      title: `Dars ${Date.now()}`,
      media: { channel: name, durationSeconds: 1800 },
    })) as { id: string };
    const [row] = await db.execute<{ publisher_id: string; kind: string }>(
      (await import("drizzle-orm")).sql`select m.publisher_id, p.kind from nodinest.media_details m
        join nodinest.publishers p on p.id = m.publisher_id where m.resource_id = ${r.id}`,
    );
    expect(row.kind).toBe("channel");
    await setLearningStatus(db, u, r.id, "completed");
    const d = await getPublisherDetail(db, u, row.publisher_id);
    expect(d?.items.map((i) => i.id)).toContain(r.id);
    expect(d?.mine).toMatchObject({ completed: 1, seconds: 1800 });
  });
});

describe("messages to the admin", () => {
  it("are private to the sender and readable by the superadmin account only", async () => {
    const f = await import("@/server/feedback");
    await f.sendFeedback(u, { title: "Idea", body: "Please add X", contact: "@me" });
    expect((await f.listMyFeedback(u)).map((x) => x.title)).toContain("Idea");
    expect((await f.listMyFeedback(other)).map((x) => x.title)).not.toContain("Idea");
    await expect(f.listAllFeedback(u)).rejects.toThrow();
    const all = await f.listAllFeedback({ ...u, superadminAccount: true });
    expect(all.find((x) => x.title === "Idea")?.contact).toBe("@me");
  });
});

describe("own books (Kitob yozish)", () => {
  it("start from a template, stay private and out of the Darsxona", async () => {
    const b = await import("@/server/own-books");
    const { listResources } = await import("@/server/catalog");
    const { getWriteup } = await import("@/server/writeups");
    const id = await b.createOwnBook(u, {
      title: "Mening hayotim",
      template: "memoir",
      goalWords: 30000,
    });
    const mine = await b.listOwnBooks(u);
    const book = mine.find((x) => x.id === id);
    expect(book).toMatchObject({ template: "memoir", goalWords: 30000, words: 0 });
    expect(book!.chapters).toBeGreaterThanOrEqual(6);
    const w = await getWriteup(db, u, id);
    expect(JSON.stringify(w?.doc)).toContain("Bolaligim");
    expect((await listResources(db, u, { q: "Mening hayotim" })).items).toHaveLength(0);
    expect(await b.listOwnBooks(other)).toHaveLength(0);
    expect(await b.getOwnBook(other, id)).toBeNull();
    await b.setOwnBookGoal(u, id, 50000);
    expect((await b.getOwnBook(u, id))?.goalWords).toBe(50000);
    await b.deleteOwnBook(u, id);
    expect((await b.listOwnBooks(u)).map((x) => x.id)).not.toContain(id);
  });
});
