import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { LanguageProvider } from "@/components/i18n";
import { MonsterDetailSelect } from "@/components/game/monster-detail-select";
import {
  chooseAutomaticMonsterDetail,
  parseMonsterDetail,
  readMonsterDetailSetting,
  saveMonsterDetailSetting,
  subscribeMonsterDetailSetting,
  getServerMonsterDetailSetting,
  MONSTER_DETAIL_STORAGE_KEY,
} from "@/lib/monster-detail-settings";

function Settings() {
  const value = useSyncExternalStore(
    subscribeMonsterDetailSetting,
    readMonsterDetailSetting,
    getServerMonsterDetailSetting,
  );
  return (
    <LanguageProvider>
      <MonsterDetailSelect
        value={value}
        automatic="balanced"
        onChange={saveMonsterDetailSetting}
      />
    </LanguageProvider>
  );
}

describe("monster detail preference", () => {
  it("starts capable phones and unknown devices at balanced, not minimum detail", () => {
    expect(chooseAutomaticMonsterDetail({ mobile: true, cores: 6 })).toBe(
      "balanced",
    );
    expect(chooseAutomaticMonsterDetail({ mobile: true })).toBe("balanced");
    expect(chooseAutomaticMonsterDetail({ mobile: false })).toBe("balanced");
    expect(chooseAutomaticMonsterDetail({ mobile: true, memoryGb: 2 })).toBe(
      "performance",
    );
    expect(chooseAutomaticMonsterDetail({ mobile: false, cores: 2 })).toBe(
      "performance",
    );
    expect(
      chooseAutomaticMonsterDetail({ mobile: false, cores: 12, memoryGb: 8 }),
    ).toBe("high");
  });

  it("rejects obsolete, malformed and unrecognized saved settings", () => {
    expect(parseMonsterDetail("ultra")).toBe("auto");
    expect(parseMonsterDetail(null)).toBe("auto");
    expect(parseMonsterDetail({ full: 10000 })).toBe("auto");
    expect(parseMonsterDetail("high")).toBe("high");
  });

  it("updates immediately and retains manual selection after remount", () => {
    const view = render(<Settings />);
    const select = screen.getByRole("combobox", {
      name: "Monster detail distance",
    });
    expect(select).toHaveValue("auto");
    expect(screen.getByText("Full creatures within 64 m.")).toBeVisible();
    fireEvent.change(select, { target: { value: "high" } });
    expect(screen.getByText("Full creatures within 96 m.")).toBeVisible();
    expect(window.localStorage.getItem(MONSTER_DETAIL_STORAGE_KEY)).toBe(
      "high",
    );
    view.unmount();
    render(<Settings />);
    expect(screen.getByRole("combobox")).toHaveValue("high");
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "auto" },
    });
    expect(screen.getByText("Full creatures within 64 m.")).toBeVisible();
  });

  it("reacts to changes from another tab and removes subscriptions", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMonsterDetailSetting(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(listener).not.toHaveBeenCalled();
    window.localStorage.setItem(MONSTER_DETAIL_STORAGE_KEY, "performance");
    window.dispatchEvent(
      new StorageEvent("storage", { key: MONSTER_DETAIL_STORAGE_KEY }),
    );
    expect(readMonsterDetailSetting()).toBe("performance");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("still lets the player tune detail when browser storage is blocked", () => {
    const blocked = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() => saveMonsterDetailSetting("high")).not.toThrow();
    expect(readMonsterDetailSetting()).toBe("high");
    blocked.mockRestore();
    saveMonsterDetailSetting("auto");
  });
});
