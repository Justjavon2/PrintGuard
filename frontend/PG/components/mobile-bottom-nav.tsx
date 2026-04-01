"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Printer, Bell, History } from "lucide-react";
import { cn } from "@/lib/utils";

const MOBILE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/printers",  label: "Printers",  icon: Printer },
  { href: "/alerts",    label: "Alerts",    icon: Bell, badge: 2 },
  { href: "/history",   label: "History",   icon: History },
];

interface MobileBottomNavProps {
  basePath?: "/protected" | "/demo";
}

export function MobileBottomNav({ basePath = "/protected" }: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border flex items-center">
      {MOBILE_NAV.map(({ href, label, icon: Icon, badge }) => {
        const resolvedHref = `${basePath}${href}`;
        const active = pathname === resolvedHref || pathname.startsWith(resolvedHref + "/");
        return (
          <Link
            key={resolvedHref}
            href={resolvedHref}
            className={cn(
              "flex-1 flex flex-col items-center gap-1 py-3 relative text-xs transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <div className="relative">
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              {badge && (
                <span className="absolute -top-1 -right-1 bg-pg-danger text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {badge}
                </span>
              )}
            </div>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
