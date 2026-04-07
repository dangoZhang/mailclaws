# Limites de securite

MailClaws traite tous les emails entrants, en-tetes et pieces jointes comme des entrees non fiables.

## Garde-fous en entree

Avant qu'un message atteigne l'orchestration, trois controles sont appliques :

- `sender policy` : les regles deny priment, les regles allow sont explicites, et les allowlists deviennent obligatoires une fois configurees.
- `loop guard` : le trafic auto-genere, bulk/list et noreply est bloque en amont.
- `attachment policy` : fichiers trop volumineux, MIME non supportes et volumes anormaux de pieces jointes sont rejetes avant toute execution agent.

Ces controles sont volontairement conservateurs pour limiter les boucles mail, l'amplification de spam et les traitements d'attachements a risque.

## Runtime et exposition des donnees

- Les etats room kernel, approvals, outbox intents et traces replay restent auditables via les surfaces operateur.
- Les configurations sensibles provider/account sont redigees sur les surfaces operateur et modele par defaut.
- La collaboration interne passe par la projection virtual mail et la retrieval scopee room, pas par l'exposition brute des payloads provider.

## Limite de release actuelle

- Les regressions securite liees a la redaction/exposition sont couvertes et vertes dans ce repository.
- Le mail I/O tourne encore en process avec le runtime dans ce repo ; une vraie frontiere sidecar externe isolee n'est pas encore livree.
- Cette release ne doit donc pas etre presentee comme une isolation dure complete sur tous les chemins de credentials provider.

## Validation de release

- Executer `pnpm test:security` pour verifier les regressions de redaction/exposition.
- Garder les claims de frontiere alignes avec [ADR-001 Architecture](./adr/ADR-001-architecture.md).
