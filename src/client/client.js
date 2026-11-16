// Client de messagerie TCP.
// Négociation ECDH et dérivation HKDF.
// Les commandes métier restent bloquées tant que le canal
// chiffré et authentifié n'est pas disponible.

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

  echange = null;
  clientNonce = null;
  serverNonce = null;
  pending = "";
  etatNegociation = "ferme";
}


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: ">",
});


const {
  createKeyExchange,
  deriverClesSession,
  encoderEnveloppe,
  extraireEnveloppes,
} = require("../common/crypto");

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
  } catch {
    console.error(kleur.red("Échec de la négociation."));
    client.destroy();
  }
});


// Réception, cadrage et traitement des messages JSON.
client.on("data", (chunk) => {
  try {
    pending = Buffer.concat([pending, chunk]);

    const resultat = extraireEnveloppes(pending);

    pending = resultat.reste;

    for (const message of resultat.enveloppes) {
      if (etatNegociation !== "attente-cle") {
        console.error(kleur.red("Message inattendu."));
        client.destroy();
        return;
      }

      try {
        const donnees = validateServerKey(message);

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

        etatNegociation = "ecdh-termine";
        clearTimeout(delaiNegociation);
        echange = null;

        console.log(
          kleur.green(
            "ECDH et HKDF terminés : clés de session calculées.",
          ),
        );

        console.log(
          "Le canal chiffré n'est pas encore disponible. Tape q pour fermer.",
        );

        rl.prompt();
      } catch {
        console.error(kleur.red("Échec de la négociation."));
        client.destroy();
        return;
      }
    }
  } catch {
    console.error(kleur.red("Message ou cadrage invalide."));
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

// Commandes bloquées avant l'intégration du canal protégé.
rl.on("line", (line) => {
  if (line.trim() === "q") {
    client.end();
    rl.close();
    return;
  }

  console.log(
    "Commandes indisponibles : chiffrement et intégrité non encore intégrés.",
  );

  rl.prompt();
});

rl.on("close", () => {
  if (!client.destroyed) {
    client.end();
  }
});

client.connect(PORT, HOST);