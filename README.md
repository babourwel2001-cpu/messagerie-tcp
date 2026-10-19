# Messagerie TCP — Node.js

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

Ce projet est pédagogique. Il ne comporte pas d’authentification
ni de chiffrement applicatif et ne doit pas être exposé directement
sur Internet.

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
├── src/
│   ├── client/
│   │   └── client.js
│   ├── common/
│   │   ├── messages.js
│   │   └── protocol.js
│   └── server/
│       ├── server.js
│       └── groups.js
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