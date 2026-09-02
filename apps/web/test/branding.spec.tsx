import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import { LanguageProvider, LOCALES } from "@/components/i18n";

describe("MonstersDNA branding", () => {
  it.each(LOCALES)(
    "uses the same game name in the %s header and title",
    (locale) => {
      // Renaming the game must not reset existing language preferences.
      window.localStorage.setItem("monsters-language", locale);
      render(
        <LanguageProvider>
          <Home />
        </LanguageProvider>,
      );
      expect(
        screen.getByRole("link", { name: /MonstersDNA/ }),
      ).toHaveTextContent("MonstersDNA");
      expect(document.title).toMatch(/^MonstersDNA — /);
      expect(document.documentElement.lang).toBe(locale);
    },
  );
});
