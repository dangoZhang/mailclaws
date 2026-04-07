---
layout: home

hero:
  name: MailClaws
  text: Le Travail Email Qui Garde Sa Forme
  tagline: MailClaws transforme les conversations email en rooms durables, fait collaborer les agents via du courrier interne, et garde la mémoire longue comme un état Pre compact au lieu d’un transcript qui gonfle.
  actions:
    - theme: brand
      text: Démarrer En 3 Minutes
      link: /fr/getting-started#three-minute-first-mail
    - theme: alt
      text: Concepts Clés
      link: /fr/concepts
    - theme: alt
      text: Mail Workbench
      link: /fr/operator-console

features:
  - title: Les Rooms Sont La Frontière De Vérité
    details: Chaque conversation réelle devient une room avec état révisé, historique rejouable et continuité stable entre inbound, brouillons, approbations et delivery.
  - title: Les Agents Collaborent Avec La Sémantique Du Mail
    details: Les agents ne partagent pas un transcript géant. Ils travaillent via des mailboxes virtuelles, des work threads, des replies single-parent et un fan-in piloté par reducer.
  - title: La Mémoire Pre Reste Compacte
    details: MailClaws conserve des résumés, faits, décisions et engagements comme état Pre durable. Les traces scratch et tentatives ratées restent hors de la mémoire longue par défaut.
  - title: L’Outbound Est Gouverné
    details: Les effets externes passent par draft, review, approval et outbox. Les workers et les mails internes ne peuvent pas contourner cette porte.
  - title: Un Seul Onglet Mail Pour Toute L’Histoire
    details: Accounts, rooms, mailboxes et approvals restent visibles depuis le même onglet Mail aligné sur OpenClaw, avec des deep links stables quand il le faut.
---

## Pourquoi MailClaws

La plupart des systèmes d’agents traitent l’email comme un transport de plus. MailClaws non.

MailClaws traite l’email comme la surface de travail elle-même :

- l’email externe devient un état de room durable
- la collaboration multi-agent interne devient du virtual mail
- la mémoire devient des snapshots Pre compacts au lieu d’une accumulation brute de transcript
- la delivery externe reste derrière approval et outbox

Cela colle à la manière dont les utilisateurs email travaillent déjà, tout en restant inspectable pour les opérateurs et extensible pour les systèmes multi-agents.

## La Boucle Principale

1. Connectez une boîte mail que vous utilisez déjà.
2. Un nouveau message entrant ouvre ou met à jour une room.
3. Les agents travaillent via des mailboxes internes et des work threads.
4. L’état Pre durable enregistre ce qui doit être conservé.
5. L’onglet Mail vous permet d’inspecter rooms, mailboxes et approvals au même endroit.

Le chemin le plus court est dans [Prise en main](./getting-started.fr.md).

## Les Quatre Idées Clés

### 1. Room

Une room est le contexte durable d’une conversation externe.

- la continuité vient de la structure de réponse et des indices provider, pas d’un transcript de chat
- la room porte la révision, les participants, les artefacts, les approvals et l’historique rejouable
- lorsqu’une nouvelle réponse arrive, l’ancien travail obsolète est invalidé au lieu d’être fusionné en silence

### 2. Virtual Mail

Les agents collaborent via du virtual mail, pas via un gros bloc de contexte partagé.

- chaque agent peut avoir des mailboxes publiques et internes
- les replies internes sont single-parent
- le fan-out et le fan-in sont explicites, avec des reducers responsables de la convergence
- la collaboration interne reste inspectable sans polluer le thread externe

### 3. Pre

MailClaws utilise un modèle de mémoire pre-first.

- les agents travaillent dans un espace scratch temporaire
- à la fin d’un tour, le résultat utile est compressé en état Pre durable
- le tour suivant charge le dernier inbound + le dernier Pre de room + les refs utiles
- cela garde les prompts plus petits et la mémoire plus propre sur les rooms longues

### 4. Governed Delivery

MailClaws sépare la réflexion des effets externes.

- les workers peuvent produire des drafts, des preuves et des recommandations
- la delivery externe réelle ne passe que par review, approval et outbox
- le replay, l’audit et la lignée d’approval restent attachés à la room

## Commencer Ici

- [Prise en main](./getting-started.fr.md) : installer, connecter une boîte, envoyer un email et lire le fil
- [Concepts](./concepts.fr.md) : room, virtual mail, Pre, approval et modèle workbench
- [Mail Workbench](./operator-console.fr.md) : ce que montre chaque onglet et comment s’y déplacer
- [Intégrations](./integrations.fr.md) : couverture provider, OAuth et intégration OpenClaw/Gateway

## Pour Les Utilisateurs OpenClaw

MailClaws est conçu pour s’insérer dans un workflow à la OpenClaw :

- démarrez le runtime avec `mailclaws`
- ouvrez la console hôte avec `mailclaws dashboard`
- cliquez sur `Mail` pour entrer dans le workbench MailClaws
- utilisez `mailclaws open` seulement comme route de secours directe

Le but n’est pas de remplacer la coque OpenClaw. Le but est d’ajouter un runtime orienté email et un onglet Mail qui comprend les rooms, le virtual mail, la mémoire Pre et la delivery gouvernée.
