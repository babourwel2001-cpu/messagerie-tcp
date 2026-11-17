// Serveur de messagerie TCP.
// Négociation ECDH et dérivation HKDF.
// Les commandes métier restent bloquées tant que le canal
// chiffré et authentifié n'est pas disponible.

const database = require("./database");
const auth = require("./auth");
const {
  buildServerAuthResult,
  buildClientHistory,
  buildServerHistory,
} = require("../common/messages");

const { ACTIONS } = require("../common/protocol");
const {
  buildServerKey,
  buildServerHello,
  buildServerMessage,
  buildServerError,
  buildServerBroadcast,
  buildServerGroupCreated,
  buildServerGroups,
  buildServerGroupJoined,
  buildServerMembers,
  buildServerGroupLeft,
  buildServerGroupMessages,
  buildServerGroupMessage,
  buildServerGroupInvited,
  buildServerGroupInvitation,
  buildServerGroupKicked,
  buildServerGroupBanned,
  buildServerGroupUnbanned,
  buildServerGroupStates,
} = require("../common/messages");

const net = require("node:net");

// Annuaire des utilisateurs connectés.
// Chaque entrée contient le socket, les clés de session
// et le compteur de séquence serveur -> client.
const clients = new Map();

// Fonctions de gestion des groupes.
const {
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
  disconnectUserFromGroups,
} = require("./groups");

// Fonctions de négociation ECDH et de dérivation HKDF.
const {
  createKeyExchange,
  deriverClesSession,
  creerEnveloppe,
  ouvrirEnveloppe,
  creerSequence,
  encoderEnveloppe,
  extraireEnveloppes,
} = require("../common/crypto");

// Séquence locale, propre à une direction et à une connexion.
function creerCompteurSequence() {
  let valeur = 0;

  return {
    prochaine() {
      valeur += 1;
      return valeur;
    },
    verifier(sequence) {
      if (sequence !== valeur + 1) {
        throw new Error(
          `Séquence invalide : attendu ${valeur + 1}, reçu ${sequence}`,
        );
      }

      valeur += 1;
    },
  };
}

const {
  validateClientKey,
} = require("../common/negociation");

const HOST = process.env.SERVER_HOST || "127.0.0.1";
const PORT = Number(process.env.SERVER_PORT || "8080");
const REQUIRE_AUTH = true;
const MAX_MESSAGE_BYTES = 8192;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("SERVER_PORT doit être un entier entre 1 et 65535.");
  process.exit(1);
}

// Envoi d'un message JSON encodé en enveloppe.
function send(socket, message) {
  socket.write(encoderEnveloppe(message));
}

function sendError(socket, message) {
  send(socket, {
    action: "server-error",
    msg: message,
  });
}

function isValidName(name) {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= 30
  );
}

const server = net.createServer((socket) => {
  const address = `${socket.remoteAddress}:${socket.remotePort}`;

  // Tampon pour les données TCP reçues en plusieurs morceaux.
  let pending = Buffer.alloc(0);
  let username = null;
  let userId = null;
  let authPending = false;

  // Négociation ECDH, propre à chaque connexion.
  let etatNegociation = "attente-cle";
  let echange = null;
  let secretPartage = null;
  let clientNonce = null;
  let serverNonce = null;

  // Clés dérivées avec HKDF.
  let clesSession = null;

  // Séquences indépendantes dans chaque direction.
  let sequenceClient = null;
  let sequenceServeur = null;

  const delaiNegociation = setTimeout(() => {
    console.error(`Négociation expirée : ${address}`);
    socket.destroy();
  }, 10000);

  // Nettoie les données sensibles lors d'une erreur ou d'une fermeture.
  function nettoyerNegociation() {
    clearTimeout(delaiNegociation);

    if (secretPartage !== null) {
      secretPartage.fill(0);
      secretPartage = null;
    }

    if (clesSession !== null) {
      clesSession.encryptionKey.fill(0);
      clesSession.macKey.fill(0);
      clesSession = null;
    }

    sequenceClient = null;
    sequenceServeur = null;

    echange = null;
    clientNonce = null;
    serverNonce = null;
    pending = Buffer.alloc(0);
    etatNegociation = "ferme";
  }

  // Chiffre et authentifie une réponse avant l'envoi.
  function envoyerProtege(message) {
    const enveloppe = creerEnveloppe(
      clesSession,
      "server",
      username,
      sequenceServeur.prochaine(),
      JSON.stringify(message),
    );

    send(socket, enveloppe);
  }

  // Gère l'inscription et la connexion sur le canal protégé.
  // Gère l'inscription et la connexion sur le canal protégé.
  async function gererAuthentification(message) {
    if (etatNegociation !== "canal-actif") {
      envoyerProtege(
        buildServerAuthResult(false, auth.CODES.INSECURE_CHANNEL),
      );

      return;
    }

    if (username !== null) {
      envoyerProtege(
        buildServerAuthResult(false, auth.CODES.ALREADY_AUTHENTICATED),
      );

      return;
    }

    if (authPending) {
      envoyerProtege(
        buildServerAuthResult(false, auth.CODES.BUSY),
      );

      return;
    }

    authPending = true;

    // Avant l'authentification, le nom demandé est connu grâce au message.
    const destinataire = message.name;

    // Envoie un résultat d'authentification au client demandeur.
    function envoyerResultat(ok, code) {
      const enveloppe = creerEnveloppe(
        clesSession,
        "server",
        destinataire,
        sequenceServeur.prochaine(),
        JSON.stringify(buildServerAuthResult(ok, code)),
      );

      send(socket, enveloppe);
    }

    try {
      const result =
        message.action === "register"
          ? await auth.register(message.name, message.password)
          : await auth.login(message.name, message.password);

      authPending = false;

      if (result.error) {
        envoyerResultat(false, result.code);
        return;
      }

      // L'inscription crée le compte, mais ne connecte pas automatiquement.
      if (message.action === "register") {
        envoyerResultat(true, result.code);
        return;
      }

      // La connexion authentifie le client et l'enregistre.
      if (clients.has(result.user.name)) {
        envoyerResultat(false, auth.CODES.ALREADY_ONLINE);
        return;
      }

      username = result.user.name;
      userId = result.user.id;

      clients.set(username, {
        socket,
        clesSession,
        sequenceServeur,
      });

      console.error(`Utilisateur authentifié : ${username}`);

      envoyerResultat(true, result.code);
    } catch (error) {
      authPending = false;

      console.error(`Erreur d'authentification : ${error.message}`);

      envoyerResultat(false, auth.CODES.SERVER_ERROR);
    }
  }

  // Chiffre et authentifie un message pour un utilisateur précis.
  // Utilise les clés et la séquence propres à sa connexion.
  function envoyerProtegeA(clientSession, message) {
    const enveloppe = creerEnveloppe(
      clientSession.clesSession,
      username,
      getUsernameDe(clientSession),
      clientSession.sequenceServeur.prochaine(),
      JSON.stringify(message),
    );

    send(clientSession.socket, enveloppe);
  }

  // Retrouve le nom associé à une session enregistrée.
  function getUsernameDe(clientSession) {
    for (const [nom, session] of clients.entries()) {
      if (session === clientSession) {
        return nom;
      }
    }

    throw new Error("Session introuvable.");
  }

  console.error(`CONNECTED from ${address}`);

  // Réception, cadrage et traitement des messages protégés.
  socket.on("data", async (chunk) => {
    try {
      pending = Buffer.concat([pending, chunk]);

      const resultat = extraireEnveloppes(pending);

      pending = resultat.reste;

      for (const enveloppe of resultat.enveloppes) {
        if (etatNegociation === "attente-cle") {
          try {
            const donnees = validateClientKey(enveloppe);

            echange = createKeyExchange();

            clientNonce = donnees.nonce;
            serverNonce = Buffer.from(echange.nonce, "base64");

            secretPartage = echange.computeSecret(
              donnees.publicKey.toString("base64"),
            );

            clesSession = deriverClesSession(
              secretPartage,
              clientNonce,
              serverNonce,
            );

            secretPartage.fill(0);
            secretPartage = null;

            const reponse = buildServerKey(
              echange.publicKey,
              echange.nonce,
            );

            send(socket, reponse);

            etatNegociation = "canal-actif";
            clearTimeout(delaiNegociation);
            echange = null;

            sequenceClient = creerCompteurSequence();
            sequenceServeur = creerCompteurSequence();

            console.error(
              `ECDH et HKDF terminés : ${address}. Canal protégé actif.`,
            );
          } catch (error) {
            console.error(
              `Négociation refusée : ${address} : ${error.message}`,
            );

            socket.destroy();
            return;
          }

          continue;
        }

        if (etatNegociation !== "canal-actif") {
          console.error(`Message inattendu : ${address}`);
          socket.destroy();
          return;
        }

        try {
          sequenceClient.verifier(enveloppe.sequence);

          const message = JSON.parse(
            ouvrirEnveloppe(clesSession, enveloppe),
          );

          // Inscription et connexion.
          if (message.action === "register" || message.action === "auth") {
            gererAuthentification(message);

            continue;
          }

          // L'enregistrement classique est remplacé par l'authentification.
          if (message.action === "client-hello") {
            envoyerProtege(
              buildServerError("Authentification requise."),
            );

            continue;
          }
          // Traitement de l'enregistrement du client.
          if (message.action === "client-hello") {
            if (username !== null) {
              envoyerProtege(
                buildServerError("Client déjà enregistré."),
              );

              continue;
            }

            if (!isValidName(message.sender)) {
              envoyerProtege(
                buildServerError("Nom invalide."),
              );

              continue;
            }

            const requestedName = message.sender.trim();

            if (clients.has(requestedName)) {
              envoyerProtege(
                buildServerError("Ce nom est déjà utilisé."),
              );

              continue;
            }

            username = requestedName;

            clients.set(username, {
              socket,
              clesSession,
              sequenceServeur,
            });

            console.error(`Utilisateur enregistré : ${username}`);

            envoyerProtege(
              buildServerHello(
                username,
                `Bienvenue ${username}`,
              ),
            );

            continue;
          }

          // Toutes les commandes métier requirent un client enregistré.
          if (username === null) {
            envoyerProtege(
              buildServerError("Client non enregistré."),
            );

            continue;
          }

          // Liste les utilisateurs connectés.
          if (message.action === "client-list-clients") {
            const names = [...clients.keys()].sort(
              (a, b) => a.localeCompare(b),
            );

            envoyerProtege(
              {
                action: "server-clients",
                clients: names,
              },
            );

            continue;
          }
          // Historique du compte authentifié.
          if (message.action === "history") {
            const limit = Number.isInteger(message.limit)
              ? Math.min(Math.max(message.limit, 1), 50)
              : 50;

            const rows = await database.listMessages(userId, limit);

            const items = rows.map((row) => {
              const content = JSON.parse(row.body);

              return {
                date: row.created_at,
                kind: row.kind,
                ...content,
              };
            });

            envoyerProtege(buildServerHistory(items));

            continue;
          }


          // Envoie un message privé à un autre utilisateur.
          if (message.action === "client-send") {
            if (
              typeof message.dest !== "string" ||
              message.dest.trim() === ""
            ) {
              envoyerProtege(
                buildServerError("Destinataire invalide."),
              );

              continue;
            }

            if (
              typeof message.msg !== "string" ||
              message.msg.trim() === ""
            ) {
              envoyerProtege(
                buildServerError("Message vide ou invalide."),
              );

              continue;
            }

            const destinationName = message.dest.trim();
            const destinationSession = clients.get(destinationName);

            if (!destinationSession) {
              envoyerProtege(
                buildServerError(
                  `Utilisateur ${destinationName} introuvable.`,
                ),
              );

              continue;
            }

            const enveloppeDestination = creerEnveloppe(
              destinationSession.clesSession,
              username,
              destinationName,
              destinationSession.sequenceServeur.prochaine(),
              JSON.stringify(
                buildServerMessage(username, message.msg),
              ),
            );

            send(destinationSession.socket, enveloppeDestination);
            // Enregistre le message privé envoyé dans l'historique du compte.
            database
              .addMessage(
                userId,
                "private",
                JSON.stringify(buildServerMessage(username, message.msg)),
              )
              .catch((error) => {
                console.error(`Erreur d'enregistrement : ${error.message}`);
              });
            continue;
          }

          // Diffuse un message à tous les utilisateurs connectés.
          if (message.action === "client-broadcast") {
            if (
              typeof message.msg !== "string" ||
              message.msg.trim() === ""
            ) {
              envoyerProtege(
                buildServerError("Message vide ou invalide."),
              );

              continue;
            }

            const messageDiffusion = buildServerBroadcast(
              username,
              message.msg,
            );

            for (const [
              nomDestinataire,
              sessionDestinataire,
            ] of clients.entries()) {
              const enveloppe = creerEnveloppe(
                sessionDestinataire.clesSession,
                username,
                nomDestinataire,
                sessionDestinataire.sequenceServeur.prochaine(),
                JSON.stringify(messageDiffusion),
              );

              send(sessionDestinataire.socket, enveloppe);
            }

            // Enregistre le message diffusé dans l'historique du compte.
            database
              .addMessage(
                userId,
                "broadcast",
                JSON.stringify(buildServerBroadcast(username, message.msg)),
              )
              .catch((error) => {
                console.error(`Erreur d'enregistrement : ${error.message}`);
              });

            continue;
          }

          // Ferme proprement la connexion du client.
          if (message.action === "client-quit") {
            envoyerProtege(
              {
                action: "server-goodbye",
                msg: `Au revoir ${username}`,
              },
            );

            socket.end();

            continue;
          }

          // Crée un groupe.
          if (message.action === "cgroupe") {
            const result = createGroupForUser(
              message.group,
              username,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerGroupCreated(
                username,
                result.group.name,
              ),
            );

            continue;
          }

          // Liste les groupes existants.
          if (message.action === "groups") {
            envoyerProtege(
              buildServerGroups(listGroupNames()),
            );

            continue;
          }

          // Rejoint un groupe.
          if (message.action === "join") {
            const result = joinGroupForUser(
              message.group,
              username,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerGroupJoined(
                username,
                result.group.name,
              ),
            );

            continue;
          }

          // Liste les membres d'un groupe.
          if (message.action === "members") {
            const result = getMembersForUser(
              message.group,
              username,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerMembers(
                result.group.name,
                result.members,
              ),
            );

            continue;
          }

          // Quitte un groupe.
          if (message.action === "leave") {
            const result = leaveGroupForUser(
              message.group,
              username,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerGroupLeft(
                username,
                result.group.name,
              ),
            );

            continue;
          }

          // Envoie un message dans un groupe.
          if (message.action === "gbroadcast") {
            const result = postGroupMessageForUser(
              message.group,
              username,
              message.msg,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            const messageGroupe = buildServerGroupMessage(
              result.message.sender,
              result.groupName,
              result.message.msg,
            );

            for (const memberName of result.members) {
              const sessionMembre = clients.get(memberName);

              if (sessionMembre) {
                const enveloppe = creerEnveloppe(
                  sessionMembre.clesSession,
                  username,
                  memberName,
                  sessionMembre.sequenceServeur.prochaine(),
                  JSON.stringify(messageGroupe),
                );

                send(sessionMembre.socket, enveloppe);
              }
            }

            continue;
          }

          // Liste les messages d'un groupe.
          if (message.action === "msgs") {
            const result = getGroupMessagesForUser(
              message.group,
              username,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerGroupMessages(
                result.groupName,
                result.messages,
              ),
            );

            continue;
          }

          // Invite un utilisateur dans un groupe.
          if (message.action === "invite") {
            const result = inviteUserToGroup(
              message.group,
              username,
              message.dest,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerGroupInvited(
                username,
                result.groupName,
                result.destination,
              ),
            );

            const destinationSession = clients.get(
              result.destination,
            );

            if (destinationSession) {
              const enveloppe = creerEnveloppe(
                destinationSession.clesSession,
                username,
                result.destination,
                destinationSession.sequenceServeur.prochaine(),
                JSON.stringify(
                  buildServerGroupInvitation(
                    username,
                    result.groupName,
                  ),
                ),
              );

              send(destinationSession.socket, enveloppe);
            }

            continue;
          }

          // Modère un membre d'un groupe.
          if (message.action === "kick" || message.action === "ban") {
            const result = moderateGroupMember(
              message.group,
              username,
              message.dest,
              message.reason,
              message.action,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            const reponse =
              message.action === "ban"
                ? buildServerGroupBanned(
                  username,
                  result.groupName,
                  result.destination,
                  result.reason,
                )
                : buildServerGroupKicked(
                  username,
                  result.groupName,
                  result.destination,
                  result.reason,
                );

            envoyerProtege(reponse);

            continue;
          }

          // Retire une exclusion d'un utilisateur.
          if (message.action === "unban") {
            const result = unbanUserFromGroup(
              message.group,
              username,
              message.dest,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerGroupUnbanned(
                username,
                result.groupName,
                result.destination,
              ),
            );

            continue;
          }

          // Liste les états des membres d'un groupe.
          if (message.action === "states") {
            const result = getGroupStatesForUser(
              message.group,
              username,
            );

            if (result.error) {
              envoyerProtege(
                buildServerError(result.error),
              );

              continue;
            }

            envoyerProtege(
              buildServerGroupStates(
                result.groupName,
                result.states,
              ),
            );

            continue;
          }

          envoyerProtege(
            buildServerError("Action inconnue."),
          );
        } catch (error) {
          console.error(
            `Message protégé invalide : ${address} : ${error.message}`,
          );

          socket.destroy();
          return;
        }
      }
    } catch (error) {
      console.error(
        `Message ou cadrage invalide : ${address} : ${error.message}`,
      );

      socket.destroy();
    }
  });

  socket.on("error", (error) => {
    nettoyerNegociation();
    console.error(`Socket error from ${address}: ${error.message}`);
  });

  socket.on("close", () => {
    nettoyerNegociation();

    console.error(`CLOSE ${address}, username =`, username);

    const session = username !== null
      ? clients.get(username)
      : null;

    if (session && session.socket === socket) {
      clients.delete(username);

      disconnectUserFromGroups(username);

      console.error(`Nom retiré : ${username}`);
    }

    console.error("Noms restants :", [...clients.keys()]);
  });
});

server.on("error", (error) => {
  console.error(`Server error: ${error.message}`);
});

server.listen(PORT, HOST, async () => {
  if (REQUIRE_AUTH) {
    await database.open();
  }

  console.error(`Listening on ${HOST}:${PORT}`);
});