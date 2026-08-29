/**
 * Tiny, dependency-free User-Agent parser → device type / browser / OS. Pure and
 * unit-testable. Deliberately coarse: it classifies the common cases for analytics
 * (mobile vs desktop, which browser/OS family) — not a full UA database. Order
 * matters: more specific tokens are tested before generic ones.
 */
export interface ParsedUserAgent {
  deviceType: "mobile" | "tablet" | "desktop" | null;
  browser: string | null;
  os: string | null;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = (ua ?? "").trim();
  if (!s) return { deviceType: null, browser: null, os: null };

  // --- OS ---
  let os: string | null = null;
  if (/windows nt/i.test(s)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(s)) os = "iOS";
  else if (/mac os x/i.test(s)) os = "macOS";
  else if (/android/i.test(s)) os = "Android";
  else if (/cros/i.test(s)) os = "ChromeOS";
  else if (/linux/i.test(s)) os = "Linux";

  // --- Browser (specific before generic; Edge/Brave/Opera masquerade as Chrome) ---
  let browser: string | null = null;
  if (/edg(a|ios|e)?\//i.test(s)) browser = "Edge";
  else if (/opr\/|opera/i.test(s)) browser = "Opera";
  else if (/samsungbrowser/i.test(s)) browser = "Samsung Internet";
  else if (/fban|fbav/i.test(s)) browser = "Facebook";
  else if (/instagram/i.test(s)) browser = "Instagram";
  else if (/firefox|fxios/i.test(s)) browser = "Firefox";
  else if (/chrome|crios/i.test(s)) browser = "Chrome";
  else if (/safari/i.test(s)) browser = "Safari";

  // --- Device type ---
  let deviceType: ParsedUserAgent["deviceType"] = null;
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) deviceType = "tablet";
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(s)) deviceType = "mobile";
  else if (os) deviceType = "desktop";

  return { deviceType, browser, os };
}
