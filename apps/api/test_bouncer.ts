async function testSelfPlayRejection() {
  const url = "http://localhost:3001/api/broker/submit";
  
  // Test 1: Self-Play (Same names in PGN)
  const selfPlayPayload = {
    jobId: "c18e4745-eaab-4220-802c-566109e10f45", 
    matchId: "c444b657-5929-485c-8e95-46c8417b33e9", // pawnstorm v3 vs MERSAL
    pgn: '[Event "Test"]\n[White "pawnstorm v3"]\n[Black "pawnstorm v3"]\n[Result "1-0"]\n\n1. e4*',
    result: "1-0",
    challengerScore: 1.0,
    defenderScore: 0.0
  };

  console.log("--- Test 1: Self-Play Rejection ---");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-broker-secret": "7b9e1c4d8a5f2b6e3a9c7d4f1a8b3c5e"
      },
      body: JSON.stringify(selfPlayPayload)
    });
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${JSON.stringify(data, null, 2)}`);
  } catch (err: any) {
    console.error("Test 1 failed:", err.message);
  }

  // Test 2: Round Count Mismatch
  const roundCountPayload = {
    jobId: "c18e4745-eaab-4220-802c-566109e10f45", 
    matchId: "c444b657-5929-485c-8e95-46c8417b33e9", // Planned games: 2
    pgn: '[Event "T1"]\n[White "pawnstorm v3"]\n[Black "MERSAL"]\n[Result "1-0"]\n\n1. e4*\n\n[Event "T2"]\n[White "pawnstorm v3"]\n[Black "MERSAL"]\n[Result "1-0"]\n\n1. e4*\n\n[Event "T3"]\n[White "pawnstorm v3"]\n[Black "MERSAL"]\n[Result "1-0"]\n\n1. e4*',
    result: "3-0",
    challengerScore: 3.0,
    defenderScore: 0.0
  };

  console.log("\n--- Test 2: Round Count Mismatch ---");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-broker-secret": "7b9e1c4d8a5f2b6e3a9c7d4f1a8b3c5e"
      },
      body: JSON.stringify(roundCountPayload)
    });
    const data = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${JSON.stringify(data, null, 2)}`);
  } catch (err: any) {
    console.error("Test 2 failed:", err.message);
  }
}

testSelfPlayRejection();
