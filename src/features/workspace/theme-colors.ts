// Plain (non-"use server") module so these can be imported by both the server
// action and client components. A "use server" file may only export async
// functions, so shared constants/types must live outside it.

export type ThemeColors = { primaryColor: string; secondaryColor: string };

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primaryColor: "#0f172a",
  secondaryColor: "#64748b",
};
