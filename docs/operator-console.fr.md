# Mail Workbench

Le Mail workbench est la surface utilisateur de MailClaws.

Dans la configuration visée, il apparaît comme l’onglet `Mail` dans OpenClaw/Gateway. La route directe `/workbench/mail` existe comme secours et comme cible de deep link.

## L’Ouvrir

Chemin recommandé :

```bash
mailclaws dashboard
```

Ensuite, connectez-vous à OpenClaw/Gateway et cliquez sur `Mail`.

Secours direct :

```bash
mailclaws open
```

## Ce Que Signifie Chaque Onglet

### Mail

La surface d’entrée pour la configuration et la connexion des boîtes mail.

Utilisez-la lorsque :

- vous connectez une boîte pour la première fois
- vous voulez le chemin provider recommandé
- vous voulez des templates d’agents en un clic
- vous voulez créer un agent durable personnalisé
- vous voulez consulter le directory d’agents et les suggestions de HeadCount
- vous voulez le chemin le plus court pour revenir dans l’onglet Mail

### Accounts

La vue au niveau compte.

Utilisez-la lorsque :

- vous voulez confirmer qu’une boîte est bien connectée
- vous voulez vérifier la posture provider et l’état général
- vous voulez sauter vers les rooms récentes ou les vues mailbox de ce compte

### Rooms

La vue au niveau room.

Utilisez-la lorsque :

- vous voulez inspecter une conversation comme état durable
- vous voulez voir la révision, les participants, les approvals et la timeline visible au replay
- vous voulez comprendre pourquoi la dernière réponse a cette forme

### Mailboxes

La vue de collaboration interne.

Utilisez-la lorsque :

- vous voulez inspecter une mailbox publique ou interne
- vous voulez comprendre ce qu’un rôle d’agent a vu
- vous voulez inspecter la collaboration interne sans relire toute la timeline room

### Approvals

La vue des effets de bord gouvernés.

Utilisez-la lorsque :

- vous voulez inspecter le travail sortant en attente d’approbation
- vous voulez revoir ou tracer ce qui doit se passer avant la delivery externe

## Flux Utilisateur Typique

Le chemin le plus courant est :

1. ouvrir `Accounts`
2. sélectionner le compte mailbox connecté
3. ouvrir la nouvelle room
4. si nécessaire, sauter vers un participant mailbox
5. si nécessaire, inspecter `Approvals` avant la delivery

Cela reflète le modèle runtime :

- le compte donne le périmètre provider et mailbox
- la room donne la vérité durable
- la mailbox donne le détail de collaboration
- les approvals donnent le contrôle des effets externes

## Deep Links

Routes directes utiles :

- `/workbench/mail`
- `/workbench/mail?mode=accounts`
- `/workbench/mail?mode=rooms`
- `/workbench/mail?mode=mailboxes`
- `/workbench/mail?mode=approvals&approvalStatus=requested`
- `/workbench/mail/accounts/:accountId`
- `/workbench/mail/rooms/:roomKey`
- `/workbench/mail/mailboxes/:accountId/:mailboxId`

Ces routes sont faites pour garder une navigation stable, que vous arriviez depuis Gateway ou via l’URL directe de secours.

## À Quoi Sert Cette Surface

Le Mail workbench est conçu pour expliquer le système avec des objets utiles opérationnellement :

- les comptes connectés
- les rooms durables
- les mailboxes internes et publiques
- l’état des approvals

Ce n’est pas juste un autre visualiseur générique de transcript.

## Lire Aussi

- [Concepts](./concepts.fr.md)
- [Prise en main](./getting-started.fr.md)
- [Intégrations](./integrations.fr.md)
