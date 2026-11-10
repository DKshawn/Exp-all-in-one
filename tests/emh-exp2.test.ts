import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  advanceClock,
  addParticipant,
  assignParticipants,
  drawStates,
  newRoom,
  phaseKey,
  unitKey,
  view,
} from "../src/experiments/emh/engine";
import { EXP2_CONFIG } from "../src/experiments/emh/server/default-config";
import { exportData } from "../src/experiments/emh/export";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomDashboard } from "../src/experiments/emh/components/room-dashboard";
import { Yen } from "../src/experiments/emh/components/market-panels";

test("state draws use the configured probabilities, including boundaries and zero probabilities", () => {
  const draws = [0, 0.349999, 0.35, 0.769999, 0.77, 0.999999];
  assert.deepEqual(
    drawStates([0.35, 0.42, 0.23], draws.length, () => draws.shift()!),
    [1, 1, 2, 2, 3, 3],
  );
  for (const [prior, expected] of [
    [[1, 0, 0], 1],
    [[0, 1, 0], 2],
    [[0, 0, 1], 3],
  ] as const) {
    assert.deepEqual(
      drawStates([...prior], 3, () => 0.999999),
      [expected, expected, expected],
    );
  }
  let index = 0;
  const evenlySpaced = drawStates(
    [0.35, 0.42, 0.23],
    1000,
    () => (index++ + 0.5) / 1000,
  );
  assert.deepEqual(
    [1, 2, 3].map(
      (state) => evenlySpaced.filter((draw) => draw === state).length,
    ),
    [350, 420, 230],
  );
  assert.throws(() => drawStates([0.1, 0.1, 0.1], 1, () => 0.5));
  assert.throws(() => drawStates([0.35, 0.42, 0.23], 1, () => 1));
});

test("new Exp2 draws all states once before countdown and keeps each clue consistent with settlement", () => {
  const room = newRoom(
    "DRAW",
    {
      ...EXP2_CONFIG,
      rounds: 3,
      insiderStartRound: 1,
      insiderCountPerType: 1,
      states: { ...EXP2_CONFIG.states!, outcomes: [] },
    },
    0,
  );
  for (let i = 0; i < 3; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `name${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  assignParticipants(room, () => 0.9);
  const draws = [0.1, 0.5, 0.9];
  act(
    room,
    { role: "teacher" },
    { kind: "start", expectedPhase: phaseKey(room) },
    0,
    () => draws.shift()!,
  );
  assert.deepEqual(room.config.states!.outcomes, [1, 2, 3]);
  assert.equal(room.status, "countdown");
  const saved = JSON.parse(JSON.stringify(room)) as typeof room;
  assert.deepEqual(saved.config.states!.outcomes, [1, 2, 3]);
  for (let year = 1; year <= 3; year++) {
    const student = view(
      saved,
      { role: "student", participantId: "p0" },
      year * 10000,
    );
    assert.equal(student.exp2!.clue, year);
    assert.equal(student.exp2!.state, null);
    assert.equal(JSON.stringify(student).includes('"outcomes"'), false);
    if (year === 1) advanceClock(saved, 5000, () => 0.1);
    act(
      saved,
      { role: "teacher" },
      { kind: "end-period", expectedPhase: phaseKey(saved) },
      year * 10000 + 1,
      () => 0.1,
    );
    assert.equal(saved.results.at(-1)!.state, year);
    assert.deepEqual(saved.config.states!.outcomes, [1, 2, 3]);
    if (year < 3)
      act(
        saved,
        { role: "teacher" },
        { kind: "next-year", expectedPhase: phaseKey(saved) },
        year * 10000 + 2,
        () => 0.1,
      );
  }
});

test("custom insider rules and dividends determine private information and equilibrium", () => {
  const room = newRoom(
    "CUSTOM",
    {
      ...EXP2_CONFIG,
      rounds: 1,
      initialUnits: 4,
      insiderStartRound: 1,
      insiderCountPerType: 12,
      states: {
        prior: [0, 1, 0],
        outcomes: [1],
        dividends: [
          [0, 1000, 0],
          [1, 1, 0],
          [2, 2, 0],
        ],
      },
    },
    0,
  );
  for (let i = 0; i < 3; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `n${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  const teacher = { role: "teacher" } as const;
  act(
    room,
    teacher,
    { kind: "start", expectedPhase: phaseKey(room) },
    0,
    () => 0.99,
  );
  assert.equal(
    view(room, { role: "student", participantId: room.participants[0]!.id }, 0)
      .exp2!.clue,
    1,
  );
  advanceClock(room, 5000, () => 0.99);
  assert.ok(room.participants.every((p) => p.holdings === 4 && p.insider));
  assert.equal(
    view(
      room,
      { role: "student", participantId: room.participants[0]!.id },
      5000,
    ).exp2!.clue,
    1,
  );
  act(
    room,
    teacher,
    { kind: "end-period", expectedPhase: phaseKey(room) },
    5001,
  );
  assert.equal(room.results[0]!.piPrice, 2);
  assert.equal(room.results[0]!.rePrice, 2);
  assert.equal(room.results[0]!.actualDividend, 12);
});

test("zero dividends and no insiders yield defined results without division by zero", () => {
  const room = newRoom(
    "ZERO",
    {
      ...EXP2_CONFIG,
      rounds: 1,
      insiderStartRound: 1,
      insiderCountPerType: 0,
      emptyUnitsLimit: 3,
      unitSeconds: 2,
      periodSeconds: 60,
      states: {
        prior: [1, 0, 0],
        outcomes: [1],
        dividends: [
          [0, 1, 1],
          [0, 2, 2],
          [0, 3, 3],
        ],
      },
    },
    0,
  );
  for (let i = 0; i < 3; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `n${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  const teacher = { role: "teacher" } as const;
  act(
    room,
    teacher,
    { kind: "start", expectedPhase: phaseKey(room) },
    0,
    () => 0.99,
  );
  advanceClock(room, 5000, () => 0.99);
  assert.ok(room.participants.every((p) => !p.insider));
  act(
    room,
    { role: "student", participantId: "p0" },
    { kind: "quote", side: "ask", price: 1, unitKey: unitKey(room) },
    5001,
    () => 0.99,
  );
  act(
    room,
    { role: "student", participantId: "p1" },
    { kind: "quote", side: "bid", price: 1, unitKey: unitKey(room) },
    5001,
    () => 0.99,
  );
  advanceClock(room, 9001, () => 0.99);
  assert.equal(room.status, "trading");
  advanceClock(room, 11001, () => 0.99);
  assert.equal(room.status, "completed");
  assert.equal(room.results[0]!.reason, "inactivity");
  assert.equal(room.results[0]!.rePrice, 0);
  assert.equal(room.results[0]!.meanPrice, 1);
  assert.equal(room.results[0]!.priceRatio, null);
  assert.equal(room.results[0]!.allocationEfficiency, null);
});

test("legacy Exp2 sessions retain their preset states and protect clue cards", () => {
  const room = newRoom(
    "EXP234",
    {
      ...EXP2_CONFIG,
      states: { ...EXP2_CONFIG.states!, outcomes: [1, 1, 1, 1, 2, 2] },
    },
    0,
  );
  for (let i = 0; i < 12; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `name${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  const teacher = { role: "teacher" } as const;
  const student = (id: string) =>
    ({ role: "student", participantId: id }) as const;
  const random = () => 0.999;
  act(
    room,
    teacher,
    { kind: "start", expectedPhase: phaseKey(room) },
    -5000,
    random,
  );
  advanceClock(room, 0, random);
  for (const type of [1, 2, 3])
    assert.equal(
      room.participants.filter((p) => p.type === type && p.insider).length,
      2,
    );
  assert.equal(room.periodEndsAt, 300000);
  assert.equal(view(room, student("p0"), 0).exp2!.clue, null);
  act(
    room,
    student("p0"),
    { kind: "quote", side: "ask", price: 100, unitKey: unitKey(room) },
    1,
    random,
  );
  act(
    room,
    student("p4"),
    { kind: "quote", side: "bid", price: 100, unitKey: unitKey(room) },
    2,
    random,
  );
  for (let year = 1; year <= 6; year++) {
    const informed = room.participants.find((p) => p.insider)!;
    const uninformed = room.participants.find((p) => !p.insider)!;
    const informedView = view(room, student(informed.id), year * 10);
    const uninformedView = view(room, student(uninformed.id), year * 10);
    assert.equal(
      informedView.exp2!.clue,
      year > 2 ? room.config.states!.outcomes[year - 1] : null,
    );
    assert.equal(uninformedView.exp2!.clue, null);
    assert.equal(uninformedView.exp2!.allDividends, null);
    assert.equal(uninformedView.participants.length, 0);
    assert.equal(uninformedView.exp2!.state, null);
    act(
      room,
      teacher,
      { kind: "end-period", expectedPhase: phaseKey(room) },
      year * 10 + 1,
      random,
    );
    const result = room.results.at(-1)!;
    assert.equal(result.state, room.config.states!.outcomes[year - 1]);
    assert.ok(Math.abs(result.piPrice! - (year <= 4 ? 142.09 : 232)) < 1e-8);
    assert.ok(
      Math.abs(result.rePrice! - (year <= 2 ? 142.09 : year <= 4 ? 136 : 232)) <
        1e-8,
    );
    assert.ok(room.participants.every((p) => p.holdings === 0));
    assert.equal(
      view(room, student(uninformed.id), year * 10 + 1).results.at(-1)!.piPrice,
      undefined,
    );
    if (year === 1) {
      assert.equal(room.participants[0]!.totalProfit, 190);
      assert.equal(room.participants[4]!.totalProfit, 56);
    }
    if (year < 6) {
      assert.equal(room.status, "break");
      act(
        room,
        teacher,
        { kind: "next-year", expectedPhase: phaseKey(room) },
        year * 10 + 2,
        random,
      );
      assert.ok(
        room.participants.every((p) => p.holdings === 2 && p.cash === 0),
      );
    }
  }
  assert.equal(room.status, "completed");
  assert.equal(room.results.length, 6);
  assert.match(exportData(room, teacher, "results").body, /RE_price/);
  assert.match(
    exportData(room, teacher, "participants").body,
    /insider_start_round/,
  );
  assert.doesNotMatch(
    exportData(room, student("p0"), "conditions").body,
    /insider/,
  );
});

test("formal Exp2 student view presents state conditions, both quote forms and records together", () => {
  const room = newRoom("EXP234", EXP2_CONFIG, 0);
  for (let i = 0; i < 12; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `name${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  act(
    room,
    { role: "teacher" },
    { kind: "start", expectedPhase: phaseKey(room) },
    0,
    () => 0.999,
  );
  const studentRoom = view(room, { role: "student", participantId: "p0" }, 0);
  const html = renderToStaticMarkup(
    createElement(RoomDashboard, { room: studentRoom, act: async () => {} }),
  );
  assert.match(html, /aria-label="状態別の配当、確率と期待配当"/);
  assert.doesNotMatch(html, /状態別の配当 \/ 確率/);
  assert.match(html, /期待配当/);
  assert.doesNotMatch(html, /期待配当合計/);
  assert.doesNotMatch(html, /見込利益/);
  assert.match(html, /買い指値注文/);
  assert.match(html, /売り指値注文/);
  assert.match(html, /取引記録/);
  assert.match(html, /配当・損益の記録/);
  assert.match(html, /class="yen-unit">円/);
  assert.doesNotMatch(html, /role="tablist"/);
});

test("state dividend contributions use the student's public probabilities, even with a clue", () => {
  const room = newRoom("EXPECT", EXP2_CONFIG, 0);
  for (let i = 0; i < 3; i++)
    addParticipant(
      room,
      {
        id: `p${i}`,
        name: `name${i}`,
        studentId: `s${i}`,
        pinHash: "",
        tokenHash: "",
      },
      0,
    );
  act(
    room,
    { role: "teacher" },
    { kind: "start", expectedPhase: phaseKey(room) },
    0,
    () => 0.999,
  );
  const studentRoom = view(room, { role: "student", participantId: "p0" }, 0);
  studentRoom.exp2!.prior = [0.35, 0.42, 0.23];
  studentRoom.exp2!.dividends = [80, 110, 170];
  studentRoom.exp2!.clue = 3;
  const html = renderToStaticMarkup(
    createElement(RoomDashboard, { room: studentRoom, act: async () => {} }),
  );
  for (const amount of ["28", "46.2", "39.1"]) {
    assert.match(
      html,
      new RegExp(`${amount.replace(".", "\\.")}<span class="yen-unit">円`),
    );
  }
  assert.match(html, /Clue カード/);
  assert.doesNotMatch(html, /class="exp2-state-realized"/);
  for (const state of [1, 2, 3]) {
    studentRoom.exp2!.state = state;
    const revealed = renderToStaticMarkup(
      createElement(RoomDashboard, { room: studentRoom, act: async () => {} }),
    );
    assert.match(
      revealed,
      new RegExp(
        `class="exp2-state-realized"><span>状態 ${state}<b class="exp2-state-realized-label">実現</b>`,
      ),
    );
    assert.equal(
      (revealed.match(/class="exp2-state-realized"/g) ?? []).length,
      1,
    );
    assert.match(revealed, new RegExp(`実現した状態は状態 ${state} です`));
  }
});

test("yen amounts retain zero, negative amounts and decimals, while missing values remain empty", () => {
  assert.match(
    renderToStaticMarkup(createElement(Yen, { value: 0 })),
    /0<span class="yen-unit">円<\/span>/,
  );
  assert.match(
    renderToStaticMarkup(createElement(Yen, { value: -1200 })),
    /-1,200<span class="yen-unit">円<\/span>/,
  );
  assert.match(
    renderToStaticMarkup(createElement(Yen, { value: 142.09, digits: 2 })),
    /142\.09<span class="yen-unit">円<\/span>/,
  );
  assert.equal(renderToStaticMarkup(createElement(Yen, { value: null })), "—");
});
