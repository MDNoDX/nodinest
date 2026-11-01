import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SESSION_COOKIES, createHandoff } from "@/server/app-handoff";
import { OpenApp } from "./open-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roznoma" };

/** Opened by the installed apps in the system sign-in sheet. */
export default async function AppLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const mobile = (await searchParams).from === "mobile";
  const here = mobile ? "/app-login?from=mobile" : "/app-login";
  const back = `/login?next=${encodeURIComponent(here)}`;
  const user = await getCurrentUser();
  if (!user) redirect(back);
  const jar = await cookies();
  const name = SESSION_COOKIES.find((n) => jar.get(n));
  if (!name) redirect(back);
  const code = await createHandoff(`${name}=${jar.get(name)!.value}`);
  return (
    <OpenApp href={`${mobile ? "roznoma" : "nodinest"}://auth?code=${code}`} name={user.name} />
  );
}
