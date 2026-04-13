const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function notifyMatchStarted(match: any) {
  try {
    const embed = {
      title: "⚔️ Match Started",
      description: `**${match.challengerEngine.name}** vs **${match.defenderEngine.name}**`,
      color: 0x3498db, // Blue
      fields: [
        {
          name: "Challenger",
          value: `${match.challengerEngine.name} (${match.challengerEngine.currentRating} Elo)`,
          inline: true
        },
        {
          name: "Defender",
          value: `${match.defenderEngine.name} (${match.defenderEngine.currentRating} Elo)`,
          inline: true
        },
        {
          name: "Format",
          value: `${match.gamesPlanned} Games`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: `Match ID: ${match.id.substring(0, 8)}`
      }
    };

    if (!DISCORD_WEBHOOK_URL) return;

    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (error) {
    console.error("Failed to send Discord notification (started):", error);
  }
}

export async function notifyMatchResult(match: any, deltaA: number, deltaB: number, challengerWins: number, defenderWins: number, draws: number) {
  try {
    const resultText = match.challengerScore > match.defenderScore 
      ? `🏆 **${match.challengerEngine.name}** won the match!`
      : match.defenderScore > match.challengerScore
      ? `🏆 **${match.defenderEngine.name}** won the match!`
      : "🤝 The match ended in a draw.";

    const embed = {
      title: "🏁 Match Completed",
      description: resultText,
      color: 0x2ecc71, // Green
      fields: [
        {
          name: match.challengerEngine.name,
          value: `Score: **${match.challengerScore}**\nRating: ${match.challengerEngine.currentRating + deltaA} (${deltaA > 0 ? "+" : ""}${deltaA})`,
          inline: true
        },
        {
          name: match.defenderEngine.name,
          value: `Score: **${match.defenderScore}**\nRating: ${match.defenderEngine.currentRating + deltaB} (${deltaB > 0 ? "+" : ""}${deltaB})`,
          inline: true
        },
        {
          name: "Statistics",
          value: `Wins: ${challengerWins} | Losses: ${defenderWins} | Draws: ${draws}`,
          inline: false
        }
      ],
      url: `${BASE_URL}/matches/${match.id}`,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Match ID: ${match.id.substring(0, 8)}`
      }
    };

    if (!DISCORD_WEBHOOK_URL) return;

    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (error) {
    console.error("Failed to send Discord notification (result):", error);
  }
}

export async function notifyEngineValidated(engine: any, owner: any) {
  try {
    const embed = {
      title: "🚀 New Agent Validated",
      description: `**${engine.name}** has passed validation and is now in the arena!`,
      color: 0x9b59b6, // Purple
      fields: [
        {
          name: "Developer",
          value: owner.username ? `@${owner.username}` : owner.name || "Anonymous",
          inline: true
        },
        {
          name: "Initial Rating",
          value: "1200 Elo",
          inline: true
        }
      ],
      thumbnail: owner.image ? { url: owner.image } : undefined,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Engine ID: ${engine.id.substring(0, 8)}`
      }
    };

    if (!DISCORD_WEBHOOK_URL) return;

    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (error) {
    console.error("Failed to send Discord notification (validated):", error);
  }
}
