const { createECDH,
  randomBytes,
  hkdfSync,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
} = require("node:crypto");

const CURVE = "prime256v1";
const PUBLIC_KEY_BYTES = 65;
const NONCE_BYTES = 32;
const ENVELOPE_VERSION = 1;
const IV_BYTES = 16;
const MAC_BYTES = 32;
const MAX_ENVELOPE_BYTES = 16384;
const MAX_BUFFER_BYTES = 65536;
const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

function decodeBase64Strict(value, expectedBytes) {
  const expectedCharacters = 4 * Math.ceil(expectedBytes / 3);

  if (
    typeof value !== "string" ||
    value.length !== expectedCharacters
  ) {
    throw new Error("Encodage ou taille invalide.");
  }

  const decoded = Buffer.from(value, "base64");

  if (
    decoded.length !== expectedBytes ||
    decoded.toString("base64") !== value
  ) {
    throw new Error("Encodage ou taille invalide.");
  }

  return decoded;
}

// Décode une chaîne Base64 sans imposer une taille en octets.
// Le ré-encodage vérifie que la chaîne est bien canonique.
function decodeBase64Canonical(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Encodage ou taille invalide.");
  }

  const decoded = Buffer.from(value, "base64");

  if (
    decoded.length === 0 ||
    decoded.toString("base64") !== value
  ) {
    throw new Error("Encodage ou taille invalide.");
  }

  return decoded;
}

function decodePublicKey(value) {
  const publicKey = decodeBase64Strict(value, PUBLIC_KEY_BYTES);

  if (publicKey[0] !== 0x04) {
    throw new Error("Format de clé publique invalide.");
  }

  return publicKey;
}

function decodeNonce(value) {
  return decodeBase64Strict(value, NONCE_BYTES);
}

function createKeyExchange() {
  const ecdh = createECDH(CURVE);
  ecdh.generateKeys();

  const publicKey = ecdh
    .getPublicKey(undefined, "uncompressed")
    .toString("base64");

  const nonce = randomBytes(NONCE_BYTES).toString("base64");

  return {
    publicKey,
    nonce,

    computeSecret(remotePublicKey) {
      const decodedKey = decodePublicKey(remotePublicKey);

      try {
        return ecdh.computeSecret(decodedKey);
      } catch {
        throw new Error("Clé publique distante invalide.");
      }
    },
  };
}

// Dérive les clés de session à partir du secret ECDH et des nonces.
// Le sel est constitué du nonce du client suivi du nonce du serveur.
// Le contexte distingue cet usage de HKDF des autres protocoles.
// Les 32 premiers octets servent au chiffrement AES,
// les 32 suivants à l'authentification HMAC

function deriverClesSession(
  secretPartage,
  clientNonce,
  serverNonce,
) {
  const entrees = [
    [secretPartage, 32],
    [clientNonce, NONCE_BYTES],
    [serverNonce, NONCE_BYTES],
  ];

  for (const [valeur, taille] of entrees) {
    if (!Buffer.isBuffer(valeur) || valeur.length !== taille) {
      throw new Error("Paramètres de dérivation invalides.");
    }
  }

  const salt = Buffer.concat([
    clientNonce,
    serverNonce,
  ]);

  const contexte = Buffer.from(
    "messagerie-tcp-v1",
    "utf8",
  );

  const material = Buffer.from(
    hkdfSync(
      "sha256",
      secretPartage,
      salt,
      contexte,
      64,
    ),
  );

  try {
    return {
      encryptionKey: Buffer.from(material.subarray(0, 32)),
      macKey: Buffer.from(material.subarray(32, 64)),
    };
  } finally {
    material.fill(0);
  }
}

// Construit les octets couverts par le HMAC.
function construireDonneesHmac(
  version,
  sender,
  recipient,
  sequence,
  iv,
  ciphertext,
) {
  const enTete = Buffer.concat([
    Buffer.from([version]),
    Buffer.from(sender, "utf8"),
    Buffer.from([0]),
    Buffer.from(recipient, "utf8"),
    Buffer.from([0]),
  ]);

  const sequenceBuffer = Buffer.alloc(8);
  sequenceBuffer.writeBigUInt64BE(BigInt(sequence));

  return Buffer.concat([
    enTete,
    sequenceBuffer,
    iv,
    ciphertext,
  ]);
}

// Chiffre un message et calcule son HMAC.
function creerEnveloppe(
  clesSession,
  sender,
  recipient,
  sequence,
  message,
) {
  if (
    typeof sender !== "string" ||
    sender.trim() === "" ||
    sender.length > 30
  ) {
    throw new Error("Expéditeur invalide.");
  }

  if (
    typeof recipient !== "string" ||
    recipient.trim() === "" ||
    recipient.length > 30
  ) {
    throw new Error("Destinataire invalide.");
  }

  if (
    !Number.isInteger(sequence) ||
    sequence < 0 ||
    sequence > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Séquence invalide.");
  }

  if (typeof message !== "string" || message.length === 0) {
    throw new Error("Message invalide.");
  }

  if (
    !clesSession ||
    !Buffer.isBuffer(clesSession.encryptionKey) ||
    !Buffer.isBuffer(clesSession.macKey) ||
    clesSession.encryptionKey.length !== 32 ||
    clesSession.macKey.length !== 32
  ) {
    throw new Error("Clés de session invalides.");
  }

  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(
    "aes-256-cbc",
    clesSession.encryptionKey,
    iv,
  );

  const ciphertext = Buffer.concat([
    cipher.update(message, "utf8"),
    cipher.final(),
  ]);

  const donneesHmac = construireDonneesHmac(
    ENVELOPE_VERSION,
    sender,
    recipient,
    sequence,
    iv,
    ciphertext,
  );

  const mac = createHmac(
    "sha256",
    clesSession.macKey,
  )
    .update(donneesHmac)
    .digest();

  return {
    version: ENVELOPE_VERSION,
    sender,
    recipient,
    sequence,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    mac: mac.toString("base64"),
  };
}

// Vérifie le HMAC puis déchiffre le message.
function ouvrirEnveloppe(
  clesSession,
  enveloppe,
) {
  if (
    !clesSession ||
    !Buffer.isBuffer(clesSession.encryptionKey) ||
    !Buffer.isBuffer(clesSession.macKey) ||
    clesSession.encryptionKey.length !== 32 ||
    clesSession.macKey.length !== 32
  ) {
    throw new Error("Clés de session invalides.");
  }

  if (
    typeof enveloppe !== "object" ||
    enveloppe === null ||
    Array.isArray(enveloppe)
  ) {
    throw new Error("Enveloppe invalide.");
  }

  if (enveloppe.version !== ENVELOPE_VERSION) {
    throw new Error("Version d'enveloppe invalide.");
  }

  if (
    typeof enveloppe.sender !== "string" ||
    enveloppe.sender.trim() === "" ||
    enveloppe.sender.length > 30
  ) {
    throw new Error("Expéditeur invalide.");
  }

  if (
    typeof enveloppe.recipient !== "string" ||
    enveloppe.recipient.trim() === "" ||
    enveloppe.recipient.length > 30
  ) {
    throw new Error("Destinataire invalide.");
  }

  if (
    !Number.isInteger(enveloppe.sequence) ||
    enveloppe.sequence < 0 ||
    enveloppe.sequence > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Séquence invalide.");
  }

  const iv = decodeBase64Strict(enveloppe.iv, IV_BYTES);
  const ciphertext = decodeBase64Canonical(enveloppe.ciphertext);

  const mac = decodeBase64Strict(enveloppe.mac, MAC_BYTES);

  const donneesHmac = construireDonneesHmac(
    enveloppe.version,
    enveloppe.sender,
    enveloppe.recipient,
    enveloppe.sequence,
    iv,
    ciphertext,
  );

  const macAttendu = createHmac(
    "sha256",
    clesSession.macKey,
  )
    .update(donneesHmac)
    .digest();

  if (!timingSafeEqual(mac, macAttendu)) {
    throw new Error("HMAC invalide.");
  }

  const decipher = createDecipheriv(
    "aes-256-cbc",
    clesSession.encryptionKey,
    iv,
  );

  const message = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return message.toString("utf8");
}

// Crée un compteur de séquence pour une direction de communication.
// La première séquence attendue est 1.
// Le paramètre sequenceInitiale sert uniquement aux tests
// du dépassement du compteur.
function creerSequence(sequenceInitiale = 1) {
  if (
    !Number.isInteger(sequenceInitiale) ||
    sequenceInitiale < 1 ||
    sequenceInitiale > MAX_SEQUENCE
  ) {
    throw new Error("Séquence initiale invalide.");
  }

  let attendue = sequenceInitiale;

  return {
    // Retourne la prochaine séquence à utiliser.
    prochaine() {
      if (attendue > MAX_SEQUENCE) {
        throw new Error("Séquence épuisée.");
      }

      return attendue;
    },

    // Vérifie la séquence reçue et avance le compteur.
    verifier(sequence) {
      if (
        !Number.isInteger(sequence) ||
        sequence < 1 ||
        sequence > MAX_SEQUENCE
      ) {
        throw new Error("Séquence invalide.");
      }

      if (sequence !== attendue) {
        throw new Error("Séquence invalide.");
      }

      if (attendue === MAX_SEQUENCE) {
        attendue = MAX_SEQUENCE + 1;
        return;
      }

      attendue += 1;
    },
  };
}

// Encode une enveloppe pour l'envoi sur TCP.
// Chaque enveloppe est un objet JSON suivi d'un retour à la ligne.
function encoderEnveloppe(enveloppe) {
  if (
    typeof enveloppe !== "object" ||
    enveloppe === null ||
    Array.isArray(enveloppe)
  ) {
    throw new Error("Enveloppe invalide.");
  }

  const ligne = JSON.stringify(enveloppe) + "\n";
  const donnees = Buffer.from(ligne, "utf8");

  if (donnees.length > MAX_ENVELOPE_BYTES) {
    throw new Error("Enveloppe trop grande.");
  }

  return donnees;
}

// Extrait les enveloppes complètes d'un tampon TCP.
// Retourne les enveloppes complètes et le fragment incomplet restant.
function extraireEnveloppes(tampon) {
  if (!Buffer.isBuffer(tampon)) {
    throw new Error("Tampon invalide.");
  }

  if (tampon.length > MAX_BUFFER_BYTES) {
    throw new Error("Tampon trop grand.");
  }

  const enveloppes = [];
  let reste = tampon;

  while (true) {
    const fin = reste.indexOf("\n");

    if (fin === -1) {
      break;
    }

    const ligne = reste.subarray(0, fin);
    reste = reste.subarray(fin + 1);

    if (ligne.length > MAX_ENVELOPE_BYTES) {
      throw new Error("Enveloppe trop grande.");
    }

    try {
      const enveloppe = JSON.parse(
        ligne.toString("utf8"),
      );

      enveloppes.push(enveloppe);
    } catch {
      throw new Error("Enveloppe invalide.");
    }
  }

  if (reste.length > MAX_BUFFER_BYTES) {
    throw new Error("Tampon trop grand.");
  }

  return {
    enveloppes,
    reste,
  };
}

// Hachage et vérification des mots de passe avec bcrypt.
// Le hachage est différent du chiffrement : il ne doit pas être réversible.
const bcrypt = require("bcrypt");

// Limite imposée par bcrypt pour le mot de passe en clair.
const MAX_PASSWORD_BYTES = 72;

// Hache un mot de passe avec un sel généré automatiquement.
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

// Vérifie un mot de passe contre son hachage bcrypt.
async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
module.exports = {
  CURVE,
  PUBLIC_KEY_BYTES,
  NONCE_BYTES,
  ENVELOPE_VERSION,
  IV_BYTES,
  MAC_BYTES,
  MAX_ENVELOPE_BYTES,
  decodePublicKey,
  decodeNonce,
  createKeyExchange,
  deriverClesSession,
  creerEnveloppe,
  ouvrirEnveloppe,
  MAX_SEQUENCE,
  creerSequence,
  MAX_BUFFER_BYTES,
  encoderEnveloppe,
  extraireEnveloppes,
  hashPassword,
  verifyPassword,
  MAX_PASSWORD_BYTES,
};