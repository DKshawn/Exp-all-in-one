# 独立 EMH 实验 2 AI 学生

[日本語](README.md) · [English](README.en.md)

这个独立的 Node.js 程序通过实验平台的学生接口参加 EMH 实验 2，不导入平台代码，也不使用 Demo 中的规则型 robot。教师负责创建房间、确认分配和开始实验；程序负责让指定数量的 AI 学生入室和交易。学生身份不需要教师权限。建议使用单独的测试环境和数据库。

## 使用方法

需要 Node.js 22 或更高版本，无需安装 npm 依赖。先启动实验平台并创建 **EMH 实验 2** 房间，记录房间代码。在本目录运行：

```powershell
node run.mjs
```

按提示输入平台地址、房间代码、AI 人数、模型来源和模型名称。也可以直接在地址处粘贴带房间代码的学生参加链接或教师房间链接，程序会自动识别房间代码。本地模型需要先启动支持 OpenAI 兼容 Chat Completions 和 JSON Schema 结构化输出的服务，例如 Ollama 的 `http://127.0.0.1:11434/v1` 或 LM Studio 的 `http://localhost:1234/v1`，并提前准备好模型。

程序会提示隐藏输入本地模型 Token：服务不要求验证时直接按回车，LM Studio 等服务要求验证时输入相应 Token。OpenAI 模式会提示隐藏输入 API 密钥。也可以预先通过环境变量 `LOCAL_MODEL_API_KEY` 或 `OPENAI_API_KEY` 提供密钥；程序不会把密钥写入恢复文件或记录。

入室完成后，在教师页面确认市场分配并开始实验。程序持续显示提交的 AI 操作和错误；Ctrl+C 停止程序。房间中的学生身份不会因此被删除。

也可以使用参数运行，例如：

```powershell
node run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
node run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider openai --model gpt-5.4-mini
node run.mjs --help
```

把模型名换成已安装或账号可用的模型。本地服务地址如果只输入主机和端口，程序会自动补上 `/v1`。`--interval` 设置每名学生最短决策间隔（秒，默认 10），`--timeout` 设置模型请求超时（秒，默认 20），`--parallel` 设置最多同时进行的模型请求数（默认 8）。达到并发上限时学生等待下一次机会，实际决策间隔可能更长。OpenAI 和本地模式均使用 JSON Schema 结构化输出。`--max-output-tokens` 设置模型输出上限（默认 2048），包括适用时的推理 tokens。

如果 LM Studio 的模型在长时间思考后仍无法给出决定，可在启动时增加 `--lmstudio-fast`。此模式使用 LM Studio 的 Responses 接口并关闭模型的长思考，仍由模型自主决定；模型和服务必须支持此设置，决策行为也可能与思考模式不同。可以同时调整 `--parallel` 和 `--max-output-tokens`，例如 `--lmstudio-fast --parallel 4 --max-output-tokens 1024`。没有这个参数时保持模型服务默认的思考设置。

## 恢复与记录

每次新运行会在 `.local/runs/` 创建包含房间地址、学生昵称和 PIN 的恢复文件，以及不含 API 密钥的 `.jsonl` 操作记录。记录包含模型决定及模型返回的 token 使用量，可能包含 AI 的私有条件；请妥善保存。文件不会提交到 Git。日志中的 `modelDurationMs` 是每次模型请求从发起到解析响应所用的毫秒数。`skipReason` 区分 `unit_changed`（交易单位已切换）、`quote_changed`（对手报价变化）、`model_capacity`（并发已满，暂缓请求）等原因；错误还会记录 `errorStage`。暂缓不代表已经发出模型请求。恢复文件可用于程序中断后重新登录同一批学生：

```powershell
node run.mjs --resume .local/runs/房间代码-时间-标识.json --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
```

恢复时平台地址、房间代码和人数来自恢复文件。AI 已入室后，必须在教师关闭入室前完成其余新学生的入室；分配后只允许已注册的学生重连。程序先检查房间属于 EMH，随后用第一个学生会话确认是实验 2：如果误选实验 1，可能留下一个已入室的 AI 学生，但不会交易。

## 决策规则

AI 选择等待后，程序保持等待状态，约每 2 秒通过学生接口检查市场；订单、成交、持仓、Clue 或轮次等发生变化时，在满足最短决策间隔和并发限制后重新请求模型决定。单纯的倒计时变化或未成交的交易单位切换不会触发模型请求。市场安静时可能所有 AI 都持续等待；恢复程序后会重新决策，不恢复之前的等待状态。日志记录等待开始、结束原因和持续时间。

每个 AI 只收到自己的持仓、配当、Clue、自己的历史结果和公开市场信息；程序会说明交易收支允许为负。模型决定买、卖、报价、取消或等待；实验平台负责验证交易。程序接受完整 JSON 或完整 JSON 代码框，并校验其中的决定。模型超时、报错、返回无效 JSON 或决定已过期时，该次不交易，**不会使用规则型 robot 代替**。暂停、休息和倒计时不调用模型。使用 OpenAI 时，这些实验观察会发送给 OpenAI，调用产生的费用取决于模型和使用量。

运行 `npm test` 可执行本程序的离线模拟测试。当前平台的学生接口不是专门承诺稳定的公共 API；平台更新后需要重新验证兼容性。
