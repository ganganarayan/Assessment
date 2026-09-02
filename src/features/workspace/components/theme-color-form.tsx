"use client";

import { useState, useTransition } from "react";
import { updateThemeColors } from "@/features/workspace/actions/theme";
import { DEFAULT_THEME_COLORS, type ThemeColors } from "@/features/workspace/theme-colors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function ColorField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX.test(value);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#4F46E5"
          className="max-w-[10rem] font-mono"
        />
        <span
          aria-hidden="true"
          className="h-8 w-8 shrink-0 rounded-md border"
          style={{ backgroundColor: valid ? value : "transparent" }}
        />
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
    </div>
  );
}

export function ThemeColorForm({ initial }: { initial: ThemeColors }) {
  const [colors, setColors] = useState<ThemeColors>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateThemeColors(colors);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <ColorField
        id="primary-color"
        label="Primary (accent)"
        hint="Your brand accent — used across your workspace and respondent-facing pages."
        value={colors.primaryColor}
        onChange={(v) => setColors((c) => ({ ...c, primaryColor: v }))}
      />
      <ColorField
        id="secondary-color"
        label="Secondary"
        hint="A supporting tone for muted accents and secondary elements."
        value={colors.secondaryColor}
        onChange={(v) => setColors((c) => ({ ...c, secondaryColor: v }))}
      />

      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save colors"}
        </Button>
        <button
          type="button"
          onClick={() => setColors(DEFAULT_THEME_COLORS)}
          className="text-sm text-[var(--muted-foreground)] underline-offset-2 hover:underline"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
