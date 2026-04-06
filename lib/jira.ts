import type { Task } from "./types";
import { adfToPlainText } from "./jira-adf";

export function normalizeJiraHost(raw: string): string {
  const t = raw.trim();
  const noProto = t.replace(/^https?:\/\//i, "");
  return noProto.split("/")[0]?.replace(/\/$/, "") ?? "";
}

type JiraSearchIssue = {
  id: string;
  key: string;
  fields?: {
    summary?: string;
    description?: unknown;
  };
};

/** POST /rest/api/3/search/jql (eski /search gövdesi kaldırıldı — CHANGE-2046). */
type JiraSearchJqlResponse = {
  issues?: JiraSearchIssue[];
  isLast?: boolean;
  nextPageToken?: string;
  errorMessages?: string[];
  errors?: unknown;
};

const DESC_MAX = 8000;

const EMPTY_JQL_HINT =
  "JQL hiç kayıt döndürmedi. Önce sadece `project = PROJEANAHTARI ORDER BY created DESC` ile dene. " +
  "`sprint IS EMPTY` bazı projelerde (Next-gen / board yok) sonuç vermez. Jira Issue Navigator’da aynı JQL’i çalıştırıp sonuç olduğunu doğrula.";

export async function fetchJiraIssuesAsTasks(
  host: string,
  email: string,
  apiToken: string,
  jql: string,
  maxIssues: number,
): Promise<{ tasks: Task[]; error?: string; hint?: string }> {
  const url = `https://${host}/rest/api/3/search/jql`;
  const auth = Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");

  const tasks: Task[] = [];
  const pageSize = Math.min(50, maxIssues);
  let nextPageToken: string | undefined;

  while (tasks.length < maxIssues) {
    const take = Math.min(pageSize, maxIssues - tasks.length);
    const body: Record<string, unknown> = {
      jql: jql.trim(),
      maxResults: take,
      fields: ["summary", "description"],
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as JiraSearchJqlResponse;

    if (!res.ok) {
      const msg =
        data.errorMessages?.join("; ") ||
        `Jira yanıtı ${res.status} (${res.statusText})`;
      return { tasks: [], error: msg };
    }

    const issues = data.issues ?? [];
    if (issues.length === 0) break;

    for (const issue of issues) {
      const key = issue.key ?? "";
      const id = String(issue.id ?? key);
      const summary = issue.fields?.summary?.trim() || key || id;
      const descRaw = adfToPlainText(issue.fields?.description);
      const description =
        descRaw.length > 0
          ? descRaw.length > DESC_MAX
            ? `${descRaw.slice(0, DESC_MAX - 1)}…`
            : descRaw
          : undefined;

      tasks.push({
        id,
        title: summary.slice(0, 500),
        description,
        order: tasks.length,
        jiraKey: key || undefined,
      });
    }

    if (data.isLast || !data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }

  if (tasks.length === 0) {
    return { tasks: [], hint: EMPTY_JQL_HINT };
  }
  return { tasks };
}
