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
