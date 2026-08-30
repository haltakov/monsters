import { describe, expect, it } from "vitest";
import { getOptionLabel, LOCALES } from "@/components/i18n";

describe("DNA option labels", () => {
  it.each(LOCALES)("keeps numeric genes readable in %s", (locale) => {
    expect(getOptionLabel(locale, 0)).toBe("0");
    expect(getOptionLabel(locale, 4)).toBe("4");
    expect(getOptionLabel(locale, 10)).toBe("10");
  });

  it("falls back to a readable label for an unknown option", () => {
    expect(getOptionLabel("en", "new-gene")).toBe("new-gene");
  });
});
