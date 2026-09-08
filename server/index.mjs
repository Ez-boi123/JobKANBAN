import { createServer } from "node:http";
import { resolve, dirname, extname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, realpath } from "node:fs/promises";
import { createJob, editJob, commandJob, HttpError } from "./domain.mjs";
import { openStore } from "./store.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
function validateLocal(req, server) {
  const port = server.address().port;
  const hosts = [
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    ...(port === 80 ? ["localhost", "127.0.0.1"] : []),
  ];
  if (!hosts.includes(req.headers.host?.toLowerCase()))
    throw new HttpError(400, "仅支持本机访问");
  if (
    req.headers.origin &&
    !hosts
      .map((host) => `http://${host}`)
      .includes(req.headers.origin.toLowerCase())
  )
    throw new HttpError(400, "不允许此来源访问");
  if (req.headers["sec-fetch-site"] === "cross-site")
    throw new HttpError(400, "不允许跨站访问");
}
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    throw new HttpError(400, "请使用 JSON 提交");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 65536) throw new HttpError(400, "提交内容过长");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON 格式无效");
  }
}
async function serveStatic(path, req, res, staticDir) {
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new HttpError(400, "资源路径无效");
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.split("/").some((part) => part.startsWith(".")) ||
    decoded.includes(":")
  )
    throw new HttpError(404, "未找到资源");
  const filePath = resolve(
    staticDir,
    "." + (decoded === "/" ? "/index.html" : decoded),
  );
  if (!mime[extname(filePath)]) throw new HttpError(404, "未找到资源");
  let actual, actualRoot;
  try {
    [actual, actualRoot] = await Promise.all([
      realpath(filePath),
      realpath(staticDir),
    ]);
  } catch {
    throw new HttpError(404, "未找到资源");
  }
  const within = relative(actualRoot, actual);
  if (within.startsWith("..") || isAbsolute(within))
    throw new HttpError(404, "未找到资源");
  let content;
  try {
    content = await readFile(actual);
  } catch {
    throw new HttpError(404, "未找到资源");
  }
  res.writeHead(200, {
    "Content-Type": mime[extname(filePath)],
    "Content-Length": content.length,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
    "Content-Security-Policy":
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  res.end(req.method === "HEAD" ? undefined : content);
}
export function createApp({
  dbPath = resolve(root, "data/jobkanban.sqlite"),
  staticDir = resolve(root, "dist"),
  clock = () => new Date(),
} = {}) {
  const store = openStore(dbPath);
  const server = createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    try {
      validateLocal(req, server);
      const path = req.url.split("?")[0];
      if (path === "/api/jobs" && req.method === "GET")
        return send(200, store.list());
      if (path === "/api/jobs" && req.method === "POST") {
        return send(
          201,
          store.save(createJob(await readBody(req), clock().toISOString())),
        );
      }
      const match = path.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)(\/commands)?$/);
      if (
        match &&
        ((req.method === "PATCH" && !match[2]) ||
          (req.method === "POST" && match[2]))
      ) {
        const body = await readBody(req);
        return send(
          200,
          store.mutate(match[1], body?.version, (old) =>
            (match[2] ? commandJob : editJob)(old, body, clock().toISOString()),
          ),
        );
      }
      if (!path.startsWith("/api/") && ["GET", "HEAD"].includes(req.method))
        return await serveStatic(path, req, res, staticDir);
      send(404, { error: "未找到资源" });
    } catch (error) {
      send(error.status || 500, {
        error: error.status ? error.message : "保存或读取失败，请稍后重试",
      });
    }
  });
  return {
    server,
    close: async () => {
      await new Promise((resolve, reject) =>
        server.close((error) =>
          error && error.code !== "ERR_SERVER_NOT_RUNNING"
            ? reject(error)
            : resolve(),
        ),
      );
      store.close();
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp();
  app.server.listen(3000, "127.0.0.1", () =>
    console.log("JobKANBAN: http://127.0.0.1:3000"),
  );
}
