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
    'project = PROJ AND sprint IS EMPTY AND type IN (Story, Task, Bug) ORDER BY rank ASC',
  );
  const [jiraMaxIssues, setJiraMaxIssues] = useState("150");
  const [jiraMode, setJiraMode] = useState<"replace" | "append">("replace");
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraError, setJiraError] = useState<string | null>(null);
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

  const handleJiraImport = async () => {
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
      const data = (await res.json()) as { tasks?: Task[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Jira içe aktarma başarısız");
      }
      const imported = data.tasks ?? [];
      if (imported.length === 0) {
        setJiraError("JQL sonuç döndürmedi. PROJ anahtarını ve koşulları kontrol et.");
        return;
      }
      if (jiraMode === "replace") {
        send({
          type: "setTasks",
          tasks: imported.map((t, i) => ({ ...t, order: i })),
        });
      } else {
        send({
          type: "appendTasks",
          tasks: imported.map((t) => ({ ...t, order: 0 })),
        });
      }
      setJiraOpen(false);
      setJiraToken("");
    } catch (e) {
      setJiraError(e instanceof Error ? e.message : "Bilinmeyen hata");
    } finally {
      setJiraLoading(false);
    }
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
      <aside className="flex w-full shrink-0 flex-col border-white/5 bg-black/20 lg:w-72 lg:border-r">
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <h2 className="font-[family-name:var(--font-syne)] text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Görevler
          </h2>
          {isFacilitator && (
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  setJiraError(null);
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
        <ul className="max-h-48 flex-1 overflow-y-auto lg:max-h-none">
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
                    className={`flex w-full items-start gap-2 border-b border-white/5 px-4 py-3 text-left text-sm transition ${
                      active
                        ? "bg-emerald-500/15 text-white"
                        : "text-zinc-300 hover:bg-white/5"
                    } ${!isFacilitator ? "cursor-default opacity-90" : ""}`}
                  >
                    <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-zinc-600" />
                    <span className="flex-1">
                      {t.jiraKey && (
                        <span className="mr-2 font-mono text-xs text-emerald-400/80">
                          {t.jiraKey}
                        </span>
                      )}
                      <span className="block">{t.title}</span>
                      {t.description && (
                        <span className="mt-0.5 line-clamp-2 block text-xs font-normal text-zinc-500">
                          {t.description}
                        </span>
                      )}
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
            <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-white/5 bg-black/25 p-3 text-sm leading-relaxed text-zinc-400 whitespace-pre-wrap">
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

      {jiraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0f1513] p-6 shadow-xl">
            <h3 className="font-[family-name:var(--font-syne)] text-lg font-semibold text-white">
              Jira backlog içe aktar
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              API token tarayıcıda tutulmaz; sadece bu istekte sunucuya gider.{" "}
              <a
                href="https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/"
                className="text-indigo-400 underline hover:text-indigo-300"
                target="_blank"
                rel="noopener noreferrer"
              >
                Token oluşturma
              </a>
            </p>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Jira sitesi (host)
            </label>
            <input
              value={jiraHost}
              onChange={(e) => setJiraHost(e.target.value)}
              placeholder="sirket.atlassian.net"
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
            <textarea
              value={jiraJql}
              onChange={(e) => setJiraJql(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500/40"
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
                onClick={() => setJiraOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={jiraLoading}
                onClick={() => void handleJiraImport()}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                {jiraLoading ? "Çekiliyor…" : "İçe aktar"}
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
