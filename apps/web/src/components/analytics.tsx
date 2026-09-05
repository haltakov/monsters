"use client";

import PlausibleProvider, { usePlausible } from "next-plausible";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const SITE_ORIGIN = "https://monstersdna.com";

// next-plausible serializes init functions into an inline script. Keep this
// callback self-contained (no imported helpers or module-scope references).
export function sanitizeAnalyticsEvent(payload: Record<string, unknown>) {
  if (payload.n !== "pageview" && payload.n !== "engagement") return false;
  try {
    const url = new URL(String(payload.u));
    payload.u = `https://monstersdna.com${url.pathname}`;
    payload.d = "monstersdna.com";
    // Keep referral attribution, but never send its path, query, or fragment.
    payload.r = payload.r ? new URL(String(payload.r)).origin : null;
    delete payload.p;
    delete payload.$;
    return payload;
  } catch {
    return false;
  }
}

// v4's typings do not yet include transformRequest, which Plausible supports.
const analyticsInit = {
  endpoint: "https://p.monstersdna.com/api/event",
  autoCapturePageviews: false,
  formSubmissions: false,
  outboundLinks: false,
  transformRequest: sanitizeAnalyticsEvent,
};

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
      src="/js/script.js"
      init={analyticsInit}
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
