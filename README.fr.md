# MailClaw

<p align="center">
  Runtime email-native pour un travail durable, auditable et multi-agent.
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.fr.md"><strong>Français</strong></a>
</p>

<p align="center">
  <a href="./docs/index.fr.md">Docs</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/ci.yml">CI</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/release.yml">Release</a>
</p>

MailClaw transforme les conversations email en rooms durables. Le runtime garde dans une seule couche la vérité de la room, le courrier interne entre agents, les approbations, le replay et la livraison sortante gouvernée.

MailClaw n’impose pas un fournisseur unique. Commencez avec l’adresse email que vous utilisez déjà, laissez MailClaw recommander le bon chemin provider, puis connectez cette mailbox. Les chemins intégrés couvrent les principaux providers hébergés ainsi que les comptes IMAP/SMTP génériques.

## Pourquoi MailClaw

- une conversation externe devient une room durable
- les agents collaborent par email interne au lieu de partager un transcript géant
- la mémoire longue garde des snapshots Pre compacts, pas les traces scratch
- approvals, outbox, replay et courrier interne restent visibles dans le même workbench
- Mail peut être monté comme onglet dans un Gateway workbench au style OpenClaw

## Installation

Prérequis runtime : Node.js 22+.

```bash
./install.sh
```

Les parcours d’installation documentés couvrent aussi :

- npm
- pnpm
- Homebrew

## Premier Démarrage

```bash
pnpm install
MAILCLAW_FEATURE_MAIL_INGEST=true pnpm mailclaw
```

Puis dans un second terminal :

```bash
pnpm mailclaw onboard you@example.com
pnpm mailclaw login
pnpm mailclaw dashboard
```

Parcours recommandé :

1. Démarrer MailClaw.
2. Connecter une mailbox que vous utilisez déjà.
3. Envoyer un email de test depuis une autre mailbox.
4. Ouvrir l’onglet `Mail` dans le workbench style Gateway.
5. Inspecter la room, le courrier interne des agents et l’état de livraison.

Si vous voulez d’abord un démo locale :

```bash
pnpm demo:mail
```

Puis ouvrir `http://127.0.0.1:3020/workbench/mail`.

## Ce Que Montre Le Workbench

- `Accounts` : mailboxes connectées et état provider
- `Rooms` : conversations externes durables
- `Mailboxes` : boîtes virtuelles des agents publics et des rôles internes
- `Approvals` : emails sortants en attente d’approbation
- `Mail` : onglet Mail intégré dans la coque OpenClaw-style

MailClaw garde la collaboration interne lisible. Vous pouvez voir quel agent a pris la tâche, quel worker a répondu, quelle review a bloqué un draft et quel résultat approuvé est finalement parti dans l’outbox.

## Modèle Multi-Agent

MailClaw sépare clairement trois choses :

- `Room` : la vérité durable d’une conversation externe
- `Virtual Mail` : le protocole de communication interne entre agents
- `Pre` : l’état compact conservé après chaque tour de travail

Les agents durables gardent leur propre `SOUL.md`, leurs mailboxes de rôle et leurs règles de collaboration. Les subagents ponctuels ne sont que des burst workers. Leur résultat ne devient vérité métier qu’après normalisation en internal reply mail puis fusion dans la room.

## Relation Avec OpenClaw

MailClaw ne remplace pas OpenClaw. Il ajoute au-dessus de cet écosystème les capacités email-native qui manquent :

- room-first truth au lieu de session-first truth
- threading email et ingest provider
- virtual mail entre agents
- gouvernance approval et outbox
- replay et recovery des opérations mail

## Documentation

La documentation est le guide produit canonique :

- Index docs : [docs/index.fr.md](./docs/index.fr.md)
- Prise en main : [docs/getting-started.fr.md](./docs/getting-started.fr.md)
- Concepts : [docs/concepts.fr.md](./docs/concepts.fr.md)
- Flux multi-agent : [docs/multi-agent-workflows.fr.md](./docs/multi-agent-workflows.fr.md)
- Console opérateur : [docs/operator-console.fr.md](./docs/operator-console.fr.md)

Le repo inclut deja un workflow GitHub Pages. Quand le forfait ou la visibilite du depot autorisera Pages, cette meme source de docs sera publiee comme site statique.

Lancer la doc en local :

```bash
pnpm docs:dev
```

Construire le site statique :

```bash
pnpm docs:build
```

## État Actuel

MailClaw livre déjà :

- room kernel et replay
- onboarding provider et connexion mailbox
- chemins d’ingest IMAP, SMTP, Gmail et raw RFC822
- virtual mailboxes et projection internal mail
- livraison sortante sous approval gate
- intégration Mail workbench embarquée au style OpenClaw

Limites et frontières actuelles :

- [docs/security-boundaries.fr.md](./docs/security-boundaries.fr.md)

## Licence

MIT. Voir [LICENSE](./LICENSE).
