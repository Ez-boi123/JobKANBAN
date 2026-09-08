# React Local JobKANBAN Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 实现 React 本地个人求职看板、Node HTTP API 和 SQLite 持久化。
**Architecture:** React 负责展示与用户输入；HTTP 命令由服务端校验并在 SQLite 事务中写入记录及历史；启动时空库。
**Tech Stack:** React, TypeScript, Vite, Node.js 24, node:sqlite, Playwright.
**Spec:** .scratch/job-kanban/full-stack-design.md and spec.md (newer scope wins).

## Global Constraints
- 中文桌面、蓝灰主题、居中详情；只监听 127.0.0.1。
- 真实时钟与北京时间；原演示隔离；数据不提交 Git。
- 浏览器及 HTTP 为测试边界，确认保存才更新 UI。

### Task 1: HTTP persistence and domain commands
Files: server/domain.mjs, server/store.mjs, server/index.mjs, tests/api.test.mjs.
Interface: GET /api/jobs => Job[]; POST /api/jobs => Job; PATCH /api/jobs/:id => Job; POST /api/jobs/:id/commands => Job. Error {error:string}; status 400/404/409. Version required for mutations. Job fields follow preview, with version:number, history:History[], rounds:Round[]. Command {version,type,...payload}, type progress|complete-action|cancel-action|offer|archive|restore. Progress fields stage,status,resultType,round,roundNotes,roundResult,action,date,dateType. Offer field decision accepted|declined. Create requires company and role.
- [ ] Test HTTP creation and GET; start missing server export and observe failure.
- [ ] Implement createApp({dbPath,staticDir,clock}) returning {server,close}; use sqlite transactions and version checking.
- [ ] Extend tests one slice at a time: persistence after restart; invalid progress; stale version; action history; Offer; archive/restore; round history.
- [ ] Check Node syntax and run node --test tests/api.test.mjs.

### Task 2: React user flows
Files: package.json, index.html, src/{main.tsx,App.tsx,Board.tsx,Detail.tsx,RecordForm.tsx,api.ts,types.ts,time.ts,app.css}, vite.config.ts, tsconfig.json.
Consumes Task 1 endpoints. Job fields string defaults, dates ISO or YYYY-MM-DD, states use Chinese. Frontend never mutates server history.
- [ ] Browser test: create company/role, refresh and assert same card; before frontend exists observe failure.
- [ ] Render React board and form with API calls and original design styles; typecheck.
- [ ] Implement detail, progress/round fields, completion/cancel, Offer, archive, query and sorting. Retain input after errors; explicit refresh on conflicts.
- [ ] Verify browser visible history, date reminders and dialog keyboard handling.

### Task 3: Integration and handoff
Files: tests/browser.mjs, README.md, start.cmd; scope status and review record.
- [ ] npm run build; npm test; npm run test:browser. Restart server during persistence scenario.
- [ ] Screenshot at 1440 and 1200; compare retained design theme; fix material defects.
- [ ] Two-axis code-review against initial snapshot, fix findings, repeat relevant checks.
- [ ] Commit final code to current branch; start personal app on port 3000 and provide link and startup instructions.

## Rulings
- User implement instruction to commit current branch overrides skill worktree default; repository is initially unborn.
- Latest explicit React/local selection approves concrete design including browser/HTTP checks. No further scope interview.
- Initial snapshot serves previously proposed review baseline. No implementation-agent parallel writes to same files.
