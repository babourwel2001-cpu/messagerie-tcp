// Serveur TLS de la messagerie.
// TLS assure le chiffrement, l'intégrité et l'authentification du serveur.
// Le protocole applicatif reste JSON, avec une commande par ligne.

const tls = require("node:tls");
const fs = require("node:fs");

const {
  buildServerHello,
  buildServerMessage,
  buildServerError,
  buildServerBroadcast,
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

const HOST = process.env.SERVER_HOST || "127.0.0.1";
const PORT = Number(process.env.SERVER_PORT || "8443");

// Annuaire des utilisateurs connectés.
const clients = new Map();

// Envoi d'un message JSON terminé par un retour à la ligne.
function send(socket, message) {
  socket.write(JSON.stringify(message) + "\n");
}

function isValidName(name) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= 30
  );
}

// Repère : TLS exige un certificat et une clé privée côté serveur.
const server = tls.createServer(
  {
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem"),
  },
  (socket) => {
    const address = `${socket.remoteAddress}:${socket.remotePort}`;

    let username = null;
    let buffer = "";

    console.log(`CONNECTED TLS from ${address}`);

    // Repère : découpage des messages JSON reçus sur TLS.
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      let index;

      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);

        if (line === "") {
          continue;
        }

        try {
          handleMessage(JSON.parse(line));
        } catch (error) {
          send(socket, {
            action: "server-error",
            msg: error.message,
          });
        }
      }
    });

    // Repère : traitement des commandes métier.
    function handleMessage(message) {
      // Enregistrement du client.
      if (message.action === "client-hello") {
        if (username !== null) {
          send(socket, buildServerError("Client déjà enregistré."));
          return;
        }

        if (!isValidName(message.sender)) {
          send(socket, buildServerError("Nom invalide."));
          return;
        }

        const requestedName = message.sender.trim();

        if (clients.has(requestedName)) {
          send(socket, buildServerError("Ce nom est déjà utilisé."));
          return;
        }

        username = requestedName;

        clients.set(username, socket);

        console.log(`Utilisateur enregistré : ${username}`);

        send(
          socket,
          buildServerHello(username, `Bienvenue ${username}`),
        );

        return;
      }

      if (username === null) {
        send(socket, buildServerError("Client non enregistré."));
        return;
      }

      // Liste des utilisateurs connectés.
      if (message.action === "client-list-clients") {
        const names = [...clients.keys()].sort((a, b) =>
          a.localeCompare(b),
        );

        send(socket, {
          action: "server-clients",
          clients: names,
        });

        return;
      }

      // Message privé.
      if (message.action === "client-send") {
        const destinationName = message.dest?.trim();
        const destinationSocket = clients.get(destinationName);

        if (!destinationSocket) {
          send(
            socket,
            buildServerError(
              `Utilisateur ${destinationName} introuvable.`,
            ),
          );

          return;
        }

        send(
          destinationSocket,
          buildServerMessage(username, message.msg),
        );

        return;
      }

      // Diffusion générale.
      if (message.action === "client-broadcast") {
        const messageDiffusion = buildServerBroadcast(
          username,
          message.msg,
        );

        for (const destinationSocket of clients.values()) {
          send(destinationSocket, messageDiffusion);
        }

        return;
      }

      // Déconnexion.
      if (message.action === "client-quit") {
        send(socket, {
          action: "server-goodbye",
          msg: `Au revoir ${username}`,
        });

        socket.end();
        return;
      }

      // Création d'un groupe.
      if (message.action === "cgroupe") {
        const result = createGroupForUser(
          message.group,
          username,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerGroupCreated(username, result.group.name),
        );

        return;
      }

      // Liste des groupes.
      if (message.action === "groups") {
        send(socket, buildServerGroups(listGroupNames()));
        return;
      }

      // Adhésion à un groupe.
      if (message.action === "join") {
        const result = joinGroupForUser(
          message.group,
          username,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerGroupJoined(username, result.group.name),
        );

        return;
      }

      // Liste des membres.
      if (message.action === "members") {
        const result = getMembersForUser(
          message.group,
          username,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerMembers(
            result.group.name,
            result.members,
          ),
        );

        return;
      }

      // Départ d'un groupe.
      if (message.action === "leave") {
        const result = leaveGroupForUser(
          message.group,
          username,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerGroupLeft(username, result.group.name),
        );

        return;
      }

      // Message de groupe.
      if (message.action === "gbroadcast") {
        const result = postGroupMessageForUser(
          message.group,
          username,
          message.msg,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        const messageGroupe = buildServerGroupMessage(
          result.message.sender,
          result.groupName,
          result.message.msg,
        );

        for (const memberName of result.members) {
          const memberSocket = clients.get(memberName);

          if (memberSocket) {
            send(memberSocket, messageGroupe);
          }
        }

        return;
      }

      // Historique d'un groupe.
      if (message.action === "msgs") {
        const result = getGroupMessagesForUser(
          message.group,
          username,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerGroupMessages(
            result.groupName,
            result.messages,
          ),
        );

        return;
      }

      // Invitation dans un groupe.
      if (message.action === "invite") {
        const result = inviteUserToGroup(
          message.group,
          username,
          message.dest,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerGroupInvited(
            username,
            result.groupName,
            result.destination,
          ),
        );

        const destinationSocket = clients.get(result.destination);

        if (destinationSocket) {
          send(
            destinationSocket,
            buildServerGroupInvitation(
              username,
              result.groupName,
            ),
          );
        }

        return;
      }

      // Exclusion ou bannissement.
      if (message.action === "kick" || message.action === "ban") {
        const result = moderateGroupMember(
          message.group,
          username,
          message.dest,
          message.reason,
          message.action,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        const reponse =
          message.action === "ban"
            ? buildServerGroupBanned(
              username,
              result.groupName,
              result.destination,
              result.reason,
            )
            : buildServerGroupKicked(
              username,
              result.groupName,
              result.destination,
              result.reason,
            );

        send(socket, reponse);
        return;
      }

      // Retrait d'un bannissement.
      if (message.action === "unban") {
        const result = unbanUserFromGroup(
          message.group,
          username,
          message.dest,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerGroupUnbanned(
            username,
            result.groupName,
            result.destination,
          ),
        );

        return;
      }

      // Journal des événements.
      if (message.action === "states") {
        const result = getGroupStatesForUser(
          message.group,
          username,
        );

        if (result.error) {
          send(socket, buildServerError(result.error));
          return;
        }

        send(
          socket,
          buildServerGroupStates(
            result.groupName,
            result.states,
          ),
        );

        return;
      }

      send(socket, buildServerError("Action inconnue."));
    }

    socket.on("error", (error) => {
      console.error(`TLS socket error ${address} : ${error.message}`);
    });

    socket.on("close", () => {
      if (username !== null) {
        clients.delete(username);
        disconnectUserFromGroups(username);

        console.log(`Déconnexion : ${username}`);
      }

      console.log(`CLOSE TLS ${address}`);
    });
  },
);

server.on("error", (error) => {
  console.error(`Server TLS error : ${error.message}`);
});

server.listen(PORT, HOST, () => {
  console.log(`Serveur TLS en écoute sur ${HOST}:${PORT}`);
});