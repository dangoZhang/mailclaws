# Guide Opérateurs

<p align="center">
  <a href="./operators-guide.md">English</a> ·
  <a href="./operators-guide.zh-CN.md">简体中文</a> ·
  <a href="./operators-guide.fr.md"><strong>Français</strong></a>
</p>

Ce guide couvre les workflows opérateurs déjà implémentés, y compris la surface navigateur `/workbench/mail` ainsi que les opérations runtime et CLI/API ; ce n’est pas un guide de client mailbox complet.

## Portée Et Terminologie

Les surfaces opérateurs MailClaw sont organisées autour de :

- `room` : frontière de collaboration durable
- `virtual mail` : modèle de projection unifié pour messages internes/externes
- `mailbox` : vue projetée des messages d’une room
- `projection` : mapping des sources provider/Gateway/internal vers la vérité room
- `approval` et `delivery` : gouvernance des effets sortants
- `provider state` : santé compte (cursor/watch/checkpoint)

## Runbook Première Réponse (Vue Utilisateur Mailbox)

À utiliser quand un utilisateur dit : "j’ai envoyé un email, est-ce bien reçu ?".

1. Vérifier la santé compte/provider :
   - `pnpm mailctl observe accounts show <accountId>`
   - `GET /api/accounts/:accountId/provider-state`
2. Vérifier la création de room :
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe room <roomKey>`
3. Vérifier la projection inbox :
   - `pnpm mailctl observe inboxes <accountId>`
   - `pnpm mailctl observe mailbox-feed <accountId> <mailboxId>`
4. Vérifier les emails de collaboration interne agent :
   - `pnpm mailctl observe mailbox-view <roomKey> <mailboxId> virtual_internal`
5. Vérifier l’état de gouvernance sortante :
   - `pnpm mailctl observe approvals room <roomKey>`
   - `pnpm mailctl operate deliver-outbox`

Chemins console équivalents :

- `/workbench/mail/accounts/:accountId`
- `/workbench/mail/rooms/:roomKey`
- `/workbench/mail/mailboxes/:accountId/:mailboxId`

## Vérifications Quotidiennes

Vérifications de base du service :

```bash
curl -s http://127.0.0.1:3000/healthz
curl -s http://127.0.0.1:3000/readyz
```

Inventaire runtime :

```bash
pnpm mailctl observe accounts
pnpm mailctl observe rooms
pnpm mailctl operate quarantine
pnpm mailctl operate dead-letter
```

Snapshots API de niveau console :

- `GET /api/console/terminology`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`
- `GET /api/runtime/execution`
- `GET /api/runtime/embedded-sessions`

Workbench navigateur :

- `GET /workbench/mail`
- deep links stables sous `/workbench/mail/accounts/:accountId`, `/workbench/mail/inboxes/:accountId/:inboxId`, `/workbench/mail/rooms/:roomKey`, `/workbench/mail/mailboxes/:accountId/:mailboxId`

Inspection runtime/operator :

```bash
pnpm mailctl observe runtime
pnpm mailctl observe embedded-sessions [sessionKey]
```

## Compte, Provider, Et Opérations D’Ingestion

Connecter ou mettre à jour des comptes :

```bash
pnpm mailctl connect providers [provider]
pnpm mailctl connect login
pnpm mailctl connect login gmail <accountId> [displayName]
pnpm mailctl connect login outlook <accountId> [displayName]
```

Inspecter l’état compte/provider :

```bash
pnpm mailctl observe accounts show <accountId>
curl -s http://127.0.0.1:3000/api/accounts/<accountId>/provider-state
curl -s http://127.0.0.1:3000/api/connect
curl -s http://127.0.0.1:3000/api/connect/providers
```

Chemins d’ingestion :

- Payload normalisé : `POST /api/inbound?processImmediately=true`
- Payload MIME brut : `POST /api/inbound/raw?processImmediately=true`
- Hooks Gmail Pub/Sub + recovery : `POST /api/accounts/:accountId/gmail/notifications`, `POST /api/accounts/:accountId/gmail/recover`

## Inspection Room, Timeline, Mailbox, Et Projection

Inspection principale de room :

```bash
pnpm mailctl observe room <roomKey>
pnpm mailctl observe approvals room <roomKey>
pnpm mailctl observe mailbox-view <roomKey> <mailboxId>
```

Surfaces mailbox/inbox multi-room :

```bash
pnpm mailctl observe inboxes <accountId>
pnpm mailctl inboxes project <accountId> <agentId>
pnpm mailctl inboxes console <accountId>
pnpm mailctl observe mailbox-feed <accountId> <mailboxId>
```

Inspection de projection Gateway :

```bash
pnpm mailctl observe projection <roomKey>
pnpm mailctl gateway resolve <sessionKey> [roomKey]
```

APIs associées :

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/rooms/:roomKey/gateway-projection-trace`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

## Contrôle Approval, Outbox, Recovery, Et Files

Actions approval/outbox :

```bash
pnpm mailctl operate approve <outboxId>
pnpm mailctl operate reject <outboxId>
pnpm mailctl operate resend <outboxId>
pnpm mailctl operate deliver-outbox
```

Actions recovery et file :

```bash
pnpm mailctl operate recover [timestamp]
pnpm mailctl operate drain [limit]
pnpm mailctl operate dead-letter retry <jobId>
```

Équivalents HTTP :

- `POST /api/outbox/:outboxId/approve`
- `POST /api/outbox/:outboxId/reject`
- `POST /api/outbox/deliver`
- `POST /api/recovery/room-queue`
- `POST /api/dead-letter/room-jobs/:jobId/retry`

## Raccourcis De Dépannage

- Sortie bloquée en attente d’approbation : vérifier `mailctl approvals trace <roomKey>`, puis `approve`/`reject`.
- État room ambigu : croiser `mailctl replay <roomKey>` avec mailbox view/feed.
- Sync provider ambiguë : vérifier provider state et endpoints watcher/recovery.
- Lignée Gateway ambiguë : inspecter ensemble `gateway trace` et room replay.

## Lacunes Opérateurs Connues

- Un Mail workbench first-party existe à `/workbench/mail`, et `/console/*` résout vers la même coque, mais ce n’est pas encore un client mailbox complet et modifiable.
- La sortie CLI reste majoritairement JSON et l’ergonomie de l’arbre de commandes est encore en évolution.
- Les APIs de projection Gateway sont disponibles, mais l’auto-connexion complète aux flux d’événements Workbench amont n’est pas terminée.
- Le câblage first-class embedded runtime/session-manager amont et la fermeture complète de l’enforcement backend restent dans le résiduel (`plan12`).
