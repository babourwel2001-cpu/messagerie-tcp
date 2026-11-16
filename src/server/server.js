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

// Envoie un objet JSON suivi d'un retour à la ligne.
function send(socket, message) {
  socket.write(JSON.stringify(message) + "\n");
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
  let pending = "";
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

  socket.setEncoding("utf8");

  // Réception et découpage des messages JSON terminés par \n.
  socket.on("data", (chunk) => {
    pending += chunk;

    let newline;

    while ((newline = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);

      if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
        console.error(`Message trop long from ${address}`);
        socket.destroy();
        return;
      }

      let message;

      try {
        message = JSON.parse(line);
      } catch {
        console.error(`Négociation refusée : ${address}`);
        socket.destroy();
        return;
      }

      // Après la négociation, le serveur ne doit plus recevoir
      // de message de négociation.
      if (etatNegociation !== "attente-cle") {
        console.error(`Message inattendu : ${address}`);
        socket.destroy();
        return;
      }

      try {
        // Validation de la requête client-key.
        const donnees = validateClientKey(message);

        echange = createKeyExchange();

        clientNonce = donnees.nonce;
        serverNonce = Buffer.from(echange.nonce, "base64");

        // Calcul du secret ECDH.
        secretPartage = echange.computeSecret(
          donnees.publicKey.toString("base64"),
        );

        // Dérivation des clés de session.
        // L'ordre des nonces doit être identique chez le client et le serveur.
        clesSession = deriverClesSession(
          secretPartage,
          clientNonce,
          serverNonce,
        );

        // Le secret ECDH n'est plus nécessaire après la dérivation.
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

      continue;
    }

    if (Buffer.byteLength(pending, "utf8") > MAX_MESSAGE_BYTES) {
      console.error(`Message incomplet trop long from ${address}`);
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