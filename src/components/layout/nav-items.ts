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
 * Default order: what a reader does every day first (home, the day's plan,
 * the library, the AI, quotes, review), then making things; the rest below the line.
 * Users can drag items to their own order (lib/nav-order.ts).
 */
export const NAV_PRIMARY: NavItem[] = [
  { href: "/", key: "dashboard", icon: Home },
  { href: "/plans", key: "plans", icon: CalendarCheck },
  {
    href: "/library",
    key: "library",
    icon: BookOpen,
    includes: ["/people", "/publishers", "/notes", "/collections"],
  },
  { href: "/review", key: "review", icon: Brain },
  { href: "/media", key: "media", icon: Clapperboard },
  { href: "/chats", key: "chats", icon: MessageCircle },
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
