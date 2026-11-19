const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const database = require("../src/server/database");
const auth = require("../src/server/auth");


describe("Persistance réelle avec SQLite", () => {
    let fichierBase;


    beforeEach(async () => {
        fichierBase = path.join(
            os.tmpdir(),
            `messagerie-test-${Date.now()}-${Math.random()
                .toString(16)
                .slice(2)}.db`,
        );


        await database.open(fichierBase);
    });


    afterEach(async () => {
        await database.close();


        if (fs.existsSync(fichierBase)) {
            fs.unlinkSync(fichierBase);
        }
    });


    it("crée réellement un compte dans SQLite", async () => {
        const resultat = await auth.register("alice", "motdepasse123");


        assert.equal(resultat.code, auth.CODES.REGISTERED);


        const utilisateur = await database.findUserByName("alice");


        assert.equal(utilisateur.name, "alice");
        assert.notEqual(utilisateur.password_hash, "motdepasse123");
    });


    it("refuse un deuxième compte avec le même nom", async () => {
        await auth.register("alice", "motdepasse123");


        const resultat = await auth.register("alice", "autre-mot-de-passe");


        assert.equal(resultat.code, auth.CODES.NAME_TAKEN);
    });


    it("connecte un compte réellement enregistré", async () => {
        await auth.register("alice", "motdepasse123");


        const resultat = await auth.login("alice", "motdepasse123");


        assert.equal(resultat.code, auth.CODES.AUTHENTICATED);
        assert.equal(resultat.user.name, "alice");
    });


    it("conserve les données après fermeture et réouverture", async () => {
        await auth.register("alice", "motdepasse123");
        await database.addMessage(1, "private", "message secret");


        await database.close();


        await database.open(fichierBase);


        const utilisateur = await database.findUserByName("alice");
        const messages = await database.listMessages(1);


        assert.equal(utilisateur.name, "alice");
        assert.equal(messages.length, 1);
        assert.equal(messages[0].body, "message secret");
    });
});