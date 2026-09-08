# Specification review

Status: needs-triage

Reviewed `449844b2ab858eaf0bf9604db238bb8ab30662bb...HEAD` (commit `0dd2da9`). The newer full-stack design authorizes React, the local backend and persistence; obsolete scope exclusions were ignored. No application files changed.

- **[P2] Follow-up deadlines overwrite the interview round time — `server/domain.mjs:70`.** Full-stack specification: “记录每轮的时间、备注和结果”; original specification: “保留过去轮次的信息”. Reproduced with domain commands: schedule 一面 for September 8 at 10:00, complete it, then add a September 10 email follow-up while remaining 待反馈. The round date becomes September 10. `saveRound` copies every current action date into the round, so the displayed interview date is now a follow-up deadline. Preserve the actual round schedule separately from follow-up actions.

- **[P2] Waiting duration is a day ahead for early-morning changes — `src/time.ts:15`.** Full-stack specification: “日期按北京时间解释”; original specification: “查看当前环节的等待时长”. Reproduced by calling `waitLabel` with `statusSince=2026-09-07T17:00:00.000Z` (September 8, 01:00 Beijing) and now September 8, 09:00 Beijing: output is “等待反馈 1 天”. The function compares Beijing today with the UTC date prefix of the stored timestamp. Convert both instants to Beijing calendar dates before subtracting.

- **[P2] The visible timeline omits preserved action context — `src/Detail.tsx:16`.** Original specification: “历史保留原行动、时间类型、原时间和轮次”; full-stack acceptance: “检查可见历史”. Rendering only title, processing date and text hides the structured previous stage/status/round and action date type. Complete identically named actions in different rounds, or cancel one, then open history: entries cannot identify their originating round or distinguish appointment from deadline. Those fields exist in history snapshots but are never rendered. Show the saved context beside each action event.

These findings supplement the reported passing API/browser checks; the two time-data issues were independently reproduced with the actual implementation functions.
