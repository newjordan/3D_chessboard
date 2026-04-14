const BASE_URL = process.env.NEXTAUTH_URL || "https://chessagents.ai";

export async function notifyMatchStarted(match: any) {
  // Silenced to prevent webhook spam on large batches.
}

export async function notifyMatchResult(match: any, deltaA: number, deltaB: number, challengerWins: number, defenderWins: number, draws: number) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  try {
    console.log(`[Notification] Sending Match Result for ${match.id}...`);
    const resultText = (match.challengerScore || 0) > (match.defenderScore || 0)
      ? `🏆 **${match.challengerEngine?.name || "Challenger"}** won the match!`
      : (match.defenderScore || 0) > (match.challengerScore || 0)
      ? `🏆 **${match.defenderEngine?.name || "Defender"}** won the match!`
      : "🤝 The match ended in a draw.";

    const embed = {
      title: "🏁 Match Completed",
      description: resultText,
      color: 0x2ecc71, // Green
      fields: [
        {
          name: match.challengerEngine?.name || "Challenger",
          value: `Score: **${match.challengerScore || 0}**\nRating: ${(match.challengerEngine?.currentRating || 1200) + deltaA} (${deltaA > 0 ? "+" : ""}${deltaA})`,
          inline: true
        },
        {
          name: match.defenderEngine?.name || "Defender",
          value: `Score: **${match.defenderScore || 0}**\nRating: ${(match.defenderEngine?.currentRating || 1200) + deltaB} (${deltaB > 0 ? "+" : ""}${deltaB})`,
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
        text: `Match ID: ${String(match.id).substring(0, 8)}`
      }
    };

    if (!webhookUrl) return;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Discord API Error (result): ${response.status} ${response.statusText} - ${errorText}`);
    } else {
      console.log(`[Notification] Match Result sent successfully.`);
    }
  } catch (error) {
    console.error("Failed to send Discord notification (result):", error);
  }
}

export async function notifyMatchesScheduled(matchCount: number, engineCount: number) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl || matchCount === 0) return;

  try {
    const embed = {
      title: "🔄 Matches Scheduled",
      description: `The scheduler has successfully queued a new batch of matches.`,
      color: 0x9b59b6, // Purple
      fields: [
        {
          name: "Matches Queued",
          value: `**${matchCount}**`,
          inline: true
        },
        {
          name: "Engines Involved",
          value: `**${engineCount}**`,
          inline: true
        },
        {
          name: "Mode",
          value: "Competitive Rating",
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "Chess Arena Scheduler"
      }
    };

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (error) {
    console.error("Failed to send Batch Schedule notification:", error);
  }
}

export async function notifyGameResult(match: any, round: number, result: string, termination: string) {
  // Silenced to prevent webhook spam (2 results per match).
}

export async function notifyEngineValidated(engine: any, owner: any) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
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
        text: `Engine ID: ${String(engine.id).substring(0, 8)}`
      }
    };

    if (!webhookUrl) return;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Discord API Error (validated): ${response.status} ${response.statusText} - ${errorText}`);
    }
  } catch (error) {
    console.error("Failed to send Discord notification (validated):", error);
  }
}
