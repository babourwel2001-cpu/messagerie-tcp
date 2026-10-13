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
  buildClientLeaveGroup
} = require("../common/messages");

const net = require("node:net");
const readline = require("node:readline");

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");

const argv = yargs(hideBin(process.argv))
  .option("name", {
    type: "string",
    demandOption: true,
    describe: "Nom de l'utilisateur"
  })
  .strict()
  .parse();

const name = argv.name.trim();

if (name === "") {
  console.error("Le nom ne peut pas être vide.");
  process.exit(1);
}

const client = new net.Socket();
const MAX_MESSAGE_BYTES = 8192;
let pending = "";

client.setEncoding("utf8");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: ">"
});

client.on("connect", () => {
  console.log(kleur.green("Connecté au serveur"));

  // Présentation automatique auprès du serveur.
  client.write(JSON.stringify(buildClientHello(name)) + "\n");

  rl.prompt();
});

client.on("data", (chunk) => {
  pending += chunk;

  let newline;

  while ((newline = pending.indexOf("\n")) !== -1) {
    const line = pending.slice(0, newline);
    pending = pending.slice(newline + 1);

    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) {
      console.error(kleur.red("Réponse trop longue."));
      client.destroy();
      return;
    }

    try {
      const message = JSON.parse(line);

      if (message.action === "server-clients") {
        console.log(
          kleur.blue("Utilisateurs connectés :"),
          message.clients.join(", ")
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
          message.groups.join(", ")
        );
      } else if (message.action === "server-group-joined") {
        console.log(kleur.green(message.msg));
      } else if (message.action === "server-group-left") {
        console.log(kleur.yellow(message.msg));
      } else if (message.action === "server-members") {
        console.log(
          kleur.blue(`Membres de ${message.group} :`),
          message.members.join(", ")
        );
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

  if (parts[0] === "s") {
    const destination = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();

    if (!destination || !text) {
      console.log("Usage : s;destinataire;message");
    } else {
      client.write(
        JSON.stringify(buildClientSend(name, destination, text)) + "\n"
      );
    }
  } else if (parts[0] === "b") {
    const text = parts.slice(1).join(";").trim();

    if (!text) {
      console.log("Usage : b;message");
    } else {
      client.write(JSON.stringify(buildClientBroadcast(name, text)) + "\n");
    }
  } else if (parts[0] === "ls") {
    client.write(JSON.stringify(buildClientListClients(name)) + "\n");
  } else if (parts[0] === "q") {
    client.write(JSON.stringify(buildClientQuit(name)) + "\n");
  } else if (parts[0] === "cg") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : cg;nom_du_groupe");
    } else {
      client.write(
        JSON.stringify(buildClientCreateGroup(name, groupName)) + "\n"
      );
    }
  } else if (parts[0] === "groups") {
    client.write(JSON.stringify(buildClientListGroups(name)) + "\n");
  } else if (parts[0] === "j") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : j;nom_du_groupe");
    } else {
      client.write(
        JSON.stringify(buildClientJoinGroup(name, groupName)) + "\n"
      );
    }
  } else if (parts[0] === "members") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : members;nom_du_groupe");
    } else {
      client.write(
        JSON.stringify(buildClientListMembers(name, groupName)) + "\n"
      );
    }
  } else if (parts[0] === "leave") {
    const groupName = parts[1]?.trim();

    if (!groupName) {
      console.log("Usage : leave;nom_du_groupe");
    } else {
      client.write(
        JSON.stringify(buildClientLeaveGroup(name, groupName)) + "\n"
      );
    }
  } else {
    console.log(
      "Commande inconnue. Utilisez s;destinataire;message, b;message, ls, q, cg;groupe, groups, j;groupe, members;groupe ou leave;groupe."
    );
  }

  rl.prompt();
});

rl.on("close", () => {
  if (!client.destroyed) {
    client.end();
  }
});

client.connect(8080, "127.0.0.1");