# Collaboration Multi-Agent

MailClaws ne demande pas à plusieurs agents de partager un transcript unique qui grossit sans fin.

Il transforme la collaboration en objets de type mail, inspectables, rejouables et gouvernés :

- la room porte la vérité durable d’une conversation externe
- la virtual mailbox sépare la persona publique des rôles internes
- le work thread isole les tâches parallèles
- le reducer reconverge les résultats des workers vers la room
- approval et outbox intent restent l’unique chemin d’envoi externe réel

## Le Modèle Pratique

Quand un vrai email arrive :

1. MailClaws ouvre ou met à jour une room.
2. Le front orchestrator lit le dernier inbound et le dernier Pre durable.
3. Si plus de travail est nécessaire, il envoie un task mail vers une mailbox interne.
4. Les workers répondent par internal reply single-parent.
5. Un reducer ou l’orchestrator reconverge les résultats.
6. Ce n’est qu’après cela que le système peut créer une approval ou un governed outbox intent.

Cela signifie :

- la collaboration interne est durable et rejouable
- les stale worker results peuvent être rejetés sans polluer la vérité de la room
- même si plusieurs workers participent, le thread externe reste propre

## Agents Durables Et Subagents Ponctuels

MailClaws sépare volontairement ces deux types d’exécution :

- les agents durables ont leur propre `SOUL.md`, une mailbox publique et des mailboxes de rôles internes
- les subagents ponctuels sont des burst compute workers et ne conservent pas de soul

Cela signifie :

- la persona durable, les règles de collaboration et la répartition réutilisable du travail appartiennent aux agents durables
- l’exécution élastique des tâches appartient aux subagents
- le résultat d’un subagent n’entre dans la collaboration de la room qu’après normalisation en internal reply mail

MailClaws ne dit donc pas « rendre tous les agents permanents ». Il dit « garder des agents durables pour l’organisation, et des subagents pour la puissance de calcul élastique ».

## Que Regarder Dans Le Workbench

Après avoir ouvert l’onglet Mail :

1. allez dans `Rooms`
2. ouvrez une room
3. lisez dans cet ordre

### Room Summary

Vérifiez ici :

- à quel account appartient la room
- quelle identité front agent est active
- quels collaborator agents ou summoned roles ont participé

### Virtual Mail

Regardez ici :

- quelle mailbox a envoyé le message interne
- quel rôle l’a reçu
- si le message est un root work ou une reply
- si le message vient d’un provider mail, d’un gateway chat ou du virtual mail interne

C’est la vue la plus directe de la coordination multi-agent.

### Mailbox Deliveries

Regardez ici :

- vers quelle mailbox chaque message interne a été livré
- s’il a été leased, consumed, stale, vetoed ou superseded

Cela montre si la collaboration a réellement abouti au niveau runtime, pas seulement au niveau logique.

### Governed Outbox

Regardez ici :

- quel résultat interne est devenu un candidat d’envoi externe
- si l’élément est pending approval, queued, sent ou failed

C’est la frontière entre le travail interne des agents et les effets externes réels.

### Gateway Projection

Utilisez cette vue quand la room est liée à OpenClaw/Gateway.

Elle montre :

- quelles gateway session keys sont liées à la room
- quels room outcomes ont été reprojetés vers Gateway
- si le dispatch est pending, dispatched ou failed

## Vues Mailbox

Si vous voulez inspecter directement la mailbox d’un rôle :

1. ouvrez `Mailboxes`
2. sélectionnez la mailbox
3. regardez surtout :
   - `Mailbox Feed`
   - `Room Thread In Mailbox`

Cela sert à répondre à des questions comme :

- qu’a réellement vu le reviewer ?
- quelles tâches la mailbox researcher a-t-elle reçues ?
- est-ce que la mailbox guard a vraiment reçu ce draft ?

## Modèles Fréquents

### Réponse Directe Simple

- une room
- une décision d’orchestrator
- un governed outbox intent

Regardez surtout `Room Summary`, `Governed Outbox` et `Timeline`.

### Collaboration De Workers En Parallèle

- l’orchestrator envoie plusieurs task mails
- les workers répondent dans des work threads séparés
- le reducer reconverge les résultats

Regardez surtout `Virtual Mail` et `Mailbox Deliveries`.

### Réponse Avec Approval

- le drafter ou l’orchestrator propose une réponse
- le reviewer ou le guard bloque, demande un changement ou escalade
- l’approval devient la porte finale de sortie

Regardez surtout `Approvals` et le `Governed Outbox` de la room.

## Surfaces CLI

Si vous voulez lire la même histoire dans le terminal :

```bash
mailclaws rooms
mailclaws replay <roomKey>
mailctl mailbox view <roomKey> <mailboxId>
mailctl mailbox feed <accountId> <mailboxId>
mailclaws approvals room <roomKey>
mailclaws trace <roomKey>
```

## Ce Que MailClaws Évite Délibérément

MailClaws n’utilise pas :

- un transcript partagé comme autorité pour tous les agents
- la continuité par subject seulement comme vérité de collaboration
- un envoi worker-vers-externe direct
- des traces scratch longues comme mémoire durable

Le but du système n’est pas seulement de faire collaborer des agents.
Le vrai but est de rendre cette collaboration durable, lisible et gouvernée.
