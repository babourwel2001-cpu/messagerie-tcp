// Conversion des commandes saisies par l'utilisateur
// en objets du protocole, sans accès au réseau.

const {
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


function parseCommand(line, name) {
  const command = line.trim();


  if (command === "") {
    return null;
  }


  const parts = line.split(";");


  if (parts[0] === "q") {
    return buildClientQuit(name);
  }


  if (parts[0] === "s") {
    const destination = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();


    if (!destination || !text) {
      throw new Error("Usage : s;destinataire;message");
    }


    return buildClientSend(name, destination, text);
  }


  if (parts[0] === "b") {
    const text = parts.slice(1).join(";").trim();


    if (!text) {
      throw new Error("Usage : b;message");
    }


    return buildClientBroadcast(name, text);
  }


  if (parts[0] === "ls") {
    return buildClientListClients(name);
  }


  if (parts[0] === "cg") {
    const groupName = parts[1]?.trim();


    if (!groupName) {
      throw new Error("Usage : cg;nom_du_groupe");
    }


    return buildClientCreateGroup(name, groupName);
  }


  if (parts[0] === "groups") {
    return buildClientListGroups(name);
  }


  if (parts[0] === "j") {
    const groupName = parts[1]?.trim();


    if (!groupName) {
      throw new Error("Usage : j;nom_du_groupe");
    }


    return buildClientJoinGroup(name, groupName);
  }


  if (parts[0] === "members") {
    const groupName = parts[1]?.trim();


    if (!groupName) {
      throw new Error("Usage : members;nom_du_groupe");
    }


    return buildClientListMembers(name, groupName);
  }


  if (parts[0] === "leave") {
    const groupName = parts[1]?.trim();


    if (!groupName) {
      throw new Error("Usage : leave;nom_du_groupe");
    }


    return buildClientLeaveGroup(name, groupName);
  }


  if (parts[0] === "bg") {
    const groupName = parts[1]?.trim();
    const text = parts.slice(2).join(";").trim();


    if (!groupName || !text) {
      throw new Error("Usage : bg;nom_du_groupe;message");
    }


    return buildClientGroupBroadcast(name, groupName, text);
  }


  if (parts[0] === "messages") {
    const groupName = parts[1]?.trim();


    if (!groupName) {
      throw new Error("Usage : messages;nom_du_groupe");
    }


    return buildClientListGroupMessages(name, groupName);
  }


  if (parts[0] === "invite") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();


    if (!groupName || !destination) {
      throw new Error("Usage : invite;nom_du_groupe;utilisateur");
    }


    return buildClientInvite(name, groupName, destination);
  }


  if (parts[0] === "kick") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";


    if (!groupName || !destination) {
      throw new Error("Usage : kick;groupe;utilisateur;raison");
    }


    return buildClientKick(name, groupName, destination, reason);
  }


  if (parts[0] === "ban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();
    const reason = parts.slice(3).join(";").trim() || "aucune raison";


    if (!groupName || !destination) {
      throw new Error("Usage : ban;groupe;utilisateur;raison");
    }


    return buildClientBan(name, groupName, destination, reason);
  }


  if (parts[0] === "unban") {
    const groupName = parts[1]?.trim();
    const destination = parts[2]?.trim();


    if (!groupName || !destination) {
      throw new Error("Usage : unban;groupe;utilisateur");
    }


    return buildClientUnban(name, groupName, destination);
  }


  if (parts[0] === "states") {
    const groupName = parts[1]?.trim();


    if (!groupName) {
      throw new Error("Usage : states;nom_du_groupe");
    }


    return buildClientListGroupStates(name, groupName);
  }


  if (parts[0] === "register") {
    const password = parts.slice(1).join(";").trim();


    if (!password) {
      throw new Error("Usage : register;motdepasse");
    }


    return {
      action: "register",
      name,
      password,
    };
  }


  if (parts[0] === "login") {
    const password = parts.slice(1).join(";").trim();


    if (!password) {
      throw new Error("Usage : login;motdepasse");
    }


    return {
      action: "auth",
      name,
      password,
    };
  }


  if (parts[0] === "history") {
    return buildClientHistory(50);
  }


  throw new Error(
    "Commande inconnue. Utilisez s;destinataire;message, b;message, ls, q, cg;groupe, groups, j;groupe, members;groupe ou leave;groupe.",
  );
}


module.exports = {
  parseCommand,
};