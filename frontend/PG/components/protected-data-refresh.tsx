"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const refreshIntervalMs = 30000;

export function ProtectedDataRefresh(): null {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/protected")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, refreshIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pathname, router]);

  return null;
}
