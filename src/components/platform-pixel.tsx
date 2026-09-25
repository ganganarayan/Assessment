import Script from "next/script";

/**
 * Assess360 SaaS-funnel Meta Pixel base code — a SEPARATE pixel from the Gita
 * assessment one (components/meta-pixel.tsx). Loads fbevents, inits the platform
 * pixel, and fires a PageView. Mounted on the marketing landing, sign-up, and the
 * /w app — never on /a/* (that stays Gita-only). Renders nothing when unset.
 *
 * Funnel events (CompleteRegistration on signup, Purchase on subscription) are fired
 * from the client via lib/meta/platform-pixel-client.ts using `trackSingle` so they
 * are attributed to THIS pixel id even if another pixel ever shares the page.
 */
export function PlatformPixel({ pixelId }: { pixelId: string | null }) {
  if (!pixelId) return null;
  return (
    <>
      <Script id="platform-meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('trackSingle', '${pixelId}', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
