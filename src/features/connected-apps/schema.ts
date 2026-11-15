import { z } from "zod";

/** One connected app as the super admin edits it. The secret is never sent back to the browser. */
export const connectedAppInput = z.object({
  id: z.string().max(64).optional(),
  prefix: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9]{1,15}$/, "Prefix: 2 to 16 lowercase letters or digits, starting with a letter."),
  name: z.string().trim().min(1).max(60),
  url: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "URL must start with https:// (or http:// for a Railway internal address)."),
  secret: z.string().max(300).optional(),
  description: z.string().trim().min(1).max(200),
  upgradeUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "Upgrade link must start with https://."),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});
export type ConnectedAppInput = z.infer<typeof connectedAppInput>;

export interface ConnectedAppRow {
  id: string;
  prefix: string;
  name: string;
  url: string;
  hasSecret: boolean;
  description: string;
  upgradeUrl: string;
  enabled: boolean;
  sortOrder: number;
}

export type ConnectedAppTest =
  | { ok: true; active: boolean; tools: string[] }
  | { ok: false; error: string };
