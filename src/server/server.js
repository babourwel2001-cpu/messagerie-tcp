
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
  buildServerGroupLeft 
} = require("../common/messages");
const net = require("node:net");

const clients = new Map();

//pour les groupes:création, récupération, vérification de l'appartenance et de l'interdiction

const groups = new Map();

function createGroup(name, creator) {
  const group = {
    name,
    creator,
    members: new Set([creator]),
    invitations: new Map(),
    bans: new Map(),
    messages: [],
    states: []
  };

  groups.set(name, group);

  return group;
}

function getGroup(name) {
  return groups.get(name);
}

function isMember(group, username) {
  return group.members.has(username);
}

function isBanned(group, username) {
  return group.bans.has(username);
}

const HOST = "127.0.0.1";
const PORT = 8080;
const MAX_MESSAGE_BYTES = 8192;

function send(socket, message) {
  socket.write(JSON.stringify(message) + "\n");
}

function sendError(socket, message) {
  send(socket, {
    action: "server-error",
    msg: message
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
    msg: message.msg
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
    clients: names
  });

  continue;
}
if (message.action === "client-quit") {
  send(socket, {
    action: "server-goodbye",
    msg: `Au revoir ${username}`
  });

  socket.end();
  continue;
}
// pour les groupes: création et récupération

if (message.action === "cgroupe") {
  const groupName = typeof message.group === "string"
    ? message.group.trim()
    : "";

  if (groupName === "") {
    sendError(socket, "Nom de groupe invalide.");
    continue;
  }

  if (groupName.length > 30) {
    sendError(socket, "Nom de groupe trop long.");
    continue;
  }

  if (groups.has(groupName)) {
    sendError(socket, `Le groupe ${groupName} existe déjà.`);
    continue;
  }

  createGroup(groupName, username);

  send(socket, buildServerGroupCreated(username, groupName));
  continue;
}

if (message.action === "groups") {
  const groupNames = [...groups.keys()].sort((a, b) =>
    a.localeCompare(b)
  );

  send(socket, buildServerGroups(groupNames));
  continue;
}

if (message.action === "join") {
  const groupName = typeof message.group === "string"
    ? message.group.trim()
    : "";

  const group = getGroup(groupName);

  if (!group) {
    sendError(socket, `Le groupe ${groupName} n'existe pas.`);
    continue;
  }

  if (isBanned(group, username)) {
    sendError(socket, `Vous êtes banni du groupe ${groupName}.`);
    continue;
  }

  if (isMember(group, username)) {
    sendError(socket, `Vous êtes déjà membre du groupe ${groupName}.`);
    continue;
  }

  group.members.add(username);
  group.invitations.delete(username);

  send(socket, buildServerGroupJoined(username, groupName));
  continue;
}

if (message.action === "members") {
  const groupName = typeof message.group === "string"
    ? message.group.trim()
    : "";
  const group = getGroup(groupName);

  if (!group) {
    sendError(socket, `Le groupe ${groupName} n'existe pas.`);
    continue;
  }

  if (!isMember(group, username)) {
    sendError(socket, `Vous n'êtes pas membre du groupe ${groupName}.`);
    continue;
  }

  const members = [...group.members].sort((a, b) =>
    a.localeCompare(b)
  );

  send(socket, buildServerMembers(groupName, members));
  continue;
}

if (message.action === "leave") {
  const groupName = typeof message.group === "string"
    ? message.group.trim()
    : "";
  const group = getGroup(groupName);

  if (!group) {
    sendError(socket, `Le groupe ${groupName} n'existe pas.`);
    continue;
  }

  if (!isMember(group, username)) {
    sendError(socket, `Vous n'êtes pas membre du groupe ${groupName}.`);
    continue;
  }

  group.members.delete(username);

  send(socket, buildServerGroupLeft(username, groupName));
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

    for (const group of groups.values()) {
      group.members.delete(username);
      group.invitations.delete(username);
    }

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