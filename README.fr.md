# MailClaw

<p align="center">
  Runtime email-native pour un travail durable, auditable et multi-agent.
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.fr.md"><strong>Français</strong></a>
</p>

MailClaw transforme les fils email en rooms durables avec état explicite, replay, approbations, retrieval local et livraison gouvernée. Le projet a démarré au-dessus de [OpenClaw](https://github.com/openclaw/openclaw), mais il est construit comme un runtime email-native, pas comme un simple plugin de transport.

## Ce Qu’est MailClaw

Aujourd’hui, MailClaw est surtout un runtime backend avec des surfaces opérateur. Le cœur vise la continuité par fil, la collaboration interne via virtual mail, les opérations rejouables et la livraison sortante sous approbation.

## Relation Avec OpenClaw

MailClaw réutilise les points d’entrée de l’écosystème OpenClaw (Gateway, runtime substrate, packaging d’agents) et garde la compatibilité Gateway. MailClaw définit la couche de vérité des rooms, la sémantique de collaboration virtual mail, la gouvernance approval/outbox, et le modèle opérateur replay/recovery.

## Fonctionnalités Disponibles Aujourd’hui

- Kernel room thread-first adossé à SQLite
- Identité room/session déterministe via headers de reply et indices de thread provider
- Flux durables de replay, recovery, quarantaine, dead-letter, resend, approve et reject
- Plan virtual mail pour la collaboration orchestrator/worker interne avec état de projection durable
- Fetch IMAP intégré, contrôleurs watcher IMAP/Gmail, ingestion Gmail history recovery/watch, livraison sortante SMTP/Gmail
- Réglages SMTP par compte pour les comptes non Gmail
- Ingestion forward/raw RFC822 via `POST /api/inbound/raw`
- Connexion OAuth Gmail/Outlook via `mailctl` et `/api/auth/:provider/*`
- Catalogue provider/setup via `mailctl connect providers` et `GET /api/connect/providers`, couvrant Gmail, Outlook, QQ, iCloud, Yahoo, 163/126, IMAP générique, et le fallback forward/raw MIME
- Les rooms liées à Gateway enregistrent désormais automatiquement les projections d’outcome pour les résultats de type `final_ready`, visibles dans le replay, l’API et la console
- Surfaces HTTP/CLI pour rooms, approvals, provider state, projections d’inbox, mailbox console/feed et traces de projection Gateway
- Console opérateur en lecture seule à `/console` pour inspecter comptes, rooms, approvals, mailboxes et traces Gateway

## Parcours 3 Minutes Pour Le Premier Email

Si vous venez d’un client mail classique, suivez ce flux simple "connexion -> premier mail -> verification":

1. Démarrer le runtime : `pnpm dev`
2. Demander d’abord à MailClaw le chemin le plus simple : `pnpm mailctl connect start you@example.com`
3. Connecter une mailbox : `pnpm mailctl connect login`
4. Vérifier le compte et l’adresse : `pnpm mailctl connect accounts show <accountId>`
5. Envoyer un email de test depuis une autre mailbox (ou votre seconde adresse) vers cette mailbox connectée
6. Vérifier la room et l’inbox :
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe inboxes <accountId>`
   - ouvrir `http://127.0.0.1:3000/console/connect` pour l’onboarding mailbox-first, puis `http://127.0.0.1:3000/console/accounts/<accountId>` pour le workbench du compte connecté

Le même flux de recommandation existe aussi via `GET /api/connect/onboarding?emailAddress=you@example.com`.

Si vous utilisez déjà OpenClaw, démarrez d’abord en mode bridge puis inspectez la vérité MailClaw au lieu de traiter la session transcript comme source de vérité :

- `MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev`
- `pnpm mailctl observe runtime`
- `pnpm mailctl observe workbench <accountId>`

Pour inspecter les emails internes de collaboration agent :

- `pnpm mailctl observe mailbox-view <roomKey> <mailboxId> virtual_internal`
- `pnpm mailctl observe mailbox-feed <accountId> <mailboxId> 50 virtual_internal`

## Limites Actuelles

- Une console opérateur en lecture seule existe à `/console`, mais pas encore de client mailbox complet de type Outlook.
- Pas encore d’intégration Workbench mailbox tab dans OpenClaw.
- Les traces d’outcome Gateway se projettent désormais automatiquement quand une room est liée à Gateway, mais l’automatisation complète de l’ingress amont Gateway / Workbench reste incomplète dans ce repo.
- Le guidage de connexion existe maintenant côté CLI/API, mais MailClaw ne provisionne pas encore pour vous le DNS provider, les topics Pub/Sub, les règles de forwarding, ou les politiques mailbox.
- L’intégration first-class du couple embedded runtime/session-manager OpenClaw et la fermeture complète de l’enforcement backend restent dans le closeout résiduel (`plan12`).

## Documentation

- [Index de documentation (français)](./docs/index.fr.md)
- [Getting Started (français)](./docs/getting-started.fr.md)
- [Console opérateur (français)](./docs/operator-console.fr.md)
- [Guide opérateurs (français)](./docs/operators-guide.fr.md)
- [Intégrations (français)](./docs/integrations.fr.md)
- [Assets de release (français)](./docs/release-assets.fr.md)

Les versions anglaise et chinoise sont accessibles via les liens de langue en haut de chaque page.

Lancer le site de documentation en local :

```bash
pnpm docs:dev
```

Construire le site statique :

```bash
pnpm docs:build
```

## Démarrage Rapide

Installer les dépendances :

```bash
pnpm install
```

Démarrer en mode bridge OpenClaw :

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true \
MAILCLAW_OPENCLAW_GATEWAY_TOKEN=dev-token \
pnpm dev
```

Ensuite, suivez [Getting Started](./docs/getting-started.fr.md) pour la connexion de compte et les parcours de smoke end-to-end.

Ordre recommande pour connecter une mailbox :

```bash
pnpm mailctl connect providers
pnpm mailctl connect login
pnpm mailctl observe accounts
```

Pour les flux OAuth sans navigateur :

```bash
pnpm mailctl connect login oauth gmail <accountId> [displayName] --no-browser
pnpm mailctl connect login oauth outlook <accountId> [displayName] --no-browser
```

## Verification De Release

Avant publication, executer au minimum :

```bash
pnpm build
pnpm test:workflow
pnpm test:security
pnpm docs:build
```

Smoke live-provider optionnel :

```bash
pnpm test:live-providers
```

## Licence

MailClaw utilise la [licence MIT](./LICENSE), alignée sur [OpenClaw](https://github.com/openclaw/openclaw).
