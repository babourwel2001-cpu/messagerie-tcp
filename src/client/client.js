// Client de messagerie TCP.
// Négociation ECDH et dérivation HKDF.
// Les commandes métier restent bloquées tant que le canal
// chiffré et authentifié n'est pas disponible.

const {
  buildClientHistory,
} = require("../common/messages");

const kleur = require("kleur");
const {
  buildClientKey,
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

const client = new net.Socket();
const MAX_MESSAGE_BYTES = 8192;

// Tampon pour les données TCP reçues en plusieurs morceaux.
let pending = Buffer.alloc(0);

// Négociation ECDH.
let etatNegociation = "connexion";
let echange = null;
let secretPartage = null;
let clientNonce = null;
let serverNonce = null;

// Clés dérivées avec HKDF.
let clesSession = null;

// Séquences indépendantes dans chaque direction.
let sequenceClient = null;
let sequenceServeur = null;
let authentifie = false;

let delaiNegociation = null;

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

  sequenceClient = null;
  sequenceServeur = null;
  echange = null;
  clientNonce = null;
  serverNonce = null;
  pending = Buffer.alloc(0);
  etatNegociation = "ferme";
}

// Chiffre et authentifie un message applicatif avant l'envoi.
function envoyerProtege(message) {
  const enveloppe = creerEnveloppe(
    clesSession,
    name,
    "server",
    sequenceClient.prochaine(),
    JSON.stringify(message),
  );

  client.write(encoderEnveloppe(enveloppe));
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: ">",
});

const {
  createKeyExchange,
  deriverClesSession,
  creerEnveloppe,
  ouvrirEnveloppe,
  creerSequence,
  encoderEnveloppe,
  extraireEnveloppes,
} = require("../common/crypto");

// Séquence locale, propre à une direction et à une connexion.
function creerCompteurSequence() {
  let valeur = 0;

  return {
    prochaine() {
      valeur += 1;
      return valeur;
    },
    verifier(sequence) {
      if (sequence !== valeur + 1) {
        throw new Error(
          `Séquence invalide : attendu ${valeur + 1}, reçu ${sequence}`,
        );
      }

      valeur += 1;
    },
  };
}

const {
  validateServerKey,
} = require("../common/negociation");

// Envoi de la clé publique et du nonce du client.
client.on("connect", () => {
  console.log(kleur.green("Connexion TCP établie."));

  try {
    echange = createKeyExchange();
    clientNonce = Buffer.from(echange.nonce, "base64");

    etatNegociation = "attente-cle";

    delaiNegociation = setTimeout(() => {
      console.error(kleur.red("Délai de négociation dépassé."));
      client.destroy();
    }, 10000);

    const message = buildClientKey(
      echange.publicKey,
      echange.nonce,
    );

    client.write(encoderEnveloppe(message));

    console.log("Clé publique envoyée. Attente du serveur...");
  } catch (error) {
    console.error(
      kleur.red(`Échec de la négociation : ${error.message}`),
    );

    client.destroy();
  }
});

// Réception, cadrage et traitement des messages protégés.
client.on("data", (chunk) => {
  try {
    pending = Buffer.concat([pending, chunk]);

    const resultat = extraireEnveloppes(pending);

    pending = resultat.reste;

    for (const enveloppe of resultat.enveloppes) {
      if (etatNegociation === "attente-cle") {
        try {
          const donnees = validateServerKey(enveloppe);

          serverNonce = donnees.nonce;

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

          etatNegociation = "canal-actif";
          clearTimeout(delaiNegociation);
          echange = null;

          sequenceClient = creerCompteurSequence();
          sequenceServeur = creerCompteurSequence();

          console.log(
            "Canal protégé établi. Utilisez register;motdepasse ou login;motdepasse.",
          );
        } catch (error) {
          console.error(
            kleur.red(`Échec de la négociation : ${error.message}`),
          );

          client.destroy();
          return;
        }

        continue;
      }

      if (etatNegociation !== "canal-actif") {
        console.error(kleur.red("Message inattendu."));
        client.destroy();
        return;
      }

      try {
        sequenceServeur.verifier(enveloppe.sequence);

        const message = JSON.parse(
          ouvrirEnveloppe(clesSession, enveloppe),
        );


        if (message.action === "server-hello") {
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
            const date = item.date || "date inconnue";

            console.log(
              kleur.cyan(`[${date}] <${item.sender}> ${item.msg}`),
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
        } else if (message.action === "auth-result") {
          if (message.ok) {
            if (message.code === "authenticated") {
              authentifie = true;
              console.log(kleur.green("Authentification réussie."));
            } else if (message.code === "registered") {
              console.log(kleur.green("Compte créé. Connecte-toi avec login;motdepasse."));
            }
          } else {
            console.error(kleur.red(`Authentification refusée : ${message.code}`));
          }
        } else if (message.action === "server-history") {
          console.log(kleur.blue("Historique du compte :"));

          for (const item of message.items) {
            console.log(
              kleur.cyan(
                `[${item.date}] <${item.sender || "inconnu"}> ${item.msg || ""}`,
              ),
            );
          }
        }

        else {
          console.error(
            kleur.red(`Action serveur inconnue : ${message.action}`),
          );
        }
      } catch (error) {
        console.error(
          kleur.red(
            `Message protégé invalide : ${error.message}`,
          ),
        );

        client.destroy();
        return;
      }

      rl.prompt();
    }
  } catch (error) {
    console.error(
      kleur.red(
        `Message ou cadrage invalide : ${error.message}`,
      ),
    );

    client.destroy();
  }
});

client.on("error", (error) => {
  console.error(kleur.red(`Connection error: ${error.message}`));
  nettoyerNegociation();
});

client.on("close", () => {
  console.log("Disconnected");
  rl.close();
  nettoyerNegociation();
});

// Commandes envoyées dans une enveloppe chiffrée et authentifiée.
rl.on("line", (line) => {
  if (line.trim() === "q") {
    envoyerProtege(
      buildClientQuit(name),
    );

    client.end();
    rl.close();
    return;
  }

  if (etatNegociation !== "canal-actif") {
    console.log(
      "Le canal protégé n'est pas encore disponible.",
    );

    rl.prompt();
    return;
  }

  const command = line.trim();

  if (command === "") {
    rl.prompt();
    return;
  }

  const parts = line.split(";");

  if (parts[0] === "s") {
    const destination = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!destination || !text) {
      console.log("Usage : s;destinataire;message");
    } else {
      envoyerProtege(
        buildClientSend(name, destination, text),
      );
    }
  } else if (parts[0] === "b") {
    const text = parts.slice(1).join(";").trim();

    if (!text) {
      console.log("Usage : b;message");
    } else {
      envoyerProtege(
        buildClientBroadcast(name, text),
      );
    }
  } else if (parts[0] === "ls") {
    envoyerProtege(
      buildClientListClients(name),
    );
  } else if (parts[0] === "cg") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : cg;nom_du_groupe");
    } else {
      envoyerProtege(
        buildClientCreateGroup(name, groupName),
      );
    }
  } else if (parts[0] === "groups") {
    envoyerProtege(
      buildClientListGroups(name),
    );
  } else if (parts[0] === "j") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : j;nom_du_groupe");
    } else {
      envoyerProtege(
        buildClientJoinGroup(name, groupName),
      );
    }
  } else if (parts[0] === "members") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : members;nom_du_groupe");
    } else {
      envoyerProtege(
        buildClientListMembers(name, groupName),
      );
    }
  } else if (parts[0] === "leave") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : leave;nom_du_groupe");
    } else {
      envoyerProtege(
        buildClientLeaveGroup(name, groupName),
      );
    }
  } else if (parts[0] === "bg") {
    const groupName = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!groupName || !text) {
      console.log("Usage : bg;nom_du_groupe;message");
    } else {
      envoyerProtege(
        buildClientGroupBroadcast(name, groupName, text),
      );
    }
  } else if (parts[0] === "messages") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : messages;nom_du_groupe");
    } else {
      envoyerProtege(
        buildClientListGroupMessages(name, groupName),
      );
    }
  } else if (parts[0] === "invite") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();

    if (!groupName || !destination) {
      console.log("Usage : invite;nom_du_groupe;utilisateur");
    } else {
      envoyerProtege(
        buildClientInvite(name, groupName, destination),
      );
    }
  } else if (parts[0] === "kick") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";

    if (!groupName || !destination) {
      console.log("Usage : kick;groupe;utilisateur;raison");
    } else {
      envoyerProtege(
        buildClientKick(name, groupName, destination, reason),
      );
    }
  } else if (parts[0] === "ban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";

    if (!groupName || !destination) {
      console.log("Usage : ban;groupe;utilisateur;raison");
    } else {
      envoyerProtege(
        buildClientBan(name, groupName, destination, reason),
      );
    }
  } else if (parts[0] === "unban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();

    if (!groupName || !destination) {
      console.log("Usage : unban;groupe;utilisateur");
    } else {
      envoyerProtege(
        buildClientUnban(name, groupName, destination),
      );
    }
  } else if (parts[0] === "states") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : states;nom_du_groupe");
    } else {
      envoyerProtege(
        buildClientListGroupStates(name, groupName),
      );
    }
  } else if (parts[0] === "register") {
    const password = parts.slice(1).join(";").trim();

    if (!password) {
      console.log("Usage : register;motdepasse");
    } else {
      envoyerProtege({
        action: "register",
        name,
        password,
      });
    }
  } else if (parts[0] === "login") {
    const password = parts.slice(1).join(";").trim();

    if (!password) {
      console.log("Usage : login;motdepasse");
    } else {
      envoyerProtege({
        action: "auth",
        name,
        password,
      });
    }
  } else if (parts[0] === "history") {
    envoyerProtege(buildClientHistory(50));
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