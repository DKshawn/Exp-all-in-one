import assert from "node:assert/strict";
import test from "node:test";
import { resultsCsv } from "../src/results.mjs";

test("export identifies the model and timings for historical and resumed decisions", () => {
  const log = [
    {
      type: "run_started",
      at: "run-1",
      experiment: "evolution",
      model: "legacy-alias",
      provider: "local",
    },
    { type: "deferred", student: "AI001" },
    {
      type: "submitted",
      student: "AI001",
      modelDurationMs: 0,
      decision: { action: "choose", choice: 0 },
      usage: { prompt_tokens: 12, completion_tokens: 3 },
    },
    {
      type: "run_started",
      at: "run-2",
      runId: "second",
      model: "new-alias",
      provider: "openai",
    },
    {
      type: "submitted",
      roomCode: "ABCD23",
      runId: "second",
      student: "AI001",
      model: "new-alias",
      responseModel: "model-build",
      modelDurationMs: 91,
      decision: { action: "choose", choice: 1, reason: '=SUM(1,2) "quoted"' },
      selectedOption: "鹿",
      usage: { input_tokens: 15, output_tokens: 4, total_tokens: 19 },
    },
    {
      type: "error",
      student: "AI002",
      modelDurationMs: 120,
      errorStage: "model",
      skipReason: "model_timeout",
    },
    { type: "waiting_ended", student: "AI002", waitDurationMs: 400 },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");
  const [header, historical, resumed, timeout, end] = resultsCsv(
    log,
    "ABCD23",
  ).split("\r\n");
  assert.match(header, /provider,model,responseModel/);
  assert.match(historical, /"ABCD23","evolution",,"run-1","AI001"/);
  assert.match(
    historical,
    /"local","legacy-alias",,,,,0,12,3,,"submitted","choose",0/,
  );
  assert.match(resumed, /"openai","new-alias","model-build",,,,91,15,4,19/);
  assert.match(
    resumed,
    /"submitted","choose",1,"鹿",,"'=SUM\(1,2\) ""quoted"""/,
  );
  assert.match(timeout, /120,,,,"error",.*"model_timeout","model"/);
  assert.equal(end, "");
});

test("export reports the line number of an incomplete record", () => {
  assert.throws(
    () => resultsCsv('{"type":"run_started"}\n{"type":', "ABCD23"),
    /第 2 行/,
  );
});
