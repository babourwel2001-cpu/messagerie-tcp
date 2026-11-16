const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createKeyExchange,
  decodeNonce,
  deriverClesSession,
  creerEnveloppe,
  ouvrirEnveloppe,
} = require("../src/common/crypto");

function preparerSession() {
  const client = createKeyExchange();
  const server = createKeyExchange();

  const cles = deriverClesSession(
    client.computeSecret(server.publicKey),
    decodeNonce(client.nonce),
    decodeNonce(server.nonce),
  );

  return cles;
}

test("Enveloppe : aller-retour correct", () => {
  const cles = preparerSession();

  const enveloppe = creerEnveloppe(
    cles,
    "alice",
    "bob",
    1,
    "Salut Bob !",
  );

  const message = ouvrirEnveloppe(cles, enveloppe);

  assert.equal(message, "Salut Bob !");
});

test("Enveloppe : l'IV change à chaque création", () => {
  const cles = preparerSession();

  const premiere = creerEnveloppe(
    cles,
    "alice",
    "bob",
    1,
    "Salut Bob !",
  );

  const seconde = creerEnveloppe(
    cles,
    "alice",
    "bob",
    1,
    "Salut Bob !",
  );

  assert.notEqual(premiere.iv, seconde.iv);
  assert.notEqual(premiere.ciphertext, seconde.ciphertext);
});

test("Enveloppe : altérer le texte chiffré invalide le HMAC", () => {
  const cles = preparerSession();

  const enveloppe = creerEnveloppe(
    cles,
    "alice",
    "bob",
    1,
    "Salut Bob !",
  );

  const ciphertext = Buffer.from(
    enveloppe.ciphertext,
    "base64",
  );

  ciphertext[0] ^= 1;

  const copie = {
    ...enveloppe,
    ciphertext: ciphertext.toString("base64"),
  };

  assert.throws(() => {
    ouvrirEnveloppe(cles, copie);
  }, /HMAC invalide/);
});