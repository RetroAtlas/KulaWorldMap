import { spawnSync } from "node:child_process";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

/** Serve a directory on a free port, once it is listening. */
export function serve(root) {
  return new Promise((done) => {
    const server = http.createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) return res.writeHead(403).end();
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, "127.0.0.1", () => done(server));
  });
}

/** Take `ref`'s public/ out into `dir`, and say where it is. */
export function checkout(ref, dir) {
  const archive = join(dir, "ref.tar");
  for (const [cmd, ...rest] of [
    ["git", "archive", "--format=tar", "-o", archive, ref, "public"],
    ["tar", "-x", "-f", archive, "-C", dir],
  ]) {
    const run = spawnSync(cmd, rest, { cwd: ROOT, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${cmd} failed: ${run.stderr}`);
  }
  return join(dir, "public");
}
