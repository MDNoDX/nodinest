import {
  BarChart3,
  Brain,
  BookOpen,
  Building2,
  CalendarCheck,
  Home,
  PenLine,
  Settings,
  ShieldCheck,
  Sparkles,
  CircleUserRound,
  Clapperboard,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  key: string;
  icon: LucideIcon;
  admin?: boolean;
  /** Where the link goes when it differs from `href` (e.g. my own profile). */
  to?: string;
  /** Other sections shown as tabs inside this one (they keep it highlighted). */
  includes?: string[];
};

/**
 * Default order: the places used most (home, Darsxona, Media, Chats, the same as
 * the phone's bottom bar), then the day's plan, review, the AI and writing; the
 * rest below the line. Users can drag items to their own order (lib/nav-order.ts).
 */
export const NAV_PRIMARY: NavItem[] = [
  { href: "/", key: "dashboard", icon: Home },
  {
    href: "/library",
    key: "library",
    icon: BookOpen,
    includes: ["/people", "/publishers", "/notes", "/collections"],
  },
  { href: "/media", key: "media", icon: Clapperboard },
  { href: "/chats", key: "chats", icon: MessageCircle },
  { href: "/plans", key: "plans", icon: CalendarCheck },
  { href: "/review", key: "review", icon: Brain },
  { href: "/assistant", key: "assistant", icon: Sparkles },
  { href: "/write", key: "write", icon: PenLine },
];

export const NAV_SECONDARY: NavItem[] = [
  {
    href: "/profile",
    key: "profile",
    icon: CircleUserRound,
    includes: ["/u", "/community"],
  },
  { href: "/stats", key: "stats", icon: BarChart3 },
  { href: "/settings", key: "settings", icon: Settings },
  { href: "/admin", key: "admin", icon: ShieldCheck, admin: true },
];

/** Sections reached through Darsxona's tabs (not in the side menu). */
export const NAV_INNER: NavItem[] = [
  { href: "/people", key: "people", icon: Users },
  { href: "/publishers", key: "publishers", icon: Building2 },
];
