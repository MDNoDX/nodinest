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
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; key: string; icon: LucideIcon; admin?: boolean };

export const NAV_PRIMARY: NavItem[] = [
  { href: "/", key: "dashboard", icon: Home },
  { href: "/library", key: "library", icon: BookOpen },
  { href: "/people", key: "people", icon: Users },
  { href: "/publishers", key: "publishers", icon: Building2 },
  { href: "/collections", key: "collections", icon: FolderHeart },
  { href: "/notes", key: "notes", icon: NotebookPen },
  { href: "/review", key: "review", icon: Brain },
  { href: "/plans", key: "plans", icon: CalendarCheck },
];

export const NAV_SECONDARY: NavItem[] = [
  { href: "/search", key: "search", icon: Search },
  { href: "/assistant", key: "assistant", icon: Sparkles },
  { href: "/stats", key: "stats", icon: BarChart3 },
  { href: "/suggestions", key: "suggestions", icon: Inbox },
  { href: "/settings", key: "settings", icon: Settings },
  { href: "/admin", key: "admin", icon: ShieldCheck, admin: true },
];
