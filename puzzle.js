
let placementsByWord = {}; 
let currentGridSize = 14;

document.addEventListener("DOMContentLoaded", () => {
  updateWordInputs();

  document.getElementById("wordCount").addEventListener("change", updateWordInputs);
  document.getElementById("generateBtn").addEventListener("click", generatePuzzle);
  document.getElementById("clearBtn").addEventListener("click", clearAll);
  document.getElementById("printBtn").addEventListener("click", printPuzzle);

  window.addEventListener("beforeunload", () => {
    clearAll();
  });
});

function updateWordInputs() {
  const count = parseInt(document.getElementById("wordCount").value, 10);
  const container = document.getElementById("wordInputsContainer");
  const label = container.querySelector("label");

  container.innerHTML = "";
  container.appendChild(label);

  for (let i = 1; i <= count; i++) {
    const div = document.createElement("div");
    div.className = "word-input-row";
    div.innerHTML = `
      <input type="text"
             id="word${i}"
             placeholder="Word ${i}"
             maxlength="20"
             oninput="this.value = this.value.toUpperCase()">
    `;
    container.appendChild(div);
  }
}

function showError(message) {
  const errorDiv = document.getElementById("errorMessage");
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
  setTimeout(() => {
    errorDiv.style.display = "none";
  }, 5000);
}

function generatePuzzle() {
  const wordCount = parseInt(document.getElementById("wordCount").value, 10);
  const words = [];

  for (let i = 1; i <= wordCount; i++) {
    const word = document.getElementById(`word${i}`).value.trim().toUpperCase();

    if (!word) {
      showError(`Please enter all ${wordCount} words!`);
      return;
    }
    if (word.length < 3) {
      showError(`Word ${i} is too short! Minimum 3 letters.`);
      return;
    }
    if (!/^[A-Z]+$/.test(word)) {
      showError(`Word ${i} contains invalid characters! Letters only.`);
      return;
    }
    words.push(word);
  }

  const size = parseInt(document.getElementById("gridSize").value, 10);
  currentGridSize = size;

  const result = createGrid(size, words);
  if (!result) {
    showError("Could not generate puzzle. Try different words or a larger grid.");
    return;
  }

  const { grid, placements } = result;
  placementsByWord = placements;

  displayGrid(grid, size, words);
}

function createGrid(size, words) {
  const grid = Array(size)
    .fill(null)
    .map(() => Array(size).fill(""));

  const placements = {}; 

  for (const word of words) {
    let attempts = 0;
    let success = false;

    while (attempts < 200 && !success) {
      const direction = Math.floor(Math.random() * 8);
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);

      if (canPlaceWord(grid, word, row, col, direction, size)) {
        const coords = placeWordAndGetCoords(grid, word, row, col, direction);
        placements[word] = coords;
        success = true;
      }
      attempts++;
    }

    if (!success) return null;
  }

 
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (grid[i][j] === "") {
        grid[i][j] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      }
    }
  }

  return { grid, placements };
}

function canPlaceWord(grid, word, row, col, direction, size) {
  const directions = [
    [0, 1], [1, 0], [1, 1], [-1, 1],
    [0, -1], [-1, 0], [-1, -1], [1, -1]
  ];

  const [dr, dc] = directions[direction];

  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;

    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    if (grid[r][c] !== "" && grid[r][c] !== word[i]) return false;
  }

  return true;
}

function placeWordAndGetCoords(grid, word, row, col, direction) {
  const directions = [
    [0, 1], [1, 0], [1, 1], [-1, 1],
    [0, -1], [-1, 0], [-1, -1], [1, -1]
  ];

  const [dr, dc] = directions[direction];
  const coords = [];

  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    grid[r][c] = word[i];
    coords.push({ row: r, col: c });
  }

  return coords;
}

function displayGrid(grid, size, words) {
  const gridElement = document.getElementById("grid");
  gridElement.innerHTML = "";
  gridElement.className = `grid size-${size}`;

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = grid[i][j];
      cell.dataset.row = i;
      cell.dataset.col = j;
      gridElement.appendChild(cell);
    }
  }

  
  const wordListContainer = document.getElementById("wordListContainer");
  wordListContainer.innerHTML = "";

  words.forEach((word) => {
    const div = document.createElement("div");
    div.className = "word-list-item";
    div.textContent = word;

  
    div.addEventListener("mouseenter", () => showHint(word));
    div.addEventListener("mouseleave", clearHints);

    wordListContainer.appendChild(div);
  });

  document.getElementById("puzzleContainer").style.display = "block";
  document.getElementById("printBtn").style.display = "inline-block";
}

function showHint(word) {
  clearHints();
  const coords = placementsByWord[word];
  if (!coords) return;

  coords.forEach(({ row, col }) => {
    const cell = document.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.classList.add("hint");
  });
}

function clearHints() {
  document.querySelectorAll(".cell.hint").forEach((cell) => {
    cell.classList.remove("hint");
  });
}

function clearAll() {
  const wordCount = parseInt(document.getElementById("wordCount").value, 10);
  for (let i = 1; i <= wordCount; i++) {
    const input = document.getElementById(`word${i}`);
    if (input) input.value = "";
  }

  placementsByWord = {};

  document.getElementById("puzzleContainer").style.display = "none";
  document.getElementById("printBtn").style.display = "none";
  document.getElementById("grid").innerHTML = "";
  document.getElementById("wordListContainer").innerHTML = "";
  clearHints();
}

function printPuzzle() {
  window.print();
}
