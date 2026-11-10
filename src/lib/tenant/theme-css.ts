const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * A tenant's brand colours as CSS variables. Only strictly hex values are emitted, so
 * stored text is never injected as-is. Shared by the root layout (host-keyed) and the
 * funnel layout (owner-keyed, Phase 3: a funnel wears its OWNER's colours on any host).
 */
export function tenantThemeCss(primary?: string | null, secondary?: string | null): string | null {
  const p = primary && HEX.test(primary) ? primary : null;
  const s = secondary && HEX.test(secondary) ? secondary : null;
  if (!p && !s) return null;
  const vars = `${p ? `--primary:${p};` : ""}${s ? `--secondary:${s};` : ""}`;
  // Apply in both light and dark so the brand accent wins in either mode.
  return `:root{${vars}}.dark{${p ? `--primary:${p};` : ""}}`;
}
