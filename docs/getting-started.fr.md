# Getting Started

<p align="center">
  <a href="./getting-started.md">English</a> ·
  <a href="./getting-started.zh-CN.md">简体中文</a> ·
  <a href="./getting-started.fr.md"><strong>Français</strong></a>
</p>

Ce guide cible la forme actuelle de MailClaw orientée développeur/opérateur. Il inclut la surface opérateur en lecture seule `/console`, mais ne suppose pas une UI mailbox complète.

## Prérequis

- Node.js et `pnpm`
- Un checkout de ce repository
- Optionnel : identifiants de vraie boîte mail (pour les tests live provider)

Installer les dépendances :

```bash
pnpm install
```

## 1. Démarrer Le Runtime

Mode bridge (compatible OpenClaw) :

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true \
MAILCLAW_OPENCLAW_GATEWAY_TOKEN=dev-token \
pnpm dev
```

Mode command (commande runtime locale) :

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_RUNTIME_MODE=command \
MAILCLAW_RUNTIME_COMMAND='mail-runtime --stdio' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
pnpm dev
```

`MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON` est requis dès qu’un tour runtime porte des métadonnées `executionPolicy`.

Après le démarrage, vous pouvez ouvrir la console opérateur en lecture seule :

```text
http://127.0.0.1:3000/console
```

## 2. Connecter Un Compte

Chemins possibles :

- Inspecter d’abord la matrice provider/setup : `pnpm mailctl connect providers [provider]`
- Demander d’abord une recommandation mailbox-first : `pnpm mailctl connect start you@example.com`
- Assistant terminal interactif : `pnpm mailctl connect login`
- OAuth Gmail : `pnpm mailctl connect login gmail <accountId> [displayName]`
- OAuth Outlook : `pnpm mailctl connect login outlook <accountId> [displayName]`
- OAuth Gmail headless : `pnpm mailctl connect login oauth gmail <accountId> [displayName] --no-browser`
- OAuth Outlook headless : `pnpm mailctl connect login oauth outlook <accountId> [displayName] --no-browser`
- Enregistrement via API : `POST /api/accounts`

Ordre de bootstrap recommande :

```bash
pnpm mailctl connect providers
pnpm mailctl connect login
pnpm mailctl observe accounts
```

Vérifier les comptes connectés :

```bash
pnpm mailctl observe accounts
```

API du catalogue provider/setup :

```bash
curl -s http://127.0.0.1:3000/api/connect
curl -s "http://127.0.0.1:3000/api/connect/onboarding?emailAddress=you@example.com"
curl -s http://127.0.0.1:3000/api/connect/providers
curl -s http://127.0.0.1:3000/api/connect/providers/gmail
```

<a id="three-minute-first-mail"></a>

## 3. Premier Email Réel (Parcours Utilisateur Mailbox) {#three-minute-first-mail}

Après la connexion du compte, commencez par un flux normal d’utilisateur email :

1. Récupérer l’adresse mailbox connectée :
   - `pnpm mailctl connect accounts show <accountId>`
2. Envoyer un email de test vers cette adresse depuis un autre compte/client mail.
3. Vérifier la room et l’inbox créées :
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe inboxes <accountId>`
   - `pnpm mailctl observe room <roomKey>`
4. Ouvrir les vues console :
   - `http://127.0.0.1:3000/console/accounts/<accountId>`
   - `http://127.0.0.1:3000/console/rooms/<roomKey>`
5. Vérifier les messages de collaboration interne des agents :
   - `pnpm mailctl mailbox view <roomKey> <mailboxId>`
   - `pnpm mailctl mailbox feed <accountId> <mailboxId>`

C’est le chemin le plus court "connexion -> reception -> inspection -> gouvernance".

## 4. Parcours A : provider mail -> room -> approval -> delivery

Injecter un message entrant normalisé :

```bash
curl -X POST 'http://127.0.0.1:3000/api/inbound?processImmediately=true' \
  -H 'content-type: application/json' \
  -d '{
    "accountId": "acct-1",
    "mailboxAddress": "mailclaw@example.com",
    "envelope": {
      "providerMessageId": "provider-1",
      "messageId": "<msg-1@example.com>",
      "subject": "API room",
      "from": { "email": "sender@example.com" },
      "to": [{ "email": "mailclaw@example.com" }],
      "text": "Hello from the API",
      "headers": [{ "name": "Message-ID", "value": "<msg-1@example.com>" }]
    }
  }'
```

Inspecter la room et les approbations :

```bash
pnpm mailctl observe rooms
pnpm mailctl observe room <roomKey>
pnpm mailctl observe approvals room <roomKey>
```

Livrer les messages outbox en attente :

```bash
pnpm mailctl operate deliver-outbox
```

## 5. Parcours B : Gateway turn -> virtual mail -> room -> final outcome

Projeter un turn Gateway dans MailClaw :

```bash
curl -X POST 'http://127.0.0.1:3000/api/gateway/project' \
  -H 'content-type: application/json' \
  -d '{
    "sessionKey": "gw-session-1",
    "sourceControlPlane": "openclaw",
    "fromPrincipalId": "agent:front",
    "fromMailboxId": "front-mailbox",
    "toMailboxIds": ["mail-orchestrator"],
    "kind": "claim",
    "visibility": "internal",
    "subject": "Gateway projection smoke",
    "bodyRef": "gateway message body",
    "inputsHash": "smoke-hash-1"
  }'
```

Inspecter la trace de projection et la timeline room :

```bash
pnpm mailctl gateway trace <roomKey>
pnpm mailctl replay <roomKey>
```

Limite connue : les API de projection existent, mais le branchement automatique à un flux d’événements Gateway amont complet n’est pas fini dans ce repository.

## 6. Parcours C : internal multi-agent -> reducer/reviewer/guard -> projected outcome

Activer les flags worker/gouvernance en local :

```bash
MAILCLAW_FEATURE_SWARM_WORKERS=true \
MAILCLAW_FEATURE_APPROVAL_GATE=true \
MAILCLAW_FEATURE_IDENTITY_TRUST_GATE=true \
pnpm dev
```

Inspecter ensuite les artefacts de collaboration interne via mailbox/feed :

```bash
pnpm mailctl mailbox view <roomKey> <mailboxId>
pnpm mailctl mailbox feed <accountId> <mailboxId>
pnpm mailctl approvals trace <roomKey>
```

Vous pouvez filtrer par origines (`provider_mail`, `gateway_chat`, `virtual_internal`) pour vérifier les transitions multi-agents internes.

## 7. Suite

- Opérations et dépannage : [Guide opérateurs](./operators-guide.fr.md)
- Branchages provider/Gateway/OpenClaw : [Intégrations](./integrations.fr.md)
- Procédures smoke avec vrais identifiants : [Live Provider Smoke](./live-provider-smoke.md)

Baseline de verification release :

```bash
pnpm build
pnpm test:workflow
pnpm test:security
pnpm docs:build
```
