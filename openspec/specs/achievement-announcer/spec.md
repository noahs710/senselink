# achievement-announcer

## Purpose
The achievement-announcer capability runs a background service that watches the PeakSense leaderboard for two kinds of events and posts them to a configured Discord channel: achievement unlocks and ELO tier rank-ups. The announcement channel can be set at boot via configuration or at runtime via the /announce slash command.

## Requirements

### Requirement: Background announcer service
The bot SHALL run a singleton Announcer service after the Discord client becomes ready. The service SHALL poll the leaderboard on a configurable interval and post achievement-unlock and rank-up announcements to a configured Discord channel.

#### Scenario: Service starts on ready
- **WHEN** the Discord client emits Events.ClientReady
- **THEN** startAnnouncer(client) SHALL be called and the announcer SHALL schedule its first poll after a short delay

#### Scenario: Service stops on shutdown
- **WHEN** the bot receives SIGTERM or SIGINT
- **THEN** stopAnnouncer() SHALL be called and the announcer timer SHALL be cleared before the process exits

### Requirement: Configurable via runtime config
The announcer SHALL read its configuration from process config variables, with constructor options taking precedence. The variables are SENSELINK_ANNOUNCE_CHANNEL_ID (initial channel id), SENSELINK_ANNOUNCE_POLL_MS (default 60000), SENSELINK_ANNOUNCE_MAX_USERS (default 25), and SENSELINK_ANNOUNCE_DISABLED (when set to "1", the service is off).

#### Scenario: Disabled by config
- **WHEN** SENSELINK_ANNOUNCE_DISABLED=1 is set
- **THEN** start() SHALL log a disabled message and return without scheduling a poll

#### Scenario: Missing channel at startup
- **WHEN** the announcer starts with no channelId configured
- **THEN** polls SHALL still run but _sendToChannel SHALL be a no-op until setChannel(channelId) is called

### Requirement: Runtime channel configuration
The bot SHALL provide an /announce slash command with subcommands here, status, and stop to configure the announcement channel at runtime.

#### Scenario: Set channel
- **WHEN** a user runs /announce here and the announcer is running
- **THEN** announcer.setChannel(interaction.channelId) SHALL be called and the bot SHALL reply confirming the channel is now the announcement channel

#### Scenario: Status check
- **WHEN** a user runs /announce status
- **THEN** the bot SHALL reply ephemerally indicating whether a channel is configured and, if so, the polling interval and tracked user count

#### Scenario: Stop announcements
- **WHEN** a user runs /announce stop in the currently configured channel
- **THEN** announcer.setChannel(null) SHALL be called

#### Scenario: Stop from non-configured channel
- **WHEN** a user runs /announce stop in a channel that is not the currently configured announcement channel
- **THEN** the bot SHALL reply with an ephemeral message indicating the channel was not the configured one

### Requirement: Rank-up detection
The announcer SHALL detect tier transitions for each tracked user. A rank-up announcement SHALL be posted the first time a user tier name changes between consecutive polls. The first poll SHALL seed the prior tier without announcing.

#### Scenario: Crossing a tier boundary
- **GIVEN** a user previous tier was Silver
- **WHEN** a subsequent poll reports a rating whose tier is Gold
- **THEN** the announcer SHALL post a rankUpAnnouncementEmbed with oldTier Silver, newTier Gold, and newRating equal to the rating

#### Scenario: First poll does not announce
- **WHEN** the announcer polls a user for the first time
- **THEN** no rank-up announcement SHALL be posted regardless of the user tier

#### Scenario: Tier boundaries
The tier table SHALL map ratings to tier names as follows: 0+ Bronze, 800+ Silver, 1000+ Gold, 1200+ Platinum, 1400+ Diamond, 1600+ Master, 1800+ Grandmaster, 2000+ Legend, null Unranked.

### Requirement: Achievement-unlock detection
The announcer SHALL detect new public achievements for each tracked user. Achievements whose isPublic is false SHALL be skipped from announcements but SHALL still populate the seen-set. The first poll SHALL seed the seen-set without announcing; subsequent polls SHALL announce newly observed achievement identifiers.

#### Scenario: New public achievement
- **GIVEN** a user has at least one achievement in the seen-set from a prior poll
- **WHEN** a subsequent poll reports an achievement whose identifier is not in the seen-set and whose isPublic is not false
- **THEN** the announcer SHALL post an achievementAnnouncementEmbed with the achievement title (from the catalog when available, otherwise the raw title) and description

#### Scenario: Private achievements are skipped
- **WHEN** a user has an achievement whose isPublic is false
- **THEN** that achievement SHALL be added to the seen-set but SHALL NOT trigger an announcement

### Requirement: Resilience
The announcer SHALL swallow API errors and connection failures. The poll timer SHALL be unrefd so it does not keep the process alive. The poll interval SHALL be jittered by plus or minus 10 percent to avoid thundering-herd effects.

#### Scenario: API failure during poll
- **WHEN** getLeaderboard or getUserAchievements throws
- **THEN** the error SHALL be logged and the next poll SHALL be scheduled

#### Scenario: Discord send failure
- **WHEN** channels.fetch or channel.send throws
- **THEN** the error SHALL be logged and the announcer SHALL continue polling

### Requirement: Achievement embed format
achievementAnnouncementEmbed(info) SHALL render an embed titled with the display name and an unlocked-achievement phrase, with a medal emoji prefix, color 0xffd700, the embed URL set to the user profile URL, a description containing the achievement title (and description when present), and the user avatar as a thumbnail when available.

#### Scenario: Achievement embed format applied
- **WHEN** achievementAnnouncementEmbed is called with valid info
- **THEN** the embed SHALL include the medal-emoji title, color 0xffd700, the user profile URL as the embed URL, a description with the achievement title (and description when present), and the user avatar as a thumbnail when available

### Requirement: Rank-up embed format
rankUpAnnouncementEmbed(info) SHALL render an embed titled with the display name and a ranked-up phrase, with a chart-increasing emoji prefix, color 0x22d3ee, the embed URL set to the user profile URL, a description of the form oldTier to newTier plus new rating rounded to integer, and the user avatar as a thumbnail when available.

#### Scenario: Achievement embed format applied
- **WHEN** achievementAnnouncementEmbed is called with valid info
- **THEN** the embed SHALL include the medal-emoji title, color 0xffd700, the user profile URL as the embed URL, a description with the achievement title (and description when present), and the user avatar as a thumbnail when available

#### Scenario: Rank-up embed format applied
- **WHEN** rankUpAnnouncementEmbed is called with valid info
- **THEN** the embed SHALL include the chart-increasing-emoji title, color 0x22d3ee, the user profile URL as the embed URL, a description of the form oldTier to newTier plus new rating rounded to integer, and the user avatar as a thumbnail when available
