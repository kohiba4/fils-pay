// Local, same-origin copy of the stack for screenshots: serves apps/web/dist on :5180 and apps/admin/dist on :5181 and proxies
// /v1/* to the API on 127.0.0.1:3010 (the production nginx does the same). Plain Node, no dependencies.
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };
function serve(root, port) {
  http.createServer((req, res) => {
    if (req.url.startsWith("/v1/") || req.url === "/healthz" || req.url === "/readyz") {
      const p = http.request({ host: "127.0.0.1", port: 3010, path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      p.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(p);
      return;
    }
    let f = join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" });
    createReadStream(f).pipe(res);
  }).listen(port, "127.0.0.1");
}
const webRoot = process.env.WEB_DIST ?? new URL("../../apps/web/dist/", import.meta.url).pathname;
const adminRoot = process.env.ADMIN_DIST ?? new URL("../../apps/admin/dist/", import.meta.url).pathname;
const webPort = Number(process.env.WEB_PORT ?? 5180), adminPort = Number(process.env.ADMIN_PORT ?? 5181);
serve(webRoot, webPort);
serve(adminRoot, adminPort);
console.log(`web http://127.0.0.1:${webPort}  admin http://127.0.0.1:${adminPort}  (API proxied to :3010)`);
