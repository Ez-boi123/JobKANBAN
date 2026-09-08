# Issue tracker: Local Markdown

Issues and specs live in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- One file per implementation ticket:
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state with a `Status:` line near the top, using
  `triage-labels.md`.
- Append conversation history under `## Comments`.

## Publish and fetch

When instructed to publish, create the appropriate spec or ticket file
using the paths above, creating directories as needed.

When instructed to fetch a ticket, read the referenced file.
Resolve issue numbers within the relevant feature directory.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, containing Notes,
  Decisions-so-far, and Fog.
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`.
- Record the question in the body and its type in a `Type:` line:
  `research`, `prototype`, `grilling`, or `task`.
- Use `Status: open`, `Status: claimed`, or `Status: resolved`
  for wayfinding tickets.
- Record dependencies with `Blocked by: NN, NN`.
- A ticket is unblocked when all listed dependencies are resolved.
- Select the lowest-numbered open, unblocked, unclaimed ticket.
- Claim by saving `Status: claimed` before starting work.
- Resolve by appending `## Answer`, setting `Status: resolved`,
  and adding a summary and link to the map's Decisions-so-far.
