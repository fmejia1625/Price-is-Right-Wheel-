const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");

const radius = 350;
const centerX = canvas.width / 2;
const centerY = canvas.height / 2;

const teams = [
    { name: "Team 1", total: null, spins: [], busted: false },
    { name: "Team 2", total: null, spins: [], busted: false },
    { name: "Team 3", total: null, spins: [], busted: false }
];

// Price Is Right canonical Big Wheel order (clockwise)
const segmentValues = [
    0.15, 0.80, 0.35, 0.60, 0.20,
    0.40, 0.75, 0.55, 0.95, 0.50,
    0.85, 0.30, 0.65, 0.10, 0.45,
    0.70, 0.25, 0.90, 0.05, 1.00
];

const segments = segmentValues.map((value) => {
    const label = `$${value.toFixed(2)}`;
    // Wedge colors: 0.05 and 0.15 are distinct greens; everything else is black
    let color = "#0d0d0d"; // deep black by default
    if (Math.abs(value - 0.05) < 0.001) color = "#007a3d"; // darker green for $0.05
    if (Math.abs(value - 0.15) < 0.001) color = "#00b050"; // lighter/brighter green for $0.15
    return { label, value, color };
});

let angle = 0;
let velocity = 0;
let spinning = false;
let spinCount = 1;
let roundTotal = 0;
let currentTeamIndex = 0;
let dragStart = 0;
let spinPower = 200;
let lastPeg = -1;
let inTieBreak = false;
let tieIndices = []; // indices of teams currently in tiebreak
let tieBreakValues = {}; // map teamIndex -> spin value during tiebreak

// Background music: light looped track
const backgroundMusic = document.getElementById("backgroundMusic") || new Audio();
const backgroundMusicCandidates = ["audio/background-music.mp3", "Price_Is_Right_Wheel/audio/background-music.mp3"];
let backgroundMusicSrcIndex = 0;

function setBackgroundMusicSource(index) {
    backgroundMusicSrcIndex = Math.max(0, Math.min(index, backgroundMusicCandidates.length - 1));
    backgroundMusic.src = backgroundMusicCandidates[backgroundMusicSrcIndex];
}

setBackgroundMusicSource(0);
backgroundMusic.loop = true;
backgroundMusic.volume = 0.18;
let musicPlaying = false; // true only once playback is actually underway (not just attempted)
let musicMuted = false; // tracks the mute button state

// Sound effects: wheel spin whir and the "bust" fail sound
const spinSfx = new Audio('audio/wheel_spin.mp3');
spinSfx.volume = 0.5;
const failSfx = new Audio('audio/fail.mp3');
failSfx.volume = 0.5;

// Preload the background track so it's ready to play instantly on the first spin
function initAudio() {
    try {
        backgroundMusic.load();
    } catch (e) {
        // ignore
    }
}

// Attempts to start the background music; retries are safe since play() on an
// already-playing track is a harmless no-op. Tracks success via musicPlaying.
function startBackgroundMusic() {
    if (musicStarted) return;
    musicStarted = true;
    backgroundMusic.play().catch(() => {
        // Retry once using alternate relative path for duplicate-folder workspace layouts.
        if (backgroundMusicSrcIndex < backgroundMusicCandidates.length - 1) {
            setBackgroundMusicSource(backgroundMusicSrcIndex + 1);
            backgroundMusic.play().catch(() => {});
        }
    });
}

// Mute button handler: toggles background music on/off and swaps the button icon
function toggleMusicMute() {
    musicMuted = !musicMuted;
    backgroundMusic.muted = musicMuted;
    if (!musicMuted) {
        startBackgroundMusic();
    }
    const btn = document.getElementById("muteBtn");
    if (btn) btn.textContent = musicMuted ? "🔇" : "🔊";
}

// Plays a one-off sound effect by name; resets currentTime so rapid repeats restart from the beginning
function playSfx(name) {
    if (name === 'spin') {
        spinSfx.currentTime = 0;
        spinSfx.play().catch(() => {});
    } else if (name === 'bust') {
        failSfx.currentTime = 0;
        failSfx.play().catch(() => {});
    }
}

// Wire up the bottom-left mute button
const muteBtn = document.getElementById("muteBtn");
if (muteBtn) muteBtn.addEventListener("click", toggleMusicMute);

// initialize audio setup
initAudio();

let spinStartTravel = 0;
let spinTravel = 0;
const flashDuration = 3600;
const tieBreakDisplayDuration = 5500;
const turnTransitionDuration = 1600;
const bustTransitionDuration = 1800;

function flashResult(msg, color = "#ffd43b", duration = flashDuration) {
    const el = document.getElementById("result");
    el.textContent = msg;
    el.style.color = color;
    el.classList.add("flash");
    setTimeout(() => {
        el.classList.remove("flash");
    }, duration);
}

// helper to find indices for special slices
const idx100 = segments.findIndex(s => s.value === 1.00);

function drawWheel() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const arc = (Math.PI * 2) / segments.length;

    const metal = ctx.createRadialGradient(
        centerX,
        centerY,
        radius - 40,
        centerX,
        centerY,
        radius + 40
    );

    metal.addColorStop(0, "#ffffff");
    metal.addColorStop(0.2, "#d9d9d9");
    metal.addColorStop(0.5, "#888");
    metal.addColorStop(1, "#333");

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 28, 0, Math.PI * 2);
    ctx.fillStyle = metal;
    ctx.fill();

    for (let i = 0; i < segments.length; i++) {
        const start = i * arc + angle;
        const end = start + arc;

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, start, end);
        ctx.closePath();

        ctx.fillStyle = segments[i].color;
        ctx.fill();

        // silver dividers between wedges for a metallic look
        ctx.strokeStyle = "#cfcfcf";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(start + arc / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const label = segments[i].label;
        // Use Georgia serif for all labels and dynamically scale to fit inside wedge
        const serifBase = (segments[i].value === 1.00) ? 34 : 24; // prefer larger for $1.00
        const minSize = 12;
        const wedgeArc = (Math.PI * 2) / segments.length;
        // approximate available width inside wedge (fraction of arc length at inner radius)
        const availableWidth = Math.max(56, (radius - 60) * wedgeArc * 0.9);

        let size = serifBase;
        ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
        // shrink until it fits or reaches min size
        while (size > minSize && ctx.measureText(label).width > availableWidth) {
            size -= 1;
            ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
        }

        if (Math.abs(segments[i].value - 0.05) < 0.001 || Math.abs(segments[i].value - 0.15) < 0.001) {
            // green wedges: white fill with dark stroke for contrast
            ctx.lineWidth = Math.max(2, Math.round(size / 12));
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.strokeText(label, radius - 38, 0);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(label, radius - 38, 0);
        } else if (segments[i].value === 1.00) {
            // $1.00: extravagant serif with shadow and red fill
            ctx.shadowColor = 'rgba(0,0,0,0.45)';
            ctx.shadowBlur = 6;
            ctx.lineWidth = Math.max(2, Math.round(size / 12));
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.strokeText(label, radius - 38, 0);
            ctx.fillStyle = '#e71d36';
            ctx.fillText(label, radius - 38, 0);
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        } else {
            // other slices: silver serif
            ctx.fillStyle = "#c0c0c0";
            ctx.fillText(label, radius - 38, 0);
        }
        ctx.restore();
        ctx.restore();
    }

    // shimmer overlay: subtle moving sheen across the wheel
    (function drawShimmer() {
        const t = Date.now() / 1000;
        const offset = (Math.sin(t * 1.6) + 1) / 2; // 0..1
        const shimmer = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
        shimmer.addColorStop(Math.max(0, offset - 0.12), 'rgba(255,255,255,0)');
        shimmer.addColorStop(offset, 'rgba(255,255,255,0.06)');
        shimmer.addColorStop(Math.min(1, offset + 0.12), 'rgba(255,255,255,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = shimmer;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    })();

    // special highlight for the $1.00 slice: soft red arc + glow
    if (idx100 >= 0) {
        const startA = idx100 * arc + angle;
        const endA = startA + arc;
        ctx.save();
        // gold shimmer overlay only (remove red glow)
        ctx.globalCompositeOperation = 'lighter';
        const goldG = ctx.createLinearGradient(centerX + Math.cos((startA + endA) / 2) * radius * 0.2, centerY - radius, centerX, centerY + radius);
        goldG.addColorStop(0, 'rgba(255,215,0,0)');
        goldG.addColorStop(0.35, 'rgba(255,215,0,0.16)');
        goldG.addColorStop(0.6, 'rgba(255,215,0,0.08)');
        goldG.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = goldG;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startA + (endA - startA) * 0.12, endA - (endA - startA) * 0.12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
    }

    drawPegs();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 48, 0, Math.PI * 2);
    ctx.fillStyle = "#999";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 24, 0, Math.PI * 2);
    ctx.fillStyle = "#f3f3f3";
    ctx.fill();

    // center logo badge using Teachers Federal Credit Union brand colors
    const badgeRadius = 30;
    const navy = "#0a1739";
    const yellow = "#ffc72c";
    const shadowColor = "rgba(0, 0, 0, 0.18)";

    // navy circle base
    ctx.beginPath();
    ctx.arc(centerX, centerY, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = navy;
    ctx.fill();

    // yellow T shape top bar
    const topBarHeight = badgeRadius * 0.3;
    const topBarWidth = badgeRadius * 1.75;
    const topBarY = centerY - badgeRadius * 0.35;
    ctx.fillStyle = yellow;
    ctx.fillRect(centerX - topBarWidth / 2, topBarY, topBarWidth, topBarHeight);

    // yellow T stem with rounded bottom
    const stemWidth = badgeRadius * 0.34;
    const stemHeight = badgeRadius * 1.05;
    const stemX = centerX - stemWidth / 2;
    const stemY = topBarY + topBarHeight;
    ctx.beginPath();
    ctx.moveTo(stemX, stemY);
    ctx.lineTo(stemX, stemY + stemHeight - stemWidth / 2);
    ctx.quadraticCurveTo(centerX, stemY + stemHeight + stemWidth / 2, stemX + stemWidth, stemY + stemHeight - stemWidth / 2);
    ctx.lineTo(stemX + stemWidth, stemY);
    ctx.closePath();
    ctx.fill();

    // subtle highlight on the top bar
    const highlight = ctx.createLinearGradient(centerX - topBarWidth / 2, topBarY, centerX + topBarWidth / 2, topBarY + topBarHeight);
    highlight.addColorStop(0, "rgba(255,255,255,0.25)");
    highlight.addColorStop(0.7, "rgba(255,255,255,0.05)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = highlight;
    ctx.fillRect(centerX - topBarWidth / 2 + 2, topBarY + 2, topBarWidth - 4, topBarHeight * 0.5);

    // soft shadow on stem
    const stemShadow = ctx.createLinearGradient(stemX, stemY, stemX + stemWidth, stemY);
    stemShadow.addColorStop(0, shadowColor);
    stemShadow.addColorStop(0.5, "rgba(0,0,0,0)");
    stemShadow.addColorStop(1, shadowColor);
    ctx.fillStyle = stemShadow;
    ctx.fillRect(stemX + 2, stemY + 6, stemWidth - 4, stemHeight - 12);
}

function drawPegs() {
    const pegCount = 100;

    for (let i = 0; i < pegCount; i++) {
        const pegAngle = (Math.PI * 2 / pegCount) * i;
        const x = centerX + Math.cos(pegAngle + angle) * (radius + 10);
        const y = centerY + Math.sin(pegAngle + angle) * (radius + 10);

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#f0f0f0";
        ctx.fill();
    }
}

// power bar removed

function syncTeamNames() {
    teams[0].name = document.getElementById("teamOneName").value.trim() || "Team 1";
    teams[1].name = document.getElementById("teamTwoName").value.trim() || "Team 2";
    teams[2].name = document.getElementById("teamThreeName").value.trim() || "Team 3";
}

function beginTurn(index) {
    syncTeamNames();
    currentTeamIndex = index;
    roundTotal = 0;
    spinCount = 1;

    document.getElementById("spinNumber").textContent = "1";
    document.getElementById("totalScore").textContent = "$0.00";
    document.getElementById("currentPlayer").textContent = teams[currentTeamIndex].name;
    document.getElementById("result").textContent = `${teams[currentTeamIndex].name}, spin the wheel!`;
    document.getElementById("result").style.color = "#ffd43b";
    updateDisplay();
    // players always get two spins; reset state
    spinTravel = 0;
    setDecisionVisible(false);
}

function advanceTurn() {
    if (currentTeamIndex >= teams.length - 1) {
        determineMatchWinner();
    } else {
        currentTeamIndex += 1;
        beginTurn(currentTeamIndex);
    }
}

function resetRoundAfterAllBust() {
    teams.forEach(t => {
        t.total = null;
        t.spins = [];
        t.busted = false;
    });
    updateTracker();
    document.getElementById("result").textContent = "All three teams busted — replaying the round for two advancing teams.";
    document.getElementById("result").style.color = "#ffd43b";
    beginTurn(0);
}

function updateLeaderboard() {
    // leaderboard removed — show a concise score area in the header instead
}

function updateDisplay() {
    document.getElementById("currentPlayer").textContent = teams[currentTeamIndex].name;
    document.getElementById("totalScore").textContent = `$${roundTotal.toFixed(2)}`;
}

function updateTracker() {
    updatePlayerLabels();
    const fmt = s => `$${s.toFixed(2)}`;
    const t0spins = teams[0].spins.map(fmt).join(", ");
    const t1spins = teams[1].spins.map(fmt).join(", ");
    const t2spins = teams[2].spins.map(fmt).join(", ");
    const statusText = (team, spins) => {
        if (team.busted) return `BUST (${spins || '-'})`;
        if (team.total !== null && team.total !== undefined) return `$${team.total.toFixed(2)} (${spins || '-'})`;
        return `- (${spins || '-'})`;
    };
    document.getElementById("team0Tracker").textContent = `${teams[0].name}: ${statusText(teams[0], t0spins)}`;
    document.getElementById("team1Tracker").textContent = `${teams[1].name}: ${statusText(teams[1], t1spins)}`;
    document.getElementById("team2Tracker").textContent = `${teams[2].name}: ${statusText(teams[2], t2spins)}`;
}

function updateTrackerForTieBreak() {
    // Show only tie-break participants and their tiebreak spin if available. Others are dimmed.
    for (let i = 0; i < teams.length; i++) {
        const el = document.getElementById(`team${i}Tracker`);
        if (!el) continue;
        if (tieIndices && tieIndices.includes(i)) {
            const val = tieBreakValues[i];
            el.textContent = `${teams[i].name}: Tiebreak ${val ? `$${val.toFixed(2)}` : '-'} (${teams[i].total > 0 ? `$${teams[i].total.toFixed(2)}` : '-'})`;
        } else {
            el.textContent = `${teams[i].name}: - (-)`;
        }
    }
}

function updatePlayerLabels() {
    const inputs = [
        { id: "teamOneName", index: 0 },
        { id: "teamTwoName", index: 1 },
        { id: "teamThreeName", index: 2 }
    ];
    inputs.forEach(({ id, index }) => {
        const el = document.getElementById(id);
        if (!el) return;
        teams[index].name = el.value.trim() || `Team ${index + 1}`;
    });
    document.getElementById("currentPlayer").textContent = teams[currentTeamIndex].name;
}

// live-update handlers: keep tracker and message in sync while typing, and handle Enter to commit
(function attachNameInputHandlers() {
    const ids = ["teamOneName", "teamTwoName", "teamThreeName"];
    ids.forEach((id, idx) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            teams[idx].name = el.value.trim() || `Team ${idx + 1}`;
            // update visible labels
            document.getElementById('currentPlayer').textContent = teams[currentTeamIndex].name;
            updateTracker();
            // update the main message to reflect current player name when editing
            const res = document.getElementById('result');
            if (res) res.textContent = `${teams[currentTeamIndex].name}, spin the wheel!`;
        });
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                teams[idx].name = el.value.trim() || `Team ${idx + 1}`;
                el.blur();
                document.getElementById('currentPlayer').textContent = teams[currentTeamIndex].name;
                updateTracker();
                const res = document.getElementById('result');
                if (res) res.textContent = `${teams[currentTeamIndex].name}, spin the wheel!`;
            }
        });
    });
})();

canvas.addEventListener("mousedown", (e) => {
    dragStart = e.clientY;
});

canvas.addEventListener("mouseup", (e) => {
    spinPower = Math.min(Math.abs(dragStart - e.clientY), 400);
});

const spinBtn = document.getElementById("spinBtn");
if (spinBtn) {
    spinBtn.addEventListener("click", startBackgroundMusic);
    spinBtn.addEventListener("click", spin);
}

// Let the Enter key trigger a spin, as long as the SPIN button is enabled and the
// user isn't currently typing a team name (those inputs use Enter to commit the name)
document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target && e.target.tagName === "INPUT") return;
    if (!spinBtn || spinBtn.disabled) return;
    e.preventDefault();
    spinBtn.click();
});

// Decision control helper
function setDecisionVisible(show) {
    const el = document.getElementById("decisionControls");
    if (!el) return;
    el.style.display = show ? "flex" : "none";
    document.getElementById("spinBtn").disabled = show;
}

// Decision button handlers
if (document.getElementById("stayBtn")) {
    document.getElementById("stayBtn").addEventListener("click", () => {
        playSfx('click');
        const team = teams[currentTeamIndex];
        team.total = roundTotal;
        updateTracker();
        setDecisionVisible(false);
        flashResult(`${team.name} stays at $${team.total.toFixed(2)}`, "#00ff66", flashDuration);
        setTimeout(() => {
            if (currentTeamIndex === teams.length - 1) determineMatchWinner(); else advanceTurn();
        }, flashDuration);
    });
}
if (document.getElementById("spinAgainBtn")) {
    document.getElementById("spinAgainBtn").addEventListener("click", () => {
        playSfx('click');
        setDecisionVisible(false);
        spinCount = 2;
        document.getElementById("spinNumber").textContent = "2";
        document.getElementById("result").textContent = `${teams[currentTeamIndex].name}, spin again!`;
        document.getElementById("result").style.color = "#ffd43b";
    });
}

function spin() {
    if (spinning) return;

    syncTeamNames();
    const team = teams[currentTeamIndex];
    document.getElementById("currentPlayer").textContent = team.name;

    // Play click and spin-start SFX (will silently fail if not allowed yet)
    playSfx('click');
    playSfx('spin');

    // Duck the background music while the wheel is spinning
    pauseBackgroundMusic();

    // always proceed; spinCount is managed by finishSpin

    // reset travel counters for spin-revolution enforcement
    spinStartTravel = spinTravel = 0;

    velocity = (spinPower / 400) * 0.704 + Math.random() * 0.054;
    spinning = true;
    animate();
}

function animate() {
    angle += velocity;
    velocity *= 0.992;
    // accumulate absolute angular travel
    spinTravel += Math.abs(velocity);
    drawWheel();

    if (velocity > 0.002) {
        requestAnimationFrame(animate);
    } else {
        spinning = false;
        // Wheel has stopped — bring the background music back in
        resumeBackgroundMusic();
        determineWinner();
    }
}

function determineWinner() {
    // Ensure spin made at least one full revolution (2*pi)
    if (spinTravel < Math.PI * 2) {
        document.getElementById("result").textContent = `Spin did not complete a full revolution — spin again.`;
        document.getElementById("result").style.color = "#ffd43b";
        // allow retry without changing state
        spinning = false;
        return;
        return;
    }
    const slice = (Math.PI * 2) / segments.length;

    let normalized = (Math.PI * 1.5 - angle) % (Math.PI * 2);
    if (normalized < 0) {
        normalized += Math.PI * 2;
    }

    const index = Math.floor(normalized / slice);
    const landed = segments[index];
    finishSpin(landed);
}

function finishSpin(result) {
    const team = teams[currentTeamIndex];

    // Normal numeric slice
    // If in a tie-break, record this single spin and advance among tied teams
    if (inTieBreak) {
        tieBreakValues[currentTeamIndex] = result.value || 0;
        playSfx('spin');
        document.getElementById("result").textContent = `${teams[currentTeamIndex].name} spins $${result.value.toFixed(2)} for tiebreak.`;
        // update tracker to show tiebreak spins in progress
        updateTrackerForTieBreak();
        setTimeout(() => {
            // find position of current team in tieIndices
            const pos = tieIndices.indexOf(currentTeamIndex);
            if (pos === -1) {
                // shouldn't happen - advance to next normal team
                advanceTurn();
                return;
            }
            if (pos === tieIndices.length - 1) {
                finishTieBreak();
            } else {
                const nextIdx = tieIndices[pos + 1];
                beginTurn(nextIdx);
                spinCount = 1; // one spin for tie-break
            }
        }, tieBreakDisplayDuration);
        return;
    }

    roundTotal += result.value;
    team.spins.push(result.value);
    document.getElementById("totalScore").textContent = `$${roundTotal.toFixed(2)}`;

    // Check for exact $1.00
    if (Math.abs(roundTotal - 1.00) < 0.0001) {
        team.total = 1.00;
        document.getElementById("result").textContent = `Perfect! ${team.name} hit $1.00!`;
        document.getElementById("result").style.color = "#ffd43b";
        confetti({ particleCount: 600, spread: 220 });
        spinCount = 1;
        updateTracker();
        setDecisionVisible(false);
        setTimeout(() => {
            if (currentTeamIndex === teams.length - 1) determineMatchWinner();
            else advanceTurn();
        }, turnTransitionDuration);
        return;
    }

    // Bust: over $1.00
    if (roundTotal > 1.0) {
        document.getElementById("result").textContent = `${team.name} BUSTED ($${roundTotal.toFixed(2)})`;
        document.getElementById("result").style.color = "#ff4444";
        team.spins = [];
        team.total = null;
        team.busted = true;
        spinCount = 1;
        roundTotal = 0;
        document.getElementById("totalScore").textContent = "$0.00";
        updateTracker();
        playSfx('bust');
        setTimeout(() => advanceTurn(), bustTransitionDuration);
        return;
    }

    // If this was the first spin, require second spin (automatic two spins)
    if (spinCount === 1) {
        // Offer choice: stay with first spin or spin again
        document.getElementById("result").textContent = `${team.name} has $${roundTotal.toFixed(2)}.`;
        document.getElementById("result").style.color = "#ffd43b";
        setDecisionVisible(true);
        return;
    }

    // Second spin finished normally — lock in team total
    team.total = roundTotal;
    document.getElementById("result").textContent = `${team.name} finishes with $${team.total.toFixed(2)}.`;
    document.getElementById("result").style.color = "#ffffff";
    // bank option removed
    updateTracker();

    // Show message if their first spin alone would have been closer to $1.00 than their final total
    if (team.spins.length >= 2) {
        const first = team.spins[0];
        const final = team.total;
        if (Math.abs(1 - first) < Math.abs(1 - final)) {
            document.getElementById("result").textContent += ` (Note: first spin $${first.toFixed(2)} was closer to $1.00 than final $${final.toFixed(2)})`;
        }
    }

    // If both teams have played, determine winner
    if (currentTeamIndex === teams.length - 1) {
        setTimeout(() => determineMatchWinner(), turnTransitionDuration);
    } else {
        setTimeout(() => advanceTurn(), turnTransitionDuration);
    }
}

function finishTieBreak() {
    // Evaluate tie-break spins for the tied indices
    let max = -1;
    tieIndices.forEach(i => {
        const v = tieBreakValues[i] || 0;
        if (v > max) max = v;
    });
    const winners = tieIndices.filter(i => (tieBreakValues[i] || 0) === max);
    if (winners.length === 1) {
        const winIdx = winners[0];
        document.getElementById("result").textContent = `${teams[winIdx].name} wins the Runner-Up Tie-Break! ($${max.toFixed(2)})`;
        document.getElementById("result").style.color = "#ffd43b";
        playSfx('tieWin');
        // Update tracker to show tiebreak scores and drop losing tied teams
        tieIndices.forEach(i => {
            const val = tieBreakValues[i] || 0;
            if (i === winIdx) {
                document.getElementById(`team${i}Tracker`).textContent = `${teams[i].name}: $${teams[i].total > 0 ? teams[i].total.toFixed(2) : '-'} (Runner-Up Tie-Break $${val.toFixed(2)})`;
            } else {
                // mark losing tied teams as dropped/out
                document.getElementById(`team${i}Tracker`).textContent = `${teams[i].name}: OUT (lost Runner-Up Tie-Break $${val.toFixed(2)})`;
            }
        });
        inTieBreak = false;
        // small pause to let players read the tiebreak result
        setTimeout(() => {
            return;
        }, tieBreakDisplayDuration);
        return;
    }

    // still tied among multiple teams — repeat sudden-death among these
    tieIndices = winners.slice();
    tieBreakValues = {};
    document.getElementById("result").textContent = `Tiebreak tied again — repeat among ${tieIndices.map(i=>teams[i].name).join(', ')}.`;
    document.getElementById("result").style.color = "#ffd43b";
    setTimeout(() => beginTieBreak(tieIndices), tieBreakDisplayDuration);
}

function beginTieBreak(indices) {
    // indices: array of team indices participating in the tiebreak
    tieIndices = indices.slice();
    tieBreakValues = {};
    inTieBreak = true;
    document.getElementById("result").textContent = `RUNNER-UP TIE-BREAK — begin tie-break spins among ${tieIndices.map(i=>teams[i].name).join(', ')}.`;
    document.getElementById("result").style.color = "#ffd43b";
    updateTrackerForTieBreak();
    playSfx('tieStart');
    // begin with first tied team after a short pause so message is readable
    setTimeout(() => {
        beginTurn(tieIndices[0]);
        spinCount = 1; // single spin for tie-break
    }, tieBreakDisplayDuration);
}

function determineMatchWinner() {
    const validTeams = teams.filter(t => !t.busted && t.total !== null && t.total <= 1.0);
    const bustedTeams = teams.filter(t => t.busted);

    if (validTeams.length === 1 && bustedTeams.length === 2) {
        const winner = validTeams[0];
        document.getElementById("result").textContent = `${winner.name} advances with $${winner.total.toFixed(2)}. Busted teams will enter the Runner-Up Tie-Break for the remaining advancement spot.`;
        document.getElementById("result").style.color = "#ffd43b";
        updateTracker();
        setTimeout(() => {
            const tieIndices = teams
                .map((t, idx) => t.busted ? idx : -1)
                .filter(idx => idx !== -1);
            beginTieBreak(tieIndices);
        }, tieBreakDisplayDuration);
        return;
    }

    if (bustedTeams.length === 3) {
        document.getElementById("result").textContent = "All three teams busted — replaying the round for two advancing teams.";
        document.getElementById("result").style.color = "#ffd43b";
        setTimeout(() => resetRoundAfterAllBust(), tieBreakDisplayDuration);
        return;
    }

    // Find highest valid total (<= 1.00). Treat busted (>1) or unset as invalid.
    const totals = teams.map((t, i) => ({ i, total: (t.total !== null && !t.busted && t.total <= 1.0) ? t.total : -1 }));
    const max = Math.max(...totals.map(t => t.total));
    if (max < 0) {
        document.getElementById("result").textContent = "No valid totals — no winner.";
        document.getElementById("result").style.color = "#ffd43b";
        return;
    }
    const winners = totals.filter(t => Math.abs(t.total - max) < 0.0001).map(t => t.i);
    if (winners.length === 1) {
        const win = winners[0];
        flashResult(`${teams[win].name} wins ($${teams[win].total.toFixed(2)})`, "#00ff66", flashDuration);
        return;
    }

    // multiple winners — start tie-break among them
    document.getElementById("result").textContent = `Tie at $${max.toFixed(2)} — tie-break needed among ${winners.map(i=>teams[i].name).join(', ')}.`;
    document.getElementById("result").style.color = "#ffd43b";
    beginTieBreak(winners);
}

// Fullscreen and overlay buttons removed from UI; handlers deleted.

document.getElementById("resetBtn").addEventListener("click", () => {
    playSfx('click');
    teams.forEach(t => { t.total = null; t.spins = []; t.busted = false; });
    beginTurn(0);
    document.getElementById("spinNumber").textContent = "1";
    document.getElementById("result").textContent = "Game reset. Team 1, spin first.";
    document.getElementById("result").style.color = "#ffd43b";
    setDecisionVisible(false);
    updateTracker();
});

drawWheel();
beginTurn(0);