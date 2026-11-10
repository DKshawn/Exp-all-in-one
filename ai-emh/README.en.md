# Independent EMH Experiment 2 AI students

[日本語](README.md) · [中文](README.zh-CN.md)

This standalone Node.js program joins EMH Experiment 2 using the platform's student interface. It does not import platform code or use the demo's rule-based robots. The teacher creates the room, confirms allocation and starts the experiment; the program joins the configured number of AI students and trades as them. A separate test environment and database are recommended.

## Usage

Node.js 22 or newer is required; no npm dependencies need to be installed. Start the experiment platform, create an **EMH Experiment 2** room and note its code. From this directory, run:

```powershell
node run.mjs
```

Enter the platform URL, room code, AI count, model provider and model name when prompted. You can also paste a student participation link or teacher room link as the address; the program extracts its room code. For a local model, first run an OpenAI-compatible Chat Completions server supporting JSON Schema structured output and prepare a model, for example Ollama at `http://127.0.0.1:11434/v1` or LM Studio at `http://localhost:1234/v1`.

The program prompts for the local model token without displaying it: press Enter if the service does not require authentication, or provide its token when required, as with some LM Studio installations. OpenAI mode prompts for its API key without displaying it. Alternatively, set `LOCAL_MODEL_API_KEY` or `OPENAI_API_KEY` in the environment first. Keys are never saved in recovery files or logs.

Once everyone has joined, confirm allocation and start from the teacher page. The program displays submitted AI actions and errors. Ctrl+C stops it without deleting enrolled students.

Alternatively, pass parameters:

```powershell
node run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
node run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider openai --model gpt-5.4-mini
node run.mjs --help
```

Replace the model name with an installed or available model. When a local service address contains only a host and port, the program automatically appends `/v1`. `--interval` is the minimum decision interval per student in seconds (default 10); `--timeout` is the model timeout in seconds (default 20); `--parallel` limits concurrent model requests (default 8). Students wait for another opportunity when the concurrency limit is reached, so actual intervals may be longer. Both OpenAI and local modes use JSON Schema structured output. `--max-output-tokens` sets the output limit (default 2048), including reasoning tokens when applicable.

If an LM Studio model spends too long reasoning without producing a decision, add `--lmstudio-fast`. This uses LM Studio's Responses interface with extended reasoning disabled; the model still makes the decision. The service and model must support this setting, and its decisions may differ from reasoning mode. You can also adjust concurrency and output limits, for example `--lmstudio-fast --parallel 4 --max-output-tokens 1024`. Without the flag the model service's default reasoning settings apply.

## Recovery and logs

Each new run saves a recovery file containing the platform address, student names and PINs, plus a `.jsonl` action log without the API key, under `.local/runs/`. The log records AI decisions and reported token usage and may contain the AI's private conditions; store it carefully. These files are excluded from Git. In the log, `modelDurationMs` measures each model request through response parsing in milliseconds. `skipReason` identifies causes such as `unit_changed`, `quote_changed`, or `model_capacity` (deferred until a concurrency slot is free); errors also include `errorStage`. A deferral is not a model request. Resume the same students after interruption with:

```powershell
node run.mjs --resume .local/runs/room-time-id.json --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
```

The recovery file determines the platform, room code and student count. All new students must join before the teacher closes admission; only registered students can reconnect after allocation. The program first checks that the room is EMH, then verifies Experiment 2 with the first student's session. If Experiment 1 was selected by mistake, one AI student may have joined, but it will not trade.

## Decisions

When the AI chooses to wait, the program keeps it in a waiting state and polls the student market view about every two seconds. Changes to orders, trades, holdings, clues or rounds trigger a fresh model decision, subject to the minimum decision interval and concurrency limit. Clock ticks and an empty unit rollover alone do not trigger a request. In a quiet market all participants may keep waiting. A resumed process makes a fresh decision instead of restoring waiting state. The log records the start, end reason and duration of waiting.

Each AI receives only its own holdings, dividends, clue and past results plus public market information, and is told that net trading cash may be negative. The model chooses to buy, sell, quote, cancel or wait; the platform validates the transaction. The program accepts a complete JSON object or a complete fenced JSON block and validates the decision. On a timeout, error, invalid JSON or stale decision, it does not trade and **never substitutes a rule-based robot**. Models are not called during pauses, breaks or countdowns. OpenAI mode sends these experiment observations to OpenAI and incurs charges based on model usage.

Run `npm test` for offline simulated tests. The current student interface is not a dedicated stable public API, so verify compatibility after platform updates.
