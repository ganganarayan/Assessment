// ============================================================================
//  THE ONLY FILE YOU NEED TO EDIT.
//  Change the values below and redeploy. No other file requires changes.
// ============================================================================

export const SITE = {
  name: 'Assess360',

  // Your live domain (no trailing slash). Used for canonical URL, sitemap, and JSON-LD.
  // If you change this, also update `site:` in astro.config.mjs to match.
  domain: 'https://assess.divineleads.guru',

  // Where every "Start free" button sends people (your app's signup page).
  // Change /signup to /register etc. if your app uses a different path.
  signupUrl: 'https://assess.divineleads.guru/signup',

  // OPTIONAL: paste your n8n webhook URL to enable analytics/notify pings on CTA clicks.
  // Leave blank ('') and nothing breaks — buttons simply link straight to signupUrl.
  webhookUrl: '',

  // Social preview + hero images (files live in the public/ folder).
  ogImage: '/og-image.png', // 1200x630 recommended (optional; drop one in public/)
  heroImage: '/hero-scorecard.png', // the nano-banana scorecard render

  // <head> copy
  title: 'Assess360 — Qualify leads before the sales call',
  description:
    'Assess360 scores every prospect against your fit criteria, so your team only talks to the leads that are actually ready to buy.',
} as const;

export type Tier = {
  name: string;
  price: string; // display only — real checkout (Razorpay) happens inside the app
  period: string;
  blurb: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  badge?: string;
};

// USD for all countries, no geo-detection. Prices are display-only.
export const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    blurb: 'Publish your first scorecard and start reading real fit signal.',
    features: [
      '1 assessment',
      '25 responses / month',
      'Hosted results page',
      'Email capture',
      'Assess360 badge',
    ],
    cta: 'Start free',
  },
  {
    name: 'Starter',
    price: '$39',
    period: '/ month',
    blurb: 'Route qualified leads straight into the tools your team already uses.',
    features: [
      '3 assessments',
      '300 responses / month',
      'Conditional logic',
      'Webhook / Zapier',
      'Lead export',
      '1 seat',
    ],
    cta: 'Start free',
  },
  {
    name: 'Growth',
    price: '$89',
    period: '/ month',
    blurb: 'Run it on your own brand and measure what converts.',
    features: [
      '15 assessments',
      '2,000 responses / month',
      'Custom domain',
      'Branding removed',
      'GA / Pixel tracking',
      'Split testing',
      '3 seats',
    ],
    cta: 'Start free',
    highlight: true,
    badge: 'Most popular',
  },
  {
    name: 'Scale',
    price: '$199',
    period: '/ month',
    blurb: 'Operate scorecards for every client from one account.',
    features: [
      'Unlimited assessments',
      '12,000 responses / month',
      'Agency sub-accounts',
      'API access',
      'White-label',
      '5+ seats',
      'Priority support',
    ],
    cta: 'Start free',
  },
];

export const FOUNDING_NOTE =
  'Founding cohort — the first 100 accounts lock this rate for life.';
