export function updateTimer(timeString) {
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.textContent = timeString;
  }
}

export function addMove(moveNumber, whiteMove, blackMove = '') {
  const movesContainer = document.getElementById('moves');
  if (!movesContainer) return;

  const div = document.createElement('div');
  div.innerHTML = `
    <span class="move-num">${moveNumber}.</span>
    <span class="move-white">${whiteMove}</span>
    <span class="move-black">${blackMove}</span>
  `;
  movesContainer.appendChild(div);
  
  // Auto scroll to bottom
  const box = document.getElementById('move-history-box');
  box.scrollTop = box.scrollHeight;
}
