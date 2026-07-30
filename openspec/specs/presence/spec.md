# presence

## Purpose
The presence capability lets Discord users see how many PeakSense users are currently online and how many are actively dabbing. It exposes a single slash command backed by the PeakSense presence API.

## Requirements

### Requirement: Show current dabbing presence
The bot SHALL provide a /presence slash command that displays how many PeakSense users are currently online and how many are actively dabbing.

#### Scenario: Presence data available
- **WHEN** a user runs /presence and the PeakSense /api/presence endpoint returns a payload with botSummary.totalOnline and botSummary.totalDabbing
- **THEN** the bot SHALL reply with an embed titled "PeakSense Presence" showing the online count, dabbing count, and a bulleted list of up to 20 dabbing names (with an overflow note when more than 20 are active)

#### Scenario: Presence endpoint unreachable
- **WHEN** /api/presence returns null or fails
- **THEN** the bot SHALL reply with a plain-text error message indicating the PeakSense presence API could not be reached

#### Scenario: No one is dabbing
- **WHEN** the presence payload contains an empty dabbingNames list
- **THEN** the embed description SHALL read "No one is dabbing right now."
