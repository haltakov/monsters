import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/components/i18n";
import { AdminMonsterActions } from "@/components/account/admin-monster-actions";
import { api } from "@/lib/net/api-client";

describe("keeper creature actions", () => {
  it("names the target, honors cancel and requires confirmation before killing", () => {
    const kill = vi.fn(),
      spawn = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <LanguageProvider>
        <AdminMonsterActions
          monster={{ id: "one", name: "Pebble", alive: true }}
          busy={false}
          onKill={kill}
          onSpawn={spawn}
        />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Kill Pebble" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Kill Pebble?"),
    );
    expect(kill).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Kill Pebble" }));
    expect(kill).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    { alive: false, busy: false },
    { alive: true, busy: true },
  ])(
    "disables kill for dead animals or in-flight actions: %o",
    ({ alive, busy }) => {
      const kill = vi.fn();
      render(
        <LanguageProvider>
          <AdminMonsterActions
            monster={{ id: "one", name: "Pebble", alive }}
            busy={busy}
            onKill={kill}
            onSpawn={vi.fn()}
          />
        </LanguageProvider>,
      );
      expect(
        screen.getByRole("button", { name: "Kill Pebble" }),
      ).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Kill Pebble" }));
      expect(kill).not.toHaveBeenCalled();
    },
  );

  it("posts only to the encoded target’s admin endpoint, with session credentials", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ monster: { id: "wild:one", alive: false } }),
        ),
      );
    await api.adminKillMonster("wild:one", {
      baseUrl: "https://example.com",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.com/api/admin/monsters/wild%3Aone/kill",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
