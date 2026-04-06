"use client";

import PartySocket from "partysocket";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARD_LABEL, CARD_VALUES, type CardValue } from "@/lib/deck";
import { HIDDEN } from "@/lib/consensus";
import { getPartyKitHost } from "@/lib/party-config";
import type { GameSnapshot, Task } from "@/lib/types";

type Props = { roomId: string };

function sortPlayers(players: GameSnapshot["players"], facilitatorId: string | null) {
  return [...players].sort((a, b) => {
    if (a.id === facilitatorId) return -1;
    if (b.id === facilitatorId) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function RoomGame({ roomId }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [phase, setPhase] = useState<"form" | "playing">("form");
  const [myId, setMyId] = useState<string | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jiraHost, setJiraHost] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [jiraJql, setJiraJql] = useState(
    "project = PROJ ORDER BY created DESC",
  );
  const [jiraMaxIssues, setJiraMaxIssues] = useState("150");
  const [jiraMode, setJiraMode] = useState<"replace" | "append">("replace");
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
  /** null = kimlik/JQL formu; dolu = çoklu seçim adımı */
  const [jiraCandidates, setJiraCandidates] = useState<Task[] | null>(null);
  const [jiraSelectedIds, setJiraSelectedIds] = useState<Set<string>>(() => new Set());
  const socketRef = useRef<PartySocket | null>(null);

  const connect = useCallback(() => {
    const name = displayName.trim();
    if (!name) return;

    socketRef.current?.close();
    socketRef.current = null;

    const host = getPartyKitHost();
    const socket = new PartySocket({
      host,
      room: roomId,
      party: "main",
      startClosed: false,
    });

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join", name }));
      setPhase("playing");
    });

    socket.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse(String(ev.data));
        if (data.type === "state" && data.payload) {
          if (typeof data.yourId === "string") setMyId(data.yourId);
          setSnap(data.payload as GameSnapshot);
        }
      } catch {
        /* ignore */
      }
    });

    socketRef.current = socket;
  }, [displayName, roomId]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const send = useCallback((msg: object) => {
    const s = socketRef.current;
    if (s?.readyState === WebSocket.OPEN) {
      s.send(JSON.stringify(msg));
    }
  }, []);

  const isFacilitator = snap && myId && snap.facilitatorId === myId;
  const activeId = snap?.activeTaskId ?? null;
  const activeTask = useMemo(
    () => snap?.tasks.find((t) => t.id === activeId) ?? null,
    [snap, activeId],
  );
  const revealed = activeId ? !!snap?.revealedByTask[activeId] : false;
  const votesForActive = activeId ? snap?.votesByTask[activeId] ?? {} : {};
  const consensus = activeId ? snap?.consensusByTask[activeId] ?? null : null;

  const histogram = useMemo(() => {
    if (!activeId || !revealed || !snap) return [];
    const m = snap.votesByTask[activeId] ?? {};
    const counts = new Map<string, number>();
    for (const v of Object.values(m)) {
      if (v == null || v === HIDDEN) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeId, revealed, snap]);

  const voteProgress = useMemo(() => {
    if (!snap || !activeId) return { voted: 0, total: 0 };
    const m = snap.votesByTask[activeId] ?? {};
    const total = snap.players.length;
    const voted = snap.players.filter((p) => {
      const v = m[p.id];
      return v != null && v !== "";
    }).length;
    return { voted, total };
  }, [snap, activeId]);

  const handleVote = (v: CardValue | null) => {
    if (!activeId || revealed) return;
    send({ type: "vote", taskId: activeId, value: v });
  };

  const handleReset = () => {
    if (!activeId) return;
    send({ type: "resetRound", taskId: activeId });
  };

  const handleSelectTask = (taskId: string) => {
    send({ type: "selectTask", taskId });
  };

  const handleAddLines = () => {
    send({ type: "addTasksFromLines", text: pasteText });
    setPasteText("");
    setPasteOpen(false);
  };

  const closeJiraModal = useCallback(() => {
    setJiraOpen(false);
    setJiraCandidates(null);
    setJiraSelectedIds(new Set());
    setJiraError(null);
    setJiraToken("");
  }, []);

  const handleJiraFetchList = async () => {
    setJiraLoading(true);
    setJiraError(null);
    try {
      const maxIssues = Math.min(
        300,
        Math.max(1, Number.parseInt(jiraMaxIssues, 10) || 150),
      );
      const res = await fetch("/api/jira/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: jiraHost.trim(),
          email: jiraEmail.trim(),
          apiToken: jiraToken.trim(),
          jql: jiraJql.trim(),
          maxIssues,
        }),
      });
      const data = (await res.json()) as {
        tasks?: Task[];
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Jira içe aktarma başarısız");
      }
      const imported = data.tasks ?? [];
      if (imported.length === 0) {
        setJiraError(
          data.hint ??
            "JQL sonuç döndürmedi. Proje anahtarını (PROJ yerine gerçek key) ve JQL’i Jira’da Issue Navigator’da test et.",
        );
        return;
      }
      setJiraCandidates(imported);
      setJiraSelectedIds(new Set(imported.map((t) => t.id)));
    } catch (e) {
      setJiraError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setJiraLoading(false);
    }
  };

  const handleJiraToggleRow = (id: string) => {
    setJiraSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const handleJiraSelectAll = (on: boolean) => {
    if (!jiraCandidates) return;
    setJiraSelectedIds(
      on ? new Set(jiraCandidates.map((t) => t.id)) : new Set(),
    );
  };

  const handleJiraConfirmSelection = () => {
    if (!jiraCandidates) return;
    const selected = jiraCandidates.filter((t) => jiraSelectedIds.has(t.id));
    if (selected.length === 0) {
      setJiraError("En az bir iş seçmelisin.");
      return;
    }
    if (jiraMode === "replace") {
      send({
        type: "setTasks",
        tasks: selected.map((t, i) => ({ ...t, order: i })),
      });
    } else {
      send({
        type: "appendTasks",
        tasks: selected.map((t) => ({ ...t, order: 0 })),
      });
    }
    closeJiraModal();
  };

  if (phase === "form") {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4">
        <Link
          href="/"
          className="mb-4 text-center text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Ana sayfa
        </Link>
        <div className="rounded-3xl border border-white/10 bg-[#111816]/90 p-8 shadow-2xl shadow-emerald-950/40 backdrop-blur">
          <h1 className="font-[family-name:var(--font-syne)] text-2xl font-bold tracking-tight text-white">
            Odaya katıl
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Oda: <span className="font-mono text-emerald-300">{roomId}</span>
          </p>
          <label className="mt-6 block text-xs font-medium uppercase tracking-wider text-zinc-500">
            Görünen adın
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="örn. Ayşe"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none ring-emerald-500/30 placeholder:text-zinc-600 focus:ring-2"
            onKeyDown={(e) => e.key === "Enter" && connect()}
          />
          <button
            type="button"
            onClick={connect}
            className="mt-6 w-full rounded-xl bg-emerald-500 py-3 font-semibold text-emerald-950 transition hover:bg-emerald-400"
          >
            Bağlan
          </button>
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
        Senkronize ediliyor…
      </div>
    );
  }

  const playersSorted = sortPlayers(snap.players, snap.facilitatorId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-black/30 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          ← Ana sayfa
        </Link>
        <span className="truncate font-mono text-xs text-emerald-400/90">oda · {roomId}</span>
        <button
          type="button"
          onClick={() => {
            const url = `${typeof window !== "undefined" ? window.location.origin : ""}/room/${roomId}`;
            void navigator.clipboard.writeText(url);
          }}
          className="shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10"
        >
          Bağlantıyı kopyala
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0">
      {/* Sidebar tasks */}
      <aside className="flex max-h-[min(52vh,28rem)] min-h-0 w-full shrink-0 flex-col border-white/5 bg-black/20 lg:max-h-[calc(100dvh-3.75rem)] lg:w-80 lg:border-r">
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 p-4">
          <h2 className="font-[family-name:var(--font-syne)] text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Görevler
          </h2>
          {isFacilitator && (
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  setJiraError(null);
                  setJiraCandidates(null);
                  setJiraSelectedIds(new Set());
                  setJiraOpen(true);
                }}
                className="rounded-lg bg-indigo-500/20 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/30"
              >
                Jira
              </button>
              <button
                type="button"
                onClick={() => setPasteOpen(true)}
                className="rounded-lg bg-white/5 px-2 py-1 text-xs text-emerald-300 hover:bg-white/10"
              >
                + Satır
              </button>
            </div>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {[...snap.tasks]
            .sort((a, b) => a.order - b.order)
            .map((t) => {
              const active = t.id === activeId;
              const c = snap.consensusByTask[t.id];
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={!isFacilitator}
                    onClick={() => handleSelectTask(t.id)}
                    className={`flex w-full items-start gap-2 border-b border-white/5 px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-emerald-500/15 text-white"
                        : "text-zinc-300 hover:bg-white/5"
                    } ${!isFacilitator ? "cursor-default opacity-90" : ""}`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-600"}`}
                    />
                    <span className="min-w-0 flex-1">
                      {t.jiraKey ? (
                        <span className="block font-mono text-[11px] text-emerald-400/90">
                          {t.jiraKey}
                        </span>
                      ) : null}
                      <span className="line-clamp-2 text-[13px] leading-snug text-zinc-200">
                        {t.title}
                      </span>
                    </span>
                    {c != null && (
                      <span className="shrink-0 rounded-md bg-emerald-500/20 px-1.5 py-0.5 font-mono text-xs text-emerald-300">
                        {CARD_LABEL[c as CardValue] ?? c}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      </aside>

      {/* Main */}
      <main className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-white/5 px-4 py-4 lg:px-8">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Aktif görev</p>
          <h1 className="mt-1 font-[family-name:var(--font-syne)] text-xl font-bold text-white lg:text-2xl">
            {activeTask?.title ?? "Görev seçilmedi"}
          </h1>
          {activeTask?.jiraKey && (
            <p className="mt-1 font-mono text-sm text-emerald-400/90">{activeTask.jiraKey}</p>
          )}
          {activeTask?.description && (
            <div className="mt-3 max-h-[min(50vh,24rem)] overflow-y-auto rounded-xl border border-white/5 bg-black/25 p-3 text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap">
              {activeTask.description}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {revealed && consensus != null && (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm text-emerald-200">
                Uzlaşı:{" "}
                <strong className="font-mono">
                  {CARD_LABEL[consensus as CardValue] ?? consensus}
                </strong>
              </span>
            )}
            {!revealed && activeId && voteProgress.total > 0 && (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-200">
                  <strong className="text-emerald-300">{voteProgress.voted}</strong>
                  <span className="text-zinc-500"> / </span>
                  {voteProgress.total} oy verdi
                </span>
                <span className="text-xs text-zinc-500">
                  Son kişi oy verince kartlar otomatik açılır.
                </span>
              </div>
            )}
            {!revealed && activeId && voteProgress.total === 0 && (
              <span className="text-sm text-zinc-400">Oyuncu bekleniyor…</span>
            )}
            {isFacilitator && activeId && revealed && (
              <button
                type="button"
                onClick={handleReset}
                className="w-fit rounded-lg border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5"
              >
                Turu sıfırla
              </button>
            )}
          </div>
        </header>

        {/* Players */}
        <section className="border-b border-white/5 px-4 py-3 lg:px-8">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Oyuncular</p>
          <div className="flex flex-wrap gap-2">
            {playersSorted.map((p) => {
              const v = activeId ? votesForActive[p.id] : null;
              const voted = v != null && v !== "";
              const showValue = revealed && v != null && v !== HIDDEN;
              const hiddenBack = !revealed && voted && p.id !== myId;
              const mine = p.id === myId;
              const statusLabel = revealed
                ? voted
                  ? "Oy verdi"
                  : "Bu turda yok"
                : voted
                  ? "Oy verdi"
                  : "Oy vermedi";
              const statusClass = revealed
                ? voted
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-zinc-800 text-zinc-500"
                : voted
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/10 text-amber-200/90";
              return (
                <div
                  key={p.id}
                  className={`flex min-w-[10rem] flex-col gap-1.5 rounded-xl border px-3 py-2 text-sm ${
                    mine
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-white/10 bg-black/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-zinc-200">
                      {p.name}
                      {p.id === snap.facilitatorId && (
                        <span className="ml-1 text-xs text-amber-400/90">· mod</span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-zinc-400">
                    {showValue
                      ? `Kart: ${CARD_LABEL[v as CardValue] ?? v}`
                      : hiddenBack
                        ? "Kart: ▮▮ (gizli)"
                        : voted
                          ? mine
                            ? `Kart: ${CARD_LABEL[v as CardValue] ?? v}`
                            : "Kart: seçildi (gizli)"
                          : "Kart: —"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Histogram */}
        {revealed && histogram.length > 0 && (
          <section className="px-4 py-4 lg:px-8">
            <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Dağılım</p>
            <div className="flex flex-wrap gap-3">
              {histogram.map(([val, count]) => (
                <div
                  key={val}
                  className={`rounded-xl border px-4 py-2 ${
                    val === consensus
                      ? "border-emerald-400/60 bg-emerald-500/15"
                      : "border-white/10 bg-black/40"
                  }`}
                >
                  <span className="font-[family-name:var(--font-syne)] text-lg text-white">
                    {CARD_LABEL[val as CardValue] ?? val}
                  </span>
                  <span className="ml-2 text-sm text-zinc-400">×{count}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Cards */}
        <section className="mt-auto px-4 pb-8 pt-4 lg:px-8">
          <p className="mb-3 text-xs uppercase tracking-wider text-zinc-500">Deste</p>
          <div className="flex flex-wrap gap-2 lg:gap-3">
            {CARD_VALUES.map((card) => {
              const selected =
                !revealed && activeId && votesForActive[myId ?? ""] === card;
              return (
                <button
                  key={card}
                  type="button"
                  disabled={!activeId || revealed}
                  onClick={() => handleVote(card)}
                  className={`flex h-16 w-[4.25rem] items-center justify-center rounded-xl border-2 text-lg font-bold transition lg:h-20 lg:w-24 lg:text-xl ${
                    selected
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                      : "border-white/15 bg-gradient-to-b from-zinc-800/80 to-zinc-900 text-white hover:border-emerald-500/40"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {CARD_LABEL[card]}
                </button>
              );
            })}
            <button
              type="button"
              disabled={!activeId || revealed}
              onClick={() => handleVote(null)}
              className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed border-white/20 px-3 text-xs text-zinc-400 hover:border-red-400/40 hover:text-red-300 lg:h-20"
            >
              Oyu temizle
            </button>
          </div>
        </section>
      </main>

      {jiraOpen && jiraCandidates === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1513] p-6 shadow-xl">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white">
              Jira’dan liste getir
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Önce JQL ile kayıtları çek; bir sonraki adımda hangilerini oyuna alacağını seçersin.{" "}
              <a
                href="https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/"
                className="text-indigo-400 underline hover:text-indigo-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                API token
              </a>
            </p>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Jira sitesi (host)
            </label>
            <input
              value={jiraHost}
              onChange={(e) => setJiraHost(e.target.value)}
              placeholder="atrosbt.atlassian.net"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Atlassian e-posta
            </label>
            <input
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              placeholder="sen@ornek.com"
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              API token
            </label>
            <input
              type="password"
              value={jiraToken}
              onChange={(e) => setJiraToken(e.target.value)}
              placeholder="••••••••••••••••"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              JQL
            </label>
            <p className="mt-1 text-xs text-zinc-500">
              Örnek:{" "}
              <code className="rounded bg-white/10 px-1">project = AFC ORDER BY created DESC</code>
            </p>
            <textarea
              value={jiraJql}
              onChange={(e) => setJiraJql(e.target.value)}
              rows={4}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="jiraMode"
                  checked={jiraMode === "replace"}
                  onChange={() => setJiraMode("replace")}
                  className="accent-indigo-500"
                />
                Listeyi değiştir (oylar sıfırlanır)
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="radio"
                  name="jiraMode"
                  checked={jiraMode === "append"}
                  onChange={() => setJiraMode("append")}
                  className="accent-indigo-500"
                />
                Sonuna ekle
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              En fazla kayıt (1–300)
            </label>
            <input
              value={jiraMaxIssues}
              onChange={(e) => setJiraMaxIssues(e.target.value)}
              type="number"
              min={1}
              max={300}
              className="mt-1 w-28 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {jiraError && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {jiraError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeJiraModal}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={jiraLoading}
                onClick={() => void handleJiraFetchList()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {jiraLoading ? "Çekiliyor…" : "Listeyi getir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {jiraOpen && jiraCandidates !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-[#0f1513] shadow-xl">
            <div className="shrink-0 border-b border-white/10 p-5">
              <h3 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white">
                Hangi işleri alalım?
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                {jiraCandidates.length} kayıt geldi · {jiraSelectedIds.size} seçili
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleJiraSelectAll(true)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/15"
                >
                  Tümünü seç
                </button>
                <button
                  type="button"
                  onClick={() => handleJiraSelectAll(false)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/15"
                >
                  Hiçbirini seçme
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              <ul className="space-y-1">
                {jiraCandidates.map((t) => {
                  const checked = jiraSelectedIds.has(t.id);
                  return (
                    <li key={t.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-transparent px-3 py-2 hover:border-white/10 hover:bg-white/5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleJiraToggleRow(t.id)}
                          className="mt-1 size-4 shrink-0 rounded border-white/20 bg-black/40 accent-indigo-500"
                        />
                        <span className="min-w-0 flex-1">
                          {t.jiraKey && (
                            <span className="font-mono text-xs text-emerald-400/90">
                              {t.jiraKey}
                            </span>
                          )}
                          <span className="block text-sm font-medium text-zinc-100">
                            {t.title}
                          </span>
                          {t.description && (
                            <span className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                              {t.description}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            {jiraError && (
              <div className="shrink-0 border-t border-red-500/20 bg-red-500/5 px-5 py-2">
                <p className="text-sm text-red-200">{jiraError}</p>
              </div>
            )}
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/10 p-4">
              <button
                type="button"
                onClick={() => {
                  setJiraError(null);
                  setJiraCandidates(null);
                  setJiraSelectedIds(new Set());
                }}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
              >
                ← JQL’e dön
              </button>
              <button
                type="button"
                onClick={closeJiraModal}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleJiraConfirmSelection}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
              >
                Seçilenleri ekle ({jiraSelectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1513] p-6 shadow-xl">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white">
              Görev satırları yapıştır
            </h3>
            <p className="mt-1 text-sm text-zinc-500">Her satır bir görev başlığı olur.</p>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={8}
              className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="Örnek görev&#10;Başka bir iş"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleAddLines}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
              >
                Listeye ekle
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
