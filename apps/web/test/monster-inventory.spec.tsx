import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n";
import { MonsterRecovery } from "@/components/game/monster-recovery";
import { AccountHub } from "@/components/account/account-hub";
import { DEFAULT_MONSTER_DNA, encodeMonsterDna } from "@monsters/game-core";
import { api, type MonsterSummary } from "@/lib/net/api-client";
import type { ReactNode } from "react";

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/components/account/monster-portrait", () => ({
  MonsterPortraitProvider: ({ children }: { children: ReactNode }) => children,
  MonsterPortrait: ({ name }: { name: string }) => <span>{name} portrait</span>,
}));
const dna = encodeMonsterDna(DEFAULT_MONSTER_DNA);
const saved: MonsterSummary = {
  id: "saved",
  name: "My Godzilla",
  species: "saurian",
  dna,
  alive: false,
  diedAt: null,
  ageSeconds: 60,
  generation: 0,
  parentIds: null,
  mutations: 0,
  createdAt: "2026-01-01T00:00:00Z",
  inWorld: false,
  selected: true,
  accountOwned: false,
  originType: "player",
  clonedFromId: null,
};
beforeEach(() => {
  localStorage.setItem("monsters-language", "en");
  vi.spyOn(api, "authConfiguration").mockResolvedValue({
    google: false,
    magicLink: false,
  });
});

describe("monster recovery and inventory", () => {
  it("offers the last saved design and inventory after death or reset", async () => {
    const respawn = vi.fn().mockResolvedValue(undefined),
      inventory = vi.fn();
    render(
      <LanguageProvider>
        <MonsterRecovery
          monster={saved}
          busy={false}
          error={null}
          onRespawn={respawn}
          onInventory={inventory}
        />
      </LanguageProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Respawn My Godzilla" }),
    );
    await waitFor(() => expect(respawn).toHaveBeenCalledWith("saved"));
    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    expect(inventory).toHaveBeenCalledOnce();
  });
  it("disables repeated respawns while saving and displays actionable server errors", () => {
    const respawn = vi.fn();
    render(
      <LanguageProvider>
        <MonsterRecovery
          monster={saved}
          busy
          error="Your living inventory is full"
          onRespawn={respawn}
          onInventory={() => {}}
        />
      </LanguageProvider>,
    );
    const button = screen.getByRole("button", { name: "Respawning…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(respawn).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your living inventory is full",
    );
  });
  it("lists living and saved monsters and respawns a dead design directly", async () => {
    const respawn = vi.fn().mockResolvedValue(undefined),
      play = vi.fn(),
      open = vi.fn();
    render(
      <LanguageProvider>
        <AccountHub
          open
          onOpenChange={open}
          onRespawn={respawn}
          guestToken="token"
          monsters={[
            saved,
            { ...saved, id: "living", name: "Living Kong", alive: true },
          ]}
          selectedDna={dna}
          onRefresh={async () => {}}
          onPlay={play}
          onCopy={async () => {}}
        />
      </LanguageProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Saved monsters" }),
    ).toBeInTheDocument();
    expect(screen.getByText("My Godzilla")).toBeInTheDocument();
    expect(screen.getByText("Living Kong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Respawn" }));
    await waitFor(() => expect(respawn).toHaveBeenCalledWith("saved"));
    await waitFor(() => expect(open).toHaveBeenCalledWith(false));
    expect(play).not.toHaveBeenCalled();
  });
  it("keeps the inventory open and reports a failed respawn", async () => {
    const respawn = vi.fn().mockRejectedValue(new Error("World unavailable")),
      open = vi.fn();
    render(
      <LanguageProvider>
        <AccountHub
          open
          onOpenChange={open}
          onRespawn={respawn}
          guestToken="token"
          monsters={[saved]}
          selectedDna={dna}
          onRefresh={async () => {}}
          onPlay={async () => {}}
          onCopy={async () => {}}
        />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Respawn" }));
    expect(await screen.findByText("World unavailable")).toBeInTheDocument();
    expect(open).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Respawn" })).toBeEnabled();
  });
});
