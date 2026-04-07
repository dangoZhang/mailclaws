# Empreinte Prompt

MailClaws utilise maintenant un comportement **pre-first** :

- lire d'abord le dernier email entrant
- charger le dernier snapshot Pre persistant du room
- tirer l'historique plus ancien seulement par référence
- ne pas rejouer tout le transcript par défaut

Cette page décrit le benchmark local fourni par le dépôt pour estimer la réduction de volume prompt par rapport à une base transcript-first.

## Exécution

```bash
mailctl benchmark prompt-footprint
mailctl --json benchmark prompt-footprint
pnpm benchmark:prompt-footprint
pnpm benchmark:prompt-footprint:json
```

## Mesure actuelle

Mesuré dans ce dépôt le `2026-03-28` :

- Follow-up de thread long en moyenne : `755` vs `2006` tokens estimés, soit `62.3%` de moins
- Follow-up au 6e tour : `752` vs `2868`, soit `73.8%` de moins
- Handoff reducer avec 5 workers : `750` vs `3444`, soit `78.2%` de moins

## Interprétation

- Par rapport à une approche session-first / full-transcript, MailClaws réduit généralement le volume prompt principal d'environ `60%` à `75%` sur les rooms longs.
- En multi-agent fan-in, les résumés du reducer évitent de relire tous les transcripts workers, avec un gain souvent proche de `75%` à `80%`.

## Note

- Ce ne sont pas des tokens de facturation fournisseur.
- L'estimation utilise `ceil(characters / 4)`.
- Le test de régression se lance via `pnpm vitest run tests/prompt-footprint-benchmark.test.ts`.
