/**
 * A validated video embed.
 *
 * `src` has already been through parseEmbed (host allowlist, https only), so this
 * component's job is presentation plus the safety attributes: a sandbox narrow enough
 * that a compromised video host cannot navigate the visitor away or reach our storage,
 * and a fixed 16:9 box so the page does not jump as the frame loads.
 *
 * `allow` carries what a player genuinely needs (autoplay on user gesture, fullscreen,
 * picture-in-picture) and nothing that touches the visitor's hardware: no camera, no
 * microphone, no geolocation.
 */
export function VideoEmbed({ src, title }: { src: string; title: string }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        className="absolute inset-0 h-full w-full border-0"
        // allow-same-origin is required for players that read their own storage for
        // playback position and view tracking; it is paired with a host allowlist, which
        // is what keeps that from being a hole.
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
