import { digest } from "@/lib/server/auth";
import type { Database, Sql } from "@/lib/server/database";
import { AuctionError } from "@/lib/server/errors";
import {
  choosePair,
  type Action,
  type Entry,
  type Game,
  type Round,
} from "../engine";
import { HISTORY_ROUNDS } from "../settings";
import { baseView, type Personal } from "../views";

export const gapMs = 15_000;
const heartbeatMs = 5000;
export const unauthorized = () => new AuctionError("再入室してください。", 401);
type State = ReturnType<typeof baseView>;
const clock =
  "COALESCE($3::bigint, (extract(epoch FROM clock_timestamp()) * 1000)::bigint)";

export async function publish(tx: Sql, g: Game, code: string, title: string) {
  await tx.query(
    `INSERT INTO evolution_live(room,state) VALUES ($1,$2::jsonb)
    ON CONFLICT (room) DO UPDATE SET state=EXCLUDED.state,advance_after=0`,
    [code, JSON.stringify(baseView(g, code, title, 0))],
  );
}

export async function claimAdvance(db: Database, view: State) {
  // Admit one phase-transition worker before opening a database transaction.
  // If that request dies, another poll can retry once the short lease expires.
  const { rows } = await db.query(
    `WITH claim AS MATERIALIZED (
      SELECT room,(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now
      FROM evolution_live WHERE room=$1 AND state->>'phase'=$2
        AND (state->>'round')::int=$3 AND (state->>'deadline')::bigint=$4
        AND state->>'pausedAt' IS NULL
        AND advance_after<=(extract(epoch FROM clock_timestamp()) * 1000)::bigint
      FOR UPDATE SKIP LOCKED
    )
    UPDATE evolution_live l SET advance_after=claim.now+2500
    FROM claim WHERE l.room=claim.room RETURNING l.room`,
    [view.code, view.phase, view.round, view.deadline],
  );
  return rows.length > 0;
}

export async function writeEntries(tx: Sql, code: string, r: Round) {
  await tx.query(
    `INSERT INTO evolution_entries(room,number,id,entry,seen_at)
    SELECT $1,$2,key::uuid,value,(value->>'seenAt')::bigint FROM jsonb_each($3::jsonb)
    ON CONFLICT (room,number,id) DO UPDATE SET entry=EXCLUDED.entry,
      seen_at=COALESCE(evolution_entries.seen_at,EXCLUDED.seen_at)`,
    [code, r.number, JSON.stringify(r.entries)],
  );
}

export async function readEntries(tx: Sql, code: string, r: Round) {
  const { rows } = await tx.query<{
    id: string;
    entry: Entry;
    seen_at: string | null;
  }>(
    "SELECT id,entry,seen_at FROM evolution_entries WHERE room=$1 AND number=$2",
    [code, r.number],
  );
  r.entries = Object.fromEntries(
    rows.map(({ id, entry, seen_at }) => [
      id,
      { ...entry, seenAt: seen_at === null ? null : Number(seen_at) },
    ]),
  );
}

export async function roundComplete(tx: Sql, code: string, number: number) {
  const { rows } = await tx.query<{ complete: boolean }>(
    `SELECT NOT EXISTS(SELECT 1 FROM evolution_entries WHERE room=$1 AND number=$2
      AND entry->>'status' IN ('choosing','submitted')) AS complete`,
    [code, number],
  );
  return rows[0].complete;
}

type PairSnapshot = {
  state: State;
  now: string;
  id: string | null;
  mine: Entry | null;
  peer: Entry | null;
};

export async function submitPair(
  db: Database,
  code: string,
  token: string,
  action: Extract<Action, { kind: "choose" }>,
  testTime: number | null,
) {
  const tokenHash = digest(token);
  for (let attempt = 0; attempt < 4; attempt++) {
    const snapshot = (
      await db.query<PairSnapshot>(
        `WITH live AS MATERIALIZED (
        SELECT state,(state->>'round')::int AS number FROM evolution_live WHERE room=$1
      ), actor AS MATERIALIZED (
        SELECT id FROM evolution_players WHERE room=$1 AND token_hash=$2
      ), mine AS MATERIALIZED (
        SELECT entry,number FROM evolution_entries WHERE room=$1
          AND id=(SELECT id FROM actor) AND number=(SELECT number FROM live)
      )
      SELECT live.state,${clock} AS now,(SELECT id FROM actor) AS id,
        (SELECT entry FROM mine) AS mine,
        (SELECT entry FROM evolution_entries WHERE room=$1
          AND id=(SELECT (entry->>'opponent')::uuid FROM mine)
          AND number=live.number) AS peer
      FROM live`,
        [code, tokenHash, testTime],
      )
    ).rows[0];
    if (!snapshot) return;
    if (!snapshot.id) throw unauthorized();
    const { state, id, mine, peer } = snapshot;
    const entries: Round["entries"] = {};
    if (mine) entries[id] = mine;
    if (peer) entries[mine!.opponent!] = peer;
    const expected = JSON.stringify(entries);
    const round: Round = {
      number: state.round,
      deadline: state.deadline ?? 0,
      openedAt: 0,
      closedAt: null,
      entries,
    };
    if (
      !choosePair(
        state,
        round,
        id,
        action.round,
        action.choice,
        Number(snapshot.now),
      )
    )
      return;
    const changes = mine!.status === "settled" ? entries : { [id]: mine };

    // Keep the database transaction inside one statement. Both players lock the
    // same rows in id order. If a peer or a teacher changed the snapshot, retry
    // against the new state. Only the committing statement determines receipt time.
    const result = await db.query(
      `WITH live AS MATERIALIZED (
        SELECT state FROM evolution_live WHERE room=$1 AND state=$4::jsonb FOR SHARE
      ), pair AS MATERIALIZED (
        SELECT e.id,e.entry=($5::jsonb->e.id::text) AS unchanged
        FROM evolution_entries e
        WHERE e.room=$1 AND e.number=$8 AND e.id=ANY($9::uuid[])
          AND EXISTS(SELECT 1 FROM live)
        ORDER BY e.id FOR UPDATE OF e
      ), stamp AS MATERIALIZED (
        SELECT ${clock} AS now FROM pair HAVING count(*)=2 AND bool_and(unchanged)
      )
      UPDATE evolution_entries e
      SET entry=CASE WHEN e.id=$7::uuid THEN
        jsonb_set(changes.value,'{submittedAt}',to_jsonb(stamp.now))
        ELSE changes.value END,
        seen_at=CASE WHEN e.id=$7::uuid THEN COALESCE(e.seen_at,stamp.now) ELSE e.seen_at END
      FROM stamp,live,jsonb_each($6::jsonb) changes
      WHERE e.room=$1 AND e.number=$8 AND e.id=ANY($9::uuid[]) AND e.id=changes.key::uuid
        AND stamp.now<(live.state->>'deadline')::bigint
        AND EXISTS(SELECT 1 FROM evolution_players WHERE room=$1 AND id=$7::uuid AND token_hash=$2)
      RETURNING e.id`,
      [
        code,
        tokenHash,
        testTime,
        JSON.stringify(state),
        expected,
        JSON.stringify(changes),
        id,
        state.round,
        Object.keys(entries),
      ],
    );
    if (result.rows.length) return;
  }
  throw new AuctionError("回答を再送してください。", 409);
}
type PollRow = {
  state: State;
  now: string;
  id: string | null;
  allocation: { group: number; side: "A" | "B" | null } | null;
  current: Personal | null;
  history: Personal[];
  complete: boolean;
};

const personalJson = `jsonb_build_object(
  'round', p.number, 'position', p.entry->'position', 'status', p.entry->'status',
  'choice', p.entry->'choice', 'pay', p.entry->'pay', 'total', p.entry->'total',
  'otherChoice', CASE WHEN p.entry->>'status'='settled' THEN peer.entry->'choice' END,
  'otherPay', CASE WHEN p.entry->>'status'='settled' THEN peer.entry->'pay' END
)`;

// Single HTTP SQL statement on the normal participant path. Read and return only this seat.
export async function pollParticipant(
  db: Database,
  code: string,
  token: string,
  now: number | null,
  after: number,
  before: number,
) {
  const { rows } = await db.query<PollRow>(
    `WITH live AS MATERIALIZED (
      SELECT state,(state->>'round')::int AS number,${clock} AS now
      FROM evolution_live WHERE room=$1
    ), actor AS MATERIALIZED (
      SELECT id,allocation FROM evolution_players WHERE room=$1 AND token_hash=$2
    ), mine AS MATERIALIZED (
      SELECT entry,number FROM evolution_entries WHERE room=$1
        AND id=(SELECT id FROM actor) AND number=(SELECT number FROM live)
    ), previous AS MATERIALIZED (
      SELECT entry,number FROM evolution_entries WHERE room=$1
        AND id=(SELECT id FROM actor)
        AND number<(SELECT least(number,$5) FROM live)
        AND number>=greatest((SELECT least(number,$5) FROM live)-${HISTORY_ROUNDS}, $4::int+1)
      ORDER BY number DESC LIMIT ${HISTORY_ROUNDS}
    ), beat AS (
      UPDATE evolution_players p SET
        gaps=CASE WHEN live.now-p.last_seen>${gapMs}
          THEN p.gaps||jsonb_build_array(jsonb_build_array(p.last_seen+${gapMs},live.now))
          ELSE p.gaps END,
        last_seen=live.now
      FROM live WHERE p.room=$1 AND p.id=(SELECT id FROM actor)
        AND live.state->>'phase'<>'finished' AND p.last_seen<=live.now-${heartbeatMs}
    ), seen AS (
      UPDATE evolution_entries e SET seen_at=live.now FROM live
      WHERE e.room=$1 AND e.number=(SELECT number FROM live)
        AND e.id=(SELECT id FROM actor) AND e.seen_at IS NULL
        AND live.state->>'phase'='playing' AND live.state->>'pausedAt' IS NULL
        AND live.now<(live.state->>'deadline')::bigint AND e.entry->>'status' IN ('choosing','bye')
    )
    SELECT live.state, live.now, actor.id, actor.allocation, current.item AS current,
      COALESCE(history.items,'[]'::jsonb) AS history,
      (current.status='settled' AND NOT EXISTS(
        SELECT 1 FROM evolution_entries WHERE room=$1 AND number=live.number
        AND entry->>'status' IN ('choosing','submitted')
      )) AS complete
    FROM live LEFT JOIN actor ON true
    LEFT JOIN LATERAL (
      SELECT ${personalJson} AS item, p.entry->>'status' AS status
      FROM mine p LEFT JOIN LATERAL (
        SELECT entry FROM evolution_entries WHERE room=$1 AND number=p.number
          AND id=(p.entry->>'opponent')::uuid AND p.entry->>'status'='settled'
        LIMIT 1
      ) peer ON true
    ) current ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(${personalJson} ORDER BY p.number) AS items
      FROM previous p LEFT JOIN LATERAL (
        SELECT entry FROM evolution_entries WHERE room=$1 AND number=p.number
          AND id=(p.entry->>'opponent')::uuid AND p.entry->>'status'='settled'
        LIMIT 1
      ) peer ON true
    ) history ON true`,
    [code, digest(token), now, after, before],
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.id) throw unauthorized();
  const { state, allocation, current, history } = row;
  return {
    complete: row.complete,
    view: {
      ...state,
      now: Number(row.now),
      role: "student" as const,
      group: allocation?.group ?? 0,
      side: allocation?.side ?? null,
      total: current?.total ?? "0",
      current,
      history,
    },
  };
}
