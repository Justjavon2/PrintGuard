import { redirect } from "next/navigation";
import { getProtectedContext } from "@/lib/data/context";
import { setActiveOrganizationAction } from "@/app/protected/settings/actions";

export default async function SelectOrganizationPage() {
  const context = await getProtectedContext();

  if (!context.userId) {
    redirect("/auth/login");
  }

  if (context.memberships.length <= 1 && context.activeOrganizationId) {
    redirect("/protected/dashboard");
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Choose Organization</h1>
        <p className="text-sm text-muted-foreground">
          Select which organization context to use for dashboards, printers, and camera feeds.
        </p>
      </div>

      <div className="space-y-3">
        {context.memberships.map((membership) => (
          <form key={membership.organizationId} action={setActiveOrganizationAction}>
            <input type="hidden" name="organizationId" value={membership.organizationId} />
            <button
              type="submit"
              className="w-full text-left bg-[hsl(0,80%,99%)] rounded-[14px] border border-border p-4 hover:bg-surface-2 transition-colors"
            >
              <p className="font-semibold text-foreground">{membership.organizationName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Role: {membership.role} {membership.organizationSlug ? `· ${membership.organizationSlug}` : ""}
              </p>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
