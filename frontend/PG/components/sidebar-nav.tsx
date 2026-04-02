"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  History,
  Server,
  Settings,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  basePath?: "/protected" | "/demo";
  userDisplayName?: string | null;
  organizationName?: string | null;
  userInitials?: string;
}

export function SidebarNav({
  basePath = "/protected",
  userDisplayName = "User",
  organizationName = "Organization",
  userInitials = "U",
}: SidebarNavProps) {
  const pathname = usePathname();
  const navItems = [
    { href: `${basePath}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `${basePath}/alerts`, label: "Alerts", icon: Bell, badge: 2 },
    { href: `${basePath}/history`, label: "History", icon: History },
    { href: `${basePath}/fleet`, label: "Fleet", icon: Server },
    ...(basePath === "/protected"
      ? [{ href: `${basePath}/analytics`, label: "Analytics", icon: BarChart3 }]
      : []),
    { href: `${basePath}/settings`, label: "Settings", icon: Settings },
  ];

  return (
    <aside className="hidden md:flex flex-col w-[240px] min-h-screen border-r border-border bg-card shrink-0">
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-border shrink-0">
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="hsl(var(--primary-foreground))" strokeWidth="1.5" />
            <circle cx="7" cy="7" r="2" fill="hsl(var(--primary-foreground))" />
          </svg>
        </div>
        <span className="font-semibold text-sm tracking-tight text-foreground">
          PrintGuard <span className="text-primary">AI</span>
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 p-3 flex-1">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors relative",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
              <span>{label}</span>
              {badge ? (
                <span className="ml-auto bg-pg-warning text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md">
          <div className="w-7 h-7 rounded-full bg-surface-2 flex items-center justify-center text-xs font-semibold text-muted-foreground">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{userDisplayName}</p>
            <p className="text-[10px] text-muted-foreground truncate">{organizationName}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
