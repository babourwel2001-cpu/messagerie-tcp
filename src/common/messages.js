const { ACTIONS } = require("./protocol");

function buildClientHello(sender) {
  return {
    sender,
    action: ACTIONS.CLIENT_HELLO,
  };
}

function buildServerHello(sender, msg) {
  return {
    sender,
    action: ACTIONS.SERVER_HELLO,
    msg,
  };
}

function buildClientSend(sender, dest, msg) {
  return {
    sender,
    dest,
    msg,
    action: ACTIONS.CLIENT_SEND,
  };
}

function buildServerMessage(sender, msg) {
  return {
    sender,
    action: ACTIONS.SERVER_MESSAGE,
    msg,
  };
}

function buildClientBroadcast(sender, msg) {
  return {
    sender,
    msg,
    action: ACTIONS.CLIENT_BROADCAST,
  };
}

function buildServerBroadcast(sender, msg) {
  return {
    sender,
    action: ACTIONS.SERVER_BROADCAST,
    msg,
  };
}

function buildClientListClients(sender) {
  return {
    sender,
    action: ACTIONS.CLIENT_LIST_CLIENTS,
  };
}

function buildServerClients(clients) {
  return {
    action: ACTIONS.SERVER_CLIENTS,
    clients,
  };
}

function buildClientQuit(sender) {
  return {
    sender,
    action: ACTIONS.CLIENT_QUIT,
  };
}

function buildServerGoodbye(msg) {
  return {
    action: ACTIONS.SERVER_GOODBYE,
    msg,
  };
}

function buildServerUserJoined(sender, msg) {
  return {
    sender,
    action: ACTIONS.SERVER_USER_JOINED,
    msg,
  };
}

function buildServerUserLeft(sender, msg) {
  return {
    sender,
    action: ACTIONS.SERVER_USER_LEFT,
    msg,
  };
}

function buildServerError(msg) {
  return {
    action: ACTIONS.SERVER_ERROR,
    msg,
  };
}

//pour les groupes
function buildClientCreateGroup(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.CLIENT_CREATE_GROUP,
  };
}

function buildClientListGroups(name) {
  return {
    name,
    action: ACTIONS.CLIENT_LIST_GROUPS,
  };
}

function buildServerGroupCreated(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.SERVER_GROUP_CREATED,
    msg: `Groupe ${group} créé par ${sender}`,
  };
}

function buildServerGroups(groups) {
  return {
    action: ACTIONS.SERVER_GROUPS,
    groups,
  };
}
function buildClientJoinGroup(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.CLIENT_JOIN_GROUP,
  };
}
function buildServerGroupJoined(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.SERVER_GROUP_JOINED,
    msg: `${sender} a rejoint le groupe ${group}`,
  };
}
function buildClientListMembers(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.CLIENT_LIST_MEMBERS,
  };
}

function buildClientLeaveGroup(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.CLIENT_LEAVE_GROUP,
  };
}

function buildServerGroupLeft(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.SERVER_GROUP_LEFT,
    msg: `${sender} a quitté le groupe ${group}`,
  };
}

function buildServerMembers(group, members) {
  return {
    group,
    action: ACTIONS.SERVER_MEMBERS,
    members,
  };
}

function buildClientGroupBroadcast(sender, group, msg) {
  return {
    sender,
    group,
    msg,
    action: ACTIONS.CLIENT_GROUP_BROADCAST,
  };
}

function buildClientListGroupMessages(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.CLIENT_LIST_GROUP_MESSAGES,
  };
}

function buildServerGroupMessage(sender, group, msg) {
  return {
    sender,
    group,
    msg,
    action: ACTIONS.SERVER_GROUP_MESSAGE,
  };
}

function buildServerGroupMessages(group, messages) {
  return {
    group,
    action: ACTIONS.SERVER_GROUP_MESSAGES,
    messages,
  };
}
function buildClientInvite(sender, group, dest) {
  return {
    sender,
    group,
    dest,
    action: ACTIONS.CLIENT_INVITE,
  };
}

function buildServerGroupInvited(sender, group, dest) {
  return {
    sender,
    group,
    dest,
    action: ACTIONS.SERVER_GROUP_INVITED,
    msg: `${sender} a invité ${dest} dans le groupe ${group}`,
  };
}

function buildServerGroupInvitation(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.SERVER_GROUP_INVITATION,
    msg: `${sender} t'a invité dans le groupe ${group}`,
  };
}

function buildClientKick(sender, group, dest, reason) {
  return {
    sender,
    group,
    dest,
    reason,
    action: ACTIONS.CLIENT_KICK,
  };
}

function buildClientBan(sender, group, dest, reason) {
  return {
    sender,
    group,
    dest,
    reason,
    action: ACTIONS.CLIENT_BAN,
  };
}

function buildClientUnban(sender, group, dest) {
  return {
    sender,
    group,
    dest,
    action: ACTIONS.CLIENT_UNBAN,
  };
}

function buildServerGroupKicked(sender, group, dest, reason) {
  return {
    sender,
    group,
    dest,
    reason,
    action: ACTIONS.SERVER_GROUP_KICKED,
    msg: `${sender} a exclu ${dest} du groupe ${group} : ${reason}`,
  };
}

function buildServerGroupBanned(sender, group, dest, reason) {
  return {
    sender,
    group,
    dest,
    reason,
    action: ACTIONS.SERVER_GROUP_BANNED,
    msg: `${sender} a banni ${dest} du groupe ${group} : ${reason}`,
  };
}

function buildServerGroupUnbanned(sender, group, dest) {
  return {
    sender,
    group,
    dest,
    action: ACTIONS.SERVER_GROUP_UNBANNED,
    msg: `${sender} a levé le bannissement de ${dest} dans le groupe ${group}`,
  };
}

function buildClientListGroupStates(sender, group) {
  return {
    sender,
    group,
    action: ACTIONS.CLIENT_LIST_GROUP_STATES,
  };
}

function buildServerGroupStates(group, states) {
  return {
    group,
    action: ACTIONS.SERVER_GROUP_STATES,
    states,
  };
}
module.exports = {
  buildClientHello,
  buildServerHello,
  buildClientSend,
  buildServerMessage,
  buildClientBroadcast,
  buildServerBroadcast,
  buildClientListClients,
  buildServerClients,
  buildClientQuit,
  buildServerGoodbye,
  buildServerUserJoined,
  buildServerUserLeft,
  buildServerError,
  buildClientCreateGroup,
  buildClientListGroups,
  buildServerGroupCreated,
  buildServerGroups,
  buildClientJoinGroup,
  buildClientListMembers,
  buildClientLeaveGroup,
  buildServerGroupJoined,
  buildServerMembers,
  buildServerGroupLeft,
  buildClientGroupBroadcast,
  buildClientListGroupMessages,
  buildServerGroupMessage,
  buildServerGroupMessages,
  buildClientInvite,
  buildServerGroupInvited,
  buildServerGroupInvitation,
  buildClientKick,
  buildClientBan,
  buildClientUnban,
  buildServerGroupKicked,
  buildServerGroupBanned,
  buildServerGroupUnbanned,
  buildServerGroupStates,
  buildClientListGroupStates,
};
