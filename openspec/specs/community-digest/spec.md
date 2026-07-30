# community-digest

## Purpose
The community-digest capability exposes a weekly snapshot of PeakSense community activity to Discord users, sourced from GET /api/community/weekly. The exact set of statistics surfaced can grow over time as the upstream endpoint evolves.

## Requirements

### Requirement: Weekly community stats digest
The bot SHALL provide a /digest slash command that renders a weekly community stats digest from PeakSense by calling GET /api/community/weekly.

#### Scenario: Stats available
- **WHEN** a user runs /digest and the API returns a stats object
- **THEN** the bot SHALL reply with a digestEmbed showing Total Dabs, Avg Score (rounded), Top Dabber and Most Active (when present), and any of New Users and Perfect Draws that are present

#### Scenario: Endpoint unavailable
- **WHEN** a user runs /digest and the API returns null or fails
- **THEN** the bot SHALL reply with a digestEmbed whose description reads "Community stats are not available right now. The /api/community/weekly endpoint may not be deployed yet." and whose color is 0xef4444

### Requirement: Digest embed format
digestEmbed(stats) SHALL render an embed titled with the weekly-digest prefix and a chart emoji, color 0x22c55e on success, the description "The latest community stats from PeakSense.", and a footer "SenseLink • /digest". Top Dabber and Most Active labels SHALL use the display name when present, formatted as displayName (@handle), otherwise @handle.

#### Scenario: Format is applied
- **WHEN** digestEmbed is called with a non-null stats object
- **THEN** the embed SHALL include the chart-emoji title, color 0x22c55e, the description "The latest community stats from PeakSense.", the SenseLink /digest footer, and Top Dabber/Most Active labels formatted as displayName (@handle) when displayName is present
