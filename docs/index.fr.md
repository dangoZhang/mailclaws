---
layout: home

hero:
  name: MailClaw
  text: Connectez une boîte mail et envoyez un premier test en 3 minutes
  tagline: MailClaw garde le contexte email dans des rooms durables, orchestre les agents via virtual mail, et expose tout dans un mail workbench unique.
  actions:
    - theme: brand
      text: Premier mail en 3 min
      link: /fr/getting-started#three-minute-first-mail
    - theme: alt
      text: Ouvrir le mail workbench
      link: /fr/operator-console
    - theme: alt
      text: Options de connexion
      link: /fr/integrations

features:
  - title: Contexte Email Durable
    details: Chaque email entrant devient une room avec révision, approbations, traces de delivery et replay.
  - title: Mailboxes Agents Internes
    details: Les agents collaborent via des mailbox threads internes auditables, sans polluer les fils externes.
  - title: Envoi Gouverné Par Défaut
    details: L'envoi réel passe par outbox + approbation. Les workers ne peuvent pas déclencher un send direct.
  - title: Un Mail Workbench
    details: "`/workbench/mail` et `mailctl` couvrent rooms, inboxes, mailboxes, approbations et traces gateway."
---

## Démarrage En 3 Minutes

1. Démarrer MailClaw : `pnpm mailclaw`
2. Demander le meilleur chemin de connexion : `pnpm mailclaw onboard you@example.com`
3. Connecter votre boîte mail : `pnpm mailclaw login`
4. Ouvrir `http://127.0.0.1:3000/workbench/mail`
5. Envoyer un email depuis une autre boîte vers l’adresse connectée

Ensuite, suivez le parcours premier message : [Prise en main](./getting-started.fr.md#three-minute-first-mail).

## Où Voir La Collaboration Des Agents

- `/workbench/mail/accounts/:accountId` pour ouvrir un compte et basculer vers room/mailbox.
- `/workbench/mail` pour partir d’une adresse mailbox et obtenir le bon parcours provider.
- `/workbench/mail/mailboxes/:accountId/:mailboxId` pour voir le flux d'une mailbox agent.
- `/workbench/mail/rooms/:roomKey` pour corréler le fil externe et les traces de collaboration interne.
- Équivalent CLI :
  - `pnpm mailctl observe mailbox-feed <accountId> <mailboxId>`
  - `pnpm mailctl observe mailbox-view <roomKey> <mailboxId>`

## Parcours De Référence

- [Prise en main](./getting-started.fr.md) : parcours 3 minutes + scénarios provider/gateway/internal-agent.
- [Mail Workbench](./operator-console.fr.md) : routes `/workbench/mail`, filtres et modèle inbox/mailbox.
- [Guide opérateur](./operators-guide.fr.md) : exploitation quotidienne, replay, approbations, récupération et dépannage.
- [Intégrations](./integrations.fr.md) : couverture provider, OAuth, câblage entrant/sortant et compatibilité OpenClaw.
- [Limites de sécurité](./security-boundaries.fr.md) : modèle de confiance, périmètre de redaction et limites d'isolation actuelles.

## Réalité de release

- Livré maintenant : kernel runtime, seams provider d'ingestion/delivery, APIs de projection Gateway, flux replay/approval, et page workbench `/workbench/mail`.
- Non livré : client mailbox complet type Outlook et câblage automatique Gateway round-trip de bout en bout.
- Validation release : exécuter [Live Provider Smoke](./live-provider-smoke.fr.md) et vérifier les contraintes dans [ADR-001 Architecture](./adr/ADR-001-architecture.md).

## Limites actuelles

- Ce dépôt fournit maintenant un vrai site de documentation via `pnpm docs:dev` et `pnpm docs:build`.
- Le runtime et le Mail workbench sont documentés, mais pas encore un client mailbox complet de type Outlook.
