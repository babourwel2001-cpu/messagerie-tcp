const test = require("node:test");
const assert = require("node:assert/strict");

const { createKeyExchange } = require("../src/common/crypto");

const {
  buildClientKey,
  buildServerKey,
  buildClientHello,
} = require("../src/common/messages");

test("Négociation : le constructeur client respecte le contrat", () => {
  const client = createKeyExchange();

  const message = buildClientKey(
    client.publicKey,
    client.nonce,
  );

  assert.deepStrictEqual(message, {
    action: "client-key",
    curve: "prime256v1",
    publicKey: client.publicKey,
    clientNonce: client.nonce,
  });
});

test("Négociation : le constructeur serveur respecte le contrat", () => {
  const server = createKeyExchange();

  const message = buildServerKey(
    server.publicKey,
    server.nonce,
  );

  assert.deepStrictEqual(message, {
    action: "server-key",
    curve: "prime256v1",
    publicKey: server.publicKey,
    serverNonce: server.nonce,
  });
});

test("Négociation : les messages restent identiques après passage par JSON", () => {
  const client = createKeyExchange();
  const server = createKeyExchange();

  const messages = [
    buildClientKey(client.publicKey, client.nonce),
    buildServerKey(server.publicKey, server.nonce),
  ];

  for (const message of messages) {
    const received = JSON.parse(JSON.stringify(message));

    assert.deepStrictEqual(received, message);
  }
});

test("Non-régression : la présentation existante reste inchangée", () => {
  assert.deepStrictEqual(buildClientHello("alice"), {
    sender: "alice",
    action: "client-hello",
  });
});