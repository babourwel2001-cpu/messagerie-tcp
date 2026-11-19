const assert = require("node:assert/strict");
const groupsModule = require("../src/server/groups");


const {
  groups,
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
  listGroupNames,
} = groupsModule;


describe("Effets des commandes de groupe", () => {
  beforeEach(() => {
    groups.clear();
  });


  it("crée un groupe et ajoute son créateur comme membre", () => {
    const resultat = createGroupForUser("wob", "alice");


    assert.equal(resultat.error, undefined);


    const membres = getMembersForUser("wob", "alice");


    assert.deepEqual(membres.members, ["alice"]);
  });


  it("refuse la création d'un groupe déjà existant", () => {
    createGroupForUser("wob", "alice");


    const resultat = createGroupForUser("wob", "bob");


    assert.equal(resultat.error, "Le groupe wob existe déjà.");
  });


  it("ajoute David au groupe d'Alice", () => {
    createGroupForUser("wob", "alice");


    const resultat = joinGroupForUser("wob", "david");


    assert.equal(resultat.error, undefined);


    const membres = getMembersForUser("wob", "alice");


    assert.deepEqual(membres.members, ["alice", "david"]);
  });


  it("refuse l'adhésion d'un utilisateur déjà membre", () => {
    createGroupForUser("wob", "alice");


    const resultat = joinGroupForUser("wob", "alice");


    assert.equal(
      resultat.error,
      "Vous êtes déjà membre du groupe wob.",
    );
  });


  it("retire David après son départ", () => {
    createGroupForUser("wob", "alice");
    joinGroupForUser("wob", "david");


    const resultat = leaveGroupForUser("wob", "david");


    assert.equal(resultat.error, undefined);


    const membres = getMembersForUser("wob", "alice");


    assert.deepEqual(membres.members, ["alice"]);
  });


  it("enregistre un message de groupe", () => {
    createGroupForUser("wob", "alice");
    joinGroupForUser("wob", "david");


    const resultat = postGroupMessageForUser(
      "wob",
      "alice",
      "hello world",
    );


    assert.equal(resultat.error, undefined);
    assert.equal(resultat.message.sender, "alice");
    assert.equal(resultat.message.msg, "hello world");


    const historique = getGroupMessagesForUser("wob", "alice");


    assert.equal(historique.messages.length, 1);
    assert.equal(historique.messages[0].msg, "hello world");
  });


  it("refuse un message d'un utilisateur qui n'est pas membre", () => {
    createGroupForUser("wob", "alice");


    const resultat = postGroupMessageForUser(
      "wob",
      "david",
      "hello world",
    );


    assert.equal(
      resultat.error,
      "Vous n'êtes pas membre du groupe wob.",
    );
  });


  it("permet au créateur d'inviter un utilisateur", () => {
    createGroupForUser("wob", "alice");


    const resultat = inviteUserToGroup("wob", "alice", "david");


    assert.equal(resultat.error, undefined);
    assert.equal(resultat.destination, "david");
  });


  it("refuse une invitation par un utilisateur qui n'est pas créateur", () => {
    createGroupForUser("wob", "alice");
    joinGroupForUser("wob", "david");


    const resultat = inviteUserToGroup("wob", "david", "bob");


    assert.equal(
      resultat.error,
      "Seul le créateur peut inviter des utilisateurs.",
    );
  });


  it("exclut David du groupe avec kick", () => {
    createGroupForUser("wob", "alice");
    joinGroupForUser("wob", "david");


    const resultat = moderateGroupMember(
      "wob",
      "alice",
      "david",
      "raison",
      "kick",
    );


    assert.equal(resultat.error, undefined);


    const membres = getMembersForUser("wob", "alice");


    assert.deepEqual(membres.members, ["alice"]);
  });


  it("bannit David puis l'empêche de rejoindre", () => {
    createGroupForUser("wob", "alice");
    joinGroupForUser("wob", "david");


    const bannissement = moderateGroupMember(
      "wob",
      "alice",
      "david",
      "raison",
      "ban",
    );


    assert.equal(bannissement.error, undefined);


    const adhesion = joinGroupForUser("wob", "david");


    assert.equal(
      adhesion.error,
      "Vous êtes banni du groupe wob.",
    );
  });


  it("lève le bannissement de David", () => {
    createGroupForUser("wob", "alice");
    joinGroupForUser("wob", "david");


    moderateGroupMember(
      "wob",
      "alice",
      "david",
      "raison",
      "ban",
    );


    const resultat = unbanUserFromGroup("wob", "alice", "david");


    assert.equal(resultat.error, undefined);


    const adhesion = joinGroupForUser("wob", "david");


    assert.equal(adhesion.error, undefined);
  });


  it("enregistre les événements du groupe", () => {
    createGroupForUser("wob", "alice");
    joinGroupForUser("wob", "david");


    const resultat = getGroupStatesForUser("wob", "alice");


    assert.equal(resultat.error, undefined);


    const types = resultat.states.map((event) => event.type);


    assert.deepEqual(types, [
      "group-created",
      "user-joined",
    ]);
  });


  it("liste les groupes créés", () => {
    createGroupForUser("wob", "alice");
    createGroupForUser("team", "bob");


    assert.deepEqual(listGroupNames(), ["team", "wob"]);
  });
});