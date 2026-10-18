"use client";

/**
 * What can go in a video field, said once and used by both page builders.
 *
 * The field used to say "paste the embed code (e.g. from VidaPulse)", which was an
 * accurate description of a limitation: an embed was the only thing that played. Now
 * that any of four kinds works, the field has to say so, or nobody will try the mp4
 * they already have.
 *
 * VidaPulse is offered as a suggestion rather than a requirement, with its own sign-up,
 * because it is the only option here that also reports how much of the video a
 * respondent actually watched. 🟢 The link opens in a new window on purpose: leaving to
 * sign up loses nothing, since the setup sequence recomputes where somebody was and
 * brings them back to the same step.
 */
export function VideoSourceHint() {
  return (
    <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
      Paste a video URL or an embed code. An mp4 or webm file, a YouTube or Vimeo link, an
      .m3u8 HLS stream, or an iframe embed all play. Only the iframe&apos;s src is used, never the
      pasted markup.{" "}
      <a
        href="https://vidapulse.io"
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        VidaPulse
      </a>{" "}
      is free to sign up for and is the one option that also reports how much of the video each
      respondent watched.
    </p>
  );
}
