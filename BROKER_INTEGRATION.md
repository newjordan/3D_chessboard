# Chess Agents - Match Broker Integration Guide

This guide describes how to connect to the Chess Agents Match Broker API to process high-performance match simulations.

## 🔐 Credentials

- **Endpoint**: `https://chessagents.ai/api/broker`
- **Auth Header**: `x-broker-secret`
- **Secret Key**: `7b9e1c4d8a5f2b6e3a9c7d4f1a8b3c5e`

---

## 1. Fetching Match Jobs

Pull a batch of pending matches from the arena queue.

- **Method**: `POST`
- **Path**: `/api/broker/next-jobs`
- **Body**:

```json
{
  "count": 10, // Max batches of 10 recommended
  "brokerId": "frosty-runner-1"
}
```

### 📦 Response (Match Package)

You will receive an array of match objects. Each object contains the raw source code for both engines.

```json
[
  {
    "jobId": "uuid",
    "matchId": "uuid",
    "matchType": "rating",
    "timeControl": "5+0.1",
    "gamesPlanned": 2,
    "challenger": {
      "id": "uuid",
      "name": "Pawnstorm v4",
      "language": "py",
      "code": "import chess..."
    },
    "defender": {
      "id": "uuid",
      "name": "DeepBlue Clone",
      "language": "js",
      "code": "const chess = ..."
    }
  }
]
```

---

## 2. Submitting Results

After simulating the match, post the PGN and scores back to update the leaderboard.

- **Method**: `POST`
- **Path**: `/api/broker/submit`
- **Body**:

```json
{
  "jobId": "uuid", // From the Match Package
  "matchId": "uuid", // From the Match Package
  "pgn": "[Event ...]", // Full PGN string
  "result": "1-0", // "1-0", "0-1", or "1/2-1/2"
  "challengerScore": 1.0, // Final score for challenger
  "defenderScore": 0.0 // Final score for defender
}
```

### 🛡️ Submission Validation Rules

To prevent data corruption and cheating, the API enforces the following rules on the submitted PGN:

1. **Identity Verification**: The `[White]` and `[Black]` tags in the PGN header **must** match the engine names provided in the job package (case-insensitive).
2. **Game Count**: The number of `[Result]` tags in the PGN must exactly match the `gamesPlanned` value for that match.
3. **No Self-Play**: If the PGN lists the same engine name for both White and Black, the submission will be rejected.

---

## 🆘 Troubleshooting Submission Errors

| Error | Cause | Fix |
| :--- | :--- | :--- |
| `Validation Failed: PGN Player names... do not match` | Mismatched header tags. | Ensure you are passing the exact `name` strings from the Job Package to your PGN generator. |
| `Validation Failed: PGN shows [Name] playing against itself` | Identity collision. | Check your runner logic to ensure you aren't launching the same engine in both slots. |
| `Validation Failed: PGN contains X games, expected Y` | Round count mismatch. | Verify that your PGN file contains every round and no duplicates. |

---

## ℹ️ Implementation Notes

1. **Source Code Execution**:
   - The `code` field contains the raw file content.
   - Save this to a temporary file based on the `language` field (`.py` or `.js`) to execute.
2. **Concurrency**:
   - You can run multiple instances of your runner pulling this API simultaneously.
   - The server uses `FOR UPDATE SKIP LOCKED` to ensure no two runners ever receive the same job.
3. **PGN Compression**:
   - We recommend sending standard text PGN. The server will handle storage.
