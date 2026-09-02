import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// NOTE: `site` should match SITE.domain in src/config.ts.
// It is already set to the correct default, so you normally do not touch this file.
export default defineConfig({
  site: 'https://assess.divineleads.guru',
  integrations: [tailwind()],
});
