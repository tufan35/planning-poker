import { z } from "zod";
import { CARD_VALUES } from "./deck";

const cardValueSchema = z.enum([...CARD_VALUES] as [string, ...string[]]);

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    name: z.string().min(1).max(64),
  }),
  z.object({
    type: z.literal("setTasks"),
    tasks: z.array(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(500),
        order: z.number().int(),
        jiraKey: z.string().max(32).optional(),
      }),
    ),
  }),
  z.object({
    type: z.literal("addTasksFromLines"),
    text: z.string().max(20_000),
  }),
  z.object({
    type: z.literal("selectTask"),
    taskId: z.string().nullable(),
  }),
  z.object({
    type: z.literal("vote"),
    taskId: z.string(),
    value: z.union([cardValueSchema, z.null()]),
  }),
  z.object({
    type: z.literal("reveal"),
    taskId: z.string(),
  }),
  z.object({
    type: z.literal("resetRound"),
    taskId: z.string(),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
