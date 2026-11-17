// Client TLS de la messagerie.
// TLS assure le chiffrement, l'intégrité et l'authentification du serveur.
// Le client peut créer un compte, se connecter et consulter son historique.

const tls = require("node:tls");
const fs = require("node:fs");
const readline = require("node:readline");
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
  buildClientHistory,
} = require("../common/messages");

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
const PORT = Number(process.env.SERVER_PORT || "8443");

// Repère : le client vérifie le certificat du serveur.
const client = tls.connect(
  {
    host: HOST,
    port: PORT,
    ca: fs.readFileSync("certs/server-cert.pem"),
    servername: "localhost",
    rejectUnauthorized: true,
  },
  () => {
    console.log(kleur.green("Connexion TLS établie."));

    console.log(
      "Utilisez register;motdepasse ou login;motdepasse.",
    );
  },
);

// Envoi d'un message JSON terminé par un retour à la ligne.
function send(message) {
  client.write(JSON.stringify(message) + "\n");
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: ">",
});

// Repère : réception et affichage des réponses du serveur.
client.on("data", (chunk) => {
  const lines = chunk.toString("utf8").split("\n");

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    try {
      const message = JSON.parse(line);

      if (message.action === "auth-result") {
        if (message.ok) {
          if (message.code === "authenticated") {
            console.log(kleur.green("Authentification réussie."));
          } else if (message.code === "registered") {
            console.log(
              kleur.green(
                "Compte créé. Connecte-toi avec login;motdepasse.",
              ),
            );
          }
        } else {
          console.error(
            kleur.red(`Authentification refusée : ${message.code}`),
          );
        }
      } else if (message.action === "server-hello") {
        console.log(kleur.green(message.msg));
      } else if (message.action === "server-error") {
        console.error(kleur.red(message.msg));
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
      } else if (message.action === "server-history") {
        console.log(kleur.blue("Historique du compte :"));

        for (const item of message.items) {
          console.log(
            kleur.cyan(
              `[${item.date}] <${item.sender || "inconnu"}> ${item.msg || ""}`,
            ),
          );
        }
      } else if (message.action === "server-goodbye") {
        console.log(kleur.green(message.msg));
        client.end();
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
          kleur.cyan(
            `[${message.group}] <${message.sender}> ${message.msg}`,
          ),
        );
      } else if (message.action === "server-group-messages") {
        console.log(kleur.blue(`Historique de ${message.group} :`));

        for (const item of message.messages) {
          console.log(
            kleur.cyan(
              `[${item.date || "date inconnue"}] <${item.sender}> ${item.msg}`,
            ),
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
          console.log(kleur.yellow(JSON.stringify(event)));
        }
      } else {
        console.error(
          kleur.red(`Action serveur inconnue : ${message.action}`),
        );
      }
    } catch (error) {
      console.error(
        kleur.red(`Message TLS invalide : ${error.message}`),
      );
    }
  }
});

client.on("error", (error) => {
  console.error(kleur.red(`Erreur TLS : ${error.message}`));
});

client.on("close", () => {
  console.log("Disconnected");
  rl.close();
});

// Repère : commandes utilisateur.
rl.on("line", (line) => {
  const parts = line.split(";");
  const command = parts[0].trim();

  if (command === "q") {
    send(buildClientQuit(name));
    client.end();
    rl.close();
    return;
  }

  // Inscription d'un compte.
  if (command === "register") {
    const password = parts.slice(1).join(";").trim();

    if (!password) {
      console.log("Usage : register;motdepasse");
    } else {
      send({
        action: "register",
        name,
        password,
      });
    }

    rl.prompt();
    return;
  }

  // Connexion à un compte.
  if (command === "login") {
    const password = parts.slice(1).join(";").trim();

    if (!password) {
      console.log("Usage : login;motdepasse");
    } else {
      send({
        action: "auth",
        name,
        password,
      });
    }

    rl.prompt();
    return;
  }

  // Historique du compte authentifié.
  if (command === "history") {
    send(buildClientHistory(50));
    rl.prompt();
    return;
  }

  if (command === "ls") {
    send(buildClientListClients(name));
  } else if (command === "s") {
    const destination = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!destination || !text) {
      console.log("Usage : s;destinataire;message");
    } else {
      send(buildClientSend(name, destination, text));
    }
  } else if (command === "b") {
    const text = parts.slice(1).join(";").trim();

    if (!text) {
      console.log("Usage : b;message");
    } else {
      send(buildClientBroadcast(name, text));
    }
  } else if (command === "cg") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : cg;nom_du_groupe");
    } else {
      send(buildClientCreateGroup(name, groupName));
    }
  } else if (command === "groups") {
    send(buildClientListGroups(name));
  } else if (command === "j") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : j;nom_du_groupe");
    } else {
      send(buildClientJoinGroup(name, groupName));
    }
  } else if (command === "members") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : members;nom_du_groupe");
    } else {
      send(buildClientListMembers(name, groupName));
    }
  } else if (command === "leave") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : leave;nom_du_groupe");
    } else {
      send(buildClientLeaveGroup(name, groupName));
    }
  } else if (command === "bg") {
    const groupName = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!groupName || !text) {
      console.log("Usage : bg;nom_du_groupe;message");
    } else {
      send(buildClientGroupBroadcast(name, groupName, text));
    }
  } else if (command === "messages") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : messages;nom_du_groupe");
    } else {
      send(buildClientListGroupMessages(name, groupName));
    }
  } else if (command === "invite") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();

    if (!groupName || !destination) {
      console.log("Usage : invite;nom_du_groupe;utilisateur");
    } else {
      send(buildClientInvite(name, groupName, destination));
    }
  } else if (command === "kick") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";

    if (!groupName || !destination) {
      console.log("Usage : kick;groupe;utilisateur;raison");
    } else {
      send(buildClientKick(name, groupName, destination, reason));
    }
  } else if (command === "ban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";

    if (!groupName || !destination) {
      console.log("Usage : ban;groupe;utilisateur;raison");
    } else {
      send(buildClientBan(name, groupName, destination, reason));
    }
  } else if (command === "unban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();

    if (!groupName || !destination) {
      console.log("Usage : unban;groupe;utilisateur");
    } else {
      send(buildClientUnban(name, groupName, destination));
    }
  } else if (command === "states") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : states;nom_du_groupe");
    } else {
      send(buildClientListGroupStates(name, groupName));
    }
  } else {
    console.log(
      "Commande inconnue. Utilisez register;motdepasse, login;motdepasse, history, ls, s;dest;message, b;message, q, cg;groupe, groups, j;groupe, members;groupe ou leave;groupe.",
    );
  }

  rl.prompt();
});

rl.on("close", () => {
  if (!client.destroyed) {
    client.end();
  }
});