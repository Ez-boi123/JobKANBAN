import test from "node:test";
import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  mkdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

test("Node version support matches the documented 24.14+ requirement", async () => {
  let launcher;
  try {
    launcher = await import("../scripts/launcher.mjs");
  } catch (error) {
    assert.fail(`launcher module should load: ${error.message}`);
  }

  assert.equal(launcher.isSupportedNodeVersion("24.14.0"), true);
  assert.equal(launcher.isSupportedNodeVersion("24.99.0"), true);
  assert.equal(launcher.isSupportedNodeVersion("24.13.9"), false);
  assert.equal(launcher.isSupportedNodeVersion("25.0.0"), false);
  assert.equal(launcher.isSupportedNodeVersion("not-a-version"), false);
});

test("dependency installation is requested only when the npm lock state is missing or stale", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const dir = await mkdtemp(join(tmpdir(), "jobkanban-launcher-"));
  const lockfilePath = join(dir, "package-lock.json");
  const nodeModulesPath = join(dir, "node_modules");
  const installedLockPath = join(nodeModulesPath, ".jobkanban-lock-stamp");
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(lockfilePath, "{}");
  assert.equal(
    launcher.needsDependencyInstall({ lockfilePath, nodeModulesPath }),
    true,
  );

  await mkdir(nodeModulesPath);
  assert.equal(
    launcher.needsDependencyInstall({ lockfilePath, nodeModulesPath }),
    true,
  );

  await writeFile(installedLockPath, "{}");
  await utimes(lockfilePath, new Date(1_000), new Date(1_000));
  await utimes(installedLockPath, new Date(2_000), new Date(2_000));
  assert.equal(
    launcher.needsDependencyInstall({ lockfilePath, nodeModulesPath }),
    false,
  );

  await utimes(lockfilePath, new Date(3_000), new Date(3_000));
  assert.equal(
    launcher.needsDependencyInstall({ lockfilePath, nodeModulesPath }),
    true,
  );
});

test("frontend build is requested only when output is missing or older than an input", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const dir = await mkdtemp(join(tmpdir(), "jobkanban-build-"));
  const sourceDir = join(dir, "src");
  const sourcePath = join(sourceDir, "main.tsx");
  const configPath = join(dir, "vite.config.ts");
  const distEntryPath = join(dir, "dist", "index.html");
  t.after(() => rm(dir, { recursive: true, force: true }));

  await mkdir(sourceDir);
  await writeFile(sourcePath, "source");
  await writeFile(configPath, "config");
  assert.equal(
    launcher.needsBuild({
      distEntryPath,
      inputPaths: [sourceDir, configPath],
    }),
    true,
  );

  await mkdir(join(dir, "dist"));
  await writeFile(distEntryPath, "built");
  await utimes(sourcePath, new Date(1_000), new Date(1_000));
  await utimes(configPath, new Date(1_000), new Date(1_000));
  await utimes(distEntryPath, new Date(2_000), new Date(2_000));
  assert.equal(
    launcher.needsBuild({
      distEntryPath,
      inputPaths: [sourceDir, configPath],
    }),
    false,
  );

  await utimes(sourcePath, new Date(3_000), new Date(3_000));
  assert.equal(
    launcher.needsBuild({
      distEntryPath,
      inputPaths: [sourceDir, configPath],
    }),
    true,
  );
});

test("endpoint inspection distinguishes JobKANBAN, another service, and a free port", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const appServer = createServer((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ name: "JobKANBAN", status: "ok" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    appServer.closeAllConnections();
    await new Promise((resolve) => appServer.close(resolve));
  });
  const appUrl = `http://127.0.0.1:${appServer.address().port}`;

  assert.equal(await launcher.inspectEndpoint(appUrl), "jobkanban");

  const otherServer = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("another service");
  });
  await new Promise((resolve) => otherServer.listen(0, "127.0.0.1", resolve));
  const otherUrl = `http://127.0.0.1:${otherServer.address().port}`;
  assert.equal(await launcher.inspectEndpoint(otherUrl), "occupied");

  const unusedUrl = otherUrl;
  otherServer.closeAllConnections();
  await new Promise((resolve) => otherServer.close(resolve));
  assert.equal(await launcher.inspectEndpoint(unusedUrl), "available");
});

test("endpoint inspection recognizes a pre-health-endpoint JobKANBAN instance", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const server = createServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        '<!doctype html><title>JobKANBAN · 我的求职看板</title><div id="root"></div>',
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  assert.equal(await launcher.inspectEndpoint(url), "jobkanban");
});

test("health waiting retries until JobKANBAN becomes ready", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  let attempts = 0;
  const server = createServer((_request, response) => {
    attempts += 1;
    response.writeHead(attempts < 3 ? 503 : 200, {
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify(
        attempts < 3
          ? { status: "starting" }
          : { name: "JobKANBAN", status: "ok" },
      ),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  assert.equal(
    await launcher.waitForJobKanban(url, { attempts: 5, delayMs: 1 }),
    true,
  );
  assert.equal(attempts, 3);
});

test("HTTP waiting reports when a page becomes reachable", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<!doctype html><title>JobKANBAN</title>");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  assert.equal(
    await launcher.waitForHttp(url, { attempts: 2, delayMs: 1 }),
    true,
  );
});

test("launcher reuses an existing JobKANBAN instance", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const server = createServer((request, response) => {
    if (request.url === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ name: "JobKANBAN", status: "ok" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  assert.deepEqual(
    await launcher.launch({
      baseUrl: url,
      nodeVersion: "24.14.0",
      open: false,
    }),
    { status: "already-running", url },
  );
});

test("launcher reports a clear error when another service owns the port", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("another service");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  await assert.rejects(
    launcher.launch({ baseUrl: url, nodeVersion: "24.14.0" }),
    /端口 3000 已被其他程序占用/,
  );
});

test("launcher requests startup when the application port is available", async () => {
  const launcher = await import("../scripts/launcher.mjs");
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  await new Promise((resolve) => server.close(resolve));

  assert.deepEqual(
    await launcher.launch({ baseUrl: url, nodeVersion: "24.14.0" }),
    { status: "start-needed", url },
  );
});

test("app preparation installs locked dependencies and builds missing output", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const appDir = await mkdtemp(join(tmpdir(), "jobkanban-prepare-"));
  t.after(() => rm(appDir, { recursive: true, force: true }));

  await mkdir(join(appDir, "src"));
  await writeFile(join(appDir, "src", "main.tsx"), "source");
  await writeFile(join(appDir, "index.html"), "<!doctype html>");
  await writeFile(join(appDir, "vite.config.ts"), "export default {};");
  await writeFile(join(appDir, "tsconfig.json"), "{}");
  await writeFile(
    join(appDir, "package.json"),
    JSON.stringify({
      name: "jobkanban-launcher-fixture",
      version: "1.0.0",
      scripts: { build: "node build.mjs" },
    }),
  );
  await writeFile(
    join(appDir, "package-lock.json"),
    JSON.stringify({
      name: "jobkanban-launcher-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": { name: "jobkanban-launcher-fixture", version: "1.0.0" },
      },
    }),
  );
  await writeFile(
    join(appDir, "build.mjs"),
    'import { mkdir, writeFile } from "node:fs/promises"; await mkdir("dist", { recursive: true }); await writeFile("dist/index.html", "built");',
  );

  assert.deepEqual(await launcher.prepareApp(appDir), {
    installed: true,
    built: true,
  });
  await access(join(appDir, "node_modules", ".jobkanban-lock-stamp"));
  await access(join(appDir, "dist", "index.html"));
});

test("development preparation skips the production build", async (t) => {
  const launcher = await import("../scripts/launcher.mjs");
  const appDir = await mkdtemp(join(tmpdir(), "jobkanban-dev-"));
  const nodeModulesPath = join(appDir, "node_modules");
  const lockfilePath = join(appDir, "package-lock.json");
  const stampPath = join(nodeModulesPath, ".jobkanban-lock-stamp");
  t.after(() => rm(appDir, { recursive: true, force: true }));

  await mkdir(nodeModulesPath);
  await writeFile(lockfilePath, "{}");
  await writeFile(stampPath, "ready");
  await utimes(lockfilePath, new Date(1_000), new Date(1_000));
  await utimes(stampPath, new Date(2_000), new Date(2_000));

  assert.deepEqual(await launcher.prepareApp(appDir, { build: false }), {
    installed: false,
    built: false,
  });
});
