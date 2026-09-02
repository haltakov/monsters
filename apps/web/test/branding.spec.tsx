import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import { LanguageProvider, LOCALES } from "@/components/i18n";
import { MonsterMark } from "@/components/monster-mark";

describe("MonstersDNA branding", () => {
  it("uses the shared generated mascot without duplicate accessible text", () => {
    const { container } = render(<MonsterMark className="brand-mark" />);
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "/brand/monstersdna-mark-v1.png?v=1");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveClass("monster-mark", "brand-mark");
    expect(image).toHaveAttribute("width", "256");
    expect(image).toHaveAttribute("height", "256");
  });

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
