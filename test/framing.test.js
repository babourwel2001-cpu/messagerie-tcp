const test = require("node:test");
const assert = require("node:assert/strict");

const {
  encoderEnveloppe,
  extraireEnveloppes,
  MAX_ENVELOPE_BYTES,
  MAX_BUFFER_BYTES,
} = require("../src/common/crypto");

function creerEnveloppeTest(sequence) {
  return {
    version: 1,
    sender: "alice",
    recipient: "bob",
    sequence,
    iv: "AAAAAAAAAAAAAAAAAAAAAA==",
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    mac: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  };
}

test("Cadrage : une enveloppe est encodée avec un retour à la ligne", () => {
  const enveloppe = creerEnveloppeTest(1);

  const donnees = encoderEnveloppe(enveloppe);

  assert.equal(
    donnees.toString("utf8").endsWith("\n"),
    true,
  );

  const resultat = extraireEnveloppes(donnees);

  assert.equal(resultat.enveloppes.length, 1);
  assert.deepStrictEqual(
    resultat.enveloppes[0],
    enveloppe,
  );
  assert.equal(resultat.reste.length, 0);
});

test("Cadrage : une enveloppe fragmentée est reconstituée", () => {
  const enveloppe = creerEnveloppeTest(1);

  const donnees = encoderEnveloppe(enveloppe);

  const premierePartie = donnees.subarray(0, 10);
  const deuxiemePartie = donnees.subarray(10);

  const premierResultat = extraireEnveloppes(premierePartie);

  assert.equal(premierResultat.enveloppes.length, 0);
  assert.equal(
    premierResultat.reste.toString("utf8"),
    premierePartie.toString("utf8"),
  );

  const tamponComplet = Buffer.concat([
    premierResultat.reste,
    deuxiemePartie,
  ]);

  const deuxiemeResultat = extraireEnveloppes(tamponComplet);

  assert.equal(deuxiemeResultat.enveloppes.length, 1);
  assert.deepStrictEqual(
    deuxiemeResultat.enveloppes[0],
    enveloppe,
  );
  assert.equal(deuxiemeResultat.reste.length, 0);
});

test("Cadrage : plusieurs enveloppes dans un même morceau", () => {
  const premiere = encoderEnveloppe(creerEnveloppeTest(1));
  const deuxieme = encoderEnveloppe(creerEnveloppeTest(2));
  const troisieme = encoderEnveloppe(creerEnveloppeTest(3));

  const tampon = Buffer.concat([
    premiere,
    deuxieme,
    troisieme,
  ]);

  const resultat = extraireEnveloppes(tampon);

  assert.equal(resultat.enveloppes.length, 3);
  assert.equal(resultat.enveloppes[0].sequence, 1);
  assert.equal(resultat.enveloppes[1].sequence, 2);
  assert.equal(resultat.enveloppes[2].sequence, 3);
  assert.equal(resultat.reste.length, 0);
});

test("Cadrage : une enveloppe complète et un fragment restent séparés", () => {
  const complete = encoderEnveloppe(creerEnveloppeTest(1));
  const incomplete = encoderEnveloppe(creerEnveloppeTest(2));

  const fragment = incomplete.subarray(
    0,
    Math.floor(incomplete.length / 2),
  );

  const tampon = Buffer.concat([
    complete,
    fragment,
  ]);

  const resultat = extraireEnveloppes(tampon);

  assert.equal(resultat.enveloppes.length, 1);
  assert.equal(resultat.enveloppes[0].sequence, 1);
  assert.equal(
    resultat.reste.toString("utf8"),
    fragment.toString("utf8"),
  );
});

test("Cadrage : une enveloppe trop grande est rejetée", () => {
  const enveloppe = creerEnveloppeTest(1);

  enveloppe.ciphertext = "A".repeat(MAX_ENVELOPE_BYTES);

  assert.throws(() => {
    encoderEnveloppe(enveloppe);
  }, /Enveloppe trop grande/);
});

test("Cadrage : une ligne trop grande est rejetée", () => {
  const ligne = "A".repeat(MAX_ENVELOPE_BYTES + 1) + "\n";

  assert.throws(() => {
    extraireEnveloppes(Buffer.from(ligne, "utf8"));
  }, /Enveloppe trop grande/);
});

test("Cadrage : un tampon trop grand est rejeté", () => {
  const tampon = Buffer.alloc(MAX_BUFFER_BYTES + 1);

  assert.throws(() => {
    extraireEnveloppes(tampon);
  }, /Tampon trop grand/);
});

test("Cadrage : un JSON invalide est rejeté", () => {
  const donnees = Buffer.from(
    "{ceci n'est pas du JSON}\n",
    "utf8",
  );

  assert.throws(() => {
    extraireEnveloppes(donnees);
  }, /Enveloppe invalide/);
});

test("Cadrage : les entrées invalides sont rejetées", () => {
  assert.throws(() => {
    encoderEnveloppe(null);
  }, /Enveloppe invalide/);

  assert.throws(() => {
    extraireEnveloppes("texte");
  }, /Tampon invalide/);
});