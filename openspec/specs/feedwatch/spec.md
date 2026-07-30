# feedwatch

## Purpose
The feedwatch capability lets a Discord channel subscribe to a real-time stream of new public dabs posted to PeakSense. Real-time delivery is driven by FINAL frames on a shared watcher room; a polling safety net on the public feed covers dabs that do not flow through the watcher room.

## Requirements

### Requirement: Channel-scoped live feed
The bot SHALL provide a /feedwatch slash command with subcommands start, stop, and status that let a Discord channel subscribe to a real-time stream of new public dabs posted to PeakSense.

#### Scenario: Start in an idle channel
- **WHEN** a user runs /feedwatch start in a channel that has no active watcher
- **THEN** the bot SHALL start a FeedWatcher bound to interaction.channelId and reply with a live-feed-started confirmation

#### Scenario: Start when already watching
- **WHEN** a user runs /feedwatch start in a channel that already has an active watcher
- **THEN** the bot SHALL reply with an ephemeral message indicating the live feed is already active

#### Scenario: Stop an active watcher
- **WHEN** a user runs /feedwatch stop in a channel that has an active watcher
- **THEN** the bot SHALL stop the watcher, remove it from the registry, and reply that the live feed was stopped

#### Scenario: Stop when no watcher exists
- **WHEN** a user runs /feedwatch stop in a channel with no active watcher
- **THEN** the bot SHALL reply with an ephemeral message indicating no live feed was active

#### Scenario: Status check
- **WHEN** a user runs /feedwatch status
- **THEN** the bot SHALL reply ephemerally indicating whether the live feed is currently active in the channel

### Requirement: Real-time delivery via shared watcher room
The bot SHALL keep one process-wide PeakSense room socket joined to the watcher room (default BOTS, overridable via SENSELINK_FEEDWATCH_ROOM). Every active /feedwatch watcher SHALL subscribe to FINAL frames on that socket and SHALL post any newly observed public dab to its bound channel. Frames from rooms other than the watcher room SHALL be ignored.

#### Scenario: FINAL in watcher room triggers a post
- **GIVEN** a watcher is active and the watcher room socket receives a FINAL frame whose payload room equals the watcher room
- **WHEN** the watcher refreshes /api/feed?period=recent
- **THEN** any dab id not in the seen-set SHALL be posted via liveFeedDabEmbed to the bound channel
- **AND** the dab id SHALL be added to the seen-set ring buffer

#### Scenario: FINAL in a different room is ignored
- **WHEN** the watcher room socket receives a FINAL frame whose payload room is not the watcher room
- **THEN** the watcher SHALL NOT trigger a feed refresh and SHALL NOT post anything

#### Scenario: Watcher room is a process singleton
- **WHEN** two /feedwatch start invocations run concurrently
- **THEN** both watchers SHALL share a single underlying room socket

### Requirement: Polling safety net
A watcher SHALL poll /api/feed?period=recent on a default 60-second interval so dabs posted by users outside the watcher room are still surfaced. The poll interval SHALL be honored even when FINAL frames are arriving.

#### Scenario: Poll cycles post missed dabs
- **GIVEN** a watcher is active and the seen-set is current
- **WHEN** the poll timer fires
- **THEN** the watcher SHALL fetch /api/feed?period=recent and post any dab id not in the seen-set, oldest first

#### Scenario: Poll continues when WS is silent
- **GIVEN** no FINAL frames have been received in the current watcher session
- **WHEN** the poll timer fires
- **THEN** the watcher SHALL still poll the public feed and post new dabs

### Requirement: Seed-on-start
A newly started watcher SHALL fetch the most recent dabs once at startup, mark them as seen, and SHALL NOT post them to the channel. Only dabs that arrive after the watcher starts SHALL be posted.

#### Scenario: Seed does not flood the channel
- **WHEN** a watcher starts in a channel
- **THEN** the first poll cycle SHALL mark existing recent dabs as seen without posting them to the channel

### Requirement: Graceful lifecycle
The bot SHALL stop all watchers on SIGTERM and SIGINT. Stopping a watcher SHALL clear its timer and unsubscribe from the shared watcher room socket.

#### Scenario: SIGTERM
- **WHEN** the bot receives SIGTERM
- **THEN** stopAllFeedWatchers() SHALL be called and the process SHALL exit 0

#### Scenario: SIGINT
- **WHEN** the bot receives SIGINT
- **THEN** stopAllFeedWatchers() SHALL be called and the process SHALL exit 0

### Requirement: Live-feed embed format
liveFeedDabEmbed(dab) SHALL render an embed with the dabber display name and score in the title, a description containing a profile link, score and grade, temperature (rounded to integer degrees Fahrenheit), and duration in seconds, the dab URL as the embed URL, the grade-based color from gradeColor, and a thumbnail of the user avatar when available. liveFeedDabEmbed(null) SHALL return null.

#### Scenario: Format is applied
- **WHEN** liveFeedDabEmbed is called with a valid dab
- **THEN** the embed SHALL include the display name and score in the title, a profile-linked description with score/grade/temp/duration, the dab URL as the embed URL, a grade-based color, and an avatar thumbnail when the dab has a user avatar

