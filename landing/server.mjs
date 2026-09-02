// Minimal, dependency-free static file server for the built site (dist/).
// Railway runs `npm start` -> this file. It binds to the PORT Railway provides.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const PORT = process.env.PORT || 4321;
const HOST = '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function resolveFile(urlPath) {
  // Strip query string, decode, and prevent path traversal.
  const clean = decodeURIComponent((urlPath.split('?')[0] || '/'));
  let rel = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) return null;

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
    await stat(filePath);
    return filePath;
  } catch {
    // Astro static also emits pretty-url folders; try "<path>/index.html".
    try {
      const alt = join(ROOT, rel, 'index.html');
      await stat(alt);
      return alt;
    } catch {
      return null;
    }
  }
}

const server = createServer(async (req, res) => {
  let filePath = await resolveFile(req.url || '/');
  let status = 200;

  if (!filePath) {
    status = 404;
    filePath = join(ROOT, '404.html');
    try {
      await stat(filePath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
  }

  try {
    const body = await readFile(filePath);
    const type = TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type };
    // Long cache for hashed assets, short cache for html.
    if (filePath.includes(`${'/'}_astro${'/'}`)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
    }
    res.writeHead(status, headers);
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Assess360 landing served on http://${HOST}:${PORT}`);
});
