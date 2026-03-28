# Console Opérateur

<p align="center">
  <a href="./operator-console.md">English</a> ·
  <a href="./operator-console.zh-CN.md">简体中文</a> ·
  <a href="./operator-console.fr.md"><strong>Français</strong></a>
</p>

MailClaw livre maintenant une console opérateur en lecture seule à l’URL `/console`. C’est une surface operator/workbench pour inspecter rooms, approvals, provider state, projections mailbox et traces Gateway depuis une seule vue navigateur.

La console expose désormais aussi une entrée stable `/console/connect`, afin de partir d’une adresse mailbox avant de naviguer vers les rooms ou les mailboxes.

## Points D’Entrée

- `/console`
- `/console/connect`
- `/console/accounts/:accountId`
- `/console/inboxes/:accountId/:inboxId`
- `/console/rooms/:roomKey`
- `/console/mailboxes/:accountId/:mailboxId`

Ces routes sont stables pour les deep links. La première vague de filtres UI couvre :

- `status`
- `originKind`
- `mailboxId`
- `approvalStatus`

## Trouver Une Mailbox Agent En 30 Secondes

Pour un usage orienté email, prenez ce chemin court :

1. Ouvrir `/console/accounts/:accountId`
2. Cliquer une room qui vient de recevoir un email
3. Depuis le détail room, ouvrir un participant mailbox
4. Arriver sur `/console/mailboxes/:accountId/:mailboxId` pour inspecter feed et état de delivery

Équivalent CLI :

- `pnpm mailctl mailbox feed <accountId> <mailboxId>`
- `pnpm mailctl mailbox view <roomKey> <mailboxId>`

## Ce Que Couvre Cette Première Tranche

- `Accounts` : santé du compte, mode provider, nombre de rooms, approbations en attente
- `Rooms` : liste des rooms avec état, niveau d’attention, origines, approbations et compteurs de delivery
- `Detail` : résumé de room, timeline, gateway projection trace avec enregistrements automatiques d’outcome projection, participation des mailboxes, vue inbox-first lorsqu’un deep link de public inbox est ouvert, ou vue mailbox-first lorsqu’un deep link mailbox est ouvert
- `Provider + Mailboxes` : résumé provider state, résumé de politique inbox, cartes mailbox, mailbox feed
- `Approvals` : items d’approbation en attente ou historiques avec sauts vers la room

Améliorations de release dans cette tranche :

- Le hero affiche maintenant un bandeau explicite de limites (lecture seule, frontière mailbox client, statut Workbench tab, statut gateway round-trip).
- Une barre d’onglets façon workbench expose désormais `Connect`, `Accounts`, `Rooms`, `Mailboxes` et `Approvals`.
- Le détail room inclut des compteurs par catégorie timeline (`provider`, `ledger`, `virtual_mail`, `approval`, `delivery`) pour accélérer le diagnostic.
- Les cartes room affichent un niveau d’attention explicite (`stable | watch | critical`) pour faciliter la priorisation opérateur.

## Sources De Données

La console reste kernel-first et API-first :

- `GET /api/console/workbench`
- `GET /api/console/terminology`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

La page ne lit pas directement les tables de stockage et ne traite pas le transcript Gateway comme source de vérité.
La tranche UI la plus récente peut désormais s’hydrater depuis le read model agrégé `GET /api/console/workbench`, tandis que les endpoints plus fins restent disponibles pour l’inspection et la compatibilité.

## Limites Actuelles

- La console est en lecture seule dans cette phase.
- C’est une console opérateur, pas un client mailbox complet de type Outlook.
- Aucun Workbench mailbox tab OpenClaw n’est encore livré.
- Les traces d’outcome Gateway sont maintenant visibles une fois la room liée, mais le câblage de production auto-ingress/Workbench Gateway reste incomplet.
