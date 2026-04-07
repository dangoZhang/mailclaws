# Prise En Main

Cette page est le chemin le plus court pour passer de zéro à une première conversation email fonctionnelle.

Si vous savez déjà ce qu’est MailClaws, allez directement à [Envoyer Votre Premier Vrai Email](#three-minute-first-mail).

## Ce Qu’il Vous Faut

- Node.js 22+
- une boîte mail que vous voulez connecter à MailClaws
- une autre boîte mail ou un autre client mail pour envoyer un message de test

MailClaws n’est pas lié à un seul provider. Les chemins intégrés couvrent Gmail, Outlook, QQ, iCloud, Yahoo, 163/126, ainsi que les comptes IMAP/SMTP génériques.

## Installer

Recommandé :

```bash
./install.sh
```

Autres chemins pris en charge :

```bash
npm install -g mailclaws
pnpm setup && pnpm add -g mailclaws
brew install mailclaws
```

Si vous lancez depuis les sources :

```bash
pnpm install
```

## Démarrer MailClaws

```bash
MAILCLAW_FEATURE_MAIL_INGEST=true \
mailclaws
```

Cela démarre le runtime local ainsi que le backend du Mail tab.

## Connecter Une Boîte Mail

Chemin recommandé :

```bash
mailclaws onboard you@example.com
mailclaws login
```

Ce que font ces commandes :

- `mailclaws onboard` recommande le chemin provider le plus simple à partir de l’adresse
- `mailclaws login` vous guide dans la connexion réelle du compte

Si vous savez déjà quel chemin provider utiliser :

```bash
mailclaws providers
```

## Ouvrir L’Onglet Mail

Chemin hôte recommandé :

```bash
mailclaws dashboard
```

Ensuite, connectez-vous à OpenClaw/Gateway et cliquez sur `Mail`.

Secours direct :

```bash
mailclaws open
```

ou ouvrez :

```text
http://127.0.0.1:3000/workbench/mail
```

<a id="three-minute-first-mail"></a>

## Envoyer Votre Premier Vrai Email {#three-minute-first-mail}

1. Connectez une boîte mail avec `mailclaws login`.
2. Copiez l’adresse connectée depuis l’onglet Mail ou `mailclaws accounts`.
3. Envoyez un email à cette adresse depuis une autre boîte.
4. Ouvrez l’onglet Mail.
5. Ouvrez le compte connecté, puis la nouvelle room.

C’est la boucle centrale de MailClaws :

- un vrai email arrive
- MailClaws crée ou met à jour une room
- les agents travaillent à l’intérieur de cette room
- vous inspectez le résultat depuis l’onglet Mail

## Ce Que Vous Verrez

Après l’arrivée du premier message, l’onglet Mail vous donne quatre vues utiles :

- `Accounts` : quelles boîtes sont connectées et en bonne santé
- `Rooms` : l’état durable des conversations
- `Mailboxes` : les vues de collaboration interne et publique des agents
- `Approvals` : le travail sortant gouverné en attente de validation

Si vous voulez inspecter la collaboration interne des agents après le premier message :

- ouvrez une room
- cliquez sur un participant mailbox
- inspectez le feed mailbox et l’état local de collaboration de la room

## Pour Les Utilisateurs OpenClaw

Si vous utilisez déjà OpenClaw, gardez le même workflow externe :

1. démarrez MailClaws
2. lancez `mailclaws dashboard`
3. entrez dans la console hôte
4. cliquez sur `Mail`

MailClaws doit ressembler à un onglet Mail supplémentaire dans la coque OpenClaw existante, pas à une console séparée qu’il faut apprendre d’abord.

## Étapes Suivantes

- [Concepts](./concepts.fr.md)
- [Mail Workbench](./operator-console.fr.md)
- [Intégrations](./integrations.fr.md)
