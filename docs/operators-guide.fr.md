# Guide Opérateurs

Cette page s’adresse aux personnes qui doivent garder MailClaws en bonne santé au quotidien.

Elle se concentre sur ce qu’il faut vérifier quand les utilisateurs disent :

- « J’ai envoyé un email, est-ce que le système l’a reçu ? »
- « Pourquoi cette room n’a-t-elle pas répondu ? »
- « Pourquoi l’email sortant est-il encore en attente ? »

## Les Objets Principaux À Vérifier

Les opérations MailClaws sont plus simples si vous suivez le même modèle que le runtime :

- `account` : une boîte connectée et sa posture provider
- `room` : la frontière de vérité durable d’une conversation
- `mailbox` : la vue de collaboration interne ou publique
- `approval` : les effets externes gouvernés

## Triage De Première Ligne

Quand un utilisateur dit « J’ai envoyé un email, qu’est-ce qui s’est passé ? », vérifiez dans cet ordre.

### 1. Account

Confirmez que la boîte connectée existe et paraît saine.

Commandes utiles :

```bash
mailclaws accounts
mailclaws accounts show <accountId>
```

API utile :

- `GET /api/accounts/:accountId/provider-state`

### 2. Room

Confirmez que MailClaws a créé ou mis à jour la room.

Commandes utiles :

```bash
mailclaws rooms
mailclaws replay <roomKey>
```

### 3. Mailbox View

Si la room existe mais que le comportement reste flou, inspectez ensuite la mailbox ou l’inbox liée.

Commandes utiles :

```bash
mailclaws inboxes <accountId>
mailctl observe mailbox-feed <accountId> <mailboxId>
mailctl observe mailbox-view <roomKey> <mailboxId>
```

### 4. Approval State

Si le système a préparé une réponse mais ne l’a pas envoyée, vérifiez ensuite l’état d’approbation.

Commandes utiles :

```bash
mailctl observe approvals room <roomKey>
mailctl operate deliver-outbox
```

## Parcours Workbench

Le workbench navigateur reflète le même flux de triage :

1. ouvrir `Accounts`
2. ouvrir le compte mailbox
3. ouvrir la room
4. sauter dans une mailbox si un détail de collaboration est nécessaire
5. ouvrir `Approvals` si la delivery est bloquée

Deep links utiles :

- `/workbench/mail?mode=accounts`
- `/workbench/mail?mode=rooms`
- `/workbench/mail?mode=mailboxes`
- `/workbench/mail?mode=approvals&approvalStatus=requested`
- `/workbench/mail/accounts/:accountId`
- `/workbench/mail/rooms/:roomKey`
- `/workbench/mail/mailboxes/:accountId/:mailboxId`

## Situations Courantes

### Un Email A Été Envoyé Mais Aucune Room N’Apparaît

Vérifiez :

- la posture du compte et du provider
- la configuration du chemin entrant
- si le message a atteint MailClaws

Commencez avec :

```bash
mailclaws accounts show <accountId>
mailclaws rooms
```

### La Room Existe Mais Il N’Y A Pas Encore De Réponse

Vérifiez :

- le replay de la room
- l’activité des mailboxes internes
- l’état d’approbation

Commencez avec :

```bash
mailclaws replay <roomKey>
mailctl observe mailbox-view <roomKey> <mailboxId>
mailctl observe approvals room <roomKey>
```

### La Delivery Sortante Semble Bloquée

Vérifiez :

- si l’approbation est encore en attente
- si une tentative de delivery a déjà eu lieu
- si le chemin provider choisi est sain

Commencez avec :

```bash
mailctl operate deliver-outbox
mailctl observe approvals room <roomKey>
```

## APIs Utiles

Inspection room et mailbox :

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

Read models console :

- `GET /api/console/workbench`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`

Delivery et recovery :

- `POST /api/outbox/:outboxId/approve`
- `POST /api/outbox/:outboxId/reject`
- `POST /api/outbox/deliver`
- `POST /api/recovery/room-queue`

## Règle Pratique

Si quelque chose n’est pas clair, inspectez dans cet ordre :

1. account
2. room
3. mailbox
4. approval

Cet ordre suit la façon dont MailClaws est structuré, donc il mène généralement plus vite à la bonne réponse que de partir des traces d’exécution brutes.
