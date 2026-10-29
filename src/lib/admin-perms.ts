/**
 * What an "admin" (not the superadmin) may do. The superadmin gives them per
 * account; they are stored in `user.admin_perms` and re-read on every request.
 */
export const ADMIN_PERMS = ["payments", "ads", "feedback", "users"] as const;
export type AdminPerm = (typeof ADMIN_PERMS)[number];

export const toPerms = (v: readonly string[] | null | undefined): AdminPerm[] =>
  ADMIN_PERMS.filter((p) => v?.includes(p));

/** The superadmin (in admin mode) may do everything; an admin only their parts. */
export const can = (ctx: { role: string; perms?: readonly string[] }, perm: AdminPerm): boolean =>
  ctx.role === "superadmin" || !!ctx.perms?.includes(perm);

/** Where an admin lands in /admin (the first part they have). */
export const PERM_HOME: Record<AdminPerm, string> = {
  payments: "/admin/premium",
  ads: "/admin/ads",
  feedback: "/suggestions?tab=inbox",
  users: "/admin/users",
};
