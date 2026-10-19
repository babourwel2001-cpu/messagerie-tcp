const MAX_GROUP_MESSAGES = 100;
const groups = new Map();

function createGroup(name, creator) {
    const group = {
        name,
        creator,
        members: new Set([creator]),
        invitations: new Map(),
        bans: new Map(),
        messages: [],
        states: [],
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

function addState(group, actor, type, details = {}) {
    group.states.push({
        actor,
        type,
        details,
        timestamp: new Date().toISOString(),
    });
}
function createGroupForUser(rawName, username) {
    const groupName =
        typeof rawName === "string" ? rawName.trim() : "";

    if (groupName === "") {
        return { error: "Nom de groupe invalide." };
    }

    if (groupName.length > 30) {
        return { error: "Nom de groupe trop long." };
    }

    if (groups.has(groupName)) {
        return {
            error: `Le groupe ${groupName} existe déjà.`,
        };
    }

    const group = createGroup(groupName, username);

    addState(group, username, "group-created");

    return { group };
}
function joinGroupForUser(rawName, username) {
    const groupName =
        typeof rawName === "string" ? rawName.trim() : "";

    const group = getGroup(groupName);

    if (!group) {
        return {
            error: `Le groupe ${groupName} n'existe pas.`,
        };
    }

    if (isBanned(group, username)) {
        return {
            error: `Vous êtes banni du groupe ${groupName}.`,
        };
    }

    if (isMember(group, username)) {
        return {
            error: `Vous êtes déjà membre du groupe ${groupName}.`,
        };
    }

    group.members.add(username);
    group.invitations.delete(username);

    addState(group, username, "user-joined");

    return { group };
}

function leaveGroupForUser(rawName, username) {
    const groupName =
        typeof rawName === "string" ? rawName.trim() : "";

    const group = getGroup(groupName);

    if (!group) {
        return {
            error: `Le groupe ${groupName} n'existe pas.`,
        };
    }

    if (!isMember(group, username)) {
        return {
            error: `Vous n'êtes pas membre du groupe ${groupName}.`,
        };
    }

    group.members.delete(username);

    addState(group, username, "user-left");

    return { group };
}

function getMembersForUser(rawName, username) {
  const groupName =
    typeof rawName === "string" ? rawName.trim() : "";

  const group = getGroup(groupName);

  if (!group) {
    return {
      error: `Le groupe ${groupName} n'existe pas.`,
    };
  }

  if (!isMember(group, username)) {
    return {
      error: `Vous n'êtes pas membre du groupe ${groupName}.`,
    };
  }

  const members = [...group.members].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    group,
    members,
  };
}

function postGroupMessageForUser(rawName, username, text) {
  const groupName =
    typeof rawName === "string" ? rawName.trim() : "";

  const group = getGroup(groupName);

  if (!group) {
    return {
      error: `Le groupe ${groupName} n'existe pas.`,
    };
  }

  if (!isMember(group, username)) {
    return {
      error: `Vous n'êtes pas membre du groupe ${groupName}.`,
    };
  }

  if (typeof text !== "string" || text.trim() === "") {
    return {
      error: "Message vide ou invalide.",
    };
  }

  const savedMessage = {
    sender: username,
    msg: text,
    date: new Date().toISOString(),
  };

  group.messages.push(savedMessage);

  if (group.messages.length > MAX_GROUP_MESSAGES) {
    group.messages.shift();
  }

  return {
    groupName: group.name,
    members: [...group.members],
    message: savedMessage,
  };
}

function getGroupMessagesForUser(rawName, username) {
  const groupName =
    typeof rawName === "string" ? rawName.trim() : "";

  const group = getGroup(groupName);

  if (!group) {
    return {
      error: `Le groupe ${groupName} n'existe pas.`,
    };
  }

  if (!isMember(group, username)) {
    return {
      error: `Vous n'êtes pas membre du groupe ${groupName}.`,
    };
  }

  return {
    groupName: group.name,
    messages: [...group.messages],
  };
}

function inviteUserToGroup(rawName, username, rawDestination) {
  const groupName =
    typeof rawName === "string" ? rawName.trim() : "";

  const destination =
    typeof rawDestination === "string"
      ? rawDestination.trim()
      : "";

  const group = getGroup(groupName);

  if (!group) {
    return {
      error: `Le groupe ${groupName} n'existe pas.`,
    };
  }

  if (group.creator !== username) {
    return {
      error: "Seul le créateur peut inviter des utilisateurs.",
    };
  }

  if (destination === "") {
    return {
      error: "Destinataire invalide.",
    };
  }

  if (isMember(group, destination)) {
    return {
      error: `${destination} est déjà membre du groupe.`,
    };
  }

  if (isBanned(group, destination)) {
    return {
      error: `${destination} est banni du groupe.`,
    };
  }

  group.invitations.set(destination, username);

  addState(group, username, "user-invited", {
    dest: destination,
  });

  return {
    groupName: group.name,
    destination,
  };
}

function moderateGroupMember(
  rawName,
  username,
  rawDestination,
  rawReason,
  action,
) {
  if (action !== "kick" && action !== "ban") {
    return {
      error: "Action de modération invalide.",
    };
  }

  const groupName =
    typeof rawName === "string" ? rawName.trim() : "";

  const destination =
    typeof rawDestination === "string"
      ? rawDestination.trim()
      : "";

  const reason =
    typeof rawReason === "string" && rawReason.trim() !== ""
      ? rawReason.trim()
      : "aucune raison";

  const group = getGroup(groupName);

  if (!group) {
    return {
      error: `Le groupe ${groupName} n'existe pas.`,
    };
  }

  if (group.creator !== username) {
    return {
      error: "Seul le créateur peut modérer ce groupe.",
    };
  }

  if (destination === username) {
    return {
      error: "Vous ne pouvez pas vous modérer vous-même.",
    };
  }

  if (!isMember(group, destination)) {
    return {
      error: `${destination} n'est pas membre du groupe.`,
    };
  }

  group.members.delete(destination);
  group.invitations.delete(destination);

  if (action === "ban") {
    group.bans.set(destination, reason);
  }

  addState(
    group,
    username,
    action === "ban" ? "user-banned" : "user-kicked",
    {
      dest: destination,
      reason,
    },
  );

  return {
    groupName: group.name,
    destination,
    reason,
  };
}

function unbanUserFromGroup(
  rawName,
  username,
  rawDestination,
) {
  const groupName =
    typeof rawName === "string" ? rawName.trim() : "";

  const destination =
    typeof rawDestination === "string"
      ? rawDestination.trim()
      : "";

  const group = getGroup(groupName);

  if (!group) {
    return {
      error: `Le groupe ${groupName} n'existe pas.`,
    };
  }

  if (group.creator !== username) {
    return {
      error: "Seul le créateur peut modérer ce groupe.",
    };
  }

  if (!isBanned(group, destination)) {
    return {
      error: `${destination} n'est pas banni du groupe.`,
    };
  }

  group.bans.delete(destination);

  addState(group, username, "user-unbanned", {
    dest: destination,
  });

  return {
    groupName: group.name,
    destination,
  };
}

function getGroupStatesForUser(rawName, username) {
  const groupName =
    typeof rawName === "string" ? rawName.trim() : "";

  const group = getGroup(groupName);

  if (!group) {
    return {
      error: `Le groupe ${groupName} n'existe pas.`,
    };
  }

  if (!isMember(group, username)) {
    return {
      error: `Vous n'êtes pas membre du groupe ${groupName}.`,
    };
  }

  return {
    groupName: group.name,
    states: [...group.states],
  };
}
function listGroupNames() {
  return [...groups.keys()].sort((a, b) =>
    a.localeCompare(b),
  );
}

function disconnectUserFromGroups(username) {
  for (const group of groups.values()) {
    if (group.members.has(username)) {
      group.members.delete(username);

      addState(
        group,
        username,
        "user-disconnected",
      );
    }

    group.invitations.delete(username);
  }
}
module.exports = {
    groups,
    createGroup,
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
    disconnectUserFromGroups,
    listGroupNames,
    getGroup,
    isMember,
    isBanned,
    addState,
};