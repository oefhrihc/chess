import { Chess } from "chess.js";
import { StockfishEngine } from "./stockfish-engine.js";

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const ANALYSIS_DEPTH = 12;
const PLAY_DEPTH = 10;

const HUMAN_COLOR = "w";
// main.js is served from /src in a branch deployment and /assets in a Vite build.
// In both cases, its parent directory is the deployed project root.
const BASE_URL = new URL("../", import.meta.url).href;

// Vite builds define this as an empty string and copy public assets to dist root.
// A branch-based Pages publish serves the original files from /public instead.
const ASSET_PREFIX =
  typeof __PUBLIC_ASSET_PREFIX__ === "string"
    ? __PUBLIC_ASSET_PREFIX__
    : "public/";
const ASSET_BASE_URL = new URL(ASSET_PREFIX, BASE_URL).href;

const PIECE_NAMES = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

// Keep the 64 square elements alive instead of rebuilding the board.
const squareElements = new Map();

const FILES = "abcdefgh";

// --------------------------------------------------
// Application state
// --------------------------------------------------

const chess = new Chess();

const engine = new StockfishEngine(
  `${ASSET_BASE_URL}stockfish/stockfish-19-lite-single.js`,
);

const boardElement = document.querySelector("#board");

const eloSelect = document.querySelector("#elo-select");
const opponentRating = document.querySelector("#opponent-rating");

const gameStatus = document.querySelector("#game-status");
const engineStatus = document.querySelector("#engine-status");

const newGameButton = document.querySelector("#new-game");
const retryButton = document.querySelector("#retry-engine");

const lastReview = document.querySelector("#last-review");
const moveList = document.querySelector("#move-list");

const takebackButton = document.querySelector("#takeback");

const playerRating = document.querySelector("#player-rating");
const ratingConfidence = document.querySelector("#rating-confidence");
const ratingACPL = document.querySelector("#rating-acpl");
const ratingMoves = document.querySelector("#rating-moves");
const ratingDescription = document.querySelector("#rating-description");
const ratingBarFill = document.querySelector("#rating-bar-fill");

const gameOverOverlay =
    document.querySelector("#game-over-overlay");

const gameOverIcon =
    document.querySelector("#game-over-icon");

const gameOverTitle =
    document.querySelector("#game-over-title");

const gameOverDescription =
    document.querySelector("#game-over-description");

const gameOverResult =
    document.querySelector("#game-over-result");

const gameOverMoves =
    document.querySelector("#game-over-moves");

const gameOverTakeback =
    document.querySelector("#game-over-takeback");

const gameOverNewGame =
    document.querySelector("#game-over-new-game");

let selectedSquare = null;
let legalTargets = new Set();

let lastMove = null;

let moveReviews = [];

let isThinking = false;
let engineReady = false;

let engineError = null;

// --------------------------------------------------
// Board rendering
// --------------------------------------------------

function renderBoard({ animateMove = false } = {}) {
  const board = chess.board();

  // Remember where the moving piece was before updating the board.
  const fromElement =
    animateMove && lastMove ? squareElements.get(lastMove.from) : null;

  const fromRect = fromElement?.getBoundingClientRect() ?? null;

  let arrivingPiece = null;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];

      const square = `${FILES[col]}${8 - row}`;

      let button = squareElements.get(square);

      // Create each square only once.
      if (!button) {
        button = document.createElement("button");

        button.type = "button";
        button.className = "square";

        button.dataset.square = square;

        button.addEventListener("click", () => {
          handleSquareClick(square);
        });

        // File coordinates.
        if (row === 7) {
          const fileLabel = document.createElement("span");

          fileLabel.className = "coordinate file-coordinate";

          fileLabel.textContent = FILES[col];

          button.appendChild(fileLabel);
        }

        // Rank coordinates.
        if (col === 0) {
          const rankLabel = document.createElement("span");

          rankLabel.className = "coordinate rank-coordinate";

          rankLabel.textContent = String(8 - row);

          button.appendChild(rankLabel);
        }

        squareElements.set(square, button);

        boardElement.appendChild(button);
      }

      const isDark = (row + col) % 2 === 1;

      button.classList.toggle("dark-square", isDark);
      button.classList.toggle("light-square", !isDark);

      button.classList.toggle("selected", selectedSquare === square);

      const isLegalTarget = legalTargets.has(square);

      button.classList.toggle("legal-target", isLegalTarget);

      button.classList.toggle(
        "capture-target",
        isLegalTarget && piece !== null,
      );

      button.classList.toggle(
        "last-move",
        lastMove !== null &&
          (lastMove.from === square || lastMove.to === square),
      );

      button.disabled =
        !engineReady ||
        isThinking ||
        chess.turn() !== HUMAN_COLOR ||
        chess.isGameOver();

      const pieceCode = piece
        ? `${piece.color}${piece.type.toUpperCase()}`
        : "";

      // Only update an image if its occupant actually changed.
      // This is what allows animations to finish uninterrupted.
      if (button.dataset.piece !== pieceCode) {
        button.querySelector(".piece-image")?.remove();

        button.dataset.piece = pieceCode;

        if (piece) {
          const image = document.createElement("img");

          image.className = "piece-image";

          image.src = `${ASSET_BASE_URL}pieces/${pieceCode}.svg`;

          image.alt =
            `${piece.color === "w" ? "White" : "Black"} ` +
            PIECE_NAMES[piece.type];

          image.dataset.color = piece.color;

          image.draggable = false;

          image.decoding = "async";

          button.insertBefore(image, button.firstChild);

          if (animateMove && lastMove?.to === square) {
            arrivingPiece = image;
          }
        }
      }

      button.setAttribute(
        "aria-label",
        piece
          ? `${square}, ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}`
          : `${square}, empty`,
      );
    }
  }

  // Animate the moved piece from its actual previous screen position.
  if (
    animateMove &&
    arrivingPiece &&
    fromRect &&
    typeof arrivingPiece.animate === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    const targetRect = arrivingPiece.getBoundingClientRect();

    const deltaX = fromRect.left - targetRect.left;
    const deltaY = fromRect.top - targetRect.top;

    arrivingPiece.animate(
      [
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(1.08)`,
          opacity: 0.9,
        },
        {
          transform: "translate(0, 0) scale(1)",
          opacity: 1,
        },
      ],
      {
        duration: 210,
        easing: "cubic-bezier(0.22, 0.75, 0.25, 1)",
        fill: "both",
      },
    );
  }
}

// --------------------------------------------------
// Square selection and legal moves
// --------------------------------------------------

function selectSquare(square) {
  selectedSquare = square;

  const moves = chess.moves({
    square,
    verbose: true,
  });

  legalTargets = new Set(moves.map((move) => move.to));

  renderBoard();
}

function clearSelection() {
  selectedSquare = null;

  legalTargets.clear();

  renderBoard();
}

async function handleSquareClick(square) {
  if (
    !engineReady ||
    isThinking ||
    chess.turn() !== HUMAN_COLOR ||
    chess.isGameOver()
  ) {
    return;
  }

  const piece = chess.get(square);

  if (selectedSquare) {
    if (square === selectedSquare) {
      clearSelection();
      return;
    }

    const possibleMoves = chess.moves({
      square: selectedSquare,
      verbose: true,
    });

    const move = possibleMoves.find((candidate) => candidate.to === square);

    if (move) {
      await playPlayerMove(selectedSquare, square);

      return;
    }

    // Allow selecting another one of your pieces.
    if (piece && piece.color === HUMAN_COLOR) {
      selectSquare(square);
      return;
    }

    clearSelection();

    return;
  }

  if (piece && piece.color === HUMAN_COLOR) {
    selectSquare(square);
  }
}

// --------------------------------------------------
// Evaluation helpers
// --------------------------------------------------

function scoreToCentipawns(score) {
  if (!score) {
    throw new Error("Engine did not return an evaluation.");
  }

  if (score.type === "cp") {
    return score.value;
  }

  // Convert mate scores into large signed values.
  if (score.type === "mate") {
    const sign = Math.sign(score.value) || 1;

    return sign * (30000 - Math.abs(score.value) * 100);
  }

  throw new Error("Unknown Stockfish score type.");
}

function classifyMove(loss) {
  if (loss <= 10) {
    return {
      grade: "Best",
      tone: "best",
    };
  }

  if (loss <= 25) {
    return {
      grade: "Excellent",
      tone: "excellent",
    };
  }

  if (loss <= 50) {
    return {
      grade: "Good",
      tone: "good",
    };
  }

  if (loss <= 100) {
    return {
      grade: "Inaccuracy",
      tone: "inaccuracy",
    };
  }

  if (loss <= 200) {
    return {
      grade: "Mistake",
      tone: "mistake",
    };
  }

  return {
    grade: "Blunder",
    tone: "blunder",
  };
}

// Convert a UCI move such as e2e4 into SAN notation.
function uciToSan(fen, uciMove) {
  if (!uciMove || uciMove === "(none)") {
    return null;
  }

  const position = new Chess(fen);

  try {
    const result = position.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove[4] || "q",
    });

    return result?.san ?? null;
  } catch {
    return null;
  }
}


// --------------------------------------------------
// Live performance rating
// --------------------------------------------------

const RATING_CALIBRATION = [
    { loss: 0, rating: 2800 },
    { loss: 10, rating: 2600 },
    { loss: 20, rating: 2400 },
    { loss: 30, rating: 2200 },
    { loss: 40, rating: 2050 },
    { loss: 50, rating: 1900 },
    { loss: 60, rating: 1750 },
    { loss: 75, rating: 1600 },
    { loss: 90, rating: 1450 },
    { loss: 110, rating: 1300 },
    { loss: 140, rating: 1150 },
    { loss: 180, rating: 1000 },
    { loss: 220, rating: 850 },
    { loss: 300, rating: 700 },
    { loss: 400, rating: 600 }
];

function estimatePerformanceRating(acpl) {
    const table = RATING_CALIBRATION;

    if (acpl <= table[0].loss) {
        return table[0].rating;
    }

    for (let i = 1; i < table.length; i++) {
        const lower = table[i - 1];
        const upper = table[i];

        if (acpl <= upper.loss) {
            const progress =
                (acpl - lower.loss) /
                (upper.loss - lower.loss);

            return Math.round(
                lower.rating +
                progress * (upper.rating - lower.rating)
            );
        }
    }

    return table[table.length - 1].rating;
}

function renderLiveRating() {
    // Only completed and successfully evaluated moves count.
    const ratedMoves = moveReviews.filter(
        move => Number.isFinite(move.loss)
    );

    const count = ratedMoves.length;

    ratingMoves.textContent = String(count);

    if (count < 3) {
        playerRating.textContent = "---";

        ratingACPL.textContent = "--";

        ratingConfidence.textContent =
            count === 0
                ? "Waiting for your moves"
                : "Calibrating estimate";

        ratingDescription.textContent =
            `${3 - count} more analysed move(s) needed.`;

        ratingBarFill.style.width =
            `${(count / 3) * 100}%`;

        return;
    }

    // Average centipawn loss across all analysed moves.
    const totalLoss = ratedMoves.reduce(
        (total, move) => total + move.loss,
        0
    );

    const acpl = totalLoss / count;

    const rating = estimatePerformanceRating(acpl);

    playerRating.textContent =
        rating.toLocaleString("en-US");

    ratingACPL.textContent =
        Math.round(acpl).toString();

    // Communicate how much confidence to place in the estimate.
    let confidence;

    if (count < 8) {
        confidence = "Early estimate";
    } else if (count < 15) {
        confidence = "Developing estimate";
    } else {
        confidence = "More established estimate";
    }

    ratingConfidence.textContent = confidence;

    ratingDescription.textContent =
        `Based on ${count} analysed moves and ${Math.round(acpl)} average centipawn loss.`;

    // Visualise the estimated rating on a 600-2800 scale.
    const percentage = Math.max(
        0,
        Math.min(100, ((rating - 600) / 2200) * 100)
    );

    ratingBarFill.style.width = `${percentage}%`;
}


// --------------------------------------------------
// Player move analysis
// --------------------------------------------------

async function analysePlayerMove(beforeFen, afterFen) {
  // Always use unrestricted Stockfish for grading.
  await engine.setAnalysisStrength();

  const before = await engine.search(beforeFen, ANALYSIS_DEPTH);

  const after = await engine.search(afterFen, ANALYSIS_DEPTH);

  if (!before.score || !after.score) {
    throw new Error("Could not evaluate both positions.");
  }

  const beforeTurn = beforeFen.split(" ")[1];
  const afterTurn = afterFen.split(" ")[1];

  const beforeScore = scoreToCentipawns(before.score);
  const afterScore = scoreToCentipawns(after.score);

  // Convert both evaluations to the player's perspective.
  const beforeForPlayer =
    beforeTurn === HUMAN_COLOR ? beforeScore : -beforeScore;

  const afterForPlayer = afterTurn === HUMAN_COLOR ? afterScore : -afterScore;

  const centipawnLoss = Math.max(
    0,
    Math.round(beforeForPlayer - afterForPlayer),
  );

  const classification = classifyMove(centipawnLoss);

  const bestMove = uciToSan(beforeFen, before.bestMove);

  return {
    ...classification,
    loss: centipawnLoss,
    bestMove,
  };
}

// --------------------------------------------------
// Review interface
// --------------------------------------------------

function renderReview(entry) {
  lastReview.replaceChildren();

  if (!entry) {
    return;
  }

  const header = document.createElement("div");

  header.className = "review-result-header";

  const moveName = document.createElement("strong");

  moveName.textContent = `${entry.moveNumber}. ${entry.san}`;

  const grade = document.createElement("span");

  grade.className = `grade grade-${entry.tone}`;

  grade.textContent = entry.grade;

  header.append(moveName, grade);

  lastReview.appendChild(header);

  if (entry.loss !== null) {
    const loss = document.createElement("div");

    loss.className = "centipawn-loss";

    loss.textContent = `Centipawn loss: ${entry.loss} cp`;

    lastReview.appendChild(loss);
  }

  if (entry.bestMove) {
    const suggestion = document.createElement("div");

    suggestion.className = "suggestion";

    if (entry.bestMove === entry.san) {
      suggestion.textContent = "Stockfish's top choice!";
    } else {
      suggestion.textContent = `Engine's best move: ${entry.bestMove}`;
    }

    lastReview.appendChild(suggestion);
  }

  if (entry.reason) {
    const reason = document.createElement("p");

    reason.className = "review-reason";
    reason.textContent = entry.reason;

    lastReview.appendChild(reason);
  }
}

function renderMoveHistory() {
  moveList.replaceChildren();

  if (moveReviews.length === 0) {
    const empty = document.createElement("li");

    empty.className = "empty-moves";

    empty.textContent = "Your move history will appear here.";

    moveList.appendChild(empty);

    renderLiveRating();

    return;
  }

  for (const entry of moveReviews) {
    const item = document.createElement("li");

    item.className = "move-entry";

    const number = document.createElement("span");

    number.className = "move-number";

    number.textContent = `${entry.moveNumber}.`;

    const san = document.createElement("span");

    san.className = "move-san";

    san.textContent = entry.san;

    const grade = document.createElement("span");

    grade.className = `grade grade-${entry.tone}`;

    grade.textContent = entry.grade;

    item.append(number, san, grade);

    moveList.appendChild(item);
  }

  moveList.scrollTop = moveList.scrollHeight;
  renderLiveRating();
}

// --------------------------------------------------
// Game status
// --------------------------------------------------


// --------------------------------------------------
// Game ending detection
// --------------------------------------------------

function getGameOverDetails() {

    // Checkmate
    if (chess.isCheckmate()) {

        // The side whose turn it is has been checkmated.
        const playerWon = chess.turn() !== HUMAN_COLOR;

        return {
            type: playerWon ? "win" : "loss",

            icon: playerWon ? "♔" : "♚",

            title: playerWon
                ? "Checkmate! You win!"
                : "Stockfish wins!",

            reason: "Checkmate",

            description: playerWon
                ? "You've successfully checkmated Stockfish. Excellent game!"
                : "Your king has been checkmated. Better luck next time!",

            result: playerWon ? "1–0" : "0–1"
        };
    }

    // Stalemate
    if (chess.isStalemate()) {
        return {
            type: "draw",
            icon: "½",
            title: "Stalemate!",
            reason: "Draw by stalemate",
            description:
                "The player whose turn it was has no legal moves, but their king is not in check.",
            result: "½–½"
        };
    }

    // Threefold repetition
    if (chess.isThreefoldRepetition()) {
        return {
            type: "draw",
            icon: "♻",
            title: "Draw!",
            reason: "Threefold repetition",
            description:
                "The same position has occurred three times during the game.",
            result: "½–½"
        };
    }

    // Fifty-move rule
    if (chess.isDrawByFiftyMoves()) {
        return {
            type: "draw",
            icon: "½",
            title: "Draw!",
            reason: "Fifty-move rule",
            description:
                "Fifty moves have been played by each side without a pawn move or capture.",
            result: "½–½"
        };
    }

    // Insufficient material
    if (chess.isInsufficientMaterial()) {
        return {
            type: "draw",
            icon: "½",
            title: "Draw!",
            reason: "Insufficient material",
            description:
                "Neither player has sufficient material to force checkmate.",
            result: "½–½"
        };
    }

    // Fallback for any other draw recognised by chess.js.
    if (chess.isDraw()) {
        return {
            type: "draw",
            icon: "½",
            title: "Game drawn!",
            reason: "Draw",
            description: "The game ended in a draw.",
            result: "½–½"
        };
    }

    return null;
}

function getGameOverMessage() {
    const details = getGameOverDetails();

    if (!details) {
        return "Game over!";
    }

    return `${details.title} — ${details.reason}`;
}


// --------------------------------------------------
// Game over screen
// --------------------------------------------------

function renderGameOverScreen() {
    const details = getGameOverDetails();

    if (!details) {
        gameOverOverlay.classList.remove("is-visible");
        gameOverOverlay.hidden = true;
        return;
    }

    const wasHidden = gameOverOverlay.hidden;

    gameOverIcon.textContent = details.icon;
    gameOverTitle.textContent = details.title;
    gameOverDescription.textContent =
        details.description;

    gameOverResult.textContent = details.result;

    const totalMoves = chess.history().length;

    gameOverMoves.textContent =
        String(Math.ceil(totalMoves / 2));

    gameOverOverlay.dataset.result = details.type;

    gameOverTakeback.disabled =
        !engineReady ||
        isThinking ||
        moveReviews.length === 0;

    gameOverNewGame.disabled =
        !engineReady ||
        isThinking;

    gameOverOverlay.hidden = false;

    if (wasHidden) {
        gameOverOverlay.classList.remove("is-visible");

        requestAnimationFrame(() => {
            gameOverOverlay.classList.add("is-visible");
        });
    }
}


function updateUI() {
  const elo = eloSelect.value;

  opponentRating.textContent = elo === "max" ? "Full strength" : `${elo} ELO`;

  if (!engineReady) {
    engineStatus.textContent = "Loading Stockfish";
  } else if (engineError) {
    engineStatus.textContent = "Engine error";
  } else if (isThinking) {
    engineStatus.textContent = "Thinking...";
  } else {
    engineStatus.textContent = "Ready";
  }

  if (!engineReady) {
    gameStatus.textContent = "Loading chess engine...";
  } else if (engineError) {
    gameStatus.textContent = engineError;
  } else if (chess.isGameOver()) {
    gameStatus.textContent = getGameOverMessage();
  } else if (isThinking) {
    gameStatus.textContent = "Analysing position...";
  } else if (chess.turn() === HUMAN_COLOR) {
    gameStatus.textContent = "Your turn — White";
  } else {
    gameStatus.textContent = "Stockfish is preparing its move...";
  }

  retryButton.hidden = !engineError;

  retryButton.disabled = isThinking;

  newGameButton.disabled = !engineReady || isThinking;

  eloSelect.disabled = !engineReady || isThinking;

  takebackButton.disabled =
    !engineReady || isThinking || moveReviews.length === 0;

  renderBoard();
  renderGameOverScreen();
}

// --------------------------------------------------
// Engine opponent
// --------------------------------------------------

async function makeEngineMove() {
  engineError = null;

  retryButton.hidden = true;

  try {
    await engine.setOpponentStrength(eloSelect.value);

    const result = await engine.search(chess.fen(), PLAY_DEPTH);

    if (!result.bestMove || result.bestMove === "(none)") {
      if (chess.isGameOver()) {
        return;
      }

      throw new Error("Stockfish returned no legal move.");
    }

    const uci = result.bestMove;

    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || "q",
    });

    if (!move) {
      throw new Error("Stockfish returned an illegal move.");
    }

    lastMove = {
      from: move.from,
      to: move.to,
    };

    renderBoard({ animateMove: true });
  } catch (error) {
    engineError = `Engine error: ${error.message}`;
  }
}

// --------------------------------------------------
// Playing a player move
// --------------------------------------------------

async function playPlayerMove(from, to) {
  const beforeFen = chess.fen();

  let move;

  try {
    move = chess.move({
      from,
      to,
      promotion: "q",
    });
  } catch {
    return;
  }

  if (!move) {
    return;
  }

  const afterFen = chess.fen();

  const moveNumber = Number(beforeFen.split(" ")[5] || 1);

  lastMove = {
    from,
    to,
  };

  selectedSquare = null;
  legalTargets.clear();

  // Add a temporary review entry.
  const review = {
    moveNumber,
    san: move.san,
    grade: "Analysing...",
    tone: "pending",
    loss: null,
    bestMove: null,
    reason: null,
  };

  moveReviews.push(review);

  renderMoveHistory();
  renderBoard({ animateMove: true });

  isThinking = true;
  engineError = null;

  updateUI();

  try {
    if (chess.isGameOver()) {
      Object.assign(review, {
        grade: "Game ending",
        tone: "best",
        loss: 0,
        reason: getGameOverMessage(),
      });

      renderReview(review);
      renderMoveHistory();

      return;
    }

    // Analyse the player's move using full-strength Stockfish.
    try {
      const result = await analysePlayerMove(beforeFen, afterFen);

      Object.assign(review, result);
    } catch (error) {
      Object.assign(review, {
        grade: "Not rated",
        tone: "pending",
        reason: error.message,
      });
    }

    renderReview(review);
    renderMoveHistory();

    if (chess.isGameOver()) {
      return;
    }

    // Let the selected Elo Stockfish opponent play.
    await makeEngineMove();
  } finally {
    isThinking = false;

    updateUI();
  }
}

// --------------------------------------------------
// Retry engine
// --------------------------------------------------

retryButton.addEventListener("click", async () => {
  if (
    isThinking ||
    !engineReady ||
    chess.isGameOver() ||
    chess.turn() !== "b"
  ) {
    return;
  }

  isThinking = true;

  updateUI();

  try {
    await makeEngineMove();
  } finally {
    isThinking = false;

    updateUI();
  }
});

// --------------------------------------------------
// New game
// --------------------------------------------------

newGameButton.addEventListener("click", async () => {
  if (isThinking || !engineReady) {
    return;
  }

  isThinking = true;

  engineError = null;

  selectedSquare = null;
  legalTargets.clear();

  lastMove = null;

  moveReviews = [];

  chess.reset();

  lastReview.replaceChildren();

  const empty = document.createElement("div");

  empty.className = "review-empty";

  empty.textContent = "No moves analysed yet. Start playing!";

  lastReview.appendChild(empty);

  renderMoveHistory();

  updateUI();

  try {
    await engine.newGame();

    await engine.setAnalysisStrength();
  } catch (error) {
    engineError = error.message;
  } finally {
    isThinking = false;

    updateUI();
  }
});

// --------------------------------------------------
// Take back the last turn
// --------------------------------------------------

async function takeBack() {
    if (
        !engineReady ||
        isThinking ||
        moveReviews.length === 0
    ) {
        return;
    }

    isThinking = true;
    engineError = null;

    updateUI();

    try {
        // If it is White's turn, Stockfish has already
        // responded. Undo both moves.
        //
        // If it is Black's turn, the player has just moved
        // but Stockfish hasn't responded. Undo one move.

        const movesToUndo = chess.turn() === "w" ? 2 : 1;

        for (let i = 0; i < movesToUndo; i++) {
            const undone = chess.undo();

            if (!undone) {
                break;
            }
        }

        // Remove the corresponding player review.
        moveReviews.pop();

        // Restore the last-move highlight.
        const history = chess.history({
            verbose: true
        });

        const previousMove = history.at(-1);

        lastMove = previousMove
            ? {
                from: previousMove.from,
                to: previousMove.to
            }
            : null;

        // Clear selection.
        selectedSquare = null;
        legalTargets.clear();

        // Restore the previous review.
        lastReview.replaceChildren();

        if (moveReviews.length > 0) {
            renderReview(moveReviews.at(-1));
        } else {
            const empty = document.createElement("div");

            empty.className = "review-empty";
            empty.textContent = "No moves analysed yet.";

            lastReview.appendChild(empty);
        }

        renderMoveHistory();

        renderBoard();

    } catch (error) {
        engineError = `Takeback failed: ${error.message}`;
    } finally {
        isThinking = false;

        updateUI();
    }
}

takebackButton.addEventListener("click", takeBack);

// Start another game from the ending screen.
gameOverNewGame.addEventListener("click", () => {
    newGameButton.click();
});

// Undo the final turn and return to the game.
gameOverTakeback.addEventListener("click", () => {
    takeBack();
});

// --------------------------------------------------
// Elo selection
// --------------------------------------------------

eloSelect.addEventListener("change", () => {
  updateUI();
});

// --------------------------------------------------
// Startup
// --------------------------------------------------

async function startApplication() {
  renderBoard();

  updateUI();

  try {
    await engine.init();

    await engine.newGame();

    await engine.setAnalysisStrength();

    engineReady = true;

    updateUI();
  } catch (error) {
    engineError = `Stockfish failed to load: ${error.message}`;

    updateUI();
  }
}

startApplication();
