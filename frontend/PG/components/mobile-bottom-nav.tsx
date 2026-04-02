"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Bell, History, BarChart3, Server } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  basePath?: "/protected" | "/demo";
}

export function MobileBottomNav({ basePath = "/protected" }: MobileBottomNavProps) {
  const pathname = usePathname();
  const navItems = [
    { href: `${basePath}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `${basePath}/alerts`, label: "Alerts", icon: Bell, badge: 2 },
    { href: `${basePath}/fleet`, label: "Fleet", icon: Server },
    ...(basePath === "/protected"
      ? [{ href: `${basePath}/analytics`, label: "Analytics", icon: BarChart3 }]
      : []),
    { href: `${basePath}/history`, label: "History", icon: History },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border flex items-center">
      {navItems.map(({ href, label, icon: Icon, badge }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 relative text-xs transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <div className="relative">
              <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
              {badge ? (
                <span className="absolute -top-1 -right-1 bg-pg-warning text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {badge}
                </span>
              ) : null}
            </div>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
