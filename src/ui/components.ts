import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { matchUrl, opggUrl, porofessorUrl } from './format';
import type { PlayerRef } from './viewModels';

/** Discord allows at most five buttons per row. */
const MAX_BUTTONS = 5;

function linkButton(label: string, url: string, emoji?: string): ButtonBuilder {
  const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url);
  if (emoji) button.setEmoji(emoji);
  return button;
}

/** "Watch live" + profile shortcuts shown under a game-start announcement. */
export function liveGameButtons(players: PlayerRef[]): ActionRowBuilder<ButtonBuilder>[] {
  if (players.length === 0) return [];
  const first = players[0];
  const buttons = [
    linkButton('Spectate', porofessorUrl(first.gameName, first.tagLine, first.platform), '🔴'),
    ...players
      .slice(0, MAX_BUTTONS - 1)
      .map((player) =>
        linkButton(
          players.length === 1 ? 'Profil op.gg' : player.gameName,
          opggUrl(player.gameName, player.tagLine, player.platform)
        )
      )
  ].slice(0, MAX_BUTTONS);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)];
}

/** "Match detail" + profile shortcuts shown under a game-result announcement. */
export function matchButtons(players: PlayerRef[], matchId: string): ActionRowBuilder<ButtonBuilder>[] {
  if (players.length === 0) return [];
  const first = players[0];
  const buttons = [
    linkButton('Détail du match', matchUrl(first.gameName, first.tagLine, first.platform, matchId), '🔍'),
    ...players
      .slice(0, MAX_BUTTONS - 1)
      .map((player) =>
        linkButton(
          players.length === 1 ? 'Profil op.gg' : player.gameName,
          opggUrl(player.gameName, player.tagLine, player.platform)
        )
      )
  ].slice(0, MAX_BUTTONS);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)];
}

export function profileButtons(player: PlayerRef): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      linkButton('op.gg', opggUrl(player.gameName, player.tagLine, player.platform)),
      linkButton('Live', porofessorUrl(player.gameName, player.tagLine, player.platform), '🔴')
    )
  ];
}
