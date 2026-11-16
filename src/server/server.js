// Serveur de messagerie TCP.
// Négociation ECDH et dérivation HKDF.
// Les commandes métier restent bloquées tant que le canal
// chiffré et authentifié n'est pas disponible.

const { ACTIONS } = require("../common/protocol");
const {
  buildServerKey,
  buildServerHello,
  buildServerMessage,
  buildServerError,
  buildServerGroupCreated,
  buildServerGroups,
  buildServerGroupJoined,
  buildServerMembers,
  buildServerGroupLeft,
  buildServerGroupMessages,
  buildServerGroupMessage,
  buildServerGroupInvited,
  buildServerGroupInvitation,
  buildServerGroupKicked,
  buildServerGroupBanned,
  buildServerGroupUnbanned,
  buildServerGroupStates,
} = require("../common/messages");

const net = require("node:net");

// Annuaire des utilisateurs connectés.
const clients = new Map();

// Fonctions de gestion des groupes.
const {
  createGroupForUser,
  joinGroupForUser,
  leaveGroupForUser,
  getMembersForUser,
  postGroupMessageForUser,
  getGroupMessagesForUser,
  inviteUserToGroup,
  moderateGroupMember,
  unbanUserFromGroup,
  getGroupStatesForUser,
  listGroupNames,
  disconnectUserFromGroups,
} = require("./groups");

// Fonctions de négociation ECDH et de dérivation HKDF.
const {
  createKeyExchange,
  deriverClesSession,
  encoderEnveloppe,
  extraireEnveloppes,
} = require("../common/crypto");

const {
  validateClientKey,
} = require("../common/negociation");

const HOST = process.env.SERVER_HOST || "127.0.0.1";
const PORT = Number(process.env.SERVER_PORT || "8080");
const MAX_MESSAGE_BYTES = 8192;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("SERVER_PORT doit être un entier entre 1 et 65535.");
  process.exit(1);
}

// Envoi d'un message JSON encodé en enveloppe.
function send(socket, message) {
  socket.write(encoderEnveloppe(message));
}

function sendError(socket, message) {
  send(socket, {
    action: "server-error",
    msg: message,
  });
}

function isValidName(name) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= 30
  );
}

const server = net.createServer((socket) => {
  const address = `${socket.remoteAddress}:${socket.remotePort}`;

  // Tampon pour les données TCP reçues en plusieurs morceaux.
  let pending = Buffer.alloc(0);
  let username = null;

  // Négociation ECDH, propre à chaque connexion.
  let etatNegociation = "attente-cle";
  let echange = null;
  let secretPartage = null;
  let clientNonce = null;
  let serverNonce = null;

  // Clés dérivées avec HKDF.
  let clesSession = null;

  const delaiNegociation = setTimeout(() => {
    console.error(`Négociation expirée : ${address}`);
    socket.destroy();
  }, 10000);

  // Nettoie les données sensibles lors d'une erreur ou d'une fermeture.
  function nettoyerNegociation() {
    clearTimeout(delaiNegociation);

    if (secretPartage !== null) {
      secretPartage.fill(0);
      secretPartage = null;
    }

    if (clesSession !== null) {
      clesSession.encryptionKey.fill(0);
      clesSession.macKey.fill(0);
      clesSession = null;
    }

    echange = null;
    clientNonce = null;
    serverNonce = null;
    pending = "";
    etatNegociation = "ferme";
  }

  console.error(`CONNECTED from ${address}`);


  // Réception, cadrage et traitement des messages JSON.
  socket.on("data", (chunk) => {
    try {
      pending = Buffer.concat([pending, chunk]);

      const resultat = extraireEnveloppes(pending);

      pending = resultat.reste;

      for (const message of resultat.enveloppes) {
        if (etatNegociation !== "attente-cle") {
          console.error(`Message inattendu : ${address}`);
          socket.destroy();
          return;
        }

        try {
          const donnees = validateClientKey(message);

          echange = createKeyExchange();

          clientNonce = donnees.nonce;
          serverNonce = Buffer.from(echange.nonce, "base64");

          secretPartage = echange.computeSecret(
            donnees.publicKey.toString("base64"),
          );

          clesSession = deriverClesSession(
            secretPartage,
            clientNonce,
            serverNonce,
          );

          secretPartage.fill(0);
          secretPartage = null;

          const reponse = buildServerKey(
            echange.publicKey,
            echange.nonce,
          );

          send(socket, reponse);

          etatNegociation = "ecdh-termine";
          clearTimeout(delaiNegociation);
          echange = null;

          console.error(
            `ECDH et HKDF terminés : ${address}. Canal chiffré non encore disponible.`,
          );
        } catch {
          console.error(`Négociation refusée : ${address}`);
          socket.destroy();
          return;
        }
      }
    } catch {
      console.error(`Message ou cadrage invalide : ${address}`);
      socket.destroy();
    }
  });

  socket.on("error", (error) => {
    nettoyerNegociation();
    console.error(`Socket error from ${address}: ${error.message}`);
  });

  socket.on("close", () => {
    nettoyerNegociation();

    console.error(`CLOSE ${address}, username =`, username);

    if (username !== null && clients.get(username) === socket) {
      clients.delete(username);

      disconnectUserFromGroups(username);

      console.error(`Nom retiré : ${username}`);
    }

    console.error("Noms restants :", [...clients.keys()]);
  });
});

server.on("error", (error) => {
  console.error(`Server error: ${error.message}`);
});

server.listen(PORT, HOST, () => {
  console.error(`Listening on ${HOST}:${PORT}`);
});