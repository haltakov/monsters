import { pathToFileURL } from "node:url";

/** Non-counting deployment check: never sends a valid analytics event. */
export async function checkAnalytics(
  origin = "https://monstersdna.com",
  request = fetch,
) {
  const site = new URL(origin);
  const script = await request(new URL("/js/script.js", site), {
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!script.ok) {
    throw new Error(
      `Tracking script returned ${script.status}; check the build-time Plausible ID and script upstream.`,
    );
  }
  if (!/javascript/.test(script.headers.get("content-type") ?? "")) {
    throw new Error(
      "Tracking script is not JavaScript (possibly an HTML fallback).",
    );
  }
  const source = await script.text();
  if (
    !/domain\s*:\s*["']monstersdna\.com["']/.test(source) ||
    !source.includes("plausible.init")
  ) {
    throw new Error(
      "Tracking script is not the site-specific MonstersDNA v4 script.",
    );
  }

  // A malformed payload must reach Plausible and be rejected. This verifies
  // the event route and browser CORS without adding a fake pageview.
  const event = await request("https://p.monstersdna.com/api/event", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Origin: site.origin },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const cors = event.headers.get("access-control-allow-origin");
  if (event.status !== 400 || (cors !== "*" && cors !== site.origin)) {
    throw new Error(
      `Events proxy/CORS failed (status ${event.status}, origin ${cors ?? "missing"}).`,
    );
  }
  const body = await event.json();
  if (!body.errors?.domain || !body.errors?.url) {
    throw new Error(
      "Events proxy did not return Plausible's expected validation response.",
    );
  }
  return "MonstersDNA script and p.monstersdna.com event proxy are healthy. No test pageviews recorded.";
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkAnalytics(process.argv[2])
    .then(console.log)
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
