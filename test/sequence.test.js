const test = require("node:test");
const assert = require("node:assert/strict");

const {
  creerSequence,
} = require("../src/common/crypto");

test("Séquence : la première séquence attendue est 1", () => {
  const sequence = creerSequence();

  assert.equal(sequence.prochaine(), 1);
});

test("Séquence : une séquence valide avance le compteur", () => {
  const sequence = creerSequence();

  sequence.verifier(1);

  assert.equal(sequence.prochaine(), 2);

  sequence.verifier(2);

  assert.equal(sequence.prochaine(), 3);
});

test("Séquence : un rejeu est rejeté", () => {
  const sequence = creerSequence();

  sequence.verifier(1);

  assert.throws(() => {
    sequence.verifier(1);
  }, /Séquence invalide/);
});

test("Séquence : un saut est rejeté", () => {
  const sequence = creerSequence();

  assert.throws(() => {
    sequence.verifier(2);
  }, /Séquence invalide/);
});

test("Séquence : une séquence ancienne est rejetée", () => {
  const sequence = creerSequence();

  sequence.verifier(1);
  sequence.verifier(2);

  assert.throws(() => {
    sequence.verifier(1);
  }, /Séquence invalide/);
});

test("Séquence : les compteurs sont indépendants", () => {
  const clientVersServeur = creerSequence();
  const serveurVersClient = creerSequence();

  clientVersServeur.verifier(1);
  clientVersServeur.verifier(2);

  assert.equal(serveurVersClient.prochaine(), 1);

  serveurVersClient.verifier(1);

  assert.equal(clientVersServeur.prochaine(), 3);
});

test("Séquence : les valeurs invalides sont rejetées", () => {
  const sequence = creerSequence();

  for (const valeur of [
    0,
    -1,
    1.5,
    "1",
    null,
    undefined,
  ]) {
    assert.throws(() => {
      sequence.verifier(valeur);
    }, /Séquence invalide/);
  }
});

test("Séquence : le dépassement du compteur est rejeté", () => {
  const sequence = creerSequence(Number.MAX_SAFE_INTEGER);

  assert.equal(sequence.prochaine(), Number.MAX_SAFE_INTEGER);

  sequence.verifier(Number.MAX_SAFE_INTEGER);

  assert.throws(() => {
    sequence.prochaine();
  }, /Séquence épuisée/);

  assert.throws(() => {
    sequence.verifier(Number.MAX_SAFE_INTEGER);
  }, /Séquence invalide/);
});