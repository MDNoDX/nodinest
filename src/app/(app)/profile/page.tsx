import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** "Profil" in the menu: my own page at /u/<username>. */
export default async function MyProfile() {
  const u = await requireUser();
  redirect(u.username ? `/u/${u.username}` : "/welcome");
}
