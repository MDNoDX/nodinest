import {
  BarChart3,
  BookOpen,
  Brain,
  Building2,
  CalendarCheck,
  FolderHeart,
  Home,
  Inbox,
  NotebookPen,
  PenLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  key: string;
  icon: LucideIcon;
  admin?: boolean;
  /** Other sections shown as tabs inside this one (they keep it highlighted). */
  includes?: string[];
};

export const NAV_PRIMARY: NavItem[] = [
  { href: "/", key: "dashboard", icon: Home },
  { href: "/search", key: "search", icon: Search },
  { href: "/library", key: "library", icon: BookOpen, includes: ["/people", "/publishers"] },
  { href: "/write", key: "write", icon: PenLine },
  { href: "/collections", key: "collections", icon: FolderHeart },
  { href: "/notes", key: "notes", icon: NotebookPen },
  { href: "/review", key: "review", icon: Brain },
  { href: "/plans", key: "plans", icon: CalendarCheck },
];

export const NAV_SECONDARY: NavItem[] = [
  { href: "/assistant", key: "assistant", icon: Sparkles },
  { href: "/community", key: "community", icon: UsersRound, includes: ["/u"] },
  { href: "/stats", key: "stats", icon: BarChart3 },
  { href: "/suggestions", key: "suggestions", icon: Inbox },
  { href: "/settings", key: "settings", icon: Settings },
  { href: "/admin", key: "admin", icon: ShieldCheck, admin: true },
];

/** Sections reached through Darsxona's tabs (not in the side menu). */
export const NAV_INNER: NavItem[] = [
  { href: "/people", key: "people", icon: Users },
  { href: "/publishers", key: "publishers", icon: Building2 },
];
