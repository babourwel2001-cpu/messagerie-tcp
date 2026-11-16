# Messagerie TCP - Node.js

Application de messagerie en ligne de commande utilisant TCP et des
messages JSON.

Le projet propose :

- une présentation automatique du client à la connexion ;
- des messages privés ;
- une diffusion générale ;
- une liste des utilisateurs connectés ;
- la création et la gestion de groupes ;
- un historique des messages de groupe ;
- des invitations ;
- l’exclusion, le bannissement et le débannissement ;
- un journal des événements des groupes.

Ce projet est pédagogique et ne doit pas être exposé directement
sur Internet.

Les sections 1 à 17 décrivent le socle de messagerie des parties
précédentes. Certaines vérifications et harmonisations y restent
à réaliser.

La partie 3 est en cours de développement et est documentée à partir
de la section 18. À ce stade, les premiers tests ECDH locaux passent,
mais ni l’authentification par mot de passe ni le canal chiffré
ne sont intégrés à la messagerie.

---

## 1. Prérequis et installation

Node.js et npm doivent être installés.

Depuis la racine du projet, installez les dépendances :

```bash
npm install
```

Les bibliothèques utilisées par le client comprennent notamment
`yargs` pour les arguments de lancement et `kleur` pour les couleurs.

---

## 2. Organisation du projet

```text
messagerie-tcp/
messagerie-tcp/
├── src/
│   ├── client/
│   │   ├── client.js
│   │   ├── client-ui.js
│   │   └── msg.json
│   ├── common/
│   │   ├── messages.js
│   │   └── protocol.js
│   └── server/
│       ├── server.js
│       └── groups.js
├── test/
│   └── ecdh-lab.test.js
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
```

### Client

`src/client/client.js` gère :

- les arguments de lancement ;
- la connexion TCP ;
- la présentation automatique ;
- la lecture des commandes au clavier ;
- la réception et l’affichage des réponses.

### Serveur

`src/server/server.js` gère :

- les connexions TCP ;
- le découpage et l’analyse des requêtes ;
- l’annuaire des utilisateurs connectés ;
- la présentation des utilisateurs ;
- les messages privés et la diffusion générale ;
- l’appel aux opérations de groupe ;
- l’envoi des réponses et des erreurs ;
- la fermeture des connexions.

### Gestion des groupes

`src/server/groups.js` contient :

- le stockage des groupes ;
- la création, l’adhésion et le départ ;
- la consultation des membres ;
- l’enregistrement des messages et la gestion de leur historique ;
- les invitations ;
- l’exclusion, le bannissement et le débannissement ;
- le journal des événements ;
- le nettoyage des appartenances lors d’une déconnexion.

Le module ne transmet pas directement de messages sur les sockets :
les envois réseau restent dans `server.js`.

### Protocole et constructeurs

- `src/common/protocol.js` définit les constantes des actions.
- `src/common/messages.js` construit les objets JSON échangés.

---

## 3. Lancement rapide

Ouvrez plusieurs terminaux à la racine du projet.

### Terminal 1 : serveur

```bash
npm run server
```

Le serveur utilise par défaut :

```text
Adresse : 127.0.0.1
Port    : 8080
```

### Terminal 2 : premier client

```bash
npm run client -- --name alice
```

### Terminal 3 : deuxième client

```bash
npm run client -- --name bob
```

Le nom est obligatoire et ne peut pas être vide.

Le client envoie automatiquement sa présentation à la connexion.
Il n’est pas nécessaire de taper `hello`.

---

## 4. Configuration réseau

Le client et le serveur utilisent les variables d’environnement :

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `SERVER_HOST` | Adresse d’écoute du serveur ou destination du client | `127.0.0.1` |
| `SERVER_PORT` | Port d’écoute du serveur ou port de destination du client | `8080` |

Le port doit être un entier compris entre 1 et 65535.

### Exemple : utilisation du port 9000

Serveur :

```bash
SERVER_HOST=127.0.0.1 SERVER_PORT=9000 npm run server
```

Client :

```bash
SERVER_HOST=127.0.0.1 SERVER_PORT=9000 npm run client -- --name alice
```

Ces exemples utilisent la syntaxe d’un terminal Bash.

Le client doit viser l’adresse et le port sur lesquels le serveur
est accessible.

L’adresse `127.0.0.1` correspond à la machine locale :
elle ne permet pas de joindre le serveur d’un autre ordinateur.

Un test entre deux ordinateurs nécessite une configuration réseau
adaptée. Ne pas exposer ce serveur pédagogique directement sur Internet.

---

## 5. Commandes de base

Les commandes sont saisies dans le terminal du client.

| Commande | Description |
|---|---|
| `s;destinataire;message` | Envoyer un message privé |
| `b;message` | Diffuser un message à tous les utilisateurs connectés |
| `ls` | Afficher les utilisateurs connectés |
| `q` | Quitter la messagerie |

### Message privé

Depuis Alice :

```text
s;bob;Salut Bob !
```

Chez Bob :

```text
[Privé] <alice> Salut Bob !
```

Le serveur ne renvoie actuellement pas de confirmation d’envoi privé
à l’expéditeur.

### Diffusion générale

```text
b;Bonjour tout le monde !
```

Tous les utilisateurs connectés reçoivent le message,
y compris son expéditeur.

Affichage :

```text
[À tous] <alice> Bonjour tout le monde !
```

### Liste des utilisateurs

```text
ls
```

La liste est triée par nom.

### Déconnexion volontaire

```text
q
```

Le serveur envoie `server-goodbye`, puis ferme la connexion.

---

## 6. Commandes de groupe

| Commande | Description |
|---|---|
| `cg;groupe` | Créer un groupe |
| `groups` | Afficher les groupes disponibles |
| `j;groupe` | Rejoindre un groupe |
| `members;groupe` | Afficher ses membres |
| `leave;groupe` | Quitter un groupe |
| `bg;groupe;message` | Envoyer un message au groupe |
| `messages;groupe` | Consulter l’historique |
| `invite;groupe;utilisateur` | Inviter un utilisateur |
| `kick;groupe;utilisateur;raison` | Exclure un membre |
| `ban;groupe;utilisateur;raison` | Bannir un membre |
| `unban;groupe;utilisateur` | Lever un bannissement |
| `states;groupe` | Consulter les événements |

### Exemple d’utilisation

Depuis Alice :

```text
cg;equipe
```

Depuis Bob :

```text
j;equipe
bg;equipe;Bonjour !
```

Depuis Alice :

```text
members;equipe
messages;equipe
states;equipe
```

---

## 7. Règles actuelles des groupes

Ces règles décrivent l’implémentation actuelle.
Certaines restent à harmoniser avec l’autre projet.

### Création et adhésion

- Le créateur devient automatiquement membre.
- Le nom du groupe est nettoyé avec `trim()`.
- Il ne peut pas être vide et ne doit pas dépasser 30 caractères.
- Deux groupes ne peuvent pas avoir le même nom.
- Les groupes sont ouverts : une invitation n’est pas obligatoire.
- Une personne bannie ne peut pas rejoindre le groupe.
- Une personne déjà membre ne peut pas le rejoindre une seconde fois.

### Consultation

Seuls les membres peuvent consulter :

- la liste des membres ;
- l’historique des messages ;
- le journal des événements.

La liste des groupes et celle des membres sont triées par nom.

### Messages de groupe

- Seuls les membres peuvent publier.
- Un message vide ou composé uniquement d’espaces est refusé.
- Les membres connectés reçoivent le message.
- L’expéditeur reçoit également son propre message.
- Chaque message est enregistré dans l’historique avec une date.

### Invitations

- Seul le créateur peut inviter.
- La cible ne doit être ni membre ni bannie.
- Une personne connectée reçoit une notification immédiatement.
- Une invitation peut être enregistrée pour une personne absente.
- Aucune notification différée n’est prévue à la reconnexion.
- Rejoindre le groupe consomme l’invitation.
- Une invitation répétée est réenregistrée et ajoute un nouvel événement.

L’invitation ne rend pas le groupe privé :
l’adhésion reste ouverte aux personnes non bannies.

### Exclusion et bannissement

- Seul le créateur peut exclure, bannir ou débannir.
- Il ne peut pas s’exclure ou se bannir lui-même.
- La cible d’une exclusion ou d’un bannissement doit être membre.
- L’exclusion retire la personne des membres et supprime son invitation.
- Une personne exclue peut rejoindre à nouveau le groupe.
- Le bannissement retire la personne des membres, supprime son invitation
  et empêche une nouvelle adhésion.
- Le débannissement ne réinscrit pas automatiquement la personne.
- Sans raison renseignée, la raison utilisée est `aucune raison`.

Les confirmations sont envoyées au modérateur.
La personne exclue ou bannie ne reçoit pas encore de notification directe
dans ces traitements.

### Départ et rôle du créateur

- La commande `leave` retire la personne des membres.
- Le rôle du créateur n’est pas transféré.
- Le créateur reste enregistré comme créateur même s’il quitte le groupe.
- Les contrôles actuels lui permettent donc encore d’inviter et de modérer
  lorsqu’il est connecté sous ce nom.
- Un groupe vide n’est pas automatiquement supprimé.

Ce comportement doit être revu ou confirmé dans l’accord commun.

---

## 8. Historique des messages

Chaque message enregistré possède cette structure :

```json
{
  "sender": "alice",
  "msg": "Bonjour",
  "date": "2026-10-19T21:30:00.000Z"
}
```

La date est produite par le serveur avec :

```js
new Date().toISOString()
```

Chaque groupe conserve les 100 derniers messages.

Lorsqu’un nouveau message dépasse cette limite,
le message le plus ancien est supprimé.

Les messages sont conservés dans l’ordre d’enregistrement,
du plus ancien au plus récent.

Consultation :

```text
messages;equipe
```

Seuls les membres peuvent accéder à cet historique.

---

## 9. Journal des événements

Chaque événement contient :

- `actor` : utilisateur à l’origine de l’événement ;
- `type` : type d’événement ;
- `details` : informations supplémentaires ;
- `timestamp` : date de l’événement.

Exemple :

```json
{
  "actor": "alice",
  "type": "user-banned",
  "details": {
    "dest": "bob",
    "reason": "Test de modération"
  },
  "timestamp": "2026-10-19T21:30:00.000Z"
}
```

Types actuellement enregistrés :

| Type | Signification |
|---|---|
| `group-created` | Création du groupe |
| `user-joined` | Arrivée d’un membre |
| `user-left` | Départ volontaire d’un membre |
| `user-invited` | Invitation |
| `user-kicked` | Exclusion |
| `user-banned` | Bannissement |
| `user-unbanned` | Débannissement |
| `user-disconnected` | Retrait d’un membre à la fermeture de sa connexion |

Consultation :

```text
states;equipe
```

Seuls les membres peuvent consulter le journal.

Le nombre d’événements n’est pas encore limité.

---

## 10. Déconnexion et reconnexion

Lorsqu’une connexion se ferme :

- le nom est retiré de l’annuaire des utilisateurs connectés ;
- la personne est retirée des groupes dont elle était membre ;
- un événement `user-disconnected` est ajouté dans ces groupes ;
- ses invitations en attente sont supprimées ;
- ses bannissements restent conservés.

Une reconnexion ne restaure pas automatiquement les appartenances :
la personne doit refaire `j;groupe`.

Les groupes vides restent conservés.

Le nettoyage ne transfère pas le rôle du créateur.

---

## 11. Format des échanges TCP

L’implémentation actuelle utilise :

```text
Un objet JSON encodé en UTF-8, suivi de \n.
```

Exemple de présentation :

```json
{"sender":"alice","action":"client-hello"}
```

Chaque envoi ajoute un délimiteur :

```js
socket.write(JSON.stringify(message) + "\n");
```

À la réception, les programmes :

1. accumulent les données dans un tampon ;
2. recherchent les fins de ligne ;
3. extraient les lignes complètes ;
4. analysent chaque ligne comme un objet JSON ;
5. conservent le fragment incomplet pour la réception suivante.

Ils ne supposent pas qu’un événement `data` contient exactement
un message complet.

### Présentation et identité

- La présentation est obligatoire avant les autres commandes.
- Le champ utilisé pour la présentation est `sender`.
- Le nom est nettoyé avec `trim()`.
- Le nom ne peut pas être vide et ne doit pas dépasser 30 caractères.
- Un nom déjà connecté est refusé.
- Une seconde présentation sur la même connexion est refusée.
- Après présentation, le serveur utilise l’identité enregistrée
  sur la connexion pour identifier l’expéditeur.

Cela ne constitue pas une authentification :
aucun mot de passe ne prouve l’identité associée au nom.

---

## 12. Actions du protocole

### Messagerie de base

| Requête | Réponse ou événement principal |
|---|---|
| `client-hello` | `server-hello` |
| `client-send` | `server-message`, envoyé au destinataire |
| `client-broadcast` | `server-broadcast` |
| `client-list-clients` | `server-clients` |
| `client-quit` | `server-goodbye` |

Les erreurs utilisent :

```json
{
  "action": "server-error",
  "msg": "Description de l’erreur"
}
```

### Groupes

| Requête | Réponse ou événement principal |
|---|---|
| `cgroupe` | `server-group-created` |
| `groups` | `server-groups` |
| `join` | `server-group-joined` |
| `members` | `server-members` |
| `leave` | `server-group-left` |
| `gbroadcast` | `server-group-message` |
| `msgs` | `server-group-messages` |
| `invite` | `server-group-invited` et notification `server-group-invitation` |
| `kick` | `server-group-kicked` |
| `ban` | `server-group-banned` |
| `unban` | `server-group-unbanned` |
| `states` | `server-group-states` |

La requête `groups` utilise le champ `name`, et non `sender` :

```json
{
  "action": "groups",
  "name": "alice"
}
```

Les définitions des actions se trouvent dans `src/common/protocol.js`.
Les objets sont construits dans `src/common/messages.js`.

---

## 13. Limites connues

### Taille des messages

Le client et le serveur limitent les lignes reçues à 8 192 octets,
sans compter le délimiteur `\n`.

Un fragment incomplet dépassant cette limite provoque également
la fermeture de la connexion.

La limite de 100 messages par groupe ne garantit pas qu’une réponse
d’historique respecte cette taille.

Un historique volumineux peut donc encore provoquer la déconnexion
du client. Une pagination ou une limitation de la taille des réponses
reste à ajouter.

### Stockage

Tout est conservé en mémoire :

- groupes ;
- messages ;
- événements ;
- invitations ;
- bannissements.

Un redémarrage du serveur efface ces données.

### Sécurité

- Pas d’authentification par mot de passe.
- Pas de chiffrement applicatif.
- Le nom d’utilisateur ne prouve pas l’identité.
- Les droits sont associés aux noms.
- Une autre personne reprenant un nom disponible peut retrouver
  les droits ou restrictions encore associés à ce nom.

Ce serveur est destiné à des essais pédagogiques locaux
ou sur un réseau de test maîtrisé.

---

## 14. Vérifications manuelles

### Messages privés et diffusion

Avec Alice et Bob connectés, depuis Alice :

```text
ls
s;bob;Salut Bob !
b;Bonjour tout le monde !
```

Vérifier que :

- la liste contient les deux utilisateurs ;
- Bob reçoit le message privé ;
- Alice et Bob reçoivent la diffusion.

### Groupes

Depuis Alice :

```text
cg;test
```

Depuis Bob :

```text
j;test
bg;test;Bonjour Alice !
members;test
messages;test
states;test
```

Vérifier les membres, la réception du message, sa date
et les événements.

### Modération

Depuis Alice :

```text
kick;test;bob;Test exclusion
```

Depuis Bob :

```text
j;test
```

Depuis Alice :

```text
ban;test;bob;Test bannissement
```

Depuis Bob :

```text
j;test
```

La nouvelle adhésion doit être refusée.

Depuis Alice :

```text
unban;test;bob
```

Depuis Bob :

```text
j;test
```

L’adhésion doit redevenir possible.

### Limite de l’historique

Pour un test court :

1. mettre temporairement `MAX_GROUP_MESSAGES` à `3` dans `groups.js` ;
2. redémarrer le serveur et créer un groupe ;
3. envoyer quatre messages ;
4. vérifier que seuls les messages 2, 3 et 4 restent dans l’historique ;
5. remettre la limite à `100`.

### Cas d’erreur à vérifier

- nom déjà connecté ;
- groupe inexistant ;
- consultation par un non-membre ;
- opération de modération par une personne non autorisée ;
- message privé vers un destinataire absent ;
- adhésion d’une personne bannie ;
- JSON invalide ;
- objet ou champs invalides ;
- message dépassant la limite de taille.

---

## 15. Compatibilité avec l’autre implémentation

Les améliorations internes ne garantissent pas encore
la compatibilité entre les deux projets.

Les points suivants doivent être harmonisés :

- champ de présentation : `sender` ou `name` ;
- découpage des messages ;
- noms et champs des réponses ;
- accusés de réception ;
- destinataires des diffusions ;
- règles d’invitation et de modération ;
- départ du créateur ;
- suppression des groupes vides ;
- appartenance après déconnexion ;
- structure et limites des historiques et événements.

Les requêtes imposées par le sujet ne doivent pas être modifiées
unilatéralement.

Après accord, effectuer les tests dans les deux sens :

1. ce client avec l’autre serveur ;
2. l’autre client avec ce serveur.

Pour chaque test, noter :

- la configuration ;
- la requête ;
- le résultat attendu ;
- le résultat observé ;
- le statut du test.

---

## 16. Améliorations réalisées

- Configuration de l’adresse et du port par variables d’environnement.
- Validation du port de lancement.
- Ajout des dates aux messages de l’historique.
- Conservation des 100 derniers messages par groupe.
- Affichage dédié des messages privés et des diffusions.
- Extraction de la logique des groupes dans `src/server/groups.js`.

## 17. Travaux restants

- Vérifier les fichiers complets après la réorganisation.
- Nettoyer les imports devenus inutiles.
- Traiter les réponses d’historique trop volumineuses.
- Limiter ou paginer le journal des événements.
- Valider les règles de groupe avec l’autre implémentation.
- Harmoniser le protocole.
- Effectuer et consigner les tests croisés.

---

## 18. Partie 3 — Objectifs et répartition

La partie 3 ajoute deux responsabilités distinctes :

- reconnaître durablement les utilisateurs grâce à des comptes ;
- protéger les échanges réseau de la messagerie.

### Répartition du travail

| Branche | Responsabilités principales | Travaux pratiques |
|---|---|---|
| `partie3-securite` | ECDH, HKDF, AES-256-CBC, HMAC, séquences et cadrage des enveloppes | TP 07 à 09 |
| `partie3-comptes` | SQLite, bcrypt, identité de session et historique persistant | TP 03 à 06 |

La préparation et les observations réseau des TP 01 et 02,
l’intégration du TP 10 et l’analyse des limites du TP 11
sont réalisées en commun.

### Méthode de validation

Chaque étape distingue :

1. le problème à résoudre ;
2. le mécanisme retenu ;
3. les tests exécutés ;
4. les résultats observés ;
5. les limites de ce qui a été démontré.

Une fonctionnalité prévue ou testée isolément n’est pas considérée
comme intégrée à la messagerie.

---

## 19. TP 07 — Première expérience ECDH

### Objectif

Vérifier le fonctionnement local d’ECDH avant de développer
la négociation sur TCP.

### Fichier de test

`test/ecdh-lab.test.js`

### Organisation de l’expérience

Le test simule un client et un serveur dans un même processus,
sans connexion réseau.

Chaque participant génère une paire de clés sur la courbe
`prime256v1`. Il calcule ensuite un secret avec sa propre clé privée
et la clé publique de l’autre participant.

Les clés privées et les secrets partagés ne sont pas affichés.

### Exécution

Depuis la racine du projet :

```bash
node --test test/ecdh-lab.test.js
```

### Résultats observés

Exécution du 11 novembre 2026 :

| Test | Résultat |
|---|---|
| Le client et le serveur obtiennent le même secret | Réussi |
| Deux sessions indépendantes ont des secrets différents | Réussi |
| Un point invalide est rejeté | Réussi |

Bilan : 3 tests exécutés, 3 réussis, 0 échec.

### Portée des tests

Le premier test vérifie l’égalité des secrets calculés
par les deux participants.

Le deuxième vérifie que les deux sessions indépendantes
créées pendant l’exécution ne produisent pas le même secret.
Il ne constitue pas une analyse statistique du hasard.

Le troisième vérifie le rejet d’un point invalide particulier.
Il ne couvre pas toutes les entrées malformées possibles.

### Limites actuelles

Ces tests ne vérifient pas encore :

- l’échange des clés sur TCP ;
- la validation complète des messages de négociation ;
- la gestion d’une négociation invalide par le serveur ;
- l’identité du serveur ;
- la dérivation des clés avec HKDF ;
- le chiffrement et l’intégrité des messages ;
- la protection contre le rejeu.

Aucun message de discussion n’est encore protégé par ce travail.

---

## 20. Partie 3 -  État d’avancement de la sécurité

### TP 07 — Échange ECDH

- [x] Créer une expérience locale avec deux participants.
- [x] Vérifier l’égalité des secrets calculés.
- [x] Vérifier le renouvellement entre deux sessions de test.
- [x] Vérifier le rejet d’un point invalide.
- [x] Créer le module commun `src/common/crypto.js`.
- [x] Ajouter les constantes `client-key` et `server-key`.
- [x] Ajouter et tester les constructeurs des messages de négociation.
- [x] Valider les messages complets `client-key` et `server-key`.
- [x] Tester les champs manquants, supplémentaires et invalides.
- [x] Vérifier le rejet d'un point elliptique invalide.
- [ ] Définir et valider le format des clés publiques et des nonces.
- [x] Brancher la négociation sur TCP.
- [x] Tester la fermeture propre d’une négociation invalide.
- [x] Bloquer les commandes métier avant l’intégration du canal protégé.
- [x] Dérivre les clés de session avec HKDF côté client et côté serveur.

### Validation locale de la négociation et de HKDF

Fichiers de tests exécutés :

- `test/ecdh-lab.test.js`
- `test/crypto.test.js`
- `test/negociation.test.js`
- `test/hkdf.test.js`
- `test/enveloppe.test.js`

Commande depuis la racine du projet :

node --test test/ecdh-lab.test.js test/crypto.test.js test/negociation.test.js test/hkdf.test.js test/enveloppe.test.js

Résultat observé le 13 novembre 2026 :
38 tests exécutés, 38 réussis, 0 échec.

Ces tests ne valident pas encore la négociation sur TCP,
la gestion des états de connexion ni la fermeture d'une socket
après réception d'un message invalide.

### Premier essai ECDH sur TCP

Essai réalisé le 13 novembre 2026 avec le client classique
`src/client/client.js`.

Commande :

    npm run client -- --name alice

Résultats observés côté client :

- connexion TCP établie ;
- envoi du message de clé ;
- réception et validation de la réponse du serveur ;
- calcul local du secret ECDH ;
- fermeture du client avec la commande locale `q`.

Le canal chiffré n'est pas encore implémenté.
Cet essai ne vérifie pas à lui seul l'égalité des secrets
des deux côtés ni l'identité du serveur.

### Essai ECDH et HKDF sur TCP

Essai réalisé avec le client classique `src/client/client.js`.

Commande :

    npm run client -- --name alice

Résultats observés côté client :

- connexion TCP établie ;
- envoi du message `client-key` ;
- réception et validation de la réponse `server-key` ;
- calcul du secret ECDH ;
- dérivation des clés de session avec HKDF ;
- effacement du Buffer du secret ECDH ;
- blocage de la commande `ls` ;
- fermeture propre avec `q`.

Résultats attendus côté serveur :

- réception et validation de `client-key` ;
- création de sa propre paire de clés ECDH ;
- calcul du secret ECDH ;
- dérivation des clés de session avec HKDF ;
- envoi de `server-key` ;
- effacement du Buffer du secret ECDH ;
- rejet des messages suivants, car le canal protégé n'est pas disponible.

Les clés de session ne sont ni affichées ni transmises.

L'ordre de dérivation est identique chez les deux participants :

    clientNonce suivi de serverNonce

Le chiffrement AES et l'authentification HMAC ne sont pas encore intégrés.
Cet essai ne prouve pas à lui seul que les clés dérivées sont identiques
des deux côtés : cette compatibilité sera vérifiée lors de l'échange
des premières enveloppes protégées.

### Blocage des commandes avant le canal protégé

Après la négociation ECDH, la commande `ls` a été saisie
dans le client classique.

Résultat observé :

    Commandes indisponibles : chiffrement et intégrité non encore intégrés.

Le blocage local de cette commande est vérifié.
Le refus d'une commande envoyée directement au serveur
doit encore être testé séparément.

### Dérivation des clés

- [x] Implémenter HKDF-SHA-256 selon le contrat du sujet.
- [x] Vérifier que les deux participants dérivent les mêmes clés.
- [x] Vérifier qu’un changement de contexte ou de nonce
      modifie les clés dérivées.
- [x] Vérifier la reproductibilité avec les mêmes entrées.
- [x] Vérifier la séparation des clés de chiffrement et de MAC.
- [x] Rejeter les types et tailles incorrects.

La dérivation est implémentée dans `deriverClesSession()`
de `src/common/crypto.js`.

Paramètres utilisés :

- fonction de dérivation : HKDF-SHA-256 ;
- secret d’entrée : secret ECDH de 32 octets ;
- sel : `clientNonce` suivi de `serverNonce` ;
- contexte : `messagerie-tcp-v1` ;
- sortie : 64 octets ;
- 32 premiers octets : clé de chiffrement AES ;
- 32 derniers octets : clé HMAC.

Les deux participants utilisent le même ordre de nonces :
`clientNonce` puis `serverNonce`.

Fichier de tests : `test/hkdf.test.js`.

Commande :

```bash
node --test test/hkdf.test.js
```

Résultat observé : 8 tests exécutés, 8 réussis, 0 échec.

Ces tests valident la dérivation locale. Ils ne prouvent pas
encore que le client et le serveur utilisent HKDF sur TCP,
ni que les clés produites sont compatibles lors d’une connexion réelle.

### TP 08 - Enveloppe chiffrée et authentifiée

- [x] Implémenter AES-256-CBC avec un nouvel IV par message.
- [x] Définir les octets couverts par le HMAC.
- [x] Vérifier le HMAC avant le déchiffrement.
- [x] Tester un aller-retour et les altérations de l’enveloppe.
- [x] Rejeter une enveloppe créée avec une autre clé HMAC.
- [x] Rejeter les champs invalides.

L’enveloppe est créée et ouverte dans `src/common/crypto.js`.

Le HMAC couvre :

- la version de l’enveloppe ;
- l’expéditeur ;
- le destinataire ;
- la séquence ;
- l’IV ;
- le texte chiffré.

Le HMAC est vérifié avant le déchiffrement.
Une altération de l’un de ces éléments est donc rejetée.

Fichier de tests : `test/enveloppe.test.js`.

Commande :

```bash
node --test test/enveloppe.test.js
```

Résultat observé : 10 tests exécutés, 10 réussis, 0 échec.

Ces tests valident l’enveloppe localement. Ils ne prouvent pas
encore que le client et le serveur échangent des enveloppes
sur TCP, ni que les séquences empêchent le rejeu.

### TP 09 - Rejeu et cadrage TCP

- [x] Gérer les séquences indépendamment dans chaque direction.
- [x] Définir le traitement des sauts et du dépassement du compteur.
- [x] Rejeter les enveloppes rejouées.
- [x] Tester les enveloppes fragmentées et regroupées.
- [x] Limiter les tailles et le tampon de réception.
- [x] Intégrer le cadrage TCP côté client et côté serveur.
- [x] Vérifier la négociation ECDH et HKDF après l’intégration du cadrage.

La gestion des séquences est implémentée dans `creerSequence()`
de `src/common/crypto.js`.

Chaque direction de communication possède son propre compteur.
La première séquence attendue est 1.

Une enveloppe est acceptée uniquement si sa séquence est
exactement égale à la séquence attendue.

Sont donc rejetés :

- une séquence déjà utilisée ;
- une séquence plus ancienne ;
- une séquence qui saute un ou plusieurs compteurs ;
- une séquence invalide ;
- une séquence au-delà du compteur maximal.

Le cadrage TCP est implémenté avec `encoderEnveloppe()`
et `extraireEnveloppes()`.

Chaque message JSON est terminé par `\n`.

Le tampon de réception :

- conserve les fragments incomplets ;
- extrait les messages complets ;
- accepte plusieurs messages dans un même événement `data` ;
- rejette une enveloppe dépassant 16 384 octets ;
- rejette un tampon dépassant 65 536 octets ;
- rejette un JSON invalide.

Fichiers de tests :

- `test/sequence.test.js`
- `test/framing.test.js`

Commandes :

```bash
node --test test/sequence.test.js
node --test test/framing.test.js
```

Résultats observés :

| Fichier | Tests | Réussis | Échecs |
|---|---:|---:|---:|
| `test/sequence.test.js` | 8 | 8 | 0 |
| `test/framing.test.js` | 9 | 9 | 0 |

Validation TCP :

Après l’intégration du cadrage, la négociation ECDH et la dérivation
HKDF ont été vérifiées entre le client et le serveur.

Le client envoie `client-key`, le serveur répond `server-key`,
puis les deux participants calculent leur secret ECDH
et dérivent leurs clés de session.

Les commandes métier restent bloquées tant que le canal
chiffré et authentifié n’est pas intégré à la messagerie.

### Intégration et analyse

- [x] TP 10 : intégrer l’authentification et la messagerie
      au canal protégé.
- [x] Rejouer les scénarios des parties précédentes.
- [x] Comparer les captures réseau avant et après protection.
- [x] TP 11 : expliquer l’attaque de l’homme du milieu.
- [x] Implémenter une variante TLS de la messagerie.
- [x] Valider la confidentialité des échanges TLS par capture réseau.
- [x] Décrire une évolution vers TLS avec validation du serveur.

### Points de contrat à préciser

Avant l’intégration et les tests croisés, documenter :

- l’encodage et le format des clés publiques ;
- la taille et l’encodage des nonces ;
- les règles de validation des messages de négociation ;
- la représentation binaire utilisée pour calculer le HMAC ;
- les règles des compteurs de séquence ;
- les limites du message applicatif et de l’enveloppe ;
- le comportement en cas d’erreur et de déconnexion ;
- l’interface entre le canal sécurisé et la couche applicative.

Les paramètres déjà imposés par le sujet doivent être conservés.
Les choix complémentaires ne doivent pas être décidés
unilatéralement avant un test croisé.

---


## 21. TP 10 - Intégration de la messagerie au canal protégé

### Objectif

Intégrer les commandes de messagerie au canal chiffré et authentifié
établi après la négociation ECDH et la dérivation HKDF.


### Fonctionnement réalisé

Après la réception de `server-key`, le client et le serveur dérivent
leurs clés de session avec HKDF.

Le client envoie ensuite `client-hello` dans une enveloppe protégée.
Le serveur vérifie la séquence, le HMAC et déchiffre le message
avant de traiter la présentation.

Une fois le client enregistré, toutes les commandes métier sont
envoyées et reçues dans des enveloppes protégées.


### Séquences

Chaque connexion possède deux compteurs indépendants :

- `sequenceClient` : client vers serveur ;
- `sequenceServeur` : serveur vers client.

La première séquence attendue est 1.

Le serveur rejette une enveloppe dont la séquence n’est pas
exactement la séquence attendue. Cela empêche le rejeu,
les sauts de séquence et l’utilisation d’une séquence ancienne.


### Commandes protégées

Les commandes suivantes sont désormais transmises dans le canal
chiffré et authentifié :

- `ls` ;
- `s;destinataire;message` ;
- `b;message` ;
- `cg;groupe` ;
- `groups` ;
- `j;groupe` ;
- `members;groupe` ;
- `leave;groupe` ;
- `bg;groupe;message` ;
- `messages;groupe` ;
- `invite;groupe;utilisateur` ;
- `kick;groupe;utilisateur;raison` ;
- `ban;groupe;utilisateur;raison` ;
- `unban;groupe;utilisateur` ;
- `states;groupe` ;
- `q`.


### Validation manuelle

Le serveur a été lancé avec :

```bash
npm run server
```

Alice et Bob ont été lancés avec :

```bash
npm run client -- --name alice
npm run client -- --name bob
```

La commande suivante a été testée depuis Alice :

```text
ls
```

Résultat observé côté Alice :

```text
Utilisateurs connectés :
alice, bob
```

Résultat observé côté serveur :

```text
Action reçue de alice : client-list-clients
```

Les messages privés, la diffusion générale et les commandes de groupe
ont également été vérifiés sur le canal protégé.


### Erreur rencontrée et corrigée

Lors des premiers essais, la commande `ls` provoquait la déconnexion
immédiate du client.

Deux causes ont été identifiées :

- les commandes métier étaient imbriquées dans le traitement
  de `client-hello` côté serveur ;
- le client fermait la connexion lorsqu’il recevait une réponse
  `server-clients`, car cette action était considérée comme inattendue.

Après séparation du traitement de `client-hello` et des commandes
métier, puis correction de la gestion des réponses côté client,
la commande `ls` fonctionne correctement.

Une erreur `Séquence invalide` a également été observée lors de
l’envoi d’une deuxième commande. Elle a été corrigée en utilisant
des compteurs de séquence locaux, propres à chaque connexion
et à chaque direction.


### Tests automatisés

La suite complète a été exécutée avec :

```bash
npm test
```

Résultat observé le 16 novembre 2026 :

| Indicateur | Valeur |
|---|---:|
| Tests exécutés | 62 |
| Tests réussis | 62 |
| Tests échoués | 0 |


### Limites actuelles

L’intégration protège les échanges après la négociation, mais :

- l’identité du serveur n’est pas encore authentifiée ;
- l’attaque de l’homme du milieu reste possible ;
- l’authentification par mot de passe n’est pas encore intégrée ;
- les comptes et l’historique ne sont pas encore persistés.

---


## 22. TP 10 - Observation réseau du canal protégé

### Objectif

Vérifier que les messages de la messagerie ne sont plus transmis
en clair après la négociation ECDH et la dérivation HKDF.

La capture réseau permet d’observer les paquets TCP échangés entre
le client et le serveur, puis de vérifier que le contenu des messages
n’apparaît pas en texte lisible.


### Outil utilisé

La capture a été réalisée avec `tshark`, l’outil en ligne de commande
de Wireshark.


### Préparation

Fermer le serveur et les clients avant de démarrer la capture.


### Démarrer la capture

Dans un premier terminal, lancer la capture sur l’interface de
bouclage local et filtrer le port 8080 :

```bash
sudo tshark -i lo -f "port 8080" -w /tmp/capture-partie3.pcap
```

La capture est enregistrée dans :

```text
/tmp/capture-partie3.pcap
```

Laisser cette commande active pendant le test.


### Lancer le serveur et les clients

Dans un deuxième terminal, lancer le serveur :

```bash
npm run server
```

Dans un troisième terminal, lancer Alice :

```bash
npm run client -- --name alice
```

Dans un quatrième terminal, lancer Bob :

```bash
npm run client -- --name bob
```


### Effectuer un test

Depuis Alice, envoyer une commande de liste puis un message privé :

```text
ls
s;bob;message secret
```

Bob doit recevoir le message privé :

```text
[Privé] <alice> message secret
```


### Arrêter la capture

Dans le terminal de `tshark`, arrêter la capture avec :

```text
Ctrl+C
```


### Vérifier les paquets capturés

Afficher les paquets TCP liés au port 8080 :

```bash
tshark -r /tmp/capture-partie3.pcap -Y "tcp.port == 8080" | head -n 20
```

La capture doit contenir :

- les connexions TCP des clients vers le serveur ;
- les échanges de négociation ECDH ;
- les enveloppes chiffrées et authentifiées ;
- les réponses du serveur.


### Vérifier l’absence du message en clair

Rechercher le texte du message dans la capture :

```bash
strings /tmp/capture-partie3.pcap | grep -F "message secret"
```

Résultat attendu :

```text
Aucune sortie
```

Le texte `message secret` ne doit pas apparaître dans la capture.


### Résultat observé

La capture contient bien les connexions des clients Alice et Bob
vers le serveur sur le port 8080.

Les échanges après la négociation apparaissent sous forme de
données binaires dans les paquets TCP.

La recherche du texte `message secret` ne renvoie aucun résultat.
Le contenu applicatif des messages n’apparaît donc pas en clair
dans le trafic réseau.

Cette observation confirme que les messages transmis après la
négociation sont protégés par le canal chiffré et authentifié.


### Limites de l’observation

Cette capture démontre que le texte du message n’est pas visible
en clair dans le trafic TCP.

Elle ne prouve pas à elle seule que le serveur est authentifié.
Une attaque de l’homme du milieu reste possible sans validation
de l’identité du serveur.

Cette limite est analysée dans le TP 11.

---


---


## 23. TP 11 - Homme du milieu et évolution vers TLS

### Objectif

Analyser la principale limite de la négociation ECDH actuelle :
l’absence d’authentification du serveur.

Le canal chiffré et authentifié protège les messages après la
négociation, mais il ne prouve pas encore que le client communique
avec le serveur légitime.


### Fonctionnement actuel

Le client et le serveur échangent leurs clés publiques ECDH.

Chaque participant calcule ensuite le même secret partagé à partir
de sa clé privée et de la clé publique de l’autre participant.

Ce secret est utilisé pour dériver deux clés de session avec HKDF :

- une clé de chiffrement AES ;
- une clé d’authentification HMAC.

Les messages applicatifs sont ensuite transmis dans des enveloppes
chiffrées avec AES-256-CBC et authentifiées avec HMAC-SHA-256.


### Attaque de l’homme du milieu

Un attaquant peut se placer entre le client et le serveur.

Lors de la négociation, il intercepte la clé publique du serveur
et l’envoie au client. Il intercepte également la clé publique
du client et l’envoie au serveur.

L’attaquant établit alors deux négociations distinctes :

- une négociation avec le client ;
- une négociation avec le serveur.

Le client calcule un secret partagé avec l’attaquant.
Le serveur calcule également un secret partagé avec l’attaquant.

Le client croit parler au serveur, alors qu’il parle à l’attaquant.
Le serveur croit parler au client, alors qu’il parle à l’attaquant.

L’attaquant peut donc :

- déchiffrer les messages du client ;
- lire leur contenu ;
- les modifier ;
- les rechiffrer pour le serveur ;
- faire la même opération dans l’autre sens.

Le client et le serveur ne peuvent pas détecter cette attaque
lors de la négociation, car ils n’ont aucun moyen de vérifier
l’identité de leur interlocuteur.


### Pourquoi la capture réseau ne suffit pas

La capture réalisée avec `tshark` montre que le texte du message
n’apparaît pas en clair dans le trafic TCP.

Cela prouve que les messages sont chiffrés après la négociation.
Cela ne prouve pas que le client communique réellement avec le
serveur légitime.

Un attaquant peut également proposer une clé publique ECDH et
établir un canal chiffré avec le client. Le trafic restera chiffré,
mais il sera chiffré entre le client et l’attaquant.


### Rôle de l’authentification du serveur

Pour empêcher cette attaque, le client doit pouvoir vérifier
l’identité du serveur avant d’établir le canal sécurisé.

Le serveur doit posséder un certificat contenant :

- son identité ;
- sa clé publique ;
- la signature d’une autorité de certification.

Le client vérifie que le certificat est valide et qu’il correspond
bien au serveur auquel il souhaite se connecter.

Le serveur prouve ensuite qu’il possède la clé privée associée
au certificat.


### Évolution vers TLS

TLS résout ce problème en associant l’échange de clés à une
authentification du serveur.

Le fonctionnement souhaité est le suivant :

1. le client se connecte au serveur ;
2. le serveur présente son certificat ;
3. le client vérifie le certificat et l’identité du serveur ;
4. le serveur prouve qu’il possède la clé privée du certificat ;
5. le client et le serveur établissent une clé de session ;
6. les messages sont chiffrés et authentifiés.

Avec TLS, un attaquant ne peut pas se faire passer pour le serveur
sans posséder la clé privée correspondant au certificat du serveur.


### Comparaison avec l’implémentation actuelle

| Élément | Implémentation actuelle | TLS |
|---|---|---|
| Échange de clés | ECDH | ECDHE ou autre mécanisme TLS |
| Secret partagé | Oui | Oui |
| Chiffrement des messages | AES-256-CBC | AES-GCM ou autre suite TLS |
| Intégrité des messages | HMAC-SHA-256 | Tag d’authentification de la suite TLS |
| Protection contre le rejeu | Séquences par direction | Numéros de séquence TLS |
| Identité du serveur | Non vérifiée | Certificat vérifié |
| Protection contre l’homme du milieu | Non | Oui, si le certificat est valide |


### Travaux réalisés

- [x] Expliquer le scénario d’attaque de l’homme du milieu.
- [x] Comparer la négociation actuelle avec TLS.
- [x] Décrire le rôle du certificat et de l’autorité de certification.
- [x] Proposer une évolution vers TLS avec validation du serveur.


### Limites restantes

L’implémentation actuelle ne valide pas l’identité du serveur.
Une attaque de l’homme du milieu reste donc possible.

L’authentification des utilisateurs, la persistance des comptes
et l’historique persistant relèvent de la branche
`partie3-comptes`.

---


## 24. TP 11 — Implémentation et validation de TLS

### Objectif

Ajouter une variante de la messagerie utilisant TLS afin de protéger
les échanges réseau et d’authentifier l’identité du serveur.

La variante TLS est séparée de l’implémentation ECDH, HKDF,
AES-256-CBC et HMAC-SHA-256. Elle permet de comparer les deux
approches sans modifier la messagerie déjà fonctionnelle.


### Fichiers ajoutés

| Fichier | Rôle |
|---|---|
| `src/server/server-tls.js` | Serveur TLS de la messagerie |
| `src/client/client-tls.js` | Client TLS de la messagerie |
| `certs/server-key.pem` | Clé privée du serveur |
| `certs/server-cert.pem` | Certificat auto-signé du serveur |


### Fonctionnement de TLS

TLS remplace les mécanismes de sécurité implémentés manuellement
dans la première variante :

| Élément | Implémentation ECDH maison | Implémentation TLS |
|---|---|---|
| Transport | TCP brut | TLS sur TCP |
| Échange de clés | ECDH | Négociation TLS |
| Dérivation des clés | HKDF-SHA-256 | Dérivation de clés TLS |
| Chiffrement | AES-256-CBC | Chiffrement négocié par TLS |
| Intégrité | HMAC-SHA-256 | Authentification TLS |
| Protection contre le rejeu | Séquences applicatives | Séquences TLS |
| Identité du serveur | Non vérifiée | Certificat vérifié |
| Protection contre l’homme du milieu | Non | Oui |


### Certificat du serveur

Un certificat auto-signé a été créé pour les tests locaux.

Commande utilisée :

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 365 \
  -nodes -keyout certs/server-key.pem \
  -out certs/server-cert.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Le certificat contient :

- le nom `localhost` ;
- l’adresse IP `127.0.0.1` ;
- la clé publique du serveur ;
- la signature du certificat.

La clé privée du serveur n’est jamais transmise sur le réseau.


### Vérification du certificat

Le client TLS vérifie le certificat du serveur avec :

```js
rejectUnauthorized: true
```

Il fournit également le certificat du serveur comme autorité
de confiance :

```js
ca: fs.readFileSync("certs/server-cert.pem")
```

Ainsi, le client vérifie que le serveur possède bien le certificat
attendu avant d’établir la session TLS.

Un attaquant ne peut pas se faire passer pour le serveur sans
posséder la clé privée correspondant au certificat.


### Protocole applicatif

Le protocole applicatif reste identique à celui de la messagerie.

Les commandes et les réponses sont envoyées en JSON, avec une
commande par ligne :

```text
{"action":"client-hello","sender":"alice"}\n
```

TLS chiffre et authentifie l’ensemble de ces échanges.


### Scripts npm

Les scripts suivants ont été ajoutés à `package.json` :

```json
"server:tls": "node src/server/server-tls.js",
"client:tls": "node src/client/client-tls.js"
```

### Lancement

Dans un premier terminal :

```bash
npm run server:tls
```

Dans un deuxième terminal :

```bash
npm run client:tls -- --name alice
```

Dans un troisième terminal :

```bash
npm run client:tls -- --name bob
```


### Test réalisé

Depuis Alice :

```text
ls
s;bob;message secret TLS
```

Bob reçoit le message privé :

```text
[Privé] <alice> message secret TLS
```

La commande `ls` affiche également les utilisateurs connectés.


### Observation réseau

Une capture TCP a été réalisée avec `tshark` sur l’interface de
bouclage local, en filtrant le port 8443.

Commande de capture :

```bash
sudo tshark -i lo -f "port 8443" -w /tmp/capture-tls.pcap
```

Affichage des paquets capturés :

```bash
tshark -r /tmp/capture-tls.pcap -Y "tcp.port == 8443" | head -n 20
```

La capture montre :

- les connexions TCP des clients vers le serveur ;
- un `Client Hello` avec le nom `localhost` ;
- des enregistrements `TLSv1.3 Application Data` ;
- les échanges chiffrés entre le client et le serveur.


### Vérification de la confidentialité

Recherche du texte du message dans la capture :

```bash
strings /tmp/capture-tls.pcap | grep -F "message secret TLS"
```

Résultat observé :

```text
Aucune sortie
```

Le texte `message secret TLS` n’apparaît donc pas en clair dans
la capture réseau.


### Résultat observé

La capture confirme que :

- les clients établissent une session TLS avec le serveur ;
- les commandes et les messages sont transmis dans des
  enregistrements `TLSv1.3 Application Data` ;
- le contenu applicatif n’apparaît pas en clair dans le trafic ;
- le client vérifie l’identité du serveur grâce au certificat.

TLS protège donc à la fois la confidentialité, l’intégrité
et l’authentification du serveur.


### Limites

Le certificat utilisé est auto-signé et destiné uniquement aux
tests locaux.

Dans un déploiement réel, le certificat devrait être émis par une
autorité de certification afin que les clients puissent vérifier
l’identité du serveur sans devoir importer manuellement son
certificat.