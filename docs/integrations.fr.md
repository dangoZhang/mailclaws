# Intégrations

<p align="center">
  <a href="./integrations.md">English</a> ·
  <a href="./integrations.zh-CN.md">简体中文</a> ·
  <a href="./integrations.fr.md"><strong>Français</strong></a>
</p>

Ce guide décrit les chemins d’intégration actuellement supportés et leurs limites.

## Positionnement De Compatibilité

MailClaw est compatible avec l’écosystème OpenClaw et conserve la compatibilité d’entrée Gateway. Dans ce découpage :

- OpenClaw reste le socle amont pour Gateway/runtime/packaging d’agents.
- MailClaw porte la vérité room, la sémantique de collaboration virtual mail, la gouvernance approval/outbox et les surfaces de projection replay/recovery.

## Stratégie D’Onboarding Pour Utilisateurs Mailbox

Pour un utilisateur email classique, suivre cet ordre de connexion :

1. OAuth Gmail/Outlook (`mailctl connect login gmail|outlook`) pour minimiser la friction.
2. Presets mot de passe/IMAP (`mailctl connect login imap|qq|icloud|yahoo|163|126`) si OAuth n’est pas disponible.
3. Fallback forward/raw MIME (`provider: "forward"` + `POST /api/inbound/raw`) si l’intégration provider native n’est pas encore faisable.

Cet ordre est aligné avec les priorités de closeout `plan12` et simplifie la transition vers un onboarding guide plus "grand public" (`plan13`).

Si vous connaissez l’adresse mailbox mais pas encore le bon parcours, commencez par :

- `pnpm mailctl connect start you@example.com`
- `GET /api/connect/onboarding?emailAddress=you@example.com`

Si vous utilisez déjà OpenClaw, gardez d’abord le mode bridge et branchez MailClaw comme couche room/approval/replay :

- `MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev`
- `pnpm mailctl observe runtime`
- `pnpm mailctl observe workbench <accountId>`

## Chemins D’Intégration Entrante

Entrée pilotée par provider :

- Fetch IMAP intégré et contrôleurs watcher
- Ingestion Gmail watch/history recovery

Entrée pilotée par API :

- Ingestion message normalisé : `POST /api/inbound`
- Ingestion RFC822/MIME brut : `POST /api/inbound/raw`

Entrée pilotée par Gateway :

- Couture d’ingestion événementielle unifiée : `POST /api/gateway/events`
- Resolve/bind session vers room : `GET /api/gateway/sessions/:sessionKey`, `POST /api/gateway/sessions/:sessionKey/bind`
- Projection d’un turn Gateway vers virtual mail : `POST /api/gateway/project`
- Les outcomes d’une room liée à Gateway enregistrent maintenant automatiquement des entrées `gateway.outcome.projected` pour les messages `final_ready / progress / handoff / approval / system_notice` éligibles

Limite connue : la projection d’outcome room vers Gateway est maintenant automatique une fois la room liée, mais le câblage automatique complet au flux d’événements amont Gateway reste incomplet dans ce repository.

## Chemins D’Intégration Sortante

Le contrôle sortant MailClaw est gouvernance-first :

- Approuver/rejeter les entrées outbox en attente : `POST /api/outbox/:outboxId/approve|reject`
- Livrer les messages sortants en file : `POST /api/outbox/deliver`
- Les flux de resend sont disponibles via CLI (`mailctl resend <outboxId>`)

Backends de livraison provider :

- Envoi Gmail API pour comptes Gmail OAuth
- Envoi SMTP (global process et réglages par compte)

Projection d’outcome vers Gateway :

- `POST /api/gateway/outcome` projette les outcomes room pour traitement externe côté Gateway.
- La classification des outcomes existe, mais le câblage de l’adaptateur amont de notification/livraison reste partiel.

## OAuth, Compte, Et Configuration Provider

Variables OAuth Gmail :

- `MAILCLAW_GMAIL_OAUTH_CLIENT_ID`
- `MAILCLAW_GMAIL_OAUTH_TOPIC_NAME` (pour watch/recovery immédiatement prête)
- Optionnelles : `MAILCLAW_GMAIL_OAUTH_CLIENT_SECRET`, `MAILCLAW_GMAIL_OAUTH_USER_ID`, `MAILCLAW_GMAIL_OAUTH_LABEL_IDS`, `MAILCLAW_GMAIL_OAUTH_SCOPES`

Variables OAuth Outlook/Microsoft :

- `MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID`
- Optionnelles : `MAILCLAW_MICROSOFT_OAUTH_CLIENT_SECRET`, `MAILCLAW_MICROSOFT_OAUTH_TENANT`, `MAILCLAW_MICROSOFT_OAUTH_SCOPES`

Commandes CLI de configuration :

```bash
pnpm mailctl connect providers [provider]
pnpm mailctl connect login
pnpm mailctl connect login gmail <accountId> [displayName]
pnpm mailctl connect login outlook <accountId> [displayName]
```

Endpoint API de configuration :

- `GET /api/connect`
- `GET /api/connect/providers`
- `GET /api/connect/providers/:provider`
- `POST /api/accounts`
- `GET /api/auth/:provider/start` pour les redirections navigateur
- `POST /api/auth/:provider/start` pour les starts programmatiques ou porteurs de secret

Note de release :

- `GET /api/auth/:provider/start` rejette volontairement `clientSecret` en query string ; utiliser POST ou un flux CLI pilote par env a la place.

Pour les setups d’entrée forward/export, utiliser `provider: "forward"` et configurer `settings.smtp` au niveau compte pour la livraison sortante.

## Surfaces D’Inspection Et Projection

État compte et provider :

- `GET /api/accounts`
- `GET /api/accounts/:accountId/provider-state`

Projections room, mailbox et approval :

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

Trace de projection Gateway :

- `GET /api/rooms/:roomKey/gateway-projection-trace`

## Lacunes D’Intégration Actuelles

- Une UI console opérateur MailClaw en lecture seule existe à `/console`, mais ce n’est pas encore un client mailbox complet.
- Aucune intégration Workbench mailbox tab OpenClaw n’est livrée.
- Le câblage de production auto-ingress/egress Gateway reste incomplet.
- La couverture provider est plus large qu’aux premières versions, mais pas encore au jeu cible long terme.
- L’intégration first-class embedded runtime/session-manager amont et la fermeture complète de l’enforcement backend sont encore en attente (`plan12`).
