import { database, type Database, type Sql } from "./database";

export type Experiment = "institutions" | "emh" | "judgment" | "evolution";
export async function claimCode(tx: Sql, code: string, experiment: Experiment) {
  const result = await tx.query(
    "INSERT INTO lab_room_registry (code, experiment) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code",
    [code, experiment],
  );
  return result.rows.length > 0;
}
export async function experimentFor(
  code: string,
  db?: Database,
): Promise<Experiment | null> {
  const result = await (db ?? (await database())).query<{
    experiment: Experiment;
  }>("SELECT experiment FROM lab_room_registry WHERE code = $1", [code]);
  return result.rows[0]?.experiment ?? null;
}
