import type * as Party from "partykit/server";
import { computeConsensus, HIDDEN } from "../lib/consensus";
import { DEFAULT_TASKS } from "../lib/default-tasks";
import { clientMessageSchema } from "../lib/messages";
import type { GameSnapshot, PlayerPublic, Task } from "../lib/types";

type PlayersMap = Map<string, string>;

function emptyVotesForTasks(tasks: Task[]): Record<string, Record<string, string | null>> {
  const o: Record<string, Record<string, string | null>> = {};
  for (const t of tasks) o[t.id] = {};
  return o;
}

export default class PokerRoom implements Party.Server {
  private players: PlayersMap = new Map();
  private facilitatorId: string | null = null;
  private tasks: Task[] = [...DEFAULT_TASKS];
  private activeTaskId: string | null = DEFAULT_TASKS[0]?.id ?? null;
  private votesByTask: Record<string, Record<string, string | null>> = emptyVotesForTasks(
    DEFAULT_TASKS,
  );
  private revealedByTask: Record<string, boolean> = {};
  private consensusByTask: Record<string, string | null> = {};

  constructor(readonly room: Party.Room) {}

  private pickFacilitator(): void {
    const conns = [...this.room.getConnections()];
    this.facilitatorId = conns[0]?.id ?? null;
  }

  private ensureTaskVoteMaps(): void {
    for (const t of this.tasks) {
      if (!this.votesByTask[t.id]) this.votesByTask[t.id] = {};
    }
  }

  private stripPlayerVotes(playerId: string): void {
    for (const taskId of Object.keys(this.votesByTask)) {
      const m = this.votesByTask[taskId];
      if (m) delete m[playerId];
    }
  }

  private isFacilitator(id: string): boolean {
    return this.facilitatorId === id;
  }

  /** Her kayıtlı oyuncunun bu görev için null olmayan bir oyu var mı? */
  private allPlayersVoted(taskId: string): boolean {
    if (this.players.size === 0) return false;
    const votes = this.votesByTask[taskId] ?? {};
    for (const playerId of this.players.keys()) {
      if (votes[playerId] == null) return false;
    }
    return true;
  }

  private revealTask(taskId: string): void {
    if (this.revealedByTask[taskId]) return;
    const votes = this.votesByTask[taskId] ?? {};
    const values = Object.values(votes);
    this.consensusByTask[taskId] = computeConsensus(values);
    this.revealedByTask[taskId] = true;
  }

  /** Sadece aktif görevde, herkes oy verince otomatik aç. */
  private tryAutoReveal(taskId: string): void {
    if (taskId !== this.activeTaskId) return;
    if (!this.allPlayersVoted(taskId)) return;
    this.revealTask(taskId);
  }

  private snapshotForViewer(viewerId: string): GameSnapshot {
    this.ensureTaskVoteMaps();
    const players: PlayerPublic[] = [...this.players.entries()].map(([id, name]) => ({
      id,
      name,
    }));

    const votesByTask: Record<string, Record<string, string | null>> = {};
    for (const t of this.tasks) {
      const raw = { ...(this.votesByTask[t.id] ?? {}) };
      const revealed = !!this.revealedByTask[t.id];
      if (!revealed) {
        for (const pid of Object.keys(raw)) {
          if (pid !== viewerId && raw[pid] != null) {
            raw[pid] = HIDDEN;
          }
        }
      }
      votesByTask[t.id] = raw;
    }

    return {
      players,
      facilitatorId: this.facilitatorId,
      tasks: this.tasks.map((t) => ({ ...t })),
      activeTaskId: this.activeTaskId,
      votesByTask,
      revealedByTask: { ...this.revealedByTask },
      consensusByTask: { ...this.consensusByTask },
    };
  }

  private broadcastState(): void {
    for (const conn of this.room.getConnections()) {
      const snap = this.snapshotForViewer(conn.id);
      conn.send(
        JSON.stringify({ type: "state", yourId: conn.id, payload: snap }),
      );
    }
  }

  onMessage(message: string, sender: Party.Connection): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) return;

    const msg = result.data;

    switch (msg.type) {
      case "join": {
        this.players.set(sender.id, msg.name.trim());
        if (this.facilitatorId === null || !this.players.has(this.facilitatorId)) {
          this.pickFacilitator();
        }
        this.broadcastState();
        break;
      }
      case "setTasks": {
        if (!this.isFacilitator(sender.id)) break;
        this.tasks = msg.tasks.map((t) => ({ ...t }));
        this.votesByTask = emptyVotesForTasks(this.tasks);
        this.revealedByTask = {};
        this.consensusByTask = {};
        this.activeTaskId = this.tasks[0]?.id ?? null;
        this.broadcastState();
        break;
      }
      case "addTasksFromLines": {
        if (!this.isFacilitator(sender.id)) break;
        const lines = msg.text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const startOrder = this.tasks.length;
        const newTasks: Task[] = lines.map((title, i) => ({
          id: crypto.randomUUID(),
          title,
          order: startOrder + i,
        }));
        this.tasks = [...this.tasks, ...newTasks];
        for (const t of newTasks) {
          this.votesByTask[t.id] = {};
        }
        this.broadcastState();
        break;
      }
      case "selectTask": {
        if (!this.isFacilitator(sender.id)) break;
        this.activeTaskId = msg.taskId;
        this.broadcastState();
        break;
      }
      case "vote": {
        if (!this.players.has(sender.id)) break;
        this.ensureTaskVoteMaps();
        if (!this.votesByTask[msg.taskId]) this.votesByTask[msg.taskId] = {};
        if (this.revealedByTask[msg.taskId]) break;
        this.votesByTask[msg.taskId][sender.id] = msg.value;
        this.tryAutoReveal(msg.taskId);
        this.broadcastState();
        break;
      }
      case "reveal": {
        if (!this.isFacilitator(sender.id)) break;
        this.revealTask(msg.taskId);
        this.broadcastState();
        break;
      }
      case "resetRound": {
        if (!this.isFacilitator(sender.id)) break;
        const taskId = msg.taskId;
        this.votesByTask[taskId] = {};
        this.revealedByTask[taskId] = false;
        this.consensusByTask[taskId] = null;
        this.broadcastState();
        break;
      }
      default:
        break;
    }
  }

  onClose(conn: Party.Connection): void {
    this.players.delete(conn.id);
    this.stripPlayerVotes(conn.id);
    if (this.facilitatorId === conn.id) {
      this.pickFacilitator();
    }
    if (this.activeTaskId) {
      this.tryAutoReveal(this.activeTaskId);
    }
    this.broadcastState();
  }
}
