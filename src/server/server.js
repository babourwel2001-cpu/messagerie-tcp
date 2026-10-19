const { ACTIONS } = require("../common/protocol");
const {
  buildServerHello,
  buildServerMessage,
  buildServerBroadcast,
  buildServerClients,
  buildServerGoodbye,
  buildServerUserJoined,
  buildServerUserLeft,
  buildServerError,
  buildServerGroupCreated,
  buildServerGroups,
  buildServerGroupJoined,
  buildServerMembers,
  buildServerGroupLeft,
  buildServerGroupMessages,
  buildServerGroupMessage,
  buildClientListGroupMessages,
  buildClientGroupBroadcast,
  buildServerGroupInvited,
  buildServerGroupInvitation,
  buildServerGroupKicked,
  buildServerGroupBanned,
  buildServerGroupUnbanned,
  buildServerGroupStates
} = require("../common/messages");
const net = require("node:net");

const clients = new Map();

//pour les groupes:création, récupération, vérification de l'appartenance et de l'interdiction

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
} = require("./groups"); //importation des fonctions de gestion des groupes


const HOST = process.env.SERVER_HOST || "127.0.0.1";
const PORT = Number(process.env.SERVER_PORT || "8080");
const MAX_MESSAGE_BYTES = 8192; // Limite de taille des messages en octets

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("SERVER_PORT doit être un entier entre 1 et 65535.");
  process.exit(1);
}

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
  let pending = "";
  let username = null;

  console.error(`CONNECTED from ${address}`);

  socket.setEncoding("utf8");

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
        send(socket, buildServerError("JSON invalide."));
        continue;
      }

      if (
        message === null ||
        typeof message !== "object" ||
        Array.isArray(message)
      ) {
        sendError(socket, "Objet JSON attendu.");
        continue;
      }

      console.error(`MESSAGE from ${address}:`, message);

      if (message.action === "client-hello") {
        if (username !== null) {
          sendError(socket, "Vous êtes déjà présenté.");
          continue;
        }

        if (!isValidName(message.sender)) {
          send(socket, buildServerError("Nom invalide."));
          continue;
        }

        const requestedName = message.sender.trim();

        console.error("Noms déjà utilisés :", [...clients.keys()]);

        if (clients.has(requestedName)) {
          sendError(socket, "Ce nom est déjà utilisé.");
          continue;
        }

        username = requestedName;
        clients.set(username, socket);

        console.error(`Utilisateur enregistré : ${username}`);
        console.error("Noms connectés :", [...clients.keys()]);

        send(socket, buildServerHello(username, `Bienvenue ${username}`));

        continue;
      }

      if (username === null) {
        sendError(socket, "Présentation obligatoire.");
        continue;
      }

      if (message.action === "client-send") {
        if (typeof message.dest !== "string" || message.dest.trim() === "") {
          send(socket, buildServerError("Destinataire invalide."));
          continue;
        }

        if (typeof message.msg !== "string" || message.msg.trim() === "") {
          send(socket, buildServerError("Message vide ou invalide."));
          continue;
        }

        const destinationName = message.dest.trim();
        const destinationSocket = clients.get(destinationName);

        if (!destinationSocket) {
          sendError(socket, `Utilisateur ${destinationName} introuvable.`);
          continue;
        }

        send(destinationSocket, buildServerMessage(username, message.msg));

        continue;
      }
      if (message.action === "client-broadcast") {
        if (typeof message.msg !== "string" || message.msg.trim() === "") {
          send(socket, buildServerError("Message vide ou invalide."));
          continue;
        }

        const broadcastMessage = {
          sender: username,
          action: "server-broadcast",
          msg: message.msg,
        };

        for (const clientSocket of clients.values()) {
          send(clientSocket, broadcastMessage);
        }

        continue;
      }
      if (message.action === "client-list-clients") {
        const names = [...clients.keys()].sort((a, b) => a.localeCompare(b));

        send(socket, {
          action: "server-clients",
          clients: names,
        });

        continue;
      }
      if (message.action === "client-quit") {
        send(socket, {
          action: "server-goodbye",
          msg: `Au revoir ${username}`,
        });

        socket.end();
        continue;
      }
      // pour les groupes: création et récupération

      if (message.action === "cgroupe") {
        const result = createGroupForUser(
          message.group,
          username,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerGroupCreated(
            username,
            result.group.name,
          ),
        );

        continue;
      }

      if (message.action === "groups") {
        const groupNames = listGroupNames();

        send(socket, buildServerGroups(groupNames));

        continue;
      }

      if (message.action === "join") {
        const result = joinGroupForUser(
          message.group,
          username,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerGroupJoined(
            username,
            result.group.name,
          ),
        );

        continue;
      }

      if (message.action === "members") {
        const result = getMembersForUser(
          message.group,
          username,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerMembers(
            result.group.name,
            result.members,
          ),
        );

        continue;
      }

      if (message.action === "leave") {
        const result = leaveGroupForUser(
          message.group,
          username,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerGroupLeft(
            username,
            result.group.name,
          ),
        );

        continue;
      }

      if (message.action === "gbroadcast") {
        const result = postGroupMessageForUser(
          message.group,
          username,
          message.msg,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        const serverMessage = buildServerGroupMessage(
          result.message.sender,
          result.groupName,
          result.message.msg,
        );

        for (const memberName of result.members) {
          const memberSocket = clients.get(memberName);

          if (memberSocket) {
            send(memberSocket, serverMessage);
          }
        }

        continue;
      }

      if (message.action === "msgs") {
        const result = getGroupMessagesForUser(
          message.group,
          username,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerGroupMessages(
            result.groupName,
            result.messages,
          ),
        );

        continue;
      }
      if (message.action === "invite") {
        const result = inviteUserToGroup(
          message.group,
          username,
          message.dest,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerGroupInvited(
            username,
            result.groupName,
            result.destination,
          ),
        );

        const destinationSocket = clients.get(
          result.destination,
        );

        if (destinationSocket) {
          send(
            destinationSocket,
            buildServerGroupInvitation(
              username,
              result.groupName,
            ),
          );
        }

        continue;
      }
      if (message.action === "kick" || message.action === "ban") {
        const result = moderateGroupMember(
          message.group,
          username,
          message.dest,
          message.reason,
          message.action,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        const response =
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

        send(socket, response);

        continue;
      }

      if (message.action === "unban") {
        const result = unbanUserFromGroup(
          message.group,
          username,
          message.dest,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerGroupUnbanned(
            username,
            result.groupName,
            result.destination,
          ),
        );

        continue;
      }
      if (message.action === "states") {
        const result = getGroupStatesForUser(
          message.group,
          username,
        );

        if (result.error) {
          sendError(socket, result.error);
          continue;
        }

        send(
          socket,
          buildServerGroupStates(
            result.groupName,
            result.states,
          ),
        );

        continue;
      }
      sendError(socket, "Action inconnue.");
    }

    if (Buffer.byteLength(pending, "utf8") > MAX_MESSAGE_BYTES) {
      console.error(`Message incomplet trop long from ${address}`);
      socket.destroy();
    }
  });

  socket.on("error", (error) => {
    console.error(`Socket error from ${address}: ${error.message}`);
  });

  socket.on("close", () => {
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
