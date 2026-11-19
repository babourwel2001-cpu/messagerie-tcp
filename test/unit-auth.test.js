const assert = require("node:assert/strict");
const sinon = require("sinon");
const database = require("../src/server/database");
const auth = require("../src/server/auth");
const {
    hashPassword,
    verifyPassword,
} = require("../src/common/crypto");


describe("Authentification isolée avec Sinon", () => {
    afterEach(() => {
        sinon.restore();
    });


    it("crée un compte avec un mot de passe haché", async () => {
        const createUser = sinon.fake.resolves(7);


        sinon.replace(database, "createUser", createUser);


        const resultat = await auth.register("alice", "motdepasse123");


        assert.equal(resultat.code, auth.CODES.REGISTERED);
        assert.deepEqual(resultat.user, {
            id: 7,
            name: "alice",
        });


        assert.equal(createUser.callCount, 1);


        const motDePasseEnvoye = createUser.firstCall.args[1];


        assert.notEqual(motDePasseEnvoye, "motdepasse123");
        assert.equal(
            await verifyPassword("motdepasse123", motDePasseEnvoye),
            true,
        );
    });


    it("refuse un mot de passe trop court", async () => {
        const createUser = sinon.fake.resolves(7);


        sinon.replace(database, "createUser", createUser);


        const resultat = await auth.register("alice", "court");


        assert.equal(resultat.code, auth.CODES.INVALID_PASSWORD);
        assert.equal(createUser.callCount, 0);
    });


    it("refuse un nom déjà utilisé", async () => {
        const erreur = new Error("UNIQUE constraint failed");
        erreur.code = "SQLITE_CONSTRAINT";


        const createUser = sinon.fake.rejects(erreur);


        sinon.replace(database, "createUser", createUser);


        const resultat = await auth.register("alice", "motdepasse123");


        assert.equal(resultat.code, auth.CODES.NAME_TAKEN);
    });


    it("connecte Alice avec le bon mot de passe", async () => {
        const motDePasse = "motdepasse123";
        const hachage = await hashPassword(motDePasse);


        const findUserByName = sinon.fake.resolves({
            id: 7,
            name: "alice",
            password_hash: hachage,
        });


        sinon.replace(database, "findUserByName", findUserByName);


        const resultat = await auth.login("alice", motDePasse);


        assert.equal(resultat.code, auth.CODES.AUTHENTICATED);
        assert.deepEqual(resultat.user, {
            id: 7,
            name: "alice",
        });


        assert.equal(findUserByName.callCount, 1);
        assert.deepEqual(findUserByName.firstCall.args, ["alice"]);
    });


    it("refuse un mauvais mot de passe", async () => {
        const motDePasse = "motdepasse123";
        const hachage = await hashPassword(motDePasse);


        const findUserByName = sinon.fake.resolves({
            id: 7,
            name: "alice",
            password_hash: hachage,
        });


        sinon.replace(database, "findUserByName", findUserByName);


        const resultat = await auth.login("alice", "mauvais-mot-de-passe");


        assert.equal(resultat.code, auth.CODES.BAD_CREDENTIALS);
        assert.equal(resultat.user, undefined);
    });


    it("refuse un compte inexistant", async () => {
        const findUserByName = sinon.fake.resolves(null);


        sinon.replace(database, "findUserByName", findUserByName);


        const resultat = await auth.login("inconnu", "motdepasse123");


        assert.equal(resultat.code, auth.CODES.BAD_CREDENTIALS);
        assert.equal(resultat.user, undefined);
    });
});