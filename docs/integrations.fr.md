# Intégrations

Cette page explique comment MailClaws se connecte au monde extérieur.

MailClaws est conçu pour fonctionner au-dessus de vrais systèmes email et, quand il le faut, à l’intérieur d’un workflow hôte OpenClaw/Gateway.

## Modèle D’Intégration

MailClaws sépare les responsabilités :

- les providers déplacent les emails en entrée et en sortie
- les rooms gardent la vérité durable
- le virtual mail gère la collaboration interne des agents
- approvals et outbox gouvernent les effets externes
- l’onglet Mail permet d’inspecter l’ensemble du système

Cela permet à MailClaws de se connecter à des providers existants sans traiter l’un d’eux comme système d’enregistrement.

## Quels Chemins Mailbox Sont Pris En Charge

MailClaws prend aujourd’hui en charge trois chemins pratiques de connexion.

### 1. Boîtes OAuth

Le meilleur choix quand il est disponible.

Pris en charge :

- Gmail
- Outlook / Microsoft 365

Pourquoi choisir ce chemin :

- friction de configuration plus faible
- meilleure delivery provider-native et meilleure intégration watch
- meilleur choix pour les utilisateurs finaux classiques

### 2. Boîtes IMAP / SMTP

Le meilleur choix quand OAuth n’est pas disponible ou pas pratique.

Presets courants :

- QQ
- iCloud
- Yahoo
- 163 / 126
- IMAP / SMTP générique

Pourquoi choisir ce chemin :

- fonctionne avec beaucoup de providers email traditionnels
- utile pour les équipes qui veulent réutiliser des identifiants mailbox existants

### 3. Ingress Forward / MIME Brut

Le meilleur choix quand l’intégration mailbox provider-native n’est pas encore possible.

Pourquoi choisir ce chemin :

- chemin de migration simple
- utile pour une adoption progressive
- permet à MailClaws de recevoir des emails même quand le support natif de watch n’est pas encore disponible

## Ordre Recommandé Pour Les Utilisateurs

Si vous ne connaissez que l’adresse mailbox et voulez le chemin le plus simple :

```bash
mailclaws onboard you@example.com
mailclaws login
```

Si vous voulez d’abord voir les chemins pris en charge :

```bash
mailclaws providers
```

Recommandation générale :

1. utiliser Gmail ou Outlook OAuth quand c’est possible
2. utiliser IMAP / SMTP quand OAuth n’est pas disponible
3. utiliser forward/raw MIME comme chemin de secours

## Intégration Avec OpenClaw / Gateway

MailClaws est conçu pour s’insérer dans un workflow de forme OpenClaw.

Utilisez-le ainsi :

1. démarrez MailClaws
2. lancez `mailclaws dashboard`
3. connectez-vous à OpenClaw/Gateway
4. cliquez sur `Mail`

Dans cette configuration :

- OpenClaw/Gateway reste la coque hôte
- MailClaws fournit l’onglet Mail et la sémantique runtime orientée email
- `mailclaws open` et l’accès direct `/workbench/mail` restent disponibles comme secours

## Chemins Entrants

MailClaws peut recevoir des emails via :

- watchers et fetchers provider-natifs
- ingress API normalisé
- ingress MIME brut
- projection d’événements Gateway

Exemples typiques :

- Gmail watch/history
- IMAP fetch et polling
- `POST /api/inbound`
- `POST /api/inbound/raw`
- `POST /api/gateway/events`

## Chemins Sortants

MailClaws peut livrer des emails externes via :

- Gmail API send
- SMTP
- des flux outbox gouvernés

La règle de design ne change pas :

l’envoi externe réel passe par approval et outbox, jamais directement depuis un worker.

## OAuth Et Configuration De Compte

Commandes utiles :

```bash
mailclaws providers
mailclaws login
mailctl connect providers [provider]
mailctl connect login gmail <accountId> [displayName]
mailctl connect login outlook <accountId> [displayName]
```

APIs utiles :

- `GET /api/connect`
- `GET /api/connect/providers`
- `GET /api/connect/providers/:provider`
- `POST /api/accounts`
- `GET /api/auth/:provider/start`
- `POST /api/auth/:provider/start`

## Lire Ensuite

- [Prise en main](./getting-started.fr.md)
- [Concepts](./concepts.fr.md)
- [Mail Workbench](./operator-console.fr.md)
- [Guide opérateurs](./operators-guide.fr.md)
