import { execFile, spawnSync } from "node:child_process";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

const TEXT = new Set([".html", ".js", ".json", ".css", ".svg"]);

/** Serve `root`, a folder or a function that reads a path to a promise of its
    bytes, on a free port, once it is listening; with `gzip`, text goes
    compressed to a browser that takes it, as the host sends it. */
export function serve(root, { gzip = false } = {}) {
  const folder = typeof root === "string";
  const read = folder ? readFile : root;
  return new Promise((done) => {
    const server = http.createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      const file = folder ? normalize(join(root, path)) : path.slice(1);
      if (folder && !file.startsWith(root)) return res.writeHead(403).end();
      try {
        let body = await read(file);
        const headers = { "content-type": TYPES[extname(file)] || "application/octet-stream" };
        if (
          gzip &&
          TEXT.has(extname(file)) &&
          /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")
        ) {
          body = gzipSync(body);
          headers["content-encoding"] = "gzip";
        }
        res.writeHead(200, headers);
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, "127.0.0.1", () => done(server));
  });
}

/** Put `__module(name)` on a page before its scripts run: the module of that
    file name, imported from where the page preloads it. */
export function locate() {
  window.__module = (name) =>
    import(
      new URL(
        [...document.querySelectorAll('link[rel="modulepreload"]')]
          .map((link) => link.getAttribute("href"))
          .find((href) => href.endsWith(`/${name}`)),
        location.href,
      ).href
    );
}

const execute = promisify(execFile);

/** What `serve` reads `ref`'s public/ through: a path under it to a promise of its bytes. */
export function fromRef(ref) {
  const found = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (found.status !== 0) {
    const said = (found.error?.message ?? found.stderr).trim();
    throw new Error(`no commit ${ref} in the repository${said && `: ${said}`}`);
  }
  const commit = found.stdout.trim();
  const blob = async (path) => {
    if (path.split("/").includes("..")) throw new Error(`${path} is outside public/`);
    const options = { cwd: ROOT, encoding: "buffer", maxBuffer: Infinity };
    return (await execute("git", ["cat-file", "blob", `${commit}:public/${path}`], options)).stdout;
  };
  const kept = new Map();
  return (path) => {
    if (!kept.has(path)) kept.set(path, blob(path));
    return kept.get(path);
  };
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
