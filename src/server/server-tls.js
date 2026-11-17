// Serveur TLS de la messagerie.
// TLS assure le chiffrement, l'intégrité et l'authentification du serveur.
// Les comptes, les mots de passe et l'historique sont gérés avec SQLite.

const tls = require("node:tls");
const fs = require("node:fs");

const {
  buildServerHello,
  buildServerMessage,
  buildServerError,
  buildServerBroadcast,
  buildServerAuthResult,
  buildServerHistory,
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

const database = require("./database");
const auth = require("./auth");

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

// Repère : TLS utilise un certificat et une clé privée.
const server = tls.createServer(
  {
    key: fs.readFileSync("certs/server-key.pem"),
    cert: fs.readFileSync("certs/server-cert.pem"),
  },
  (socket) => {
    const address = `${socket.remoteAddress}:${socket.remotePort}`;

    let username = null;
    let userId = null;
    let authPending = false;
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

    // Repère : inscription et connexion des comptes.
    async function gererAuthentification(message) {
      if (username !== null) {
        send(
          socket,
          buildServerAuthResult(
            false,
            auth.CODES.ALREADY_AUTHENTICATED,
          ),
        );

        return;
      }

      if (authPending) {
        send(
          socket,
          buildServerAuthResult(false, auth.CODES.BUSY),
        );

        return;
      }

      authPending = true;

      try {
        const result =
          message.action === "register"
            ? await auth.register(message.name, message.password)
            : await auth.login(message.name, message.password);

        authPending = false;

        if (result.error) {
          send(
            socket,
            buildServerAuthResult(false, result.code),
          );

          return;
        }

        // L'inscription crée le compte, mais ne connecte pas automatiquement.
        if (message.action === "register") {
          send(
            socket,
            buildServerAuthResult(true, result.code),
          );

          return;
        }

        // La connexion authentifie le client et l'enregistre.
        if (clients.has(result.user.name)) {
          send(
            socket,
            buildServerAuthResult(false, auth.CODES.ALREADY_ONLINE),
          );

          return;
        }

        username = result.user.name;
        userId = result.user.id;

        clients.set(username, socket);

        console.log(`Utilisateur authentifié : ${username}`);

        send(
          socket,
          buildServerAuthResult(true, result.code),
        );
      } catch (error) {
        authPending = false;

        console.error(`Erreur d'authentification : ${error.message}`);

        send(
          socket,
          buildServerAuthResult(false, auth.CODES.SERVER_ERROR),
        );
      }
    }

    // Repère : traitement des commandes métier.
    function handleMessage(message) {
      // Inscription et connexion.
      if (message.action === "register" || message.action === "auth") {
        gererAuthentification(message);

        return;
      }

      if (username === null) {
        send(socket, buildServerError("Authentification requise."));
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

        const messagePrive = buildServerMessage(
          username,
          message.msg,
        );

        send(destinationSocket, messagePrive);

        // Enregistre le message privé dans l'historique du compte.
        database
          .addMessage(
            userId,
            "private",
            JSON.stringify(messagePrive),
          )
          .catch((error) => {
            console.error(
              `Erreur d'enregistrement : ${error.message}`,
            );
          });

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

        // Enregistre la diffusion dans l'historique du compte.
        database
          .addMessage(
            userId,
            "broadcast",
            JSON.stringify(messageDiffusion),
          )
          .catch((error) => {
            console.error(
              `Erreur d'enregistrement : ${error.message}`,
            );
          });

        return;
      }

      // Historique du compte authentifié.
      if (message.action === "history") {
        const limit = Number.isInteger(message.limit)
          ? Math.min(Math.max(message.limit, 1), 50)
          : 50;

        database
          .listMessages(userId, limit)
          .then((rows) => {
            const items = rows.map((row) => {
              const content = JSON.parse(row.body);

              return {
                date: row.created_at,
                kind: row.kind,
                ...content,
              };
            });

            send(socket, buildServerHistory(items));
          })
          .catch((error) => {
            send(
              socket,
              buildServerError(
                `Erreur d'historique : ${error.message}`,
              ),
            );
          });

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

server.listen(PORT, HOST, async () => {
  // Repère : ouverture de la base SQLite au démarrage.
  await database.open();

  console.log(`Serveur TLS en écoute sur ${HOST}:${PORT}`);
});