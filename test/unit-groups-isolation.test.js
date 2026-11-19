const assert = require("node:assert/strict");
const sinon = require("sinon");
const groupsModule = require("../src/server/groups");


const {
  groups,
  createGroupForUser,
  joinGroupForUser,
  getMembersForUser,
  getGroup,
} = groupsModule;


describe("Isolation de l'adhésion avec Sinon", () => {
  beforeEach(() => {
    groups.clear();
  });


  afterEach(() => {
    sinon.restore();
  });


  it("ajoute David lorsque le contrôle de bannissement répond non banni", () => {
    createGroupForUser("wob", "alice");


    const fakeIsBanned = sinon.fake.returns(false);


    sinon.replace(
      groupsModule,
      "isBanned",
      fakeIsBanned,
    );


    const resultat = joinGroupForUser("wob", "david");


    assert.equal(resultat.error, undefined);


    const membres = getMembersForUser("wob", "alice");


    assert.deepEqual(membres.members, ["alice", "david"]);


    assert.equal(fakeIsBanned.callCount, 1);
    assert.deepEqual(fakeIsBanned.firstCall.args, [
      getGroup("wob"),
      "david",
    ]);
  });


  it("refuse David lorsque le contrôle de bannissement répond banni", () => {
    createGroupForUser("wob", "alice");


    const fakeIsBanned = sinon.fake.returns(true);


    sinon.replace(
      groupsModule,
      "isBanned",
      fakeIsBanned,
    );


    const resultat = joinGroupForUser("wob", "david");


    assert.equal(
      resultat.error,
      "Vous êtes banni du groupe wob.",
    );


    const membres = getMembersForUser("wob", "alice");


    assert.deepEqual(membres.members, ["alice"]);


    assert.equal(fakeIsBanned.callCount, 1);
  });
});