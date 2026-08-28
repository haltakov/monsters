import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/components/i18n";
import { ConnectionBadge } from "@/components/game/connection-badge";
import { PairingRequestCard } from "@/components/game/pairing-prompt";

function withI18n(node: React.ReactNode) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

// jsdom reports a Bulgarian navigator locale on this machine; pin English so
// the assertions read naturally.
beforeEach(() => {
  window.localStorage.setItem("monsters-language", "en");
});

describe("connection indicator", () => {
  it("shows a live badge when connected", () => {
    withI18n(<ConnectionBadge phase="connected" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("Live");
    expect(badge).toHaveAttribute("data-phase", "connected");
  });

  it("shows an actionable state while reconnecting and after failure", () => {
    const { rerender } = withI18n(<ConnectionBadge phase="reconnecting" />);
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting");

    rerender(
      <LanguageProvider>
        <ConnectionBadge phase="error" />
      </LanguageProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Connection failed");
    expect(screen.getByRole("status")).toHaveAttribute("data-phase", "error");
  });
});

describe("player pairing request", () => {
  const request = {
    requestId: "pair-1",
    fromName: "Bramble Snout",
    expiresAtMs: Date.now() + 20_000,
  };

  it("names the other player and shows the expiry countdown", () => {
    withI18n(
      <PairingRequestCard
        request={request}
        secondsLeft={14}
        onRespond={() => undefined}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Bramble Snout wants to pair with you.",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("14s left");
  });

  it("requires an explicit accept or decline", async () => {
    const onRespond = vi.fn();
    withI18n(
      <PairingRequestCard
        request={request}
        secondsLeft={9}
        onRespond={onRespond}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onRespond).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onRespond).toHaveBeenLastCalledWith(false);
    expect(onRespond).toHaveBeenCalledTimes(2);
  });
});
