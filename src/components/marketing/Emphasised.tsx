/**
 * Bold the named phrases inside a line of plain copy.
 *
 * Done by splitting the line on the phrases rather than by storing HTML, so the copy in
 * content.ts stays plain text that anyone can edit without being able to write markup,
 * and nothing from that file is ever injected as HTML. A phrase that no longer appears
 * in its line simply does not match, which degrades to an unbolded line instead of
 * throwing.
 *
 * Shared by every bulleted marketing section, so "which words are heavy" is answered the
 * same way in all of them.
 */
export function Emphasised({ text, strong }: { text: string; strong: readonly string[] }) {
  const parts = strong.reduce<string[]>(
    (acc, phrase) =>
      acc.flatMap((chunk) =>
        strong.includes(chunk)
          ? [chunk]
          : chunk.split(phrase).flatMap((p, i) => (i === 0 ? [p] : [phrase, p])),
      ),
    [text],
  );

  return (
    <>
      {parts.map((part, i) =>
        strong.includes(part) ? (
          <strong key={`${part}-${i}`} className="font-semibold text-[var(--foreground)]">
            {part}
          </strong>
        ) : (
          <span key={`${part}-${i}`}>{part}</span>
        ),
      )}
    </>
  );
}

/** The green tick that leads every bullet in these sections. */
export function Tick() {
  return (
    <span
      aria-hidden="true"
      className="mt-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-600/10 text-green-600"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12l4 4L19 6"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
