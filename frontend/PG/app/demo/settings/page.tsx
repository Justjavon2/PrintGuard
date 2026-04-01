import { exitDemoModeAction } from "@/app/protected/settings/actions";

export default function DemoSettingsPage() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Demo Settings</h1>
        <p className="text-sm text-muted-foreground">You are in an isolated demo workspace.</p>
      </div>

      <section className="bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-5 space-y-3">
        <p className="text-sm text-foreground font-medium">Exit Demo Mode</p>
        <p className="text-xs text-muted-foreground">Return to your real organization interface and real printer data.</p>
        <form action={exitDemoModeAction}>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-2"
          >
            Exit Demo
          </button>
        </form>
      </section>
    </div>
  );
}
