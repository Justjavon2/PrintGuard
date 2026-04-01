import { User, Mail, Bell, Sliders, Building2 } from "lucide-react";
import { getProtectedContext } from "@/lib/data/context";
import {
  openDemoModeAction,
  setActiveOrganizationAction,
} from "@/app/protected/settings/actions";
import { LogoutButton } from "@/components/logout-button";

const sectionClassName = "bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-5 space-y-4 shadow-sm";
const labelClassName = "text-xs font-medium text-muted-foreground uppercase tracking-wide";
const inputClassName =
  "w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-shadow";

export default async function SettingsPage() {
  const context = await getProtectedContext();

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Account, notifications, and lab preferences</p>
      </div>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 size={15} />
          Active Organization
        </div>
        <p className="text-xs text-muted-foreground">
          Current: <span className="font-medium text-foreground">{context.activeOrganizationName ?? "Not selected"}</span>
        </p>
        <div className="space-y-2">
          {context.memberships.map((membership) => (
            <form key={membership.organizationId} action={setActiveOrganizationAction}>
              <input type="hidden" name="organizationId" value={membership.organizationId} />
              <button
                type="submit"
                className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-surface-2 transition-colors"
              >
                <p className="text-sm font-medium text-foreground">{membership.organizationName}</p>
                <p className="text-[11px] text-muted-foreground">Role: {membership.role}</p>
              </button>
            </form>
          ))}
        </div>
      </section>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sliders size={15} />
          Demo Environment
        </div>
        <p className="text-xs text-muted-foreground">
          Open an isolated demo workspace. Demo data and your organization data are fully separate.
        </p>
        <form action={openDemoModeAction}>
          <button
            type="submit"
            className="px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-surface-2"
          >
            Open Demo
          </button>
        </form>
      </section>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <User size={15} />
          Profile
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClassName}>Display Name</label>
            <input className={inputClassName} defaultValue={context.userDisplayName ?? ""} />
          </div>
          <div className="space-y-1.5">
            <label className={labelClassName}>Email</label>
            <input className={inputClassName} defaultValue={context.userEmail ?? ""} type="email" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            Save Changes
          </button>
          <LogoutButton />
        </div>
      </section>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mail size={15} />
          Sign-In Methods
        </div>
        <div className="space-y-2">
          {[
            { label: "Email / Password", status: "Connected" },
            { label: "Google OAuth", status: "Not linked" },
          ].map(({ label, status }) => (
            <div key={label} className="flex items-center justify-between py-2.5 px-3 bg-surface-2 rounded-lg">
              <span className="text-sm text-foreground">{label}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{status}</span>
                <button className="text-xs text-primary hover:underline">
                  {status === "Connected" ? "Update" : "Link"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClassName}>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Bell size={15} />
          Notifications
        </div>
        <p className="text-sm text-muted-foreground">Notification controls remain in phased rollout.</p>
      </section>
    </div>
  );
}
