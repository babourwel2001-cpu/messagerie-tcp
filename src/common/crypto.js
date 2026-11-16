const nodeCrypto = require("node:crypto");
const { ACTIONS } = require("./protocol");

function generateKeyPair() {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("x25519");

  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey,
  };
}

function createChannel(privateKey, myPublicKey, peerPublicKey, role) {
  if (role !== "client" && role !== "server") throw new Error("Rôle inconnu");
  if (typeof peerPublicKey !== "string") throw new Error("Clé invalide");

  const peer = nodeCrypto.createPublicKey({
    key: Buffer.from(peerPublicKey, "base64"),
    format: "der",
    type: "spki",
  });

  if (peer.asymmetricKeyType !== "x25519") throw new Error("Clé invalide");

  const secret = nodeCrypto.diffieHellman({ privateKey, publicKey: peer });

  const clientPublic = role === "client" ? myPublicKey : peerPublicKey;
  const serverPublic = role === "client" ? peerPublicKey : myPublicKey;
  const salt = nodeCrypto
    .createHash("sha256")
    .update(clientPublic + "|" + serverPublic)
    .digest();
  const keys = Buffer.from(
    nodeCrypto.hkdfSync("sha256", secret, salt, "messagerie-tcp channel v1", 64),
  );
  const clientToServer = keys.subarray(0, 32);
  const serverToClient = keys.subarray(32, 64);

  const sendKey = role === "client" ? clientToServer : serverToClient;
  const receiveKey = role === "client" ? serverToClient : clientToServer;

  let sentCount = 0n;
  let receivedCount = 0n;

  function nonce(count) {
    const bytes = Buffer.alloc(12);
    bytes.writeBigUInt64BE(count, 4);
    return bytes;
  }

  return {
    seal(text) {
      const cipher = nodeCrypto.createCipheriv("aes-256-gcm", sendKey, nonce(sentCount));
      const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
      const data = Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");

      sentCount += 1n;

      return JSON.stringify({ action: ACTIONS.SECURE_ENVELOPE, data });
    },

    open(line) {
      const envelope = JSON.parse(line);

      if (
        !envelope ||
        envelope.action !== ACTIONS.SECURE_ENVELOPE ||
        typeof envelope.data !== "string"
      ) {
        throw new Error("Enveloppe chiffrée attendue");
      }

      const raw = Buffer.from(envelope.data, "base64");

      if (raw.length < 16) throw new Error("Enveloppe trop courte");

      const decipher = nodeCrypto.createDecipheriv("aes-256-gcm", receiveKey, nonce(receivedCount));

      decipher.setAuthTag(raw.subarray(raw.length - 16));

      const text = Buffer.concat([
        decipher.update(raw.subarray(0, raw.length - 16)),
        decipher.final(),
      ]).toString("utf8");

      receivedCount += 1n;

      return text;
    },
  };
}

const COST = Number(process.env.BCRYPT_COST) || 12;

// bcrypt ne lit que les 72 premiers octets du mot de passe : au-delà, il les ignore.
const MAX_PASSWORD_BYTES = 72;

function hashPassword(password) {
  return require("bcrypt").hash(password, COST);
}

function verifyPassword(password, hash) {
  return require("bcrypt").compare(password, hash);
}

function randomToken(bytes = 32) {
  return nodeCrypto.randomBytes(bytes).toString("hex");
}

module.exports = {
  generateKeyPair,
  createChannel,
  hashPassword,
  verifyPassword,
  randomToken,
  MAX_PASSWORD_BYTES,
};
