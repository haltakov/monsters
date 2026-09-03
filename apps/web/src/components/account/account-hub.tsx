"use client";

import {
  Baby,
  ChevronRight,
  Copy,
  Dna,
  LogIn,
  LogOut,
  Mail,
  Play,
  RotateCcw,
  Shield,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth/auth-client";
import {
  api,
  ApiError,
  type MonsterLineage,
  type MonsterSummary,
} from "@/lib/net/api-client";
import { useI18n } from "@/components/i18n";
import { decodeMonsterDna } from "@monsters/game-core";
import { MonsterAge } from "@/components/game/monster-age";

type AuthConfiguration = { google: boolean; magicLink: boolean };
type AccountUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string;
};

type AdminMonster = MonsterSummary & {
  owner: { id: string; name: string; email: string } | null;
  localPlayerCreated: boolean;
};

type Props = {
  guestToken: string;
  monsters: MonsterSummary[];
  selectedDna: string;
  onRefresh: () => Promise<void>;
  onPlay: (id: string) => Promise<void>;
  onCopy: (id: string) => Promise<void>;
};

function describeError(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "Something went wrong";
}

function OriginBadge({ origin }: { origin: string }) {
  const labels: Record<string, string> = {
    player: "Player-created",
    mating: "Hatched",
    wild: "Wild",
    admin: "Island keeper",
    copy: "Copied",
  };
  return (
    <span className={`account-origin origin-${origin}`}>
      {labels[origin] ?? origin}
    </span>
  );
}

export function AccountHub({
  guestToken,
  monsters,
  selectedDna,
  onRefresh,
  onPlay,
  onCopy,
}: Props) {
  const { t } = useI18n();
  const session = authClient.useSession();
  const user = (session.data?.user ?? null) as AccountUser | null;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"family" | "archive" | "admin">("family");
  const [configuration, setConfiguration] = useState<AuthConfiguration>({
    google: false,
    magicLink: false,
  });
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lineage, setLineage] = useState<MonsterLineage | null>(null);
  const [adminMonsters, setAdminMonsters] = useState<AdminMonster[]>([]);
  const [publicMonsters, setPublicMonsters] = useState<MonsterSummary[]>([]);
  const [publicTotal, setPublicTotal] = useState(0);
  const [adminOrigin, setAdminOrigin] = useState("all");
  const [adminSearch, setAdminSearch] = useState("");
  const [adminName, setAdminName] = useState("Keeper's creature");
  const [adminDna, setAdminDna] = useState(selectedDna);
  const [adminEditId, setAdminEditId] = useState<string | null>(null);
  const [resetPopulation, setResetPopulation] = useState(10);
  const claimKey = useRef<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void api
      .authConfiguration()
      .then(setConfiguration)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!user) {
      claimKey.current = null;
      return;
    }
    const key = `${user.id}:${guestToken}`;
    if (claimKey.current === key) return;
    claimKey.current = key;
    void api
      .claimAccount(guestToken)
      .then(async ({ claimedMonsters }) => {
        await onRefresh();
        if (claimedMonsters > 0) {
          setMessage(t("account.claimed", { count: claimedMonsters }));
        }
      })
      .catch((claimError) => {
        claimKey.current = null;
        setError(describeError(claimError));
      });
  }, [guestToken, onRefresh, t, user]);

  const closePanel = useCallback(() => {
    setOpen(false);
    setLineage(null);
  }, []);

  useEffect(() => {
    if (open) {
      closeButton.current?.focus();
      return;
    }
    opener.current?.focus();
    opener.current = null;
  }, [open]);

  const history = useMemo(
    () =>
      [...monsters].sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      ),
    [monsters],
  );

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (actionError) {
      setError(describeError(actionError));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadLineage = (id: string) =>
    run(async () => setLineage(await api.getMonsterLineage(id)));

  const loadAdmin = useCallback(
    () =>
      run(async () => {
        const result = await api.adminListMonsters(adminOrigin, adminSearch);
        setAdminMonsters(result.monsters);
      }),
    [adminOrigin, adminSearch, run],
  );

  const loadArchive = useCallback(
    () =>
      run(async () => {
        const result = await api.listPublicMonsters(adminOrigin, adminSearch);
        setPublicMonsters(result.monsters);
        setPublicTotal(result.total);
      }),
    [adminOrigin, adminSearch, run],
  );

  const signInGoogle = () =>
    run(async () => {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
      });
    });

  const sendMagicLink = () =>
    run(async () => {
      const result = await authClient.signIn.magicLink({
        email,
        name: email.split("@")[0] || "Monster keeper",
        callbackURL: window.location.href,
      });
      if (result.error) throw new Error(result.error.message);
      setMessage(t("account.magicSent"));
    });

  const signOut = () =>
    run(async () => {
      await api.releaseAccount(guestToken);
      await authClient.signOut();
      await session.refetch();
      await onRefresh();
      setTab("family");
      setMessage(t("account.localAgain"));
    });

  const selectAdminMonster = (monster: AdminMonster) => {
    setAdminEditId(monster.id);
    setAdminName(monster.name);
    setAdminDna(monster.dna);
  };

  const saveAdminMonster = () =>
    run(async () => {
      if (adminEditId) {
        await api.adminUpdateMonster(adminEditId, {
          name: adminName,
          dna: adminDna,
        });
      } else {
        await api.adminCreateMonster({
          name: adminName,
          dna: adminDna,
          spawn: true,
        });
      }
      setAdminEditId(null);
      setAdminName("Keeper's creature");
      setAdminDna(selectedDna);
      await loadAdmin();
    });

  const resetAdminWorld = () => {
    if (
      !window.confirm(t("account.resetConfirm", { count: resetPopulation }))
    ) {
      return;
    }
    void run(async () => {
      const result = await api.adminResetWorld(resetPopulation);
      const refreshed = await api.adminListMonsters(adminOrigin, adminSearch);
      setAdminMonsters(refreshed.monsters);
      setAdminEditId(null);
      await onRefresh();
      setMessage(t("account.resetComplete", { count: result.population }));
    });
  };

  return (
    <>
      <button
        type="button"
        className="account-entry account-entry-desktop"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          opener.current = event.currentTarget;
          setOpen(true);
        }}
        aria-label={t("account.open")}
      >
        {user?.image ? (
          <Image src={user.image} alt="" width={29} height={29} unoptimized />
        ) : (
          <UserRound size={18} />
        )}
        <span>{user ? user.name : t("account.local")}</span>
      </button>
      <button
        type="button"
        className="account-entry account-entry-mobile"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          opener.current = event.currentTarget;
          setOpen(true);
        }}
        aria-label={t("account.open")}
      >
        {user?.image ? (
          <Image src={user.image} alt="" width={29} height={29} unoptimized />
        ) : (
          <UserRound size={19} />
        )}
      </button>

      {open && (
        <div
          className="account-backdrop"
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.target === event.currentTarget) closePanel();
          }}
        >
          <section
            className="account-ledger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-title"
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.code === "Escape") closePanel();
            }}
          >
            <header className="account-ledger-header">
              <div>
                <span>{t("account.kicker")}</span>
                <h2 id="account-title">
                  {user ? user.name : t("account.localTitle")}
                </h2>
              </div>
              <button
                ref={closeButton}
                type="button"
                className="account-close"
                onClick={closePanel}
                aria-label={t("account.close")}
              >
                <X size={20} />
              </button>
            </header>

            {user ? (
              <div className="account-identity-strip">
                <div className="account-avatar">
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                    />
                  ) : (
                    <UserRound />
                  )}
                </div>
                <div>
                  <strong>{user.email}</strong>
                  <span>{t("account.savedAcross")}</span>
                </div>
                {user.role === "admin" && (
                  <span className="account-admin-badge">
                    <Shield size={13} /> Admin
                  </span>
                )}
                <button type="button" onClick={signOut} disabled={busy}>
                  <LogOut size={15} /> {t("account.signOut")}
                </button>
              </div>
            ) : (
              <div className="account-login">
                <div className="account-local-note">
                  <Dna size={22} />
                  <div>
                    <strong>{t("account.playingLocal")}</strong>
                    <p>{t("account.localWarning")}</p>
                  </div>
                </div>
                {configuration.google && (
                  <button
                    type="button"
                    className="account-google"
                    onClick={signInGoogle}
                    disabled={busy}
                  >
                    <LogIn size={17} /> {t("account.google")}
                  </button>
                )}
                {configuration.magicLink && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void sendMagicLink();
                    }}
                  >
                    <label>
                      <span>{t("account.email")}</span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </label>
                    <button type="submit" disabled={busy}>
                      <Mail size={17} /> {t("account.magic")}
                    </button>
                  </form>
                )}
                {!configuration.google && !configuration.magicLink && (
                  <p className="account-setup-note">
                    {t("account.setupPending")}
                  </p>
                )}
                <div className="account-legal">
                  <p>{t("legal.notice")}</p>
                  <nav
                    className="legal-links"
                    aria-label={t("legal.navigation")}
                  >
                    <Link
                      href="/terms/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("legal.terms")}
                    </Link>
                    <Link
                      href="/privacy/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("legal.privacy")}
                    </Link>
                  </nav>
                </div>
              </div>
            )}

            <nav className="account-tabs" aria-label="Account sections">
              <button
                type="button"
                className={tab === "family" ? "selected" : ""}
                onClick={() => setTab("family")}
              >
                {t("account.family")}
              </button>
              <button
                type="button"
                className={tab === "archive" ? "selected" : ""}
                onClick={() => {
                  setTab("archive");
                  void loadArchive();
                }}
              >
                {t("account.islandArchive")}
              </button>
              {user?.role === "admin" && (
                <button
                  type="button"
                  className={tab === "admin" ? "selected" : ""}
                  onClick={() => {
                    setTab("admin");
                    void loadAdmin();
                  }}
                >
                  <Shield size={14} /> {t("account.islandKeeper")}
                </button>
              )}
            </nav>

            {message && <p className="account-message">{message}</p>}
            {error && <p className="account-error">{error}</p>}

            {tab === "family" ? (
              lineage ? (
                <div className="lineage-sheet">
                  <button
                    type="button"
                    className="lineage-back"
                    onClick={() => setLineage(null)}
                  >
                    ← {t("account.backHistory")}
                  </button>
                  <div className="lineage-hero">
                    <Baby size={25} />
                    <div>
                      <span>{t("account.lineage")}</span>
                      <h3>{lineage.monster.name}</h3>
                      <p>
                        Generation {lineage.monster.generation} ·{" "}
                        {lineage.monster.species}
                      </p>
                      <MonsterAge
                        dna={decodeMonsterDna(lineage.monster.dna)}
                        seconds={lineage.monster.ageSeconds}
                      />
                    </div>
                    <OriginBadge origin={lineage.monster.originType} />
                  </div>
                  <div className="lineage-branches">
                    {lineage.parents.map((parent) => (
                      <button
                        key={parent.id}
                        type="button"
                        onClick={() => void loadLineage(parent.id)}
                      >
                        <span>Parent</span>
                        <strong>{parent.name}</strong>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {lineage.clonedFrom && (
                      <button
                        type="button"
                        onClick={() => void loadLineage(lineage.clonedFrom!.id)}
                      >
                        <span>Copied from</span>
                        <strong>{lineage.clonedFrom.name}</strong>
                        <ChevronRight size={16} />
                      </button>
                    )}
                    {lineage.children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => void loadLineage(child.id)}
                      >
                        <span>Child</span>
                        <strong>{child.name}</strong>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!lineage.parents.length &&
                      !lineage.clonedFrom &&
                      !lineage.children.length && (
                        <p>{t("account.noRelations")}</p>
                      )}
                  </div>
                </div>
              ) : (
                <div className="account-history">
                  <div className="account-section-heading">
                    <div>
                      <span>{t("account.archive")}</span>
                      <h3>{t("account.history")}</h3>
                    </div>
                    <strong>{history.length}</strong>
                  </div>
                  {history.length === 0 ? (
                    <p className="account-empty">{t("account.empty")}</p>
                  ) : (
                    <div className="account-monster-list">
                      {history.map((monster) => (
                        <article
                          key={monster.id}
                          className={!monster.alive ? "dead" : ""}
                        >
                          <button
                            type="button"
                            className="account-monster-main"
                            onClick={() => void loadLineage(monster.id)}
                          >
                            <span className="account-specimen-number">
                              G{monster.generation}
                            </span>
                            <div>
                              <strong>{monster.name}</strong>
                              <MonsterAge
                                dna={decodeMonsterDna(monster.dna)}
                                seconds={monster.ageSeconds}
                              />
                              <small>
                                {monster.species} ·{" "}
                                {monster.alive
                                  ? t("account.alive")
                                  : t("account.dead")}
                              </small>
                            </div>
                            <OriginBadge origin={monster.originType} />
                            <ChevronRight size={17} />
                          </button>
                          <div className="account-monster-actions">
                            {monster.alive && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void run(async () => {
                                    await onPlay(monster.id);
                                    closePanel();
                                  })
                                }
                              >
                                <Play size={14} /> {t("account.play")}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await onCopy(monster.id);
                                  closePanel();
                                })
                              }
                            >
                              <Copy size={14} /> {t("account.copy")}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : tab === "archive" ? (
              <div className="account-history public-archive">
                <div className="account-section-heading">
                  <div>
                    <span>{t("account.publicRecord")}</span>
                    <h3>{t("account.islandArchive")}</h3>
                  </div>
                  <strong>{publicTotal}</strong>
                </div>
                <div className="admin-filters">
                  <select
                    value={adminOrigin}
                    aria-label={t("account.filterOrigin")}
                    onChange={(event) => setAdminOrigin(event.target.value)}
                  >
                    <option value="all">All origins</option>
                    <option value="player">Players</option>
                    <option value="mating">Hatched</option>
                    <option value="wild">Wild</option>
                    <option value="admin">Island keeper</option>
                    <option value="copy">Copies</option>
                  </select>
                  <input
                    value={adminSearch}
                    aria-label={t("account.searchName")}
                    placeholder={t("account.searchName")}
                    onChange={(event) => setAdminSearch(event.target.value)}
                  />
                  <button type="button" onClick={() => void loadArchive()}>
                    Find
                  </button>
                </div>
                <div className="account-monster-list public-monster-list">
                  {publicMonsters.map((monster) => (
                    <article key={monster.id}>
                      <button
                        type="button"
                        className="account-monster-main"
                        onClick={() => {
                          setTab("family");
                          void loadLineage(monster.id);
                        }}
                      >
                        <span className="account-specimen-number">
                          G{monster.generation}
                        </span>
                        <div>
                          <strong>{monster.name}</strong>
                          <small>
                            {monster.species} ·{" "}
                            {monster.alive
                              ? t("account.alive")
                              : t("account.dead")}
                          </small>
                          <MonsterAge
                            dna={decodeMonsterDna(monster.dna)}
                            seconds={monster.ageSeconds}
                          />
                        </div>
                        <OriginBadge origin={monster.originType} />
                        <ChevronRight size={17} />
                      </button>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="admin-workbench">
                <div className="admin-editor">
                  <div className="account-section-heading">
                    <div>
                      <span>WORLD AUTHORING</span>
                      <h3>
                        {adminEditId ? "Configure monster" : "Create and spawn"}
                      </h3>
                    </div>
                  </div>
                  <label>
                    <span>Nickname</span>
                    <input
                      value={adminName}
                      maxLength={24}
                      onChange={(event) => setAdminName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>DNA</span>
                    <textarea
                      value={adminDna}
                      rows={4}
                      onChange={(event) => setAdminDna(event.target.value)}
                    />
                  </label>
                  <div className="admin-editor-actions">
                    {adminEditId && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdminEditId(null);
                          setAdminName("Keeper's creature");
                          setAdminDna(selectedDna);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveAdminMonster()}
                    >
                      {adminEditId ? "Save changes" : "Spawn in world"}
                    </button>
                  </div>
                </div>
                <div className="admin-browser">
                  <div className="admin-filters">
                    <select
                      value={adminOrigin}
                      aria-label={t("account.filterOrigin")}
                      onChange={(event) => setAdminOrigin(event.target.value)}
                    >
                      <option value="all">All origins</option>
                      <option value="player">Players</option>
                      <option value="mating">Hatched</option>
                      <option value="wild">Wild</option>
                      <option value="admin">Admin</option>
                      <option value="copy">Copies</option>
                    </select>
                    <input
                      value={adminSearch}
                      aria-label={t("account.searchName")}
                      placeholder={t("account.searchName")}
                      onChange={(event) => setAdminSearch(event.target.value)}
                    />
                    <button type="button" onClick={() => void loadAdmin()}>
                      Find
                    </button>
                  </div>
                  <div className="admin-monster-list">
                    {adminMonsters.map((monster) => (
                      <article key={monster.id}>
                        <button
                          type="button"
                          onClick={() => selectAdminMonster(monster)}
                        >
                          <strong>{monster.name}</strong>
                          <span>
                            {monster.owner
                              ? `${monster.owner.name} · ${monster.owner.email}`
                              : monster.localPlayerCreated
                                ? "Local player"
                                : "Simulation"}
                          </span>
                        </button>
                        <OriginBadge origin={monster.originType} />
                        <button
                          type="button"
                          onClick={() =>
                            void run(async () => {
                              await api.adminSpawnMonster(monster.id);
                            })
                          }
                        >
                          <Play size={13} /> Spawn
                        </button>
                        <button
                          type="button"
                          aria-label={`View lineage for ${monster.name}`}
                          onClick={() => {
                            setTab("family");
                            void loadLineage(monster.id);
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
                <section
                  className="admin-world-reset"
                  aria-labelledby="world-reset-title"
                >
                  <div>
                    <span>{t("account.dangerZone")}</span>
                    <h3 id="world-reset-title">{t("account.resetWorld")}</h3>
                    <p>{t("account.resetWorldHelp")}</p>
                  </div>
                  <label>
                    <span>{t("account.resetPopulation")}</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={resetPopulation}
                      onChange={(event) =>
                        setResetPopulation(
                          Math.max(
                            1,
                            Math.min(100, Number(event.target.value) || 1),
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={resetAdminWorld}
                  >
                    <RotateCcw size={16} /> {t("account.resetAction")}
                  </button>
                </section>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
