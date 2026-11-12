# 开发、部署与验证

[日本語](../ja/development.md) · [中文](../zh-CN/development.md) · [English](../en/development.md)

随机演化博弈使用平台迁移器及四张 `evolution_` 表。`npx tsx --test tests/evolution.test.ts` 检查引擎和 PGlite，`npx playwright test evolution.spec.ts` 验证两种正式实验和演示。 [规则与数据](evolution.md)

## 本地启动

在 Codex 的 Edit project 中，Source folders 只保留 `C:\Users\dksha\Documents\project\Exp-all-in-one`，并设为 Make primary。不要再把旧 `EMH` 或 `Judgment_under_Uncertainty` 添加为开发目录。已有聊天可能仍记录旧工作目录，因此执行命令前核对工作目录和 `git rev-parse --show-toplevel`。旧教师页面分支的来源见[迁移记录](../../upstream/judgment/teacher-management-20261102/README.md)，后续只修改统一仓库。

本地项目文件夹为 `Exp-all-in-one`，所有命令都从该仓库根目录运行。

使用 Node.js 24.x，与 `.nvmrc`、CI 和 Vercel 的设置一致。`package.json` 的 `engines.node` 固定为 `24.x`，避免自动切换到将来的主版本。

```sh
npm ci
npm run dev
```

Windows 上可使用 `pwsh -NoProfile -File scripts/dev-local.ps1` 启动隔离的本地验证环境，端口为3200，数据目录为 `.data/platform-verification`。不再需要旧 EMH 文件夹，见[整理记录（英文）](../../releases/emh-folder-consolidation.md)。

普通开发服务器的教师入口为 `http://localhost:3000/teacher`，请使用与学生入口不同的独立地址打开。配置密钥后，需先登录才能选择实验。未配置 Neon 时使用嵌入式 PostgreSQL（PGlite），默认保存在 `.data/auction`；不要让多个服务器同时打开同一保存目录。生产环境使用 Neon。

要在本地使用教师演示，请在 Git 忽略的 `.env.local` 中设置 `TEACHER_ACCESS_KEY`，然后重启服务。未配置密钥时，本地仍可开发正式课堂流程，演示登录会被禁用。

教师入口及 `?entry=teacher` 的房间页面在服务器端验证登录。`POST /api/teacher/session` 验证密钥后签发8小时有效的签名HttpOnly、SameSite=Lax Cookie，HTTPS下启用Secure；不会把密钥本身存入Cookie或浏览器存储。`DELETE` 用于退出，更换密钥使已有会话失效。创建、管理、删除及Judgment教师预览API验证会话，同时兼容现有已认证脚本的 `accessKey`。无需新增环境变量或数据库迁移。

尺寸预览仅允许同源嵌入 `/demo` 和 `/emh/demo`；教师页面和正式房间仍禁止嵌入。

## Vercel + Neon

| 环境变量             | 用途                                                            |
| -------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`       | Neon pooled PostgreSQL 连接字符串，Vercel 必需                  |
| `TEACHER_ACCESS_KEY` | 用于教师入口认证及会话签名的共用密钥，Vercel 必需，不分享给学生 |
| `PGLITE_DATA_DIR`    | 可选的本地数据保存目录                                          |

通过 GitHub 部署到 Vercel。`vercel.json` 的函数区域为 `sin1`，与 Neon Singapore 一致。首次连接自动初始化表，也可手动运行 `npm run db:migrate`。生产环境不会回退到本地数据库。

`.env*`、`.data`、`work` 和测试产物不提交到 Git。预览环境应使用单独的 Neon 分支。

## 同步与一致性

SSE 推送订单和成交变化，通常仅发送当前身份有权查看的差量，首次连接或重连时发送最新快照。Double Auction 的学生历史仅涵盖当前制度配置的期数，累计利润和教师的所有期记录仍保留。断线后自动重连，并以低频 HTTP 查询补充。单个学生断线不会自动暂停其他参加者或实验时钟；全市场暂停由教师操作。订单截止仍以数据库时间判断。

实验1按市场保存交易状态、去重ID和操作记录。学生订单仅锁定所在市场行；教师暂停或恢复等操作通过共用设置锁协调全市场。状态和审计记录在同一事务中提交。服务器有连接时继续推进截止时间；所有人断开后，下次访问也会按已记录的时间补齐状态。

本地 PostgreSQL 用 LISTEN/NOTIFY 通知其他应用进程。线上直接通知需要额外的 `REALTIME_DATABASE_URL`，使用支持 LISTEN 的直连。未设置时，服务器查询每个房间的小型版本列表并推送差量。本地实测不能保证云端能力或费用。

认证令牌保存在 HttpOnly Cookie 中，数据库只存哈希；密码和 PIN 使用带盐 scrypt。教师数据仅在认证后返回；学生不会收到其他人的价值、成本或其他市场的订单。Call 订单簿仅公开本市场的价格与剩余数量。审计 CSV 的记录范围区分共用操作和市场操作。

[本地 PostgreSQL 与192人负载验证（日文）](../../local-capacity-testing.md)说明了如何使用 `LOCAL_ONLY=1` 和 `LOCAL_DATABASE_URL` 阻止验证连接云端。PGlite 单进程测试和真实 PostgreSQL 并发测试应分别看待。

## 验证与开发约定

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

自动测试检查三种交易制度、1至5单位的边际价值与逐单位订单、制度顺序的均衡分配、6市场96人的数据库加入、并发请求、截止、暂停、收敛指标、私有信息、导出和已有房间兼容性。各模块的 HTTP 验证方法见 [EMH](emh.md) 和 [Judgement](judgment.md)。

`tests/e2e` 是 Playwright 浏览器测试，`npm run test:e2e` 使用专用本地数据库和临时教师密钥。测试另行启动的本地服务器时，用 `VERIFY_TEACHER_KEY_FILE` 指定保存该服务器教师密钥的文件。指定已有环境的 `E2E_BASE_URL` 不应指向生产地址。包含旧12人 CDA 的回归测试和教师新建实验1的表单测试。

所有正式实验共同维护在 `main`，开发使用短期功能分支，验证后合并并删除分支。平台负责入口、房间、会话与数据库连接，各实验模块负责自己的规则和数据。详见[架构与开发约定（英文）](../../architecture.md)。

Double Auction 的主要实现包括 `src/experiments/double-auction/lib/study-core.ts`（规则）、同目录的 `study-view.ts`（视图与统计）、`study-export.ts`（导出），以及 `src/experiments/double-auction/components/study-room.tsx`（页面）和同目录的 `study-settings.tsx`（设置）。照片来源见 [public/fruits/CREDITS.md](../../../public/fruits/CREDITS.md)。

## 三语文档同步检查

PR 中的 **Documentation sync** 从共同分支点比较整个 PR 已提交的改动，检查 README 和相关指南是否遗漏日中英更新，不只检查最后一次提交。在检查警告和运行摘要中列出未更新或不存在的语言文件，以及触发检查的改动。文档提醒不会自动阻止合并；如果无法完成 Git 比较，检查会失败，避免把未执行检查误报为通过。

| 改动                                     | 检查的指南                                            |
| ---------------------------------------- | ----------------------------------------------------- |
| 实验模块及路径含实验名的路由或样式       | 对应的 `double-auction.md`、`emh.md` 或 `judgment.md` |
| Demo 代码                                | `demo.md`，以及对应实验或共用指南                     |
| 共用界面、加入与房间相关代码             | `classroom.md`                                        |
| 共用服务端代码                           | `classroom.md` 和 `development.md`                    |
| 脚本、Actions 工作流、依赖与运行环境配置 | `development.md`                                      |

以上改动也会检查三个 README。只修改 README 或 `docs/guide/{ja,zh-CN,en}/` 中某个语言的指南时，会核对同一文档的其他语言，新指南名称也适用。只删除或重命名一个语言版本会提醒；仅涉及文档的改动中，同时废弃或重命名三种语言的指南可以通过。仅测试、`AGENTS.md` 以及 `docs/upstream` 历史原材料的修改不视为功能变更。

本地提交后也可执行同样的比较，未提交的编辑不在检查范围内：

```sh
npm run docs:check -- --base origin/main --head HEAD
```

这是基于文件改动的提醒，不能判断翻译语义是否准确，也不能自动判断重构是否需要文档变更。出现提醒时，应核对对应三版的内容和链接，将必要修改放在同一个 PR；确实无需修改时在评审中说明理由，不要为消除警告而制造无意义改动。

---

[首页](../../../README.zh-CN.md) · [课堂使用流程](classroom.md) · [Double Auction](double-auction.md) · [Demo Model](demo.md) · [EMH 资产市场实验](emh.md) · [Judgement under Uncertainty](judgment.md)
