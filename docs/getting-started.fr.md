# Prise En Main

Cette page est le chemin le plus court pour passer de zéro à une première conversation email fonctionnelle.

Si vous savez déjà ce qu’est MailClaw, allez directement à [Envoyer Votre Premier Vrai Email](#three-minute-first-mail).

## Ce Qu’il Vous Faut

- Node.js 22+
- une boîte mail que vous voulez connecter à MailClaw
- une autre boîte mail ou un autre client mail pour envoyer un message de test

MailClaw n’est pas lié à un seul provider. Les chemins intégrés couvrent Gmail, Outlook, QQ, iCloud, Yahoo, 163/126, ainsi que les comptes IMAP/SMTP génériques.

## Installer

Recommandé :

```bash
./install.sh
```

Autres chemins pris en charge :

```bash
npm install -g mailclaw
pnpm setup && pnpm add -g mailclaw
brew install mailclaw
```

Si vous lancez depuis les sources :

```bash
pnpm install
```

## Démarrer MailClaw

```bash
MAILCLAW_FEATURE_MAIL_INGEST=true \
mailclaw
```

Cela démarre le runtime local ainsi que le backend du Mail tab.

## Connecter Une Boîte Mail

Chemin recommandé :

```bash
mailclaw onboard you@example.com
mailclaw login
```

Ce que font ces commandes :

- `mailclaw onboard` recommande le chemin provider le plus simple à partir de l’adresse
- `mailclaw login` vous guide dans la connexion réelle du compte

Si vous savez déjà quel chemin provider utiliser :

```bash
mailclaw providers
```

## Ouvrir L’Onglet Mail

Chemin hôte recommandé :

```bash
mailclaw dashboard
```

Ensuite, connectez-vous à OpenClaw/Gateway et cliquez sur `Mail`.

Secours direct :

```bash
mailclaw open
```

ou ouvrez :

```text
http://127.0.0.1:3000/workbench/mail
```

<a id="three-minute-first-mail"></a>

## Envoyer Votre Premier Vrai Email {#three-minute-first-mail}

1. Connectez une boîte mail avec `mailclaw login`.
2. Copiez l’adresse connectée depuis l’onglet Mail ou `mailclaw accounts`.
3. Envoyez un email à cette adresse depuis une autre boîte.
4. Ouvrez l’onglet Mail.
5. Ouvrez le compte connecté, puis la nouvelle room.

C’est la boucle centrale de MailClaw :

- un vrai email arrive
- MailClaw crée ou met à jour une room
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

1. démarrez MailClaw
2. lancez `mailclaw dashboard`
3. entrez dans la console hôte
4. cliquez sur `Mail`

MailClaw doit ressembler à un onglet Mail supplémentaire dans la coque OpenClaw existante, pas à une console séparée qu’il faut apprendre d’abord.

## Étapes Suivantes

- [Concepts](./concepts.fr.md)
- [Mail Workbench](./operator-console.fr.md)
- [Intégrations](./integrations.fr.md)
