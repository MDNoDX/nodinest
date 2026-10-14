import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SESSION_COOKIES, createHandoff } from "@/server/app-handoff";
import { OpenApp } from "./open-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "NodiNest — Mac" };

/** Opened by the Mac app in the system sign-in sheet. */
export default async function AppLoginPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app-login");
  const jar = await cookies();
  const name = SESSION_COOKIES.find((n) => jar.get(n));
  if (!name) redirect("/login?next=/app-login");
  const code = await createHandoff(`${name}=${jar.get(name)!.value}`);
  return <OpenApp href={`nodinest://auth?code=${code}`} name={user.name} />;
}
