import { redirect } from "next/navigation";
import { MOCK_PRINTERS } from "@/lib/mock-data";

export default function DemoPrintersPage() {
  redirect(`/demo/printers/${MOCK_PRINTERS[0]?.id ?? "printer-1"}`);
}
