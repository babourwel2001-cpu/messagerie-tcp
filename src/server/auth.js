const database = require("./database");
const { hashPassword, verifyPassword, MAX_PASSWORD_BYTES } = require("../common/crypto");

const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 30;
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

const CODES = {
  REGISTERED: "registered",
  AUTHENTICATED: "authenticated",
  INVALID_NAME: "invalid-name",
  INVALID_PASSWORD: "invalid-password",
  NAME_TAKEN: "name-taken",
  BAD_CREDENTIALS: "bad-credentials",
  INSECURE_CHANNEL: "insecure-channel",
  ALREADY_AUTHENTICATED: "already-authenticated",
  ALREADY_ONLINE: "already-online",
  BUSY: "busy",
  SERVER_ERROR: "server-error",
};

let dummyHash = null;

async function getDummyHash() {
  if (!dummyHash) dummyHash = await hashPassword("not-a-real-password");

  return dummyHash;
}

const BAD_LOGIN = { error: "Nom ou mot de passe invalide.", code: CODES.BAD_CREDENTIALS };

async function register(name, password) {
  if (typeof name !== "string" || name.length > MAX_NAME_LENGTH || !NAME_PATTERN.test(name)) {
    return {
      error: `Nom invalide (1 à ${MAX_NAME_LENGTH} lettres, chiffres, - ou _).`,
      code: CODES.INVALID_NAME,
    };
  }

  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum).`,
      code: CODES.INVALID_PASSWORD,
    };
  }

  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return {
      error: `Mot de passe trop long (${MAX_PASSWORD_BYTES} octets maximum).`,
      code: CODES.INVALID_PASSWORD,
    };
  }

  try {
    const id = await database.createUser(name, await hashPassword(password));

    return { user: { id, name }, code: CODES.REGISTERED };
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT") {
      return { error: "Ce nom est déjà utilisé.", code: CODES.NAME_TAKEN };
    }

    throw err;
  }
}

async function login(name, password) {
  if (typeof name !== "string" || typeof password !== "string") return BAD_LOGIN;

  const row = await database.findUserByName(name);
  const ok = await verifyPassword(password, row ? row.password_hash : await getDummyHash());

  if (!row || !ok) return BAD_LOGIN;

  return { user: { id: row.id, name: row.name }, code: CODES.AUTHENTICATED };
}

module.exports = { register, login, CODES };
