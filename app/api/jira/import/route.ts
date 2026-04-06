import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchJiraIssuesAsTasks, normalizeJiraHost } from "@/lib/jira";
import type { Task } from "@/lib/types";

const bodySchema = z.object({
  host: z.string().min(1).max(200),
  email: z.string().min(3).max(254),
  apiToken: z.string().min(1).max(200),
  jql: z.string().min(1).max(8000),
  maxIssues: z.number().int().min(1).max(300).optional().default(150),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Eksik veya hatalı alanlar", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { host: rawHost, email, apiToken, jql, maxIssues } = parsed.data;
  const host = normalizeJiraHost(rawHost);
  if (!host || host.includes("..")) {
    return NextResponse.json({ error: "Geçersiz Jira site adresi" }, { status: 400 });
  }

  const { tasks, error } = await fetchJiraIssuesAsTasks(
    host,
    email,
    apiToken,
    jql,
    maxIssues,
  );

  if (error) {
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ tasks } satisfies { tasks: Task[] });
}
