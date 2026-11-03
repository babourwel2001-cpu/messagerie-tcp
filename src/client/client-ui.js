const blessed = require("blessed");

const {
  buildClientHello,
  buildClientSend,
  buildClientBroadcast,
  buildClientListClients,
  buildClientQuit,
  buildClientCreateGroup,
  buildClientListGroups,
  buildClientJoinGroup,
  buildClientListMembers,
  buildClientLeaveGroup,
  buildClientGroupBroadcast,
  buildClientListGroupMessages,
  buildClientInvite,
  buildClientKick,
  buildClientBan,
  buildClientUnban,
  buildClientListGroupStates,
} = require("../common/messages");

const net = require("node:net");
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
  .option("name", {
    type: "string",
    demandOption: true,
    describe: "Nom de l'utilisateur",
  })
  .strict()
  .parse();

const name = argv.name.trim();

if (name === "") {
  console.error("Le nom ne peut pas être vide.");
  process.exit(1);
}

const HOST = process.env.SERVER_HOST || "127.0.0.1";
const PORT = Number(process.env.SERVER_PORT || "8080");

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("SERVER_PORT doit être un entier entre 1 et 65535.");
  process.exit(1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error("Ce client nécessite un terminal interactif.");
  process.exit(1);
}

const client = new net.Socket();
const MAX_MESSAGE_BYTES = 8192;

let pending = "";
let connected = false;
let quitting = false;
let finished = false;
let exitCode = 0;
let quitTimer;

client.setEncoding("utf8");

const screen = blessed.screen({
  smartCSR: true,
  title: `Messagerie TCP - ${name}`,
});

const header = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  border: { type: "line" },
  tags: false,
  content: ` ${name} | ${HOST}:${PORT} | Connexion...`,
  style: {
    fg: "white",
    border: { fg: "cyan" },
  },
});

const output = blessed.log({
  parent: screen,
  top: 3,
  bottom: 4,
  left: 0,
  width: "100%",
  label: " Messages ",
  border: { type: "line" },
  tags: false,
  mouse: true,
  keys: false,
  scrollable: true,
  alwaysScroll: true,
  scrollback: 1000,
  scrollbar: {
    ch: " ",
    style: { bg: "cyan" },
  },
  style: {
    fg: "white",
    border: { fg: "blue" },
  },
});

const input = blessed.textbox({
  parent: screen,
  bottom: 1,
  left: 0,
  width: "100%",
  height: 3,
  label: " Commande — Entrée pour envoyer ",
  border: { type: "line" },
  inputOnFocus: false,
  keys: true,
  mouse: true,
  tags: false,
  style: {
    fg: "white",
    border: { fg: "green" },
  },
});

blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  width: "100%",
  height: 1,
  tags: false,
  content: " aide : commandes | q : quitter | Ctrl+C : fermer",
  style: {
    fg: "black",
    bg: "cyan",
  },
});

// Évite que du contenu reçu soit interprété comme des séquences terminal.
function safeText(value) {
  return String(value ?? "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

function writeLine(text) {
  if (finished) return;

  output.log(safeText(text));
  screen.render();
}

function updateStatus(status) {
  if (finished) return;

  header.setContent(
    ` ${safeText(name)} | ${safeText(HOST)}:${PORT} | ${status}`,
  );

  screen.render();
}

function showHelp() {
  [
    "Commandes disponibles :",
    "s;destinataire;message | b;message | ls | q",
    "cg;groupe | groups | j;groupe | members;groupe | leave;groupe",
    "bg;groupe;message | messages;groupe",
    "invite;groupe;utilisateur",
    "kick;groupe;utilisateur;raison",
    "ban;groupe;utilisateur;raison | unban;groupe;utilisateur",
    "states;groupe",
    "aide : afficher cette liste",
  ].forEach(writeLine);
}

function finish(code = exitCode) {
  if (finished) return;

  finished = true;
  clearTimeout(quitTimer);
  client.destroy();
  screen.destroy();
  process.exitCode = code;
}

function sendMessage(message) {
  if (!connected || client.destroyed || client.writableEnded) {
    writeLine("Connexion indisponible.");
    return false;
  }

  client.write(JSON.stringify(message) + "\n");
  return true;
}

function requestQuit() {
  if (quitting || finished) return;

  quitting = true;
  updateStatus("Déconnexion...");

  if (!connected || client.destroyed || client.writableEnded) {
    finish();
    return;
  }

  sendMessage(buildClientQuit(name));

  // Fermeture de secours si le serveur ne termine pas la connexion.
  quitTimer = setTimeout(() => finish(), 1500);
}

function handleMessage(message) {
  if (
    message === null ||
    typeof message !== "object" ||
    Array.isArray(message)
  ) {
    throw new Error("Objet de réponse attendu.");
  }

  if (message.action === "server-hello") {
    writeLine(message.msg);
  } else if (message.action === "server-message") {
    writeLine(`[Privé] <${message.sender}> ${message.msg}`);
  } else if (message.action === "server-broadcast") {
    writeLine(`[À tous] <${message.sender}> ${message.msg}`);
  } else if (message.action === "server-clients") {
    writeLine(
      `Utilisateurs connectés : ${message.clients.join(", ")}`,
    );
  } else if (message.action === "server-goodbye") {
    writeLine(message.msg);
    quitting = true;
    client.end();
  } else if (message.action === "server-error") {
    writeLine(`[Erreur] ${message.msg}`);
  } else if (message.action === "server-group-created") {
    writeLine(message.msg);
  } else if (message.action === "server-groups") {
    writeLine(
      `Groupes disponibles : ${message.groups.join(", ")}`,
    );
  } else if (message.action === "server-group-joined") {
    writeLine(message.msg);
  } else if (message.action === "server-group-left") {
    writeLine(message.msg);
  } else if (message.action === "server-members") {
    writeLine(
      `Membres de ${message.group} : ${message.members.join(", ")}`,
    );
  } else if (message.action === "server-group-message") {
    writeLine(
      `[${message.group}] <${message.sender}> ${message.msg}`,
    );
  } else if (message.action === "server-group-messages") {
    // Historique des messages d'un groupe
    writeLine(`Historique de ${message.group} :`);

    for (const item of message.messages) {
      const date = item.date || "date inconnue";

      writeLine(`[${date}] <${item.sender}> ${item.msg}`);
    }
  } else if (message.action === "server-group-invited") {
    writeLine(message.msg);
  } else if (message.action === "server-group-invitation") {
    writeLine(message.msg);
  } else if (message.action === "server-group-kicked") {
    writeLine(message.msg);
  } else if (message.action === "server-group-banned") {
    writeLine(message.msg);
  } else if (message.action === "server-group-unbanned") {
    writeLine(message.msg);
  } else if (message.action === "server-group-states") {
    writeLine(`Événements de ${message.group} :`);

    for (const event of message.states) {
      const details = event.details || {};

      const destination = details.dest
        ? ` (${details.dest})`
        : "";

      const reason = details.reason
        ? ` - ${details.reason}`
        : "";

      writeLine(
        `[${event.timestamp}] ${event.actor} -> ` +
          `${event.type}${destination}${reason}`,
      );
    }
  } else {
    writeLine(`Received: ${JSON.stringify(message)}`);
  }
}

client.on("connect", () => {
  connected = true;

  updateStatus("Connecté");
  writeLine("Connecté au serveur");

  // Présentation automatique auprès du serveur.
  sendMessage(buildClientHello(name));
});

client.on("data", (chunk) => {
  pending += chunk;

  let newline;

  while ((newline = pending.indexOf("\n")) !== -1) {
    const line = pending.slice(0, newline);
    pending = pending.slice(newline + 1);

    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
      writeLine("Réponse trop longue.");
      exitCode = 1;
      client.destroy();
      return;
    }

    let message;

    try {
      message = JSON.parse(line);
    } catch (error) {
      writeLine("Réponse JSON invalide.");
      writeLine(`Ligne reçue : ${JSON.stringify(line)}`);
      writeLine(`Erreur : ${error.message}`);
      continue;
    }

    try {
      handleMessage(message);
    } catch (error) {
      writeLine(`Réponse inattendue : ${error.message}`);
    }
  }

  if (Buffer.byteLength(pending, "utf8") > MAX_MESSAGE_BYTES) {
    writeLine("Réponse incomplète trop longue.");
    exitCode = 1;
    client.destroy();
  }
});

client.on("error", (error) => {
  exitCode = 1;
  writeLine(`Connection error: ${error.message}`);
});

client.on("close", () => {
  connected = false;
  clearTimeout(quitTimer);

  if (finished) return;

  if (quitting) {
    finish();
    return;
  }

  updateStatus("Déconnecté");
  writeLine("Disconnected");
  writeLine("Tape q ou utilise Ctrl+C pour fermer cette fenêtre.");
});

const simpleCommands = {
  ls: buildClientListClients,
  groups: buildClientListGroups,
};

const groupCommands = {
  cg: {
    build: buildClientCreateGroup,
    usage: "cg;nom_du_groupe",
  },
  j: {
    build: buildClientJoinGroup,
    usage: "j;nom_du_groupe",
  },
  members: {
    build: buildClientListMembers,
    usage: "members;nom_du_groupe",
  },
  leave: {
    build: buildClientLeaveGroup,
    usage: "leave;nom_du_groupe",
  },
  messages: {
    build: buildClientListGroupMessages,
    usage: "messages;nom_du_groupe",
  },
  states: {
    build: buildClientListGroupStates,
    usage: "states;nom_du_groupe",
  },
};

const memberCommands = {
  invite: {
    build: buildClientInvite,
    usage: "invite;groupe;utilisateur",
  },
  unban: {
    build: buildClientUnban,
    usage: "unban;groupe;utilisateur",
  },
};

const moderationCommands = {
  kick: buildClientKick,
  ban: buildClientBan,
};

function handleCommand(line) {
  const command = line.trim();

  if (command === "") return;

  const parts = command.split(";");
  const action = parts[0].trim();

  if (action === "aide") {
    showHelp();
    return;
  }

  if (action === "q") {
    requestQuit();
    return;
  }

  if (quitting) {
    writeLine("Déconnexion en cours...");
    return;
  }

  if (!connected || client.destroyed || client.writableEnded) {
    writeLine("Le client n'est pas connecté au serveur.");
    return;
  }

  if (action === "s") {
    const destination = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!destination || !text) {
      writeLine("Usage : s;destinataire;message");
      return;
    }

    sendMessage(buildClientSend(name, destination, text));
    return;
  }

  if (action === "b") {
    const text = parts.slice(1).join(";").trim();

    if (!text) {
      writeLine("Usage : b;message");
      return;
    }

    sendMessage(buildClientBroadcast(name, text));
    return;
  }

  if (action === "bg") {
    const groupName = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!groupName || !text) {
      writeLine("Usage : bg;nom_du_groupe;message");
      return;
    }

    sendMessage(buildClientGroupBroadcast(name, groupName, text));
    return;
  }

  if (Object.prototype.hasOwnProperty.call(simpleCommands, action)) {
    sendMessage(simpleCommands[action](name));
    return;
  }

  if (Object.prototype.hasOwnProperty.call(groupCommands, action)) {
    const groupName = parts[1]?.trim();
    const { build, usage } = groupCommands[action];

    if (!groupName) {
      writeLine(`Usage : ${usage}`);
      return;
    }

    sendMessage(build(name, groupName));
    return;
  }

  if (Object.prototype.hasOwnProperty.call(memberCommands, action)) {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const { build, usage } = memberCommands[action];

    if (!groupName || !destination) {
      writeLine(`Usage : ${usage}`);
      return;
    }

    sendMessage(build(name, groupName, destination));
    return;
  }

  if (Object.prototype.hasOwnProperty.call(moderationCommands, action)) {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";

    if (!groupName || !destination) {
      writeLine(`Usage : ${action};groupe;utilisateur;raison`);
      return;
    }

    sendMessage(
      moderationCommands[action](name, groupName, destination, reason),
    );
    return;
  }

  writeLine("Commande inconnue. Tape aide pour la liste.");
}

input.on("click", () => {
  resumeInput();
});

function resumeInput() {
  if (finished) return;

  input.focus();
  input.readInput();
  screen.render();
}

input.on("submit", (line) => {
  input.clearValue();

  if (line.trim() !== "") {
    writeLine(`> ${line}`);
  }

  try {
    handleCommand(line);
  } catch (error) {
    writeLine(`Erreur de commande : ${error.message}`);
  }

  setImmediate(resumeInput);
});

input.on("cancel", () => {
  setImmediate(resumeInput);
});

screen.key(["C-c"], requestQuit);
process.on("SIGINT", requestQuit);
process.on("SIGTERM", () => finish());

updateStatus("Connexion...");
writeLine("Tape aide pour afficher les commandes.");

resumeInput();
client.connect(PORT, HOST);

