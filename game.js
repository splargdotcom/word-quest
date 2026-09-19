'use strict';
const App = {
    difficulty: 'normal', state: GameState.MENU, gameActive: false, isPaused: false,
    player: { hp: 500, maxHp: 500, depth: 0, score: 0 },
    curses: { silence: 0, rot: 0, aphasia: 0, phased: 0 },
    level: 1, currentBiome: Biomes[0], enemy: null, endlessMode: false,
    distNext: 100, idleSeconds: 0, encounterDelay: 0, currentAction: null,
    deepestDescent: 0, stats: null, lastTime: null, saveTimer: 0, uiTimer: 0,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
    init() {
        this.renderer = new Renderer();
        this.stats = this.freshStats();
        const ready = Dict.init();
        // The old LZW dictionary could fill localStorage and is no longer needed.
        if (ready) { Storage.remove('wq_dict_comp'); Storage.remove('wq_dict_version'); }
        const status = document.getElementById('dictionary-status');
        status.textContent = ready ? 'Full dictionary included · plays offline' : 'Dictionary missing. Extract all the files together, then reopen index.html.';
        document.getElementById('start-btn').disabled = !ready;
        AudioSys.muted = Storage.get('wq_muted') === 'true';
        const mute = document.getElementById('mute-btn');
        mute.textContent = AudioSys.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON';
        mute.setAttribute('aria-pressed', String(AudioSys.muted));
        mute.addEventListener('click', () => AudioSys.toggleMute());
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('action-btn').addEventListener('click', () => this.submit());
        document.getElementById('undo-btn').addEventListener('click', () => GridManager.undo());
        document.getElementById('clear-btn').addEventListener('click', () => {
            if (this.canInteract()) { this.noteInput(); GridManager.clearSelection(); }
        });
        document.getElementById('sacrifice-btn').addEventListener('click', () => this.triggerSacrifice());
        window.addEventListener('keydown', event => this.onKey(event));
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.gameActive && !this.isPaused) this.togglePause();
            if (document.hidden) this.saveRun();
        });
        window.addEventListener('blur', () => {
            if (this.gameActive && !this.isPaused) this.togglePause();
        });
        window.addEventListener('pagehide', () => this.saveRun());
        const savedDifficulty = Storage.get('wq_difficulty');
        this.setDifficulty(['easy', 'normal', 'hard'].includes(savedDifficulty) ? savedDifficulty : 'normal');
        const legacyDepth = Number(Storage.get('void_deepest_descent'));
        this.deepestDescent = Number.isFinite(legacyDepth) ? Math.max(0, Math.floor(legacyDepth)) : 0;
        this.refreshTitle(); this.setBiome(0); this.updateHUD();
        this.showOverlay('menu-start');
        requestAnimationFrame(time => this.loop(time));
    },
    freshStats() { return { words: 0, kills: 0, bestWord: '', bestPower: 0, longestWord: '', seconds: 0 }; },
    canInteract() {
        return Dict.isReady && this.gameActive && !this.isPaused && this.player.hp > 0 &&
            [GameState.WALKING, GameState.COMBAT].includes(this.state) && !this.enemy?.dead;
    },
    noteInput() { this.idleSeconds = 0; },
    announce(text) { document.getElementById('live-message').textContent = text; },
    onKey(event) {
        if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
        const overlay = document.querySelector('.overlay:not(.hidden)');
        if (event.key === 'Tab' && overlay) {
            const focusable = [...overlay.querySelectorAll('button:not([disabled]), a[href]')].filter(el => !el.closest('.hidden'));
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (first && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            return;
        }
        if (event.key === 'Escape') {
            if (!document.getElementById('menu-help').classList.contains('hidden')) this.closeHelp();
            else this.togglePause();
            event.preventDefault(); return;
        }
        if (overlay) return;
        if (event.code === 'Space' && event.target.tagName !== 'BUTTON') {
            event.preventDefault(); this.togglePause(); return;
        }
        if (!this.canInteract()) return;
        if (/^[a-z]$/i.test(event.key)) {
            event.preventDefault(); GridManager.typeLetter(event.key.toUpperCase());
            // After typing, Enter casts even if a previous mouse click focused a tile.
            document.getElementById('play-surface').focus({ preventScroll: true });
        }
        else if (event.key === '?') {
            event.preventDefault();
            const wild = GridManager.grid.find(t => t.special === 'wild' && !GridManager.selected.includes(t));
            if (wild) GridManager.handleClick(wild);
        } else if (event.key === 'Backspace') { event.preventDefault(); GridManager.undo(); }
        else if (event.key === 'Delete') { event.preventDefault(); this.noteInput(); GridManager.clearSelection(); }
        else if (event.key === 'Enter' && (event.target.tagName !== 'BUTTON' || event.target.id === 'action-btn')) {
            event.preventDefault(); this.submit();
        }
    },
    showOverlay(id) {
        document.querySelectorAll('.overlay').forEach(el => el.classList.toggle('hidden', el.id !== id));
        document.getElementById('play-surface').inert = Boolean(id);
        if (id) document.getElementById(id).querySelector('button:not([disabled])')?.focus();
        else document.getElementById('play-surface').focus({ preventScroll: true });
    },
    setDifficulty(difficulty) {
        if (!['easy', 'normal', 'hard'].includes(difficulty)) return;
        this.difficulty = difficulty; Storage.set('wq_difficulty', difficulty);
        document.querySelectorAll('.diff-btn').forEach(button => {
            const chosen = button.id === `btn-${difficulty}`;
            button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', String(chosen));
        });
        const hp = GAME_CONFIG[difficulty === 'easy' ? 'hpEasy' : difficulty === 'hard' ? 'hpHard' : 'hpNormal'];
        document.getElementById('difficulty-detail').textContent = `${hp} HP · ${difficulty === 'easy' ? 'gentler battles' : difficulty === 'hard' ? 'faster, tougher enemies' : 'the original descent'}`;
        this.refreshTitle();
    },
    refreshTitle() {
        document.getElementById('menu-high-score').textContent = this.deepestDescent ? `${this.deepestDescent}m` : '—';
        const best = this.readRecords()[this.difficulty];
        document.getElementById('difficulty-best').textContent = `${this.difficulty.toUpperCase()} BEST: ${best ? Math.floor(best.depth) + 'm' : '—'}`;
        const save = this.readSave();
        const resume = document.getElementById('continue-btn');
        resume.classList.toggle('hidden', !save || !Dict.isReady);
        if (save) resume.textContent = `CONTINUE · ${Math.floor(save.player.depth)}m · ${save.difficulty.toUpperCase()}`;
        document.getElementById('start-btn').textContent = save ? 'NEW RUN' : 'START DESCENT';
        document.getElementById('save-note').textContent = !Storage.available ? 'Saving is unavailable in this browser. You can still play.' : save ? 'A new run replaces your saved descent.' : 'Your run saves automatically in this browser.';
    },
    startGame() {
        if (!Dict.isReady) return;
        Storage.remove('wq_run_v2');
        const hp = GAME_CONFIG[this.difficulty === 'easy' ? 'hpEasy' : this.difficulty === 'hard' ? 'hpHard' : 'hpNormal'];
        this.player = { hp, maxHp: hp, score: 0, depth: 0 };
        this.curses = { silence: 0, rot: 0, aphasia: 0, phased: 0 };
        this.stats = this.freshStats(); this.level = 1; this.turns = 0;
        this.enemy = null; this.endlessMode = false; this.voidCurse = false;
        this.pendingCurse = null;
        this.encounterDelay = 0; this.distNext = 100; this.idleSeconds = 0; this.saveTimer = 0;
        this.isPaused = false; this.gameActive = true; this.state = GameState.WALKING;
        this.renderer.realityBreak = 0; this.renderer.shake = 0;
        this.setBiome(0); GridManager.generate(); this.showOverlay(null);
        AudioSys.currentPattern = 'walk'; AudioSys.init(); AudioSys.start();
        this.lastTime = performance.now(); this.updateHUD(); this.saveRun();
    },
    returnToTitle() {
        this.gameActive = false; this.isPaused = false; this.state = GameState.MENU;
        this.enemy = null; this.currentAction = null; AudioSys.stop();
        this.renderer.realityBreak = 0; this.renderer.shake = 0;
        this.refreshTitle(); this.showOverlay('menu-start'); this.updateHUD();
    },
    saveAndQuit() {
        if (!this.saveRun()) {
            document.getElementById('pause-note').textContent = 'This browser could not save your run. Resume to keep playing.';
            return;
        }
        this.returnToTitle();
    },
    surrender() {
        if (!this.gameActive) return;
        this.isPaused = false; this.finishRun(false, 'Surrendered'); this.showSummary();
    },
    setBiome(index) {
        const source = Biomes[Math.max(0, Math.min(index, Biomes.length - 1))];
        // Clone the rule: endless mode must never mutate campaign configuration.
        this.currentBiome = { ...source, rule: this.endlessMode ? { id: 'none', desc: 'ENTROPY: NO RULES' } : { ...source.rule } };
        document.getElementById('hud').style.background = source.colors.pillar;
        document.getElementById('board-area').style.background = source.colors.bg;
        document.getElementById('biome-name').textContent = source.name;
        document.getElementById('ui-rule').textContent = this.currentBiome.rule.id === 'none' && !this.endlessMode ? 'Any word, two letters or more.' : this.currentBiome.rule.desc;
    },
    togglePause() {
        if (!this.gameActive) return;
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            AudioSys.stop(); this.showOverlay('menu-pause');
            document.getElementById('pause-note').textContent = this.saveRun() ? 'Run saved. Take your time.' : 'Saving unavailable. Keep this page open.';
        } else {
            this.lastTime = performance.now(); this.showOverlay(null); AudioSys.start();
        }
        this.checkWord();
    },
    showHelp() {
        this.helpReturn = this.gameActive ? 'menu-pause' : 'menu-start';
        if (this.gameActive && !this.isPaused) this.togglePause();
        this.showOverlay('menu-help');
    },
    closeHelp() { this.showOverlay(this.helpReturn || 'menu-start'); },
    attackThreshold() { return GAME_CONFIG[this.difficulty === 'easy' ? 'attackSpeedEasy' : this.difficulty === 'hard' ? 'attackSpeedHard' : 'attackSpeedNormal']; },
    loop(time) {
        const dt = this.lastTime == null ? 0 : Math.min(0.1, Math.max(0, (time - this.lastTime) / 1000));
        this.lastTime = time;
        this.update(dt);
        const moving = (this.gameActive && !this.isPaused) || this.state === GameState.EPITAPH;
        if (moving || !this.hasDrawn) {
            this.renderer.draw(this.state === GameState.COMBAT, moving ? dt : 0);
            this.hasDrawn = true;
        }
        this.uiTimer += dt;
        if (this.uiTimer >= 0.1) { this.updateHUD(); this.uiTimer = 0; }
        requestAnimationFrame(t => this.loop(t));
    },
    update(dt) {
        if (this.state === GameState.EPITAPH) {
            this.epitaphTimer += dt;
            if (this.epitaphTimer >= 3) this.showSummary();
            return;
        }
        if (!this.gameActive || this.isPaused) return;
        this.stats.seconds += dt; this.idleSeconds += dt; this.saveTimer += dt;
        let curseChanged = false;
        for (const key of ['silence', 'rot', 'aphasia']) {
            if (this.curses[key] > 0) {
                this.curses[key] = Math.max(0, this.curses[key] - dt);
                if (!this.curses[key]) curseChanged = true;
            }
        }
        if (curseChanged) { GridManager.updateVisuals(); this.checkWord(); }
        this.aphasiaTick = (this.aphasiaTick || 0) + dt;
        if (this.curses.aphasia > 0 && this.aphasiaTick > 0.18 && !this.reducedMotion) {
            GridManager.updateVisuals(true); this.aphasiaTick = 0;
        }
        if (this.encounterDelay > 0) {
            this.encounterDelay = Math.max(0, this.encounterDelay - dt);
            if (!this.encounterDelay) {
                this.enemy = null; this.state = GameState.WALKING;
                this.distNext = 100 + Math.random() * 200; this.idleSeconds = 0;
                AudioSys.currentPattern = 'walk'; AudioSys.start(); this.checkWord();
            }
        } else if (this.state === GameState.WALKING) {
            this.player.depth += 10 * dt; this.distNext -= 60 * dt;
            if (this.distNext <= 0) this.spawnEncounter();
        } else if (this.state === GameState.COMBAT && this.enemy && !this.enemy.dead) {
            this.enemy.enter = Math.min(1, this.enemy.enter + GAME_CONFIG.entrySpeed * dt);
            this.enemy.timer += dt * (this.idleSeconds > 4 ? 2 : 1);
            if (this.enemy.timer >= this.attackThreshold()) {
                this.enemy.timer = 0; AudioSys.sfxWarn();
                this.takeDamage(this.enemy.dmg, { avoidable: true, source: this.enemy.name });
                if (!this.gameActive) return;
                const ability = this.enemy.isBoss && this.currentBiome.boss.ability;
                if (ability && Math.random() < ability.chance) this.inflictCurse(ability.type, ability.dur);
            }
        }
        if (this.saveTimer >= 5) { this.saveRun(); this.saveTimer = 0; }
    },
    spawnEncounter() {
        if (!this.endlessMode && this.player.depth >= this.level * GAME_CONFIG.depthPerBiome) this.spawnBoss();
        else this.spawnEnemy();
    },
    spawnBoss() {
        const boss = this.currentBiome.boss;
        const multiplier = this.difficulty === 'easy' ? 0.7 : this.difficulty === 'normal' ? 0.8 : 1;
        const hp = Math.floor(boss.hp * multiplier);
        this.enemy = { name: boss.name, maxHp: hp, hp, color: boss.color, dmg: 15 + this.level * 2,
            anim: boss.anim, isBoss: true, grammar: boss.grammar, timer: 0, enter: 0, dead: false, shake: 0 };
        this.state = GameState.COMBAT; this.idleSeconds = 0;
        AudioSys.currentPattern = 'boss'; AudioSys.sfxBoss(); this.checkWord(); this.updateHUD(); this.saveRun();
    },
    spawnEnemy() {
        let pool = this.currentBiome.enemies, invader = false;
        if (this.endlessMode) pool = Biomes[Math.floor(Math.random() * Biomes.length)].enemies;
        else if (Math.random() < 0.15) {
            const others = Biomes.filter(b => b.name !== this.currentBiome.name);
            pool = others[Math.floor(Math.random() * others.length)].enemies; invader = true;
        }
        const enemy = pool[Math.floor(Math.random() * pool.length)];
        let multiplier = (1 + this.level * 0.2) * (this.difficulty === 'easy' ? 0.5 : this.difficulty === 'hard' ? 1.5 : 0.9);
        if (this.endlessMode) multiplier *= 1 + Math.sqrt(this.player.depth / 1000) + this.player.depth / 5000;
        const hp = Math.floor(enemy.h * multiplier);
        this.enemy = { name: enemy.n, maxHp: hp, hp, color: enemy.c, dmg: Math.ceil(enemy.d * multiplier),
            anim: enemy.anim, isBoss: false, timer: 0, enter: 0, dead: false, shake: 0 };
        this.state = GameState.COMBAT; this.idleSeconds = 0; AudioSys.currentPattern = 'fight';
        if (invader) this.spawnParticle('INVADER', document.getElementById('view-panel'), '#ce93d8');
        this.checkWord(); this.updateHUD(); this.saveRun();
    },
    takeDamage(amount, { avoidable = false, source = 'Recoil' } = {}) {
        if (!this.gameActive || this.isPaused || this.player.hp <= 0) return;
        if (avoidable && this.curses.phased > 0) {
            this.curses.phased--; this.spawnParticle('PHASED · DODGED', document.getElementById('view-panel'), '#64b5f6'); return;
        }
        this.player.hp = Math.max(0, this.player.hp - Math.max(0, amount));
        if (!this.reducedMotion) this.renderer.shake = 10;
        AudioSys.tone(100, 'sawtooth', 0.2, 0.1);
        if (!this.player.hp) this.finishRun(false, source);
        this.checkWord(); this.updateHUD();
    },
    inflictCurse(type, duration) {
        if (!this.gameActive || !['silence', 'rot', 'aphasia'].includes(type)) return;
        this.curses[type] = Math.max(this.curses[type], duration);
        if (type === 'silence') {
            // Already-selected vowels must not bypass the curse or become stuck.
            GridManager.selected = GridManager.selected.filter(t => !GridManager.isSilenced(t));
        }
        GridManager.updateVisuals(true); this.checkWord();
        this.spawnParticle(type.toUpperCase(), document.getElementById('view-panel'), '#ef5350');
        AudioSys.tone(150, 'sawtooth', 0.5, 0.2);
        if (!this.reducedMotion) this.renderer.shake = 20;
    },
    checkWord() {
        const button = document.getElementById('action-btn');
        const display = document.getElementById('current-word-display');
        const detail = document.getElementById('action-detail');
        this.currentAction = null; button.disabled = true; button.className = '';
        display.className = ''; detail.textContent = '';
        const pattern = GridManager.selected.map(t => t.special === 'wild' ? t.chosenChar || '?' : t.char).join('');
        display.textContent = pattern || 'MAKE A WORD';
        document.getElementById('undo-btn').disabled = document.getElementById('clear-btn').disabled = !this.canInteract() || !pattern;
        document.getElementById('sacrifice-btn').disabled = !this.canInteract() || this.player.hp <= this.sacrificeCost();
        if (!Dict.isReady) { button.textContent = 'DICTIONARY UNAVAILABLE'; return; }
        if (!this.canInteract()) { button.textContent = this.isPaused ? 'PAUSED' : this.enemy?.dead ? 'ENEMY DEFEATED' : 'WAITING'; return; }
        if (pattern.length < 2) { button.textContent = pattern ? 'ADD ANOTHER LETTER' : 'SELECT LETTERS ANYWHERE'; return; }
        if (GridManager.selected.some(t => GridManager.isSilenced(t))) { button.textContent = 'VOWELS ARE SILENCED'; return; }
        const word = Dict.solve(pattern);
        if (!word) { button.textContent = 'UNKNOWN WORD'; return; }
        display.textContent = word;
        if (word === 'VOID') {
            if (this.level < 3 && !this.endlessMode) { button.textContent = 'VOID · TOO SHALLOW'; detail.textContent = 'Its power awakens in the third biome.'; return; }
            if (this.state !== GameState.COMBAT) { button.textContent = 'VOID · NEEDS AN ENEMY'; return; }
            this.currentAction = { type: 'VOID', word, val: 0, recoil: 0 };
            button.textContent = 'BREAK REALITY'; button.className = 'ready void';
            detail.textContent = 'Defeat this foe · lose 90% of current HP · no next-biome heal'; button.disabled = false; return;
        }
        const action = Combat.calculateTurn(GridManager.selected, word, this.player, this.enemy, this.currentBiome.rule, this.curses);
        if (action.type === 'FAIL') { button.textContent = action.text; return; }
        if (action.type === 'ATTACK' && this.state !== GameState.COMBAT) {
            button.textContent = `READY · ${action.val} DAMAGE`; detail.textContent = 'Word prepared. Cast when an enemy arrives.'; return;
        }
        const healGain = action.type === 'HEAL' ? Math.min(action.val, this.player.maxHp - this.player.hp + action.recoil) : 0;
        if (action.type === 'HEAL' && !healGain && !action.recoil) { button.textContent = 'HEALTH FULL'; return; }
        this.currentAction = { ...action, word };
        button.textContent = action.type === 'HEAL' ? `HEAL +${healGain} HP` : `${action.text} · ${action.val} DAMAGE`;
        button.className = action.type === 'HEAL' ? 'ready heal' : 'ready';
        display.className = action.type === 'HEAL' ? 'healing-word' : '';
        const hints = [];
        if (action.recoil) hints.push(`Costs ${action.recoil} HP${action.recoil >= this.player.hp ? ' · FATAL' : ''}`);
        if (action.isResisted) hints.push('Reduced by this enemy or biome');
        else if (word.length >= 5) hints.push('Long word bonus');
        if (pattern.includes('?')) hints.push(`Wildcard → ${word}`);
        detail.textContent = hints.join(' · '); button.disabled = false;
    },
    submit() {
        if (!this.canInteract()) return;
        // Resolve again: health, curses or enemies may have changed since selection.
        this.checkWord();
        const action = this.currentAction;
        if (!action) return;
        this.noteInput();
        this.stats.words++; this.turns = this.stats.words;
        if (action.word.length > this.stats.longestWord.length) this.stats.longestWord = action.word;
        const target = GridManager.selected[GridManager.selected.length - 1].el;
        if (action.type === 'VOID') {
            this.triggerRealityBreak(); GridManager.refillSelected(); this.defeatEnemy();
            this.checkWord(); this.updateHUD(); this.saveRun(); return;
        }
        // Costs resolve first. A lethal cost cannot heal, kill the foe, or continue the run.
        if (action.recoil) {
            this.takeDamage(action.recoil, { source: 'Corruption / recoil' });
            if (!this.gameActive) return;
        }
        let applied;
        if (action.type === 'HEAL') {
            applied = Math.min(action.val, this.player.maxHp - this.player.hp);
            this.player.hp += applied; AudioSys.sfxHeal();
            this.spawnParticle(`+${applied}`, target, '#69f0ae');
        } else {
            applied = action.val;
            const previousHp = this.enemy.hp;
            this.enemy.hp = Math.max(0, this.enemy.hp - applied); this.enemy.shake = 5;
            AudioSys.sfxAttack(); this.spawnParticle(applied, target);
            if (this.enemy.hp > 0 && this.enemy.isBoss && this.currentBiome.boss.ability) {
                const crossed = [0.66, 0.33].some(f => previousHp > this.enemy.maxHp * f && this.enemy.hp <= this.enemy.maxHp * f);
                if (crossed) {
                    const ability = this.currentBiome.boss.ability;
                    // Refill first below; defer the curse so every used tile is consumed.
                    this.pendingCurse = ability;
                    if (this.difficulty === 'hard') this.enemy.timer = this.attackThreshold();
                }
            }
        }
        if (this.difficulty === 'easy' && this.player.hp < this.player.maxHp * 0.5) this.player.hp = Math.min(this.player.maxHp * 0.5, this.player.hp + 2);
        this.player.score += applied;
        if (applied > this.stats.bestPower) { this.stats.bestPower = applied; this.stats.bestWord = action.word; }
        GridManager.refillSelected();
        if (this.pendingCurse) {
            const curse = this.pendingCurse; this.pendingCurse = null; this.inflictCurse(curse.type, curse.dur);
        }
        if (this.enemy && this.enemy.hp <= 0) this.defeatEnemy();
        this.checkWord(); this.updateHUD(); this.saveRun();
    },
    triggerRealityBreak() {
        this.voidCurse = true; this.curses.phased = 2;
        this.player.hp = Math.max(1, Math.floor(this.player.hp * 0.1));
        this.enemy.hp = 0;
        if (!this.reducedMotion) this.renderer.realityBreak = GAME_CONFIG.voidDuration;
        AudioSys.glitch(); this.spawnParticle('REALITY BROKEN', document.getElementById('view-panel'), '#fff');
    },
    defeatEnemy() {
        if (!this.enemy || this.enemy.dead) return;
        this.enemy.dead = true; this.stats.kills++;
        if (this.enemy.isBoss) {
            this.gameActive = false; AudioSys.stop();
            if (this.level >= 4 && !this.endlessMode) { this.state = GameState.CROSSROADS; this.showOverlay('menu-crossroads'); }
            else {
                this.state = GameState.LEVELUP;
                document.getElementById('lvl-rule-desc').textContent = Biomes[this.level].rule.desc;
                document.getElementById('lvl-heal-desc').textContent = this.voidCurse ? 'Reality is fractured. No healing at this crossing.' : 'Your health will be fully restored.';
                this.showOverlay('menu-levelup');
            }
        } else this.encounterDelay = this.renderer.realityBreak > 0 ? 0.8 : 0.4;
    },
    sacrificeCost() { return Math.max(1, Math.floor(this.player.maxHp * 0.1)); },
    triggerSacrifice() {
        if (!this.canInteract() || this.player.hp <= this.sacrificeCost()) return;
        const cost = this.sacrificeCost();
        this.takeDamage(cost, { source: 'Sacrifice' }); this.noteInput();
        GridManager.generate(); // All 64 tiles, including corruption, are replaced.
        this.spawnParticle(`−${cost} HP · REWRITTEN`, document.getElementById('tile-grid'), '#ef5350');
        this.checkWord(); this.updateHUD(); this.saveRun();
    },
    nextLevel() {
        if (this.state !== GameState.LEVELUP) return;
        this.level++; this.setBiome(this.level - 1);
        if (!this.voidCurse) this.player.hp = this.player.maxHp;
        this.voidCurse = false;
        this.curses = { silence: 0, rot: 0, aphasia: 0, phased: this.curses.phased };
        this.resumeWalking(); GridManager.generate(); this.saveRun();
    },
    chooseAscend() {
        if (this.state !== GameState.CROSSROADS) return;
        this.finishRun(true, 'The Guardian falls. Silence reclaims the void.'); this.showSummary();
    },
    chooseDescend() {
        if (this.state !== GameState.CROSSROADS) return;
        this.endlessMode = true; this.voidCurse = false;
        this.curses = { silence: 0, rot: 0, aphasia: 0, phased: this.curses.phased };
        this.setBiome(this.level - 1); this.resumeWalking(); GridManager.updateVisuals(); this.checkWord(); this.saveRun();
    },
    resumeWalking() {
        this.gameActive = true; this.isPaused = false; this.state = GameState.WALKING;
        this.enemy = null; this.encounterDelay = 0; this.distNext = 200; this.idleSeconds = 0;
        this.showOverlay(null); AudioSys.currentPattern = 'walk'; AudioSys.start();
        this.updateHUD(); this.checkWord();
    },
    readRecords() {
        const records = Storage.json('wq_records_v2', {});
        if (!records || typeof records !== 'object' || Array.isArray(records)) return {};
        return Object.fromEntries(Object.entries(records).filter(([key, value]) =>
            ['easy', 'normal', 'hard'].includes(key) && value &&
            Number.isFinite(value.depth) && value.depth >= 0 &&
            Number.isFinite(value.score) && value.score >= 0));
    },
    finishRun(victory, reason) {
        this.gameActive = false; this.isPaused = false; this.encounterDelay = 0;
        this.victory = victory; this.endReason = reason; this.currentAction = null;
        this.state = GameState.EPITAPH; this.epitaphTimer = 0;
        AudioSys.stop(); Storage.remove('wq_run_v2');
        const depth = Math.floor(this.player.depth);
        this.deepestDescent = Math.max(this.deepestDescent, depth);
        Storage.set('void_deepest_descent', String(this.deepestDescent));
        const records = this.readRecords(), previous = records[this.difficulty];
        if (!previous || depth > previous.depth || (depth === previous.depth && this.player.score > previous.score)) {
            records[this.difficulty] = { depth, score: this.player.score };
            Storage.set('wq_records_v2', JSON.stringify(records));
        }
        this.showOverlay(null); this.checkWord(); this.updateHUD();
    },
    showSummary() {
        this.state = GameState.GAMEOVER;
        document.getElementById('summary-title').textContent = this.victory ? 'ASCENDED' : 'HERE LIES A WORD.';
        document.getElementById('summary-reason').textContent = this.victory ? this.endReason : `It meant something, briefly. ${this.endReason === 'Surrendered' ? 'You surrendered.' : 'Slain by ' + this.endReason + '.'}`;
        const values = { 'go-depth': Math.floor(this.player.depth) + 'm', 'go-score': this.player.score,
            'go-words': this.stats.words, 'go-kills': this.stats.kills,
            'go-best': this.stats.bestWord ? `${this.stats.bestWord} · ${this.stats.bestPower}` : '—',
            'go-longest': this.stats.longestWord || '—' };
        Object.entries(values).forEach(([id, value]) => { document.getElementById(id).textContent = value; });
        this.showOverlay('menu-gameover');
    },
    saveRun() {
        if (![GameState.WALKING, GameState.COMBAT, GameState.LEVELUP, GameState.CROSSROADS].includes(this.state) || this.player.hp <= 0 || GridManager.grid.length !== 64) return false;
        const data = { version: 2, difficulty: this.difficulty, state: this.state, player: this.player,
            level: this.level, endlessMode: this.endlessMode, curses: this.curses, enemy: this.enemy,
            voidCurse: Boolean(this.voidCurse), distNext: this.distNext, encounterDelay: this.encounterDelay,
            idleSeconds: this.idleSeconds, stats: this.stats,
            grid: GridManager.grid.map(t => ({ char: t.char, special: t.special, chosenChar: t.chosenChar })),
            selected: GridManager.selected.map(t => GridManager.grid.indexOf(t)) };
        return Storage.set('wq_run_v2', JSON.stringify(data));
    },
    readSave() {
        const save = Storage.json('wq_run_v2', null);
        if (!save) return null;
        if (!this.validSave(save)) { Storage.remove('wq_run_v2'); return null; }
        return save;
    },
    validSave(s) {
        const number = (v, min = 0, max = 1e12) => Number.isFinite(v) && v >= min && v <= max;
        const special = [null, 'heal', 'wild', 'corrupted'];
        const enemy = s?.enemy;
        return Boolean(s && s.version === 2 && ['easy', 'normal', 'hard'].includes(s.difficulty) &&
            [GameState.WALKING, GameState.COMBAT, GameState.LEVELUP, GameState.CROSSROADS].includes(s.state) &&
            Number.isInteger(s.level) && s.level >= 1 && s.level <= 4 && typeof s.endlessMode === 'boolean' &&
            (s.state !== GameState.LEVELUP || s.level < 4) &&
            (s.state !== GameState.CROSSROADS || s.level === 4) &&
            (!s.endlessMode || s.level === 4) &&
            typeof s.voidCurse === 'boolean' && s.player && number(s.player.hp, 1, 800) &&
            s.player.maxHp === GAME_CONFIG[s.difficulty === 'easy' ? 'hpEasy' : s.difficulty === 'hard' ? 'hpHard' : 'hpNormal'] &&
            s.player.hp <= s.player.maxHp && number(s.player.depth) && number(s.player.score) &&
            number(s.distNext, -10, 1000) && number(s.encounterDelay, 0, 1) && number(s.idleSeconds) &&
            s.curses && ['silence', 'rot', 'aphasia', 'phased'].every(k => number(s.curses[k], 0, 60)) &&
            s.stats && ['words', 'kills', 'bestPower', 'seconds'].every(k => number(s.stats[k])) &&
            ['bestWord', 'longestWord'].every(k => typeof s.stats[k] === 'string' && /^[A-Z]{0,64}$/.test(s.stats[k])) &&
            Array.isArray(s.grid) && s.grid.length === 64 && s.grid.every(t => t && special.includes(t.special) &&
                (t.special === 'wild' ? t.char === '?' : /^[A-Z]$/.test(t.char)) &&
                (t.chosenChar == null || t.special === 'wild' && /^[A-Z]$/.test(t.chosenChar))) &&
            s.grid.filter(t => t.special === 'wild').length <= 3 && Array.isArray(s.selected) &&
            s.selected.every(i => Number.isInteger(i) && i >= 0 && i < 64) && new Set(s.selected).size === s.selected.length &&
            (s.state !== GameState.COMBAT || enemy) && (s.state !== GameState.WALKING || !enemy) &&
            (s.state !== GameState.COMBAT || !enemy?.dead || !enemy.isBoss && s.encounterDelay > 0) &&
            (![GameState.LEVELUP, GameState.CROSSROADS].includes(s.state) || enemy?.dead && enemy.isBoss) &&
            (!enemy || typeof enemy.name === 'string' && enemy.name.length <= 80 && number(enemy.hp) && number(enemy.maxHp, 1) &&
                enemy.hp <= enemy.maxHp && number(enemy.dmg) && number(enemy.timer, 0, 10) && number(enemy.enter, 0, 1) &&
                (enemy.dead ? enemy.hp === 0 : enemy.hp > 0) &&
                typeof enemy.dead === 'boolean' && typeof enemy.isBoss === 'boolean' && /^#[0-9a-f]{3,8}$/i.test(enemy.color) &&
                ['squish', 'flutter', 'lunge', 'hover'].includes(enemy.anim)));
    },
    continueRun() {
        const saved = this.readSave(); if (!saved || !Dict.isReady) return;
        this.setDifficulty(saved.difficulty);
        for (const key of ['state', 'player', 'level', 'endlessMode', 'curses', 'enemy', 'voidCurse', 'distNext', 'encounterDelay', 'idleSeconds', 'stats']) this[key] = saved[key];
        this.currentAction = null; this.pendingCurse = null; this.turns = this.stats.words;
        this.isPaused = false; this.gameActive = [GameState.WALKING, GameState.COMBAT].includes(this.state);
        this.setBiome(this.level - 1); GridManager.generate(saved.grid);
        GridManager.selected = saved.selected.map(i => GridManager.grid[i]); GridManager.updateVisuals();
        AudioSys.currentPattern = this.enemy?.isBoss ? 'boss' : this.enemy ? 'fight' : 'walk';
        if (this.state === GameState.LEVELUP) {
            document.getElementById('lvl-rule-desc').textContent = Biomes[this.level].rule.desc;
            document.getElementById('lvl-heal-desc').textContent = this.voidCurse ? 'Reality is fractured. No healing at this crossing.' : 'Your health will be fully restored.';
            this.showOverlay('menu-levelup');
        } else if (this.state === GameState.CROSSROADS) this.showOverlay('menu-crossroads');
        else { this.showOverlay(null); AudioSys.init(); AudioSys.start(); }
        this.lastTime = performance.now(); this.saveTimer = 0;
        this.checkWord(); this.updateHUD();
    },
    spawnParticle(value, target, color = '#ffd54f') {
        if (!target) return;
        const particle = document.createElement('div');
        particle.className = 'particle'; particle.textContent = String(value); particle.style.color = color;
        const rect = target.getBoundingClientRect();
        particle.style.left = Math.min(window.innerWidth - 170, Math.max(8, rect.left)) + 'px';
        particle.style.top = rect.top + 'px';
        document.body.appendChild(particle); setTimeout(() => particle.remove(), 1050);
    },
    updateHUD() {
        document.getElementById('ui-hp').textContent = `${Math.ceil(this.player.hp)} / ${this.player.maxHp}`;
        document.getElementById('ui-depth').textContent = Math.floor(this.player.depth) + 'm';
        document.getElementById('ui-level').textContent = this.endlessMode ? '∞' : this.level;
        document.getElementById('ui-score').textContent = this.player.score;
        document.getElementById('health-fill').style.width = (this.player.hp / this.player.maxHp * 100) + '%';
        document.getElementById('vignette').classList.toggle('low-health', this.gameActive && this.player.hp <= this.player.maxHp * 0.3);
        document.getElementById('sacrifice-btn').textContent = `SACRIFICE −${this.sacrificeCost()} HP`;
        document.getElementById('pause-btn').disabled = !this.gameActive;
        const enemy = this.enemy && !this.enemy.dead ? this.enemy : null;
        document.getElementById('enemy-name').textContent = enemy ? `${enemy.isBoss ? 'BOSS · ' : ''}${enemy.name}` : this.state === GameState.EPITAPH || this.state === GameState.GAMEOVER ? 'THE DESCENT ENDS' : 'EXPLORING';
        const speed = this.idleSeconds > 4 ? 2 : 1;
        document.getElementById('enemy-health').textContent = enemy ? `${Math.ceil(enemy.hp)} / ${enemy.maxHp} HP` : this.endlessMode ? 'There is no bottom.' : `${Math.max(0, Math.ceil(this.level * GAME_CONFIG.depthPerBiome - this.player.depth))}m to the guardian`;
        document.getElementById('attack-fill').style.width = enemy ? Math.min(100, enemy.timer / this.attackThreshold() * 100) + '%' : '0%';
        document.getElementById('enemy-intent').textContent = enemy ? `${enemy.dmg} damage · ${Math.max(0, (this.attackThreshold() - enemy.timer) / speed).toFixed(1)}s${speed > 1 ? ' · ENRAGED' : ''}` : 'Prepare a word as you walk.';
        const rules = { vowel_req: 'Use at least one vowel.', ending_dst: 'End in D, S or T for full power.', len_cap: 'Over 5 letters: recoil. VOID breaks reality.' };
        document.getElementById('boss-rule').textContent = enemy?.grammar?.id ? rules[enemy.grammar.id] || '' : '';
        const status = [];
        for (const [key, label] of [['silence', 'VOWELS SILENCED'], ['rot', 'VOWEL ROT'], ['aphasia', 'APHASIA']]) {
            if (this.curses[key] > 0) status.push(`${label} ${Math.ceil(this.curses[key])}s`);
        }
        if (this.curses.phased > 0) status.push(`PHASED ×${this.curses.phased}`);
        document.getElementById('curse-status').textContent = status.join(' · ');
    }
};

class Renderer {
    constructor() {
        this.cvs = document.getElementById('gameCanvas');
        this.ctx = this.cvs.getContext('2d');
        this.cvs.width = 320; this.cvs.height = 150;
        this.cam = 0; this.frame = 0; this.shake = 0;
		this.realityBreak = 0; 
    }
draw(isCombat, dt) {
    try {
        // --- MOVED CHECK INSIDE TRY BLOCK ---
        if (App.state === GameState.EPITAPH) {
            this.drawEpitaph();
            return;
        }
        // ------------------------------------

        this.ctx.globalCompositeOperation = 'source-over';

            const isRealityBroken = this.realityBreak > 0;

            if (isRealityBroken) {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'difference';
            }

            const colors = App.currentBiome.colors;
            this.ctx.setTransform(1, 0, 0, 1, 0, 0); 
            
            if(isRealityBroken) this.ctx.fillStyle = '#ffffff'; 
            else this.ctx.fillStyle = colors.bg;
            
            this.ctx.fillRect(0, 0, 320, 150);
            
            if (this.shake > 0 && !App.reducedMotion) {
                this.ctx.translate(Math.random() * 4 - 2, Math.random() * 4 - 2);
                this.shake = Math.max(0, this.shake - dt * 60);
            }

            this.frame += (dt || 0) * 60;
            if (!isCombat && dt) this.cam += (120 * dt);

            this.ctx.strokeStyle = colors.brick;
            let camOffset = -(this.cam * 0.2) % 20;
            this.ctx.beginPath();
            for (let y = 0; y < 110; y += 12) {
                let rowOffset = (Math.floor(y / 12) % 2) * 10;
                for (let x = camOffset - 20; x < 340; x += 20) {
                    this.ctx.strokeRect(x + rowOffset, y, 20, 12);
                }
            }
            this.ctx.stroke();

            this.ctx.fillStyle = colors.pillar;
            let offset = -(this.cam * 0.5) % 120;
            for (let x = offset; x < 320; x += 120) {
                this.ctx.fillRect(x, 20, 15, 110);
                this.ctx.fillStyle = colors.highlight;
                this.ctx.fillRect(x + 12, 20, 2, 110);
                this.ctx.fillStyle = colors.pillar; 
            }

            this.ctx.fillStyle = "rgba(255, 255, 255, 0.05)"; 
            this.ctx.font = "bold 20px monospace";
            for (let i = 0; i < 10; i++) {
                const x = (this.frame * 0.3 + i * 40) % 340 - 20;
                const y = 60 + Math.sin(this.frame * 0.03 + i) * 15;
                const char = String.fromCharCode(65 + (i + App.level) % 26);
                this.ctx.fillText(char, x, y);
            }

            this.ctx.fillStyle = colors.floor;
            this.ctx.fillRect(0, 0, 320, 30);
            this.ctx.fillRect(0, 110, 320, 40);

            this.drawPlayer(isCombat);
            if (App.enemy) this.drawEnemy(App.enemy, dt);

            if (isRealityBroken) {
                this.ctx.fillStyle = 'white';
                this.ctx.fillRect(-50, -50, 400, 300); 
                this.ctx.restore(); 
                this.realityBreak = Math.max(0, this.realityBreak - dt * 60);
            }

        } catch (e) {
            console.error("Render Error:", e);
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.filter = "none";
            this.realityBreak = 0; 
        }
    }

drawPlayer(isCombat) {
        const px = 40; const py = 95; 
        const isFrozen = this.realityBreak > 0;
        
        let bob = (!isCombat && !isFrozen) ? Math.sin(this.frame * 0.2) * 2 : 0;
        
        this.ctx.save(); this.ctx.translate(px, py + bob);
        
        if (!isFrozen) {
            this.ctx.fillStyle = "rgba(0,0,0,0.3)"; 
            this.ctx.fillRect(0, 28 - bob, 20, 4);
        }

        this.ctx.fillStyle = "#d32f2f"; this.ctx.fillRect(5, 10, 10, 12);
        this.ctx.fillStyle = "#222"; this.ctx.fillRect(5, 18, 10, 2);
        this.ctx.fillStyle = "#ffcc80"; this.ctx.fillRect(5, 2, 10, 8);
        this.ctx.fillStyle = "#5d4037"; this.ctx.fillRect(4, 0, 12, 4); this.ctx.fillRect(4, 2, 2, 6); 

        this.ctx.save(); 
        this.ctx.translate(13, 10); 
        
        let angle = 0;
        if (isCombat && !isFrozen) {
        angle = Math.sin(this.frame * 0.15) * 0.6;
        } else if (!isFrozen) {
            angle = Math.sin(this.frame * 0.05) * 0.15; 
        }
        
        this.ctx.rotate(angle);
        
        this.ctx.fillStyle = "#8d6e63"; this.ctx.fillRect(-1, -2, 2, 4);  
        this.ctx.fillStyle = "#cfd8dc"; this.ctx.fillRect(1, -2, 14, 4); 
        
        this.ctx.restore(); 
        
        this.ctx.fillStyle = "#3e2723";
        if (!isCombat && !isFrozen) {
            let legL = Math.sin(this.frame * 0.2) * 5;
            this.ctx.fillRect(6 + legL, 22, 3, 5); this.ctx.fillRect(11 - legL, 22, 3, 5);
        } else {
            this.ctx.fillRect(6, 22, 3, 5); this.ctx.fillRect(11, 22, 3, 5);
        }
        this.ctx.restore();
    }
	
	
drawEnemy(enemy, dt) {
    // 1. Existing Safety Check
    if(!enemy || enemy.dead) return;

    // 2. NEW: VISUAL CLEANUP
    // If reality is broken (VOID triggered), do not draw the enemy or their UI.
    if(this.realityBreak > 0) return; 

    // ... rest of the function continues as normal ...
    let x = 280 - (enemy.enter * 180); 
    let y = 90;
    let scale = enemy.isBoss ? 1.5 : 1;
    
    let bob = 0;
    if(this.realityBreak <= 0) {
        if(enemy.anim === 'hover') bob = Math.sin(this.frame * 0.1) * 4;
        if(enemy.anim === 'flutter') bob = Math.sin(this.frame * 0.4) * 6;
    }

    if(enemy.shake > 0 && !App.reducedMotion) { 
        x += (Math.random()-0.5)*5; 
        y += (Math.random()-0.5)*5; 
        enemy.shake = Math.max(0, enemy.shake - dt * 60); 
    }

    // --- FIX STARTS HERE ---
    let threshold = GAME_CONFIG.attackSpeedNormal;
    if (App.difficulty === 'easy') threshold = GAME_CONFIG.attackSpeedEasy;
    if (App.difficulty === 'hard') threshold = GAME_CONFIG.attackSpeedHard;
    // --- FIX ENDS HERE ---
        
    const pct = Math.min(1, enemy.timer / threshold);
    
    // ... rest of the function remains exactly the same ...
    let lunge = 0;
    if (pct > 0.8 && pct <= 0.95) {
            const windUp = (pct - 0.8) / 0.15; 
            lunge = -20 * Math.sin(windUp * Math.PI); 
    }
    else if (pct > 0.95) {
        const strike = (pct - 0.95) / 0.05; 
        lunge = strike * 50; 
    }
    
    x -= lunge;

    this.ctx.save();
        this.ctx.translate(x, y + bob);
        this.ctx.scale(scale, scale);

        this.ctx.fillStyle = "rgba(0,0,0,0.3)"; this.ctx.fillRect(0, 25 - bob, 25, 5);
        
        this.ctx.fillStyle = enemy.color;
        this.ctx.fillRect(0, 0, 25, 25);
        
        this.ctx.fillStyle = "rgba(0,0,0,0.2)"; 
        if(enemy.anim === 'lunge') { this.ctx.fillRect(5,5,5,5); this.ctx.fillRect(15,5,5,5); } 
        else { this.ctx.fillRect(2, 5, 21, 5); }

        this.ctx.fillStyle = "#333"; this.ctx.fillRect(0, -8, 25, 4);
        this.ctx.fillStyle = "#f44336"; this.ctx.fillRect(0, -8, 25 * (enemy.hp / enemy.maxHp), 4);

        this.ctx.fillStyle = "#222"; this.ctx.fillRect(0, -3, 25, 2);
        this.ctx.fillStyle = pct > 0.8 ? "#fff" : "#ffd54f"; 
        this.ctx.fillRect(0, -3, 25 * pct, 2);
        
        this.ctx.fillStyle = "#aaa"; this.ctx.font = "8px sans-serif"; this.ctx.textAlign = "center";
        this.ctx.fillText(enemy.name, 12.5, -12);
        
        this.ctx.restore();
    }
	// Inside Renderer class...
drawEpitaph() {
    // Increment timer via App controller
    // The controller advances this in seconds, independent of display refresh rate.
    
    const ctx = this.ctx;
    const w = this.cvs.width;
    const h = this.cvs.height;

    // 1. The Void (Pure Black)
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    // 2. Wait for 90 frames (1.5 seconds) before showing text
    if (App.epitaphTimer < 1.5) return;

    // 3. The Text
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 16px Courier New";
    ctx.fillText("HERE LIES A WORD.", w / 2, h / 2 - 10);

    ctx.fillStyle = "#888888"; // Dimmer
    ctx.font = "12px Courier New";
    ctx.fillText("It meant something, briefly.", w / 2, h / 2 + 10);

    // 4. The Cursor (Blinks after 2.5 seconds)
    if (App.epitaphTimer > 2.5) {
        if (Math.floor(App.epitaphTimer * 2) % 2 === 0) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(w / 2 - 4, h / 2 + 30, 8, 14);
        }
    }
}
}


App.init();