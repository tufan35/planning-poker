export type Task = {
  id: string;
  title: string;
  order: number;
  jiraKey?: string;
  /** Jira açıklaması veya ek bağlam (ADF’ten düz metne çevrilmiş). */
  description?: string;
};

export type PlayerPublic = {
  id: string;
  name: string;
};

/** Full game state sent to clients (votes may be sanitized per viewer in transport layer). */
export type GameSnapshot = {
  players: PlayerPublic[];
  facilitatorId: string | null;
  tasks: Task[];
  activeTaskId: string | null;
  /** playerId -> vote; unrevealed other players may see HIDDEN sentinel */
  votesByTask: Record<string, Record<string, string | null>>;
  revealedByTask: Record<string, boolean>;
  consensusByTask: Record<string, string | null>;
};
