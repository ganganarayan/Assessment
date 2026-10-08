/**
 * Repair the mistakes a person makes editing JSON by hand.
 *
 * A template document is several hundred lines. Editing one in a textarea means missed
 * commas, a brace deleted with the line above it, a comma left behind after removing
 * the last item, and quotes turned curly by a paste from a word processor. Each of
 * those is a one-character problem that stops the whole save, and "Unexpected token }
 * in JSON at position 8231" tells the person nothing about which of the four it was.
 *
 * So this finds them, fixes them, and - critically - SAYS WHAT IT CHANGED so the fix
 * can be refused. It is never applied on its own: the editor shows the list and waits.
 * Silently rewriting somebody's content is a worse failure than refusing to save it,
 * because the rewrite is the one they will not notice.
 *
 * SAFETY: every rule runs OUTSIDE string literals only. The scanner tracks whether it
 * is inside a string and skips escaped characters, so a comma, brace or apostrophe in
 * a question's text is never touched. That is the whole reason this is a scanner and
 * not a pile of regular expressions - a regex cannot tell "Yes, and it's working" from
 * structure, and would happily corrupt a respondent-facing sentence.
 *
 * Pure, with no imports: it runs in the browser (so the offer is instant) and under
 * tsx in the verification script, which is what keeps it honest.
 */

export interface RepairResult {
  /** The repaired text. Equal to the input when nothing was found. */
  text: string;
  /** One line per KIND of fix, with a count. Shown to the person before applying. */
  fixes: string[];
  /** True when the repaired text parses. False means it could not be salvaged. */
  parses: boolean;
}

/** Where a parse error actually is, in terms a person can act on. */
export interface JsonErrorLocation {
  line: number;
  column: number;
  /** The offending line's text, for pointing at. */
  lineText: string;
}

/**
 * Turn a parser's complaint into a line and column.
 *
 * A character offset is useless in a textarea with no offset ruler; the line number is
 * the thing somebody can scroll to. Three formats, because engines disagree and have
 * changed their minds:
 *
 *  1. "...at position 8231"      - older V8, and still used for some error classes.
 *  2. "line X column Y"          - Firefox.
 *  3. "Unexpected token 'o', ...\"1,\n  \"b\": oops\n}\" is not valid JSON"
 *     Current V8 dropped the offset for most errors and prints a snippet of the source
 *     instead. That snippet is findable in the original text, which gives the position
 *     back - and this is the format that actually turns up in practice, so a locator
 *     that only handled the first two reported "could not locate" on every real error.
 */
export function locateJsonError(text: string, message: string): JsonErrorLocation | null {
  const at = (pos: number): JsonErrorLocation => {
    const clamped = Math.max(0, Math.min(pos, text.length));
    const before = text.slice(0, clamped);
    const line = before.split("\n").length;
    return {
      line,
      column: clamped - before.lastIndexOf("\n"),
      lineText: text.split("\n")[line - 1] ?? "",
    };
  };

  const byPosition = /at position (\d+)/.exec(message);
  if (byPosition) return at(Number(byPosition[1]));

  const direct = /line (\d+) column (\d+)/.exec(message);
  if (direct) {
    const line = Number(direct[1]);
    return { line, column: Number(direct[2]), lineText: text.split("\n")[line - 1] ?? "" };
  }

  // The snippet form. Find the snippet in the source, then the offending token inside
  // it - V8 names the token, which is usually enough to land on the right character
  // rather than merely the right neighbourhood.
  const snippet = /"([\s\S]*)" is not valid JSON/.exec(message);
  if (snippet?.[1]) {
    const idx = text.indexOf(snippet[1]);
    if (idx >= 0) {
      const token = /Unexpected token '(.)'/.exec(message)?.[1];
      const within = token ? snippet[1].indexOf(token) : -1;
      return at(idx + (within >= 0 ? within : 0));
    }
  }

  // "Unexpected end of JSON input" names no place, because the place is the end.
  if (/end of (?:JSON input|data)/i.test(message)) return at(text.length);

  return null;
}

const isDigit = (c: string) => c >= "0" && c <= "9";
const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_$]/.test(c);
/** Characters that can END one. */
const endsValue = (c: string) => c === "}" || c === "]" || c === '"' || isDigit(c) || c === "e" || c === "l";

export function repairJson(input: string): RepairResult {
  const counts = new Map<string, number>();
  const note = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);

  let src = input;
  if (src.charCodeAt(0) === 0xfeff) {
    src = src.slice(1);
    note("Removed an invisible byte-order mark at the start");
  }

  const out: string[] = [];
  // The open brackets, so a truncated document can be closed in the right order.
  const stack: string[] = [];
  let i = 0;

  /** Next non-whitespace character from `k`, skipping comments too. */
  const peekMeaningful = (k: number): { ch: string; at: number } => {
    let j = k;
    while (j < src.length) {
      const c = src[j]!;
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        j += 1;
        continue;
      }
      if (c === "/" && src[j + 1] === "/") {
        while (j < src.length && src[j] !== "\n") j += 1;
        continue;
      }
      if (c === "/" && src[j + 1] === "*") {
        j += 2;
        while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
        j += 2;
        continue;
      }
      return { ch: c, at: j };
    }
    return { ch: "", at: j };
  };

  /** The last meaningful character already emitted. */
  const lastEmitted = (): string => {
    for (let k = out.length - 1; k >= 0; k -= 1) {
      const s = out[k]!;
      for (let q = s.length - 1; q >= 0; q -= 1) {
        const c = s[q]!;
        if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") return c;
      }
    }
    return "";
  };

  while (i < src.length) {
    const c = src[i]!;

    // ---- strings: copied through untouched, which is what keeps content safe -------
    if (c === '"') {
      let j = i + 1;
      let str = '"';
      while (j < src.length) {
        const d = src[j]!;
        str += d;
        if (d === "\\") {
          str += src[j + 1] ?? "";
          j += 2;
          continue;
        }
        j += 1;
        if (d === '"') break;
      }
      out.push(str);
      i = j;
      continue;
    }

    // A curly quote where a string should start. Safe to normalise HERE and only here:
    // inside a real string the branch above has already copied it verbatim.
    if (c === "“" || c === "”") {
      let j = i + 1;
      let body = "";
      while (j < src.length && src[j] !== "“" && src[j] !== "”" && src[j] !== '"') {
        body += src[j];
        j += 1;
      }
      out.push('"' + body.replace(/"/g, '\\"') + '"');
      note("Replaced curly quotes with straight ones");
      i = j + 1;
      continue;
    }

    // A single-quoted string: legal in JavaScript, not in JSON.
    if (c === "'") {
      let j = i + 1;
      let body = "";
      while (j < src.length) {
        const d = src[j]!;
        if (d === "\\") {
          body += d + (src[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (d === "'") break;
        body += d;
        j += 1;
      }
      out.push('"' + body.replace(/"/g, '\\"') + '"');
      note("Changed single quotes to double quotes");
      i = j + 1;
      continue;
    }

    // ---- comments: not JSON, but people paste them in -----------------------------
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      note("Removed a comment");
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      note("Removed a comment");
      continue;
    }

    // ---- an unquoted key: name: value ---------------------------------------------
    if (isIdentStart(c)) {
      let j = i;
      let word = "";
      while (j < src.length && isIdentChar(src[j]!)) {
        word += src[j];
        j += 1;
      }
      if (word === "true" || word === "false" || word === "null") {
        out.push(word);
        i = j;
        continue;
      }
      const after = peekMeaningful(j);
      if (after.ch === ":") {
        out.push('"' + word + '"');
        note("Put quotes around a key that had none");
        i = j;
        continue;
      }
      // Not a key and not a literal - leave it exactly as it is and let the parse fail
      // honestly rather than guessing at what was meant.
      out.push(word);
      i = j;
      continue;
    }

    // ---- a comma that should not be there ------------------------------------------
    if (c === ",") {
      const next = peekMeaningful(i + 1);
      if (next.ch === "}" || next.ch === "]") {
        note("Removed a trailing comma");
        i += 1;
        continue;
      }
      out.push(c);
      i += 1;
      continue;
    }

    // ---- a comma that is missing ----------------------------------------------------
    if (c === "{" || c === "[") {
      const prev = lastEmitted();
      if (endsValue(prev)) {
        out.push(",");
        note("Added a missing comma");
      }
      stack.push(c);
      out.push(c);
      i += 1;
      continue;
    }
    if (c === "}" || c === "]") {
      // A closer with nothing open is a stray, and deleting it is a guess. Keep it and
      // let the parse fail: better an honest error than a document quietly reshaped.
      if (stack.length > 0) stack.pop();
      out.push(c);
      i += 1;
      continue;
    }

    out.push(c);
    i += 1;
  }

  let text = out.join("");

  // A second pass for the missing comma BETWEEN two values that are not brackets - a
  // string followed by a string, a number followed by a key. Done on the rebuilt text
  // with the same string-skipping scan, so content is still never touched.
  text = insertMissingCommas(text, note);

  // ---- a document cut off mid-way -------------------------------------------------
  if (stack.length > 0) {
    const closers = stack
      .reverse()
      .map((b) => (b === "{" ? "}" : "]"))
      .join("");
    text += closers;
    note(
      stack.length === 1
        ? "Closed a bracket that was left open"
        : `Closed ${stack.length} brackets that were left open`,
    );
  }

  let parses = true;
  try {
    JSON.parse(text);
  } catch {
    parses = false;
  }

  const fixes = [...counts.entries()].map(([k, n]) => (n > 1 ? `${k} (${n} times)` : k));
  return { text, fixes, parses };
}

/** The "two values with nothing between them" case, on a string-aware scan. */
function insertMissingCommas(src: string, note: (k: string) => void): string {
  const out: string[] = [];
  let i = 0;
  let lastMeaningful = "";
  while (i < src.length) {
    const c = src[i]!;
    if (c === '"') {
      let j = i + 1;
      let str = '"';
      while (j < src.length) {
        const d = src[j]!;
        str += d;
        if (d === "\\") {
          str += src[j + 1] ?? "";
          j += 2;
          continue;
        }
        j += 1;
        if (d === '"') break;
      }
      // A string starting right after a completed value, with no comma between them.
      if (endsValue(lastMeaningful)) {
        out.push(",");
        note("Added a missing comma");
      }
      out.push(str);
      lastMeaningful = '"';
      i = j;
      continue;
    }
    if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
      // A number or literal beginning right after a completed value.
      if ((isDigit(c) || c === "-") && endsValue(lastMeaningful)) {
        out.push(",");
        note("Added a missing comma");
      }
      lastMeaningful = c;
    }
    out.push(c);
    i += 1;
  }
  return out.join("");
}
