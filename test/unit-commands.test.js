const assert = require("node:assert/strict");
const { parseCommand } = require("../src/client/commands");
const {
    buildClientHistory,
} = require("../src/common/messages");

describe("Commandes du client", () => {
    it("transforme s;david;hello world en message privé envoyé par Alice", () => {
        const obtained = parseCommand("s;david;hello world", "alice");


        const expected = {
            sender: "alice",
            dest: "david",
            msg: "hello world",
            action: "client-send",
        };


        assert.deepEqual(obtained, expected);
    });

    it("transforme b;hello world en demande de diffusion", () => {
        const obtained = parseCommand("b;hello world", "alice");


        const expected = {
            sender: "alice",
            msg: "hello world",
            action: "client-broadcast",
        };


        assert.deepEqual(obtained, expected);
    });


    it("transforme ls en demande de liste des clients", () => {
        const obtained = parseCommand("ls", "alice");


        const expected = {
            sender: "alice",
            action: "client-list-clients",
        };


        assert.deepEqual(obtained, expected);
    });


    it("transforme q en demande de déconnexion", () => {
        const obtained = parseCommand("q", "alice");


        const expected = {
            sender: "alice",
            action: "client-quit",
        };


        assert.deepEqual(obtained, expected);
    });


    it("utilise un autre expéditeur, destinataire et message", () => {
        const obtained = parseCommand("s;bob;salut bob", "carole");


        const expected = {
            sender: "carole",
            dest: "bob",
            msg: "salut bob",
            action: "client-send",
        };


        assert.deepEqual(obtained, expected);
    });
});

describe("Commandes de groupe", () => {
    it("transforme cg;wob en demande de création de groupe", () => {
        const obtained = parseCommand("cg;wob", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            action: "cgroupe",
        });
    });


    it("transforme j;wob en demande d'adhésion", () => {
        const obtained = parseCommand("j;wob", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            action: "join",
        });
    });


    it("transforme bg;wob;hello world en diffusion de groupe", () => {
        const obtained = parseCommand("bg;wob;hello world", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            msg: "hello world",
            action: "gbroadcast",
        });
    });


    it("transforme members;wob en demande de liste des membres", () => {
        const obtained = parseCommand("members;wob", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            action: "members",
        });
    });


    it("transforme messages;wob en demande d'historique du groupe", () => {
        const obtained = parseCommand("messages;wob", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            action: "msgs",
        });
    });


    it("transforme groups en demande de liste des groupes", () => {
        const obtained = parseCommand("groups", "alice");


        assert.deepEqual(obtained, {
            name: "alice",
            action: "groups",
        });
    });


    it("transforme leave;wob en demande de départ du groupe", () => {
        const obtained = parseCommand("leave;wob", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            action: "leave",
        });
    });


    it("transforme invite;wob;david en invitation", () => {
        const obtained = parseCommand("invite;wob;david", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            dest: "david",
            action: "invite",
        });
    });


    it("transforme kick;wob;david;raison en exclusion", () => {
        const obtained = parseCommand("kick;wob;david;raison", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            dest: "david",
            reason: "raison",
            action: "kick",
        });
    });


    it("transforme ban;wob;david;raison en bannissement", () => {
        const obtained = parseCommand("ban;wob;david;raison", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            dest: "david",
            reason: "raison",
            action: "ban",
        });
    });


    it("transforme unban;wob;david en levée de bannissement", () => {
        const obtained = parseCommand("unban;wob;david", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            dest: "david",
            action: "unban",
        });
    });


    it("transforme states;wob en demande des événements", () => {
        const obtained = parseCommand("states;wob", "alice");


        assert.deepEqual(obtained, {
            sender: "alice",
            group: "wob",
            action: "states",
        });
    });
});


describe("Commandes invalides", () => {
    it("refuse un message privé sans destinataire", () => {
        assert.throws(() => parseCommand("s;hello world", "alice"));
    });


    it("refuse une diffusion sans message", () => {
        assert.throws(() => parseCommand("b;", "alice"));
    });


    it("refuse une commande inconnue", () => {
        assert.throws(() => parseCommand("inconnue", "alice"));
    });
});


describe("Commandes de compte", () => {
    it("transforme register;motdepasse en création de compte", () => {
        const obtained = parseCommand("register;motdepasse", "alice");


        assert.deepEqual(obtained, {
            action: "register",
            name: "alice",
            password: "motdepasse",
        });
    });


    it("transforme login;motdepasse en demande d'authentification", () => {
        const obtained = parseCommand("login;motdepasse", "alice");


        assert.deepEqual(obtained, {
            action: "auth",
            name: "alice",
            password: "motdepasse",
        });
    });


    it("transforme history en demande d'historique", () => {
        const obtained = parseCommand("history", "alice");


        assert.deepEqual(obtained, {
            action: "history",
            limit: 50,
        });
    });
});
