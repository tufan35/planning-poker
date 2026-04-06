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

type JiraSearchResponse = {
  issues?: JiraSearchIssue[];
  errorMessages?: string[];
};

const DESC_MAX = 8000;

export async function fetchJiraIssuesAsTasks(
  host: string,
  email: string,
  apiToken: string,
  jql: string,
  maxIssues: number,
): Promise<{ tasks: Task[]; error?: string }> {
  const base = `https://${host}/rest/api/3/search`;
  const auth = Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");

  const tasks: Task[] = [];
  let startAt = 0;
  const pageSize = Math.min(50, maxIssues);

  while (tasks.length < maxIssues) {
    const take = Math.min(pageSize, maxIssues - tasks.length);
    const res = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql: jql.trim(),
        startAt,
        maxResults: take,
        fields: ["summary", "description"],
      }),
    });

    const data = (await res.json()) as JiraSearchResponse;

    if (!res.ok) {
      const msg =
        data.errorMessages?.join("; ") ||
        `Jira yanıtı ${res.status} (${res.statusText})`;
      return { tasks: [], error: msg };
    }

    const issues = data.issues ?? [];
    if (issues.length === 0) break;

    for (const issue of issues) {
      const summary = issue.fields?.summary?.trim() || issue.key;
      const descRaw = adfToPlainText(issue.fields?.description);
      const description =
        descRaw.length > 0
          ? descRaw.length > DESC_MAX
            ? `${descRaw.slice(0, DESC_MAX - 1)}…`
            : descRaw
          : undefined;

      tasks.push({
        id: issue.id,
        title: summary.slice(0, 500),
        description,
        order: tasks.length,
        jiraKey: issue.key,
      });
    }

    if (issues.length < take) break;
    startAt += issues.length;
  }

  return { tasks };
}
