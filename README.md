# JobKANBAN · 本地个人版

React 求职看板，Node.js 后端与 SQLite 数据库。蓝灰主界面、四阶段看板及居中详情沿用已确认设计。正式版首次运行是空看板，不写入虚构示例。

## 启动

需要 Node.js 24.14 或更新的 24.x 版本。

在项目目录执行一次：

```powershell
npm install
```

随后双击 `start.cmd`，或执行：

```powershell
npm run build
npm start
```

打开 [本地应用](http://127.0.0.1:3000)。保持服务窗口运行；按 Ctrl+C 停止。再次启动仍能读取此前记录。若 3000 端口已被占用，请先停止本应用的旧服务。

## 使用与数据

- 新建公司和岗位，然后在详情中补充行动或更新进展。拖动卡片后需要保存确认。
- 测评和面试支持多轮、轮次备注与结果；完成并待反馈和取消行动保留不同历史。
- Offer 可记录待决定、已接受或已婉拒；结果记录可归档并恢复。
- 数据保存于 `data/jobkanban.sqlite`，不保存在浏览器缓存。刷新、更换本机浏览器或重启服务不丢失成功保存的数据。
- 备份时先停止服务，再复制整个 `data` 文件夹；恢复时先停止服务，再放回备份。请勿删除该文件夹。
- 正式版按真实时间和北京时间显示今天、本周、逾期及预约待更新。
- 多页面同时修改会提示版本冲突；重新读取最新记录后再编辑，避免覆盖别处的修改。

这是本机单用户应用，仅监听 `127.0.0.1`。不包含云端账号或跨设备同步。原设计预览仍独立保留于 `design/index.html`，其中的演示操作不会修改正式数据库。

## 开发与检查

```powershell
npm run typecheck
npm run build
npm test
npm run test:browser
```

浏览器验收使用临时数据库并自行启动测试服务，不触碰实际记录；Windows 默认调用已安装的 Edge。其他环境先执行 `npx playwright install chromium`，并将 `PLAYWRIGHT_CHANNEL` 设为 `chromium`。

`npm run dev` 提供 React 开发服务，需另一个窗口运行 `npm start` 启动后端。正式使用以 `start.cmd` 为入口。

前端源码在 `src`，后端在 `server`，测试在 `tests`。SQLite 使用 Node.js 内置接口，当前 Node 版本可能输出实验性提示；这不会中断启动。
