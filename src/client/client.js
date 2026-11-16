const kleur = require("kleur");
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
  buildClientKey,
  buildClientRegister,
  buildClientAuth,
} = require("../common/messages");
const cryptoTools = require("../common/crypto");

const net = require("node:net");
const readline = require("node:readline");

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

const SECURE_CHANNEL = process.env.SECURE_CHANNEL === "1";
let keyPair = null;
let channel = null;
let authenticated = !SECURE_CHANNEL;

const client = new net.Socket();
const MAX_MESSAGE_BYTES = 8192;
let pending = "";

client.setEncoding("utf8");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: ">",
});

function writeLine(text) {
  const clear = text.replace(/\n$/, "");

  client.write((channel ? channel.seal(clear) : clear) + "\n");
}

const AUTH_MESSAGES = {
  registered: "Compte créé. Connectez-vous avec login;mot_de_passe.",
  authenticated: "Authentifié.",
  "invalid-name": "Nom invalide (30 caractères max : lettres, chiffres, - ou _).",
  "invalid-password": "Mot de passe invalide (8 caractères minimum, 72 octets maximum).",
  "name-taken": "Ce nom est déjà utilisé.",
  "bad-credentials": "Nom ou mot de passe invalide.",
  "insecure-channel": "Canal non sécurisé : refusé par le serveur.",
  "already-authenticated": "Vous êtes déjà authentifié.",
  "already-online": "Ce compte est déjà connecté ailleurs.",
  busy: "Une demande est déjà en cours, patientez.",
  "server-error": "Erreur du serveur, réessayez plus tard.",
};

client.on("connect", () => {
  console.log(kleur.green("Connecté au serveur"));

  if (SECURE_CHANNEL) {
    keyPair = cryptoTools.generateKeyPair();
    writeLine(JSON.stringify(buildClientKey(keyPair.publicKey)) + "\n");
  } else {
    writeLine(JSON.stringify(buildClientHello(name)) + "\n");
  }

  rl.prompt();
});

client.on("data", (chunk) => {
  pending += chunk;

  let newline;

  while ((newline = pending.indexOf("\n")) !== -1) {
    let line = pending.slice(0, newline);
    pending = pending.slice(newline + 1);

    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
      console.error(kleur.red("Réponse trop longue."));
      client.destroy();
      return;
    }

    if (channel) {
      try {
        line = channel.open(line);
      } catch {
        console.error(kleur.red("Message du serveur illisible : connexion fermée."));
        client.destroy();
        return;
      }
    }

    try {
      const message = JSON.parse(line);

      if (message.action === "server-key") {
        try {
          channel = cryptoTools.createChannel(
            keyPair.privateKey,
            keyPair.publicKey,
            message.key,
            "client",
          );
        } catch {
          console.error(kleur.red("Clé du serveur invalide."));
          client.destroy();
          process.exitCode = 1;
          return;
        }

        console.log(kleur.green("Canal chiffré établi."));
        console.log(
          kleur.blue("Utilisez register;mot_de_passe puis login;mot_de_passe (identifiant : " + name + ")."),
        );
      } else if (message.action === "auth-result") {
        const text = AUTH_MESSAGES[message.code] || message.code;

        if (message.ok) {
          console.log(kleur.green(text));
          if (message.code === "authenticated") authenticated = true;
        } else {
          console.error(kleur.red(text));
        }
      } else if (message.action === "server-hello") {
        console.log(kleur.green(message.msg));
      } else if (message.action === "server-message") {
        console.log(
          kleur.cyan(`[Privé] <${message.sender}> ${message.msg}`),
        );
      } else if (message.action === "server-broadcast") {
        console.log(
          kleur.yellow(`[À tous] <${message.sender}> ${message.msg}`),
        );
      } else if (message.action === "server-clients") {
        console.log(
          kleur.blue("Utilisateurs connectés :"),
          message.clients.join(", "),
        );
      } else if (message.action === "server-goodbye") {
        console.log(kleur.green(message.msg));
        client.end();
      } else if (message.action === "server-error") {
        console.error(kleur.red(message.msg));
      } else if (message.action === "server-group-created") {
        console.log(kleur.green(message.msg));
      } else if (message.action === "server-groups") {
        console.log(
          kleur.blue("Groupes disponibles :"),
          message.groups.join(", "),
        );
      } else if (message.action === "server-group-joined") {
        console.log(kleur.green(message.msg));
      } else if (message.action === "server-group-left") {
        console.log(kleur.yellow(message.msg));
      } else if (message.action === "server-members") {
        console.log(
          kleur.blue(`Membres de ${message.group} :`),
          message.members.join(", "),
        );
      } else if (message.action === "server-group-message") {
        console.log(
          kleur.cyan(`[${message.group}] <${message.sender}> ${message.msg}`),
        );
      } else if (message.action === "server-group-messages") { // Historique des messages d'un groupe
        console.log(kleur.blue(`Historique de ${message.group} :`));

        for (const item of message.messages) {
          const date = item.date || "date inconnue";

          console.log(kleur.cyan(`[${date}] <${item.sender}> ${item.msg}`),
          );
        }
      } else if (message.action === "server-group-invited") {
        console.log(kleur.green(message.msg));
      } else if (message.action === "server-group-invitation") {
        console.log(kleur.magenta(message.msg));
      } else if (message.action === "server-group-kicked") {
        console.log(kleur.yellow(message.msg));
      } else if (message.action === "server-group-banned") {
        console.log(kleur.red(message.msg));
      } else if (message.action === "server-group-unbanned") {
        console.log(kleur.green(message.msg));
      } else if (message.action === "server-group-states") {
        console.log(kleur.blue(`Événements de ${message.group} :`));

        for (const event of message.states) {
          const destination = event.details.dest
            ? ` (${event.details.dest})`
            : "";
          const reason = event.details.reason
            ? ` - ${event.details.reason}`
            : "";

          console.log(
            kleur.yellow(
              `[${event.timestamp}] ${event.actor} -> ${event.type}${destination}${reason}`,
            ),
          );
        }
      } else {
        console.log("Received:", message);
      }
    } catch (error) {
      console.error(kleur.red("Réponse JSON invalide."));
      console.error(kleur.yellow("Ligne reçue :"), JSON.stringify(line));
      console.error(kleur.yellow("Erreur :"), error.message);
    }

    rl.prompt();
  }

  if (Buffer.byteLength(pending, "utf8") > MAX_MESSAGE_BYTES) {
    console.error(kleur.red("Réponse incomplète trop longue."));
    client.destroy();
  }
});

client.on("error", (error) => {
  console.error(kleur.red(`Connection error: ${error.message}`));
});

client.on("close", () => {
  console.log("Disconnected");
  rl.close();
});

rl.on("line", (line) => {
  const command = line.trim();

  if (command === "") {
    rl.prompt();
    return;
  }

  const parts = line.split(";");

  if (SECURE_CHANNEL && !authenticated && !["register", "login", "q"].includes(parts[0])) {
    console.log("Authentification requise : register;mot_de_passe ou login;mot_de_passe.");
  } else if (parts[0] === "register" || parts[0] === "login") {
    const password = parts.slice(1).join(";");

    if (!SECURE_CHANNEL) {
      console.log("Commande disponible seulement avec SECURE_CHANNEL=1.");
    } else if (!channel) {
      console.log("Canal chiffré pas encore établi.");
    } else if (!password) {
      console.log(`Usage : ${parts[0]};mot_de_passe`);
    } else {
      const build = parts[0] === "register" ? buildClientRegister : buildClientAuth;

      writeLine(JSON.stringify(build(name, password)) + "\n");
    }
  } else if (parts[0] === "s") {
    const destination = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!destination || !text) {
      console.log("Usage : s;destinataire;message");
    } else {
      writeLine(
        JSON.stringify(buildClientSend(name, destination, text)) + "\n",
      );
    }
  } else if (parts[0] === "b") {
    const text = parts.slice(1).join(";").trim();

    if (!text) {
      console.log("Usage : b;message");
    } else {
      writeLine(JSON.stringify(buildClientBroadcast(name, text)) + "\n");
    }
  } else if (parts[0] === "ls") {
    writeLine(JSON.stringify(buildClientListClients(name)) + "\n");
  } else if (parts[0] === "q") {
    writeLine(JSON.stringify(buildClientQuit(name)) + "\n");
  } else if (parts[0] === "cg") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : cg;nom_du_groupe");
    } else {
      writeLine(
        JSON.stringify(buildClientCreateGroup(name, groupName)) + "\n",
      );
    }
  } else if (parts[0] === "groups") {
    writeLine(JSON.stringify(buildClientListGroups(name)) + "\n");
  } else if (parts[0] === "j") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : j;nom_du_groupe");
    } else {
      writeLine(
        JSON.stringify(buildClientJoinGroup(name, groupName)) + "\n",
      );
    }
  } else if (parts[0] === "members") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : members;nom_du_groupe");
    } else {
      writeLine(
        JSON.stringify(buildClientListMembers(name, groupName)) + "\n",
      );
    }
  } else if (parts[0] === "leave") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : leave;nom_du_groupe");
    } else {
      writeLine(
        JSON.stringify(buildClientLeaveGroup(name, groupName)) + "\n",
      );
    }
  } else if (parts[0] === "bg") {
    const groupName = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!groupName || !text) {
      console.log("Usage : bg;nom_du_groupe;message");
    } else {
      writeLine(
        JSON.stringify(buildClientGroupBroadcast(name, groupName, text)) + "\n",
      );
    }
  } else if (parts[0] === "messages") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : messages;nom_du_groupe");
    } else {
      writeLine(
        JSON.stringify(buildClientListGroupMessages(name, groupName)) + "\n",
      );
    }
  } else if (parts[0] === "invite") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();

    if (!groupName || !destination) {
      console.log("Usage : invite;nom_du_groupe;utilisateur");
    } else {
      writeLine(
        JSON.stringify(buildClientInvite(name, groupName, destination)) + "\n",
      );
    }
  } else if (parts[0] === "kick") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";

    if (!groupName || !destination) {
      console.log("Usage : kick;groupe;utilisateur;raison");
    } else {
      writeLine(
        JSON.stringify(buildClientKick(name, groupName, destination, reason)) +
        "\n",
      );
    }
  } else if (parts[0] === "ban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";

    if (!groupName || !destination) {
      console.log("Usage : ban;groupe;utilisateur;raison");
    } else {
      writeLine(
        JSON.stringify(buildClientBan(name, groupName, destination, reason)) +
        "\n",
      );
    }
  } else if (parts[0] === "unban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();

    if (!groupName || !destination) {
      console.log("Usage : unban;groupe;utilisateur");
    } else {
      writeLine(
        JSON.stringify(buildClientUnban(name, groupName, destination)) + "\n",
      );
    }
  } else if (parts[0] === "states") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : states;nom_du_groupe");
    } else {
      writeLine(
        JSON.stringify(buildClientListGroupStates(name, groupName)) + "\n",
      );
    }
  } else {
    console.log(
      "Commande inconnue. Utilisez s;destinataire;message, b;message, ls, q, cg;groupe, groups, j;groupe, members;groupe ou leave;groupe.",
    );
  }

  rl.prompt();
});

rl.on("close", () => {
  if (!client.destroyed) {
    client.end();
  }
});

client.connect(PORT, HOST);
