import { describe, expect, it, vi } from "vitest";
import { checkAnalytics } from "../../../deploy/check-analytics.mjs";

const tracker = 'domain:"monstersdna.com"; plausible.init = init';
function responses(scriptStatus = 200, source = tracker, cors = "*") {
  return vi
    .fn()
    .mockResolvedValueOnce(
      new Response(source, {
        status: scriptStatus,
        headers: { "content-type": "application/javascript" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errors: { domain: ["required"], url: ["required"] } }),
        {
          status: 400,
          headers: { "access-control-allow-origin": cors },
        },
      ),
    );
}

describe("analytics deployment check", () => {
  it("checks script identity and event delivery without recording pageviews", async () => {
    const request = responses();
    await expect(
      checkAnalytics("https://monstersdna.com", request),
    ).resolves.toContain("healthy");
    expect(request).toHaveBeenLastCalledWith(
      "https://p.monstersdna.com/api/event",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: {
          "Content-Type": "text/plain",
          Origin: "https://monstersdna.com",
        },
      }),
    );
  });
  it.each([503, 404])("detects the production failure (%s)", async (status) => {
    await expect(checkAnalytics(undefined, responses(status))).rejects.toThrow(
      `returned ${status}`,
    );
  });
  it("rejects a script for a different site", async () => {
    await expect(
      checkAnalytics(
        undefined,
        responses(200, tracker.replace("monstersdna.com", "example.com")),
      ),
    ).rejects.toThrow("site-specific");
  });
  it("rejects an events proxy that browsers cannot use", async () => {
    await expect(
      checkAnalytics(
        undefined,
        responses(200, tracker, "https://wrong.example"),
      ),
    ).rejects.toThrow("CORS");
  });
});
