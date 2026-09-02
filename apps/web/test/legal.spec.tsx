import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/privacy/page";
import TermsPage, { metadata as termsMetadata } from "@/app/terms/page";

describe("public legal pages", () => {
  it.each([
    ["Privacy policy", PrivacyPage, "/privacy/", privacyMetadata],
    ["Terms of use", TermsPage, "/terms/", termsMetadata],
  ] as const)(
    "renders %s without requiring an account",
    (title, Page, path, metadata) => {
      const { container } = render(<Page />);
      expect(
        screen.getByRole("link", { name: "MonstersDNA home" }),
      ).toHaveTextContent("MonstersDNA");
      expect(
        screen.getByRole("heading", { name: title, level: 1 }),
      ).toBeVisible();
      expect(
        screen.getByRole("navigation", { name: "Legal information" }),
      ).toBeVisible();
      expect(screen.getByRole("link", { name: "Play" })).toHaveAttribute(
        "href",
        expect.stringMatching(/^\/game\/?$/),
      );
      expect(metadata.alternates?.canonical).toBe(path);
      expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(container.textContent).not.toMatch(/\S+@\S+\.[a-z]+/);
    },
  );
});
