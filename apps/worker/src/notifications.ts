const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

export async function notifyMatchStarted(match: any) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  try {
    console.log(`[Notification] Sending Match Started for ${match.id}...`);
    const embed = {
      title: "⚔️ Match Started",
      description: `**${match.challengerEngine?.name || "Unknown"}** vs **${match.defenderEngine?.name || "Unknown"}**`,
      color: 0x3498db, // Blue
      fields: [
        {
          name: "Challenger",
          value: `${match.challengerEngine?.name || "N/A"} (${match.challengerEngine?.currentRating || 1200} Elo)`,
          inline: true
        },
        {
          name: "Defender",
          value: `${match.defenderEngine?.name || "N/A"} (${match.defenderEngine?.currentRating || 1200} Elo)`,
          inline: true
        },
        {
          name: "Format",
          value: `${match.gamesPlanned || 0} Games`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: `Match ID: ${String(match.id).substring(0, 8)}`
      }
    };

    if (!webhookUrl) {
      console.warn("DEBUG: No DISCORD_WEBHOOK_URL found in environment.");
      return;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Discord API Error (started): ${response.status} ${response.statusText} - ${errorText}`);
    } else {
      console.log(`[Notification] Match Started sent successfully.`);
    }
  } catch (error) {
    console.error("Failed to send Discord notification (started):", error);
  }
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

export async function notifyGameResult(match: any, round: number, result: string, termination: string) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  try {
    console.log(`[Notification] Sending Game Result for round ${round}...`);
    
    // Logic: Odd rounds = Challenger is White, Even rounds = Defender is White
    const isChallengerWhite = round % 2 !== 0;
    const whiteName = isChallengerWhite ? match.challengerEngine?.name : match.defenderEngine?.name;
    const blackName = isChallengerWhite ? match.defenderEngine?.name : match.challengerEngine?.name;
    
    let winnerText = "🤝 The game ended in a draw.";
    let resultEmoji = "🤝";
    
    if (result === "1-0") {
      winnerText = `🏆 **${whiteName}** (White) won!`;
      resultEmoji = "⚪";
    } else if (result === "0-1") {
      winnerText = `🏆 **${blackName}** (Black) won!`;
      resultEmoji = "⚫";
    }

    const embed = {
      title: `🎮 Game ${round} Finished`,
      description: `${resultEmoji} ${winnerText}\n**Result**: ${result} (${termination})`,
      color: 0xf1c40f, // Yellow/Gold
      fields: [
        {
          name: "Challenger",
          value: match.challengerEngine?.name || "Agent A",
          inline: true
        },
        {
          name: "Defender",
          value: match.defenderEngine?.name || "Agent B",
          inline: true
        }
      ],
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
        console.error(`Discord API Error (game): ${response.status} ${response.statusText} - ${errorText}`);
    } else {
      console.log(`[Notification] Game Result sent successfully.`);
    }
  } catch (error) {
    console.error("Failed to send Discord notification (game):", error);
  }
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
