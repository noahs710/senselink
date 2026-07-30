# dotd

## Purpose
The dotd capability surfaces PeakSense's Dab of the Day to Discord users as a single, shareable embed. It exposes a /dotd slash command backed by GET /api/dabs/dotd.

## Requirements

### Requirement: Dab of the Day
The bot SHALL provide a /dotd slash command that displays the current Dab of the Day from PeakSense by calling GET /api/dabs/dotd.

#### Scenario: Dab picked
- **WHEN** a user runs /dotd and the API returns a dab (or a payload wrapping one in dab)
- **THEN** the bot SHALL reply with a dotdEmbed showing score, grade, rounded temperature in degrees Fahrenheit, duration in seconds, and a "Perfect draw!" annotation when isPerfectDraw is true; the embed URL SHALL be the dab URL; the thumbnail SHALL be the user avatar when available; the footer SHALL include the dab createdAt formatted with toLocaleString()

#### Scenario: No dab picked yet
- **WHEN** a user runs /dotd and the API returns null or a payload with neither dab nor id
- **THEN** the bot SHALL reply with a dotdEmbed whose description reads "No Dab of the Day has been picked yet today. Check back later!" and color 0x94a3b8

#### Scenario: Includes share row
- **WHEN** a dab id is available
- **THEN** the bot SHALL include the standard dab share button row (makeDabRow(dabUrl(id), handle, id)) in the reply components

### Requirement: Dotd embed format
dotdEmbed(data) SHALL render an embed titled with the dab-of-the-day prefix and a trophy emoji, prefixed with a "Perfect draw!" marker when applicable, color 0xffd700, and a description that links the user @handle to their profile and states the score, grade, temperature, duration, and perfect-draw flag.

#### Scenario: Format is applied
- **WHEN** dotdEmbed is called with a payload containing a dab
- **THEN** the embed SHALL include the trophy-emoji title, color 0xffd700, a "Perfect draw!" marker when applicable, a profile-linked @handle, and the score, grade, temperature, duration, and perfect-draw flag in the description
