import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { pickerKeys } from "@/lib/plan-icons";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

const png = async () =>
  (
    await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 4,
        background: { r: 200, g: 40, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
  ).toString("base64");

describe("plan icons the owner shapes", () => {
  it("replaces ours, adds new ones, orders and removes them; only the owner", async () => {
    const icons = await import("@/server/plan-icons");
    const boss = await makeUser(db, { role: "superadmin" });
    const someone = await makeUser(db);
    const picture = { type: "image/png", data: await png() };

    await expect(icons.saveIcon(someone, { key: "book", picture })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // One of ours gets a new picture: a 192 px WebP under a fresh id.
    let cfg = await icons.saveIcon(boss, { key: "book", picture, words: "mutolaa" });
    const id = cfg.over.book;
    const img = await icons.iconImage(id);
    expect(img?.type).toBe("image/webp");
    const meta = await sharp(img!.body).metadata();
    expect([meta.width, meta.height]).toEqual([192, 192]);
    expect(cfg.words.book).toBe("mutolaa");

    // Replaced again: the old picture is gone.
    cfg = await icons.saveIcon(boss, { key: "book", picture });
    expect(await icons.iconImage(id)).toBeNull();
    cfg = await icons.resetIcon(boss, "book");
    expect(cfg.over.book).toBeUndefined();

    // A new one from an SVG: kept as SVG; a dangerous one is refused.
    const svg = Buffer.from(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1" fill="gold"/></svg>',
    ).toString("base64");
    cfg = await icons.saveIcon(boss, {
      key: "new",
      name: "Quyosh",
      words: "quyosh",
      picture: { type: "image/svg+xml", data: svg },
    });
    const added = cfg.custom.at(-1)!;
    expect((await icons.iconImage(added.img))?.type).toBe("image/svg+xml");
    expect(pickerKeys(cfg)[0]).toBe(`c:${added.id}`);
    const bad = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/x.png"/></svg>',
    ).toString("base64");
    await expect(
      icons.saveIcon(boss, {
        key: "new",
        name: "X",
        picture: { type: "image/svg+xml", data: bad },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      icons.saveIcon(boss, { key: "new", name: "X", picture: { type: "text/html", data: svg } }),
    ).resolves.toBeTruthy(); // an SVG is known by its content, not the label

    // Order: kept as given, unknown keys dropped.
    cfg = await icons.saveIconOrder(boss, ["beads", "grad", "nope"]);
    expect(cfg.order).toEqual(["beads", "grad"]);
    cfg = await icons.saveIconOrder(boss, null);

    // Removing an added icon removes its picture too.
    for (const c of cfg.custom) cfg = await icons.removeIcon(boss, c.id);
    expect(cfg.custom).toHaveLength(0);
    expect(await icons.iconImage(added.img)).toBeNull();
  });
});
