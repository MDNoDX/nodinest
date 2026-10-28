import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import { saveProfile, suggestUsername } from "@/server/profile";
import { makeUser, testDb } from "../helpers/db";

const db = testDb();
afterAll(async () => {
  await db.$client.end();
});

describe("profile (/welcome)", () => {
  it("keeps the Google photo, saves names and a unique username", async () => {
    const u = await makeUser(db);
    const photo = "https://lh3.googleusercontent.com/a/abc=s96-c";
    await db.update(user).set({ image: photo }).where(eq(user.id, u.userId));
    const name = await suggestUsername("Ögabek", "Şukurov", u.email);
    expect(name).toMatch(/^[a-z][a-z0-9_]{2,29}$/);
    await saveProfile(u, {
      firstName: "Ögabek",
      lastName: "Şukurov",
      username: name,
      image: photo,
    });
    const [row] = await db.select().from(user).where(eq(user.id, u.userId));
    expect(row.image).toBe(photo);
    expect(row.name).toBe("Ögabek Şukurov");
    expect(row.username).toBe(name);

    // Another account cannot take it; a foreign URL is refused; null removes the photo.
    const v = await makeUser(db);
    await expect(saveProfile(v, { firstName: "A", username: name, image: null })).rejects.toThrow();
    await expect(
      saveProfile(u, { firstName: "Ö", username: name, image: "https://evil.example/x.png" }),
    ).rejects.toThrow();
    await saveProfile(u, { firstName: "Ögabek", username: name, image: null });
    const [after] = await db.select().from(user).where(eq(user.id, u.userId));
    expect(after.image).toBeNull();
  });
});
