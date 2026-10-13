const ACTIONS = {
  CLIENT_HELLO: "client-hello",
  SERVER_HELLO: "server-hello",
  CLIENT_SEND: "client-send",
  SERVER_MESSAGE: "server-message",
  CLIENT_BROADCAST: "client-broadcast",
  SERVER_BROADCAST: "server-broadcast",
  CLIENT_LIST_CLIENTS: "client-list-clients",
  SERVER_CLIENTS: "server-clients",
  CLIENT_QUIT: "client-quit",
  SERVER_GOODBYE: "server-goodbye",
  SERVER_USER_JOINED: "server-user-joined",
  SERVER_USER_LEFT: "server-user-left",
  SERVER_ERROR: "server-error",

  //pour les groupes
  CLIENT_CREATE_GROUP: "cgroupe",
  CLIENT_LIST_GROUPS: "groups",
  SERVER_GROUP_CREATED: "server-group-created",
  SERVER_GROUPS: "server-groups",
  CLIENT_JOIN_GROUP: "join",
  SERVER_GROUP_JOINED: "server-group-joined",
  CLIENT_LIST_MEMBERS: "members",
  CLIENT_LEAVE_GROUP: "leave",
  SERVER_GROUP_LEFT: "server-group-left",
  SERVER_MEMBERS: "server-members"
  
};

module.exports = { ACTIONS }
