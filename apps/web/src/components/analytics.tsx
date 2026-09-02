"use client";

import PlausibleProvider, { usePlausible } from "next-plausible";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const ANALYTICS_ORIGIN = "https://p.monstersdna.com";
export const SITE_ORIGIN = "https://monstersdna.com";

function Pageviews({ ready }: { ready: boolean }) {
  const pathname = usePathname();
  const plausible = usePlausible();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    // Never send auth callback parameters, player IDs, nicknames, or DNA.
    plausible("pageview", { u: `${SITE_ORIGIN}${pathname}` });
  }, [pathname, plausible, ready]);

  return null;
}

export function Analytics() {
  const [ready, setReady] = useState(false);
  const enabled =
    process.env.NODE_ENV === "production" &&
    /^pa-[A-Za-z0-9_-]+$/.test(
      process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID ?? "",
    );

  if (!enabled) return null;

  return (
    <PlausibleProvider
      src={`${ANALYTICS_ORIGIN}/js/script.js`}
      init={{
        endpoint: `${ANALYTICS_ORIGIN}/api/event`,
        autoCapturePageviews: false,
      }}
      scriptProps={{
        crossOrigin: "anonymous",
        referrerPolicy: "no-referrer",
        onLoad: () => setReady(true),
      }}
    >
      <Pageviews ready={ready} />
    </PlausibleProvider>
  );
}
