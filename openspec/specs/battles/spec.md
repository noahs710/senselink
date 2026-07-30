# battles

## Purpose
The battles capability lets Discord users browse the open public battle rooms currently advertised by PeakSense. It exposes a single /battles slash command backed by GET /api/groups.

## Requirements

### Requirement: List public battle rooms
The bot SHALL provide a /battles slash command that lists open public battle rooms from PeakSense by calling GET /api/groups.

#### Scenario: Open rooms available
- **WHEN** a user runs /battles and the API returns groups with at least one room whose seshState is unset, open, or lobby
- **THEN** the bot SHALL reply with a battlesEmbed showing up to 25 of those rooms with member count, state, and host name when present

#### Scenario: Only in-progress rooms available
- **WHEN** a user runs /battles and the API returns only rooms whose seshState is in_progress or active
- **THEN** the bot SHALL fall back to showing those rooms (no open rooms available)

#### Scenario: No rooms available
- **WHEN** a user runs /battles and the API returns an empty array or null
- **THEN** the embed description SHALL read "No public battle rooms open right now."

### Requirement: Battles embed format
battlesEmbed(groups) SHALL render an embed titled with the battle-rooms prefix and a sword emoji, color 0xf97316, footer "SenseLink • /battles", and a description where each room line begins with a state icon (green circle for open, red circle for in_progress/active), followed by the room name, member count, state, and optional host.

#### Scenario: Format is applied
- **WHEN** battlesEmbed is called with a non-empty groups array
- **THEN** the embed SHALL include the sword-emoji title, color 0xf97316, the SenseLink /battles footer, and one line per room with the state icon, name, member count, state, and optional host
