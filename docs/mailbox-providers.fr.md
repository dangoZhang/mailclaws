# Matrice Des Providers Mailbox

Cette page liste les chemins de connexion mailbox actuellement pris en charge par MailClaws et ce que l’utilisateur doit faire pour chacun.

| Mailbox / Chemin | Provider ID | Mode De Connexion | Entrée | Sortie | Ce Que L’Utilisateur Doit Préparer | Ce Que L’Utilisateur Doit Faire | Action Dans MailClaws |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gmail | `gmail` | OAuth navigateur | `gmail_watch`, `gmail_history_recovery` | `gmail_api_send` | Client OAuth Google et, si nécessaire, client secret et topic Pub/Sub | Se connecter à Google et autoriser l’accès à la mailbox | Sélectionner Gmail et démarrer la connexion OAuth |
| Outlook / Microsoft 365 | `outlook` | OAuth navigateur | `imap_watch` | `account_smtp` | Client OAuth Microsoft et, si nécessaire, client secret et tenant | Se connecter à Microsoft et autoriser l’accès à la mailbox | Sélectionner Outlook et démarrer la connexion OAuth |
| QQ Mail | `qq` | Code d’autorisation IMAP / SMTP | `imap_watch` | `account_smtp` | Code d’autorisation QQ Mail | Activer IMAP / SMTP dans les réglages de sécurité du provider et générer le code | Sélectionner QQ Mail et coller le code |
| NetEase 163 Mail | `163` | Code d’autorisation IMAP / SMTP | `imap_watch` | `account_smtp` | Code d’autorisation 163 Mail | Activer IMAP / SMTP dans les réglages de sécurité du provider et générer le code | Sélectionner NetEase 163 Mail et coller le code |
| NetEase 126 Mail | `126` | Code d’autorisation IMAP / SMTP | `imap_watch` | `account_smtp` | Code d’autorisation 126 Mail | Activer IMAP / SMTP dans les réglages de sécurité du provider et générer le code | Sélectionner NetEase 126 Mail et coller le code |
| iCloud Mail | `icloud` | Mot de passe spécifique IMAP / SMTP | `imap_watch` | `account_smtp` | Mot de passe spécifique Apple | Générer un mot de passe spécifique dans les réglages de sécurité Apple Account | Sélectionner iCloud Mail et coller le mot de passe |
| Yahoo Mail | `yahoo` | App password IMAP / SMTP | `imap_watch` | `account_smtp` | App password Yahoo | Générer un app password dans les réglages de sécurité Yahoo | Sélectionner Yahoo Mail et coller l’app password |
| IMAP / SMTP générique | `imap` | IMAP / SMTP manuel | `imap_watch` | `account_smtp` | Hôte IMAP, hôte SMTP, ports, mode TLS, nom d’utilisateur et mot de passe ou code d’autorisation | Confirmer tous les paramètres de connexion auprès du provider ou de l’administrateur | Sélectionner IMAP / SMTP générique et saisir les paramètres |
| Forward / raw MIME fallback | `forward` | Forward MIME brut | `raw_mime_forward` | `account_smtp` | Une mailbox ou une gateway capable de transférer du mail RFC822 brut | Configurer le provider ou la gateway pour transférer le mail brut | Créer un compte forward et envoyer le mail vers `POST /api/inbound/raw` |

| Point D’Entrée Utilisateur | Rôle |
| --- | --- |
| `mailclaws onboard you@example.com` | Recommander un provider à partir de l’adresse mailbox |
| `mailclaws login` | Ouvrir l’assistant de connexion générique |
| `mailclaws providers` | Lister tous les providers pris en charge |
| `mailctl connect providers` | Afficher les données détaillées des providers |
| `mailctl connect provider <providerId>` | Afficher le guide détaillé d’un provider |

| Étape Du Flux Web | Description |
| --- | --- |
| Saisir l’adresse mailbox | Sert à recommander un provider et remplir les paramètres par défaut |
| Cliquer sur `Load Setup` | Charge le chemin recommandé et l’autoconfig |
| Sélectionner un provider | Permet de basculer vers n’importe quel chemin pris en charge |
| Terminer OAuth ou coller le secret | Finalise OAuth navigateur, ou colle le code d’autorisation, l’app password ou le mot de passe |
| Enregistrer le compte | Persiste la configuration mailbox dans MailClaws |

| Note | Détails |
| --- | --- |
| Récupération automatique des secrets | MailClaws ne scrape pas et ne lit pas automatiquement les codes d’autorisation, app passwords ou mots de passe sur les pages de sécurité des providers |
| Ordre recommandé | Utiliser OAuth navigateur quand il est disponible, puis un preset ou IMAP / SMTP générique, puis forward / raw MIME |
| Limite de prise en charge | La connexion dépend du fait que le provider expose un OAuth utilisable, IMAP / SMTP, ou un transfert raw MIME |

## Voir Aussi

- [Intégrations](./integrations.fr.md)
- [Prise en main](./getting-started.fr.md)
- [Console opérateur](./operator-console.fr.md)
