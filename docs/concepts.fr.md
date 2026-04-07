# Concepts Clés

Pour comprendre MailClaws, il suffit de retenir quelques idées.

## 1. Room

Une room est la frontière de vérité durable d’une conversation email externe.

Une room contient :

- l’état courant du thread externe
- les participants
- les pièces jointes et les preuves extraites
- l’état d’approval et de delivery
- une timeline rejouable
- le dernier Pre durable

Pourquoi c’est important :

- la continuité email ne doit pas dépendre d’un transcript toujours plus long
- lorsqu’une nouvelle réponse arrive, l’ancien travail peut être marqué stale proprement
- les opérateurs ont besoin d’une source de vérité unique pour l’audit et le débogage

## 2. Virtual Mail

La collaboration interne entre agents passe par des mailboxes virtuelles et des work threads.

Ses contraintes sont importantes :

- les replies sont single-parent
- le travail peut faire du fan-out vers plusieurs workers
- le fan-in est pris en charge par les reducers
- la visibilité des mailboxes peut être bornée par rôle
- la collaboration interne reste observable sans polluer le thread externe

## 3. Mémoire Pre-First

MailClaws ne construit pas la mémoire longue à partir des traces de raisonnement brutes.

Le modèle est :

- les agents travaillent temporairement dans le scratch
- le résultat qui mérite d’être conservé est compressé en Pre
- le tour suivant charge le dernier inbound, le dernier Pre et seulement les refs utiles

Un Pre contient généralement :

- un summary
- des facts
- des open questions
- des decisions
- des commitments

## 4. ReAct-Pre

Le modèle de comportement de MailClaws peut se résumer ainsi :

1. React dans le scratch
2. Compresser le résultat en Pre
3. Projeter ce Pre en email externe, email interne, approval ou vue workbench

Cela signifie :

- le chain-of-thought n’est pas une mémoire durable
- les child transcripts ne sont pas la vérité métier
- le corps des emails n’est pas l’unique état du système

## 5. Approval Et Outbox

MailClaws sépare les effets externes du raisonnement.

Le chemin normal est :

1. draft
2. review / guard
3. approval
4. outbox intent
5. delivery attempt

Pourquoi c’est important :

- les workers ne peuvent pas envoyer à l’extérieur directement
- les drafts obsolètes ou risqués ne sortent pas silencieusement
- l’audit, la trace et le replay suivent un chemin canonique unique

## 6. Workbench

L’onglet Mail est la surface utilisateur de ces concepts.

Vues principales :

- `Mail`
- `Accounts`
- `Rooms`
- `Mailboxes`
- `Approvals`

Ce n’est pas un simple lecteur d’historique de chat. Il expose directement le modèle runtime.

## 7. Agents Durables

Les agents durables de MailClaws ne sont pas des workers anonymes.

Chaque agent durable possède :

- un `SOUL.md`
- un `AGENTS.md`
- une mailbox publique
- des mailboxes de rôles internes

Le `SOUL.md` explicite :

- quelles adresses de virtual mail appartiennent à l’agent
- ce dont il est responsable
- quand il doit collaborer avec un autre rôle

Cela ancre la coordination multi-agent dans un roster durable au lieu d’un prompt temporaire.

## 8. Templates Et HeadCount

MailClaws permet de faire évoluer un roster d’agents de trois façons :

- des templates intégrés
- des agents durables personnalisés
- des recommandations de HeadCount déduites d’un usage répété des subagents

Les templates servent à démarrer vite. Le HeadCount aide à décider quels rôles doivent devenir durables quand la charge augmente.

## En Une Phrase

MailClaws transforme l’email en rooms durables, la collaboration multi-agent en virtual mail, et la mémoire longue en Pre compact.
