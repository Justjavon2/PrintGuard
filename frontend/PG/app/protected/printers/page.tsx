import { redirect } from "next/navigation";
import { getProtectedContext } from "@/lib/data/context";
import { loadRealPrinters } from "@/lib/data/real-data";

export default async function PrintersPage() {
  const context = await getProtectedContext();

  if (context.isDemoMode) {
    redirect("/demo/printers");
  }
  if (!context.activeOrganizationId) {
    redirect("/protected/select-org");
  }

  const { printers } = await loadRealPrinters(context.supabase, context.activeOrganizationId);
  if (printers.length === 0) {
    redirect("/protected/fleet");
  }

  redirect(`/protected/printers/${printers[0].id}`);
}
