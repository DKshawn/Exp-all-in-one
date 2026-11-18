export const EVOLUTION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS evolution_rooms(code text PRIMARY KEY,title text NOT NULL,created_at bigint NOT NULL,password_hash text NOT NULL,teacher_hash text NOT NULL,game jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS evolution_players(room text REFERENCES evolution_rooms ON DELETE CASCADE,id uuid NOT NULL,nickname text NOT NULL,pin_hash text NOT NULL,token_hash text NOT NULL,joined_at bigint NOT NULL,last_seen bigint NOT NULL,gaps jsonb NOT NULL DEFAULT '[]',PRIMARY KEY(room,id),UNIQUE(room,nickname),UNIQUE(room,token_hash))`,
  `CREATE TABLE IF NOT EXISTS evolution_rounds(room text REFERENCES evolution_rooms ON DELETE CASCADE,number int NOT NULL,data jsonb NOT NULL,summary jsonb NOT NULL,personal jsonb NOT NULL,PRIMARY KEY(room,number))`,
  `CREATE TABLE IF NOT EXISTS evolution_logins(room text REFERENCES evolution_rooms ON DELETE CASCADE,identity text NOT NULL,attempts integer NOT NULL,since timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room,identity))`,
];
