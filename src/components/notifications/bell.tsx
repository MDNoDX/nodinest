import { Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** The top bar's way to the notification centre. */
export function NotificationBell({ count }: { count: number }) {
  const t = useTranslations("notifications");
  return (
    <Link
      href="/notifications"
      aria-label={count ? t("unread", { n: count }) : t("title")}
      title={t("title")}
      className="text-muted hover:bg-surface-2 hover:text-foreground relative grid size-9 place-items-center rounded-lg transition-colors"
    >
      <Bell className="size-[18px]" />
      {count > 0 && (
        <span className="bg-danger absolute top-1 right-1 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
