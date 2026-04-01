import { SidebarNav } from "@/components/sidebar-nav";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { exitDemoModeAction } from "@/app/protected/settings/actions";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <SidebarNav basePath="/demo" />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          <span className="text-sm font-semibold text-foreground">Demo Workspace</span>
          <span className="text-[10px] uppercase px-2 py-0.5 rounded border text-pg-warning bg-warning-dim border-pg-warning/30">demo</span>
          <div className="flex-1" />
          <form action={exitDemoModeAction}>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-accent"
            >
              Exit Demo
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>
      <MobileBottomNav basePath="/demo" />
    </div>
  );
}
