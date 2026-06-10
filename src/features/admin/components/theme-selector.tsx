"use client";

import { useEffect, useState } from "react";
import { THEME_OPTIONS, type ThemePref } from "@/lib/theme";
import { Button } from "@/components/ui/button";

function applyTheme(pref: ThemePref) {
  const isDark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

function readCookie(): ThemePref {
  const m = document.cookie.match(/(?:^|; )theme=([^;]+)/);
  const v = m?.[1];
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function ThemeSelector() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    setPref(readCookie());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readCookie() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function select(next: ThemePref) {
    setPref(next);
    document.cookie = `theme=${next};path=/;max-age=31536000;samesite=lax`;
    applyTheme(next);
  }

  return (
    <div className="inline-flex gap-2">
      {THEME_OPTIONS.map((opt) => (
        <Button
          key={opt}
          size="sm"
          variant={pref === opt ? "default" : "outline"}
          onClick={() => select(opt)}
        >
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </Button>
      ))}
    </div>
  );
}
