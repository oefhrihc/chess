
export class StockfishEngine {
    constructor(workerUrl) {
        this.worker = new Worker(workerUrl);

        this.initialized = false;
        this.activeSearch = null;
        this.syncResolver = null;

        this.readyPromise = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;

            this.initTimeout = setTimeout(() => {
                reject(new Error("Stockfish initialization timed out."));
            }, 20000);
        });

        this.worker.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        this.worker.onerror = (event) => {
            const error = new Error(
                event.message || "Stockfish worker failed."
            );

            this.fail(error);
        };

        this.worker.postMessage("uci");
    }

    handleMessage(data) {
        const line = String(data).trim();

        if (line === "uciok") {
            this.worker.postMessage("isready");
            return;
        }

        if (line === "readyok") {
            if (!this.initialized) {
                this.initialized = true;

                clearTimeout(this.initTimeout);

                this.resolveReady();
            } else if (this.syncResolver) {
                const resolve = this.syncResolver;

                this.syncResolver = null;

                resolve();
            }

            return;
        }

        if (line.includes("CRITICAL ERROR")) {
            this.fail(new Error(line));
            return;
        }

        if (line.startsWith("info ")) {
            this.handleInfo(line);
            return;
        }

        if (line.startsWith("bestmove ")) {
            this.handleBestMove(line);
        }
    }

    handleInfo(line) {
        if (!this.activeSearch) {
            return;
        }

        const cpMatch = line.match(/\bscore cp (-?\d+)/);
        const mateMatch = line.match(/\bscore mate (-?\d+)/);

        if (cpMatch) {
            this.activeSearch.score = {
                type: "cp",
                value: Number(cpMatch[1])
            };
        } else if (mateMatch) {
            this.activeSearch.score = {
                type: "mate",
                value: Number(mateMatch[1])
            };
        }
    }

    handleBestMove(line) {
        if (!this.activeSearch) {
            return;
        }

        const search = this.activeSearch;

        this.activeSearch = null;

        clearTimeout(search.timeout);

        const parts = line.split(/\s+/);

        search.resolve({
            bestMove: parts[1] || "(none)",
            score: search.score
        });
    }

    fail(error) {
        if (!this.initialized) {
            clearTimeout(this.initTimeout);
            this.rejectReady(error);
        }

        if (this.activeSearch) {
            const search = this.activeSearch;

            this.activeSearch = null;

            clearTimeout(search.timeout);

            search.reject(error);
        }
    }

    async init() {
        await this.readyPromise;
    }

    async sync() {
        await this.readyPromise;

        return new Promise((resolve, reject) => {
            if (this.syncResolver) {
                reject(new Error("Engine synchronization already pending."));
                return;
            }

            const timeout = setTimeout(() => {
                this.syncResolver = null;

                reject(new Error("Stockfish synchronization timed out."));
            }, 10000);

            this.syncResolver = () => {
                clearTimeout(timeout);
                resolve();
            };

            this.worker.postMessage("isready");
        });
    }

    async newGame() {
        await this.readyPromise;

        this.worker.postMessage("ucinewgame");

        await this.sync();
    }

    // Full-strength analysis for evaluating player moves.
    async setAnalysisStrength() {
        await this.readyPromise;

        this.worker.postMessage(
            "setoption name UCI_LimitStrength value false"
        );

        this.worker.postMessage(
            "setoption name Skill Level value 20"
        );

        await this.sync();
    }

    // Configure the opponent's playing strength.
    async setOpponentStrength(elo) {
        await this.readyPromise;

        if (elo === "max") {
            this.worker.postMessage(
                "setoption name UCI_LimitStrength value false"
            );

            this.worker.postMessage(
                "setoption name Skill Level value 20"
            );
        } else {
            const rating = Number(elo);

            if (
                !Number.isInteger(rating) ||
                rating < 1320 ||
                rating > 3190
            ) {
                throw new Error("Invalid Stockfish Elo setting.");
            }

            this.worker.postMessage(
                "setoption name UCI_LimitStrength value true"
            );

            this.worker.postMessage(
                `setoption name UCI_Elo value ${rating}`
            );
        }

        await this.sync();
    }

    // Analyse a FEN position and return the best move and evaluation.
    async search(fen, depth = 12) {
        await this.readyPromise;

        if (this.activeSearch) {
            throw new Error("Stockfish is already searching.");
        }

        if (!Number.isInteger(depth) || depth < 1 || depth > 64) {
            throw new Error("Invalid search depth.");
        }

        return new Promise((resolve, reject) => {
            const search = {
                resolve,
                reject,
                score: null,
                timeout: null
            };

            this.activeSearch = search;

            search.timeout = setTimeout(() => {
                if (this.activeSearch !== search) {
                    return;
                }

                this.worker.postMessage("stop");

                this.activeSearch = null;

                reject(new Error("Stockfish search timed out."));
            }, 30000);

            this.worker.postMessage(`position fen ${fen}`);
            this.worker.postMessage(`go depth ${depth}`);
        });
    }

    terminate() {
        if (this.activeSearch) {
            const search = this.activeSearch;

            this.activeSearch = null;

            clearTimeout(search.timeout);

            search.reject(new Error("Engine terminated."));
        }

        this.worker.terminate();
    }
}
