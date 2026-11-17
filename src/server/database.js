const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");

const KINDS = ["private", "private-in", "broadcast", "group"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);`;

let db = null; // la connexion ouverte

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function open(
  file = process.env.DB_FILE || path.join(__dirname, "..", "..", "data", "chat.db"),
) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });

  await new Promise((resolve, reject) => {
    db = new sqlite3.Database(file, (err) => (err ? reject(err) : resolve()));
  });

  await run("PRAGMA foreign_keys = ON");
  await new Promise((resolve, reject) => db.exec(SCHEMA, (err) => (err ? reject(err) : resolve())));
}

function close() {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();

    db.close((err) => {
      db = null;
      if (err) reject(err);
      else resolve();
    });
  });
}

async function createUser(name, passwordHash) {
  const result = await run("INSERT INTO users (name, password_hash) VALUES (?, ?)", [name, passwordHash]);

  return result.lastID;
}

function findUserByName(name) {
  return get("SELECT id, name, password_hash, created_at FROM users WHERE name = ?", [name]);
}

async function addMessage(userId, kind, body) {
  if (!KINDS.includes(kind)) throw new Error("Type de message inconnu : " + kind);

  const result = await run("INSERT INTO messages (user_id, kind, body) VALUES (?, ?, ?)", [userId, kind, body]);

  return result.lastID;
}

async function listMessages(userId, limit = 50) {
  const rows = await all(
    "SELECT id, kind, body, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    [userId, limit],
  );

  return rows.reverse();
}

module.exports = { open, close, createUser, findUserByName, addMessage, listMessages, KINDS };
