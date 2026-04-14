import { ReplayControllerClient } from '@/components/replay/ReplayControllerClient';

const SAMPLE_PGN = `[Event "Dot Matrix Visual Check"]
[Site "Local"]
[Date "2026.04.14"]
[Round "1"]
[White "CORE_AI"]
[Black "DATA_SENTRY"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5
7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3 Qc7
13. Be3 Bb7 14. Rc1 Rfe8 15. cxb5 axb5 16. Nxb5 Qa5 17. Nc3 Bf8
18. Ng5 Re7 19. f4 h6 20. Nxf7 Rxf7 21. Bxf7+ Kxf7 22. Qb3+ d5
23. Qxb7 Rb8 24. Qxc6 exf4 25. Bxf4 Rxb2 26. e5 Qa3 27. exf6 Nxf6
28. Qe6+ Kg6 29. Nxd5 Qxa2 30. Ne7+ Bxe7 31. Qxa2 Rxa2 32. Rxe7
1-0`;

export default function Board3DVisualLabPage() {
  return (
    <div className="fixed inset-0 bg-[#050505] text-white z-[60] flex flex-col overflow-hidden select-none">
      <header className="flex-none h-14 px-6 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <h1 className="text-sm font-bold tracking-tight">Board3D Visual Lab</h1>
        <span className="technical-label text-[9px] opacity-40 uppercase tracking-widest">
          Static Replay Fixture
        </span>
      </header>
      <main className="flex-1 min-h-0 container mx-auto p-4 lg:p-6 overflow-hidden flex flex-col">
        <ReplayControllerClient
          pgn={SAMPLE_PGN}
          whiteName="CORE_AI"
          blackName="DATA_SENTRY"
        />
      </main>
    </div>
  );
}
