// Wordquest — reliability and usability update
'use strict';

/** 0. BIOMES CONFIG **/
const Biomes = [
    {
        name: "The Whispering Mines",
        colors: { bg: "#140c1c", floor: "#1a111f", brick: "#261b2e", pillar: "#261a2b", highlight: "#3a2842" },
        boss: { 
            name: "Stone Guardian", hp: 150, color: "#9e9e9e", anim: "lunge",
            grammar: { id: 'vowel_req', flavor: "IT CANNOT HEAR SILENCE" },
            // BIOME 1: NO ABILITY (Pure Combat Tutorial)
            ability: null 
        },
        rule: { id: 'none', desc: "NO RULES" },
        enemies: [
            { n:'Slime', h:20, c:'#81c784', d:5, anim:'squish' }, 
            { n:'Bat', h:15, c:'#b39ddb', d:4, anim:'flutter' },
            { n:'Kobold', h:35, c:'#a1887f', d:7, anim:'lunge' }
        ]
    },
    {
        name: "The Crimson Archives",
        colors: { bg: "#2a0a0a", floor: "#3e1212", brick: "#541a1a", pillar: "#3e1212", highlight: "#7f2b2b" },
        boss: { 
            name: "Rot Blossom", hp: 350, color: "#69f0ae", anim: "squish",
            grammar: null,
            // BIOME 2: APHASIA (Theme: Redacted Knowledge)
            // Duration 3.0s: Long enough to confuse, short enough to recover
            ability: { type: 'aphasia', chance: 0.4, dur: 3.0 } 
        },
        rule: { id: 'length', min: 4, desc: "VERBOSE: Under 4 letters = 20% power" },
        enemies: [
            { n:'Ink Blot', h:25, c:'#212121', d:6, anim:'squish' },
            { n:'Tome Mimic', h:45, c:'#8d6e63', d:9, anim:'lunge' },
            { n:'Paper Golem', h:40, c:'#eceff1', d:7, anim:'hover' }
        ]
    },
    {
        name: "The Sunken Swamp",
        colors: { bg: "#05140a", floor: "#0a2112", brick: "#12331d", pillar: "#0a2112", highlight: "#1e5230" },
        boss: { 
            name: "Mire King", hp: 350, color: "#69f0ae", anim: "squish", 
            grammar: { id: 'ending_dst', flavor: "IT LISTENS ONLY TO CLOSURE" },
            // BIOME 3: ROT (Theme: Infection/Decay)
            // Moves Rot to the Swamp where it belongs nicely
            ability: { type: 'rot', chance: 0.4, dur: 10.0 } 
        },
        rule: { id: 'no_plural', desc: "SINGULAR: Ends in S = 20% power" },
        enemies: [
            { n:'Leech', h:30, c:'#ef5350', d:6, anim:'squish' },
            { n:'Mosquito', h:15, c:'#ef5350', d:10, anim:'flutter' }, 
            { n:'Mud Crab', h:50, c:'#558b2f', d:8, anim:'hover' }
        ]
    },
    {
        name: "The Void",
        colors: { bg: "#000000", floor: "#111111", brick: "#333333", pillar: "#222222", highlight: "#555555" },
        boss: { 
            name: "Nullity", hp: 500, color: "#fff", anim: "hover",
            grammar: { id: 'len_cap', flavor: "IT FEARS ONLY THE WORD 'VOID'"},
            // BIOME 4: SILENCE (Theme: Nullification)
            // The hardest mechanic for the final boss
            ability: { type: 'silence', chance: 0.4, dur: 8.0 } 
        },
        rule: { id: 'vowel_tax', desc: "VOWEL TAX: −10% power per vowel" },
        enemies: [
            { n:'Glitch', h:40, c:'#00e676', d:9, anim:'flutter' },
            { n:'Null Mite', h:60, c:'#e040fb', d:12, anim:'squish' },
            { n:'Echo', h:50, c:'#bdbdbd', d:10, anim:'hover' }
        ]
    }
];
/** GAME STATES **/
const GameState = {
    WALKING: 'WALKING',
    COMBAT: 'COMBAT',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER',
    MENU: 'MENU',
EPITAPH: 'EPITAPH',
    LEVELUP: 'LEVELUP', CROSSROADS: 'CROSSROADS'
};

/** GAME CONFIGURATION **/
const GAME_CONFIG = {
    depthPerBiome: 200,
    hpNormal: 500,
    hpEasy: 800, 
    hpHard: 200,
    attackSpeedHard: 3.3,   
    attackSpeedNormal: 4.5, 
    attackSpeedEasy: 5.5,   
    entrySpeed: 1.0,        
    healMultiplier: 4,      
    silenceRecoil: 20,      
    rotDmgPerVowel: 15,     
    vowelTaxRate: 0.1,      
    maxWildcards: 3,        
    voidDuration: 120       
};

/** Storage failures must never prevent play. */
const Storage = {
    available: true,
    get(key, fallback = null) {
        try { return localStorage.getItem(key) ?? fallback; }
        catch (_) { this.available = false; return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; }
        catch (_) { this.available = false; return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (_) { this.available = false; }
    },
    json(key, fallback) {
        try { return JSON.parse(this.get(key)) ?? fallback; } catch (_) { return fallback; }
    }
};

/** 1. AUDIO ENGINE **/
const AudioSys = {
    ctx: null, muted: false, musicTimer: null, noteIndex: 0, currentPattern: 'walk', playing: false,
    notes: { 'C2':65.4,'D#2':77.7,'F2':87.3,'G2':98,'C3':130.8,'D#3':155.5,'E3':164.8,'F3':174.6,'G3':196,'C4':261.6 },
    patterns: { 
        walk: ['C3',0,'G2',0,'C3','E3','G2',0], 
        fight: ['C2','C2','D#2',0,'F2','F2','D#2',0],
        boss: ['C2','C2','C2','C2','D#2','D#2','F2','G2']
    },
    init() {
        try {
            const Context = window.AudioContext || window.webkitAudioContext;
            if (!Context) return;
            if (!this.ctx) this.ctx = new Context();
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        } catch (_) { /* Audio is optional; never stop a run. */ }
    },
    toggleMute() { 
        this.muted=!this.muted; document.getElementById('mute-btn').textContent=this.muted?'🔇 SOUND OFF':'🔊 SOUND ON';
        document.getElementById('mute-btn').setAttribute('aria-pressed', String(this.muted));
        Storage.set('wq_muted', String(this.muted));
        if(this.muted)this.stop(); else if(App.gameActive && !App.isPaused) { this.init(); this.start(); }
    },
	glitch() {
        this.stop(); 
        for(let i=0; i<8; i++) {
            const freq = 50 + Math.random() * 800;
            const type = Math.random() > 0.5 ? 'sawtooth' : 'square';
            setTimeout(() => this.tone(freq, type, 1.0, 0.3), i * 40);
        }
    },
    getBPM() { 
        if(!App.player) return 120;
        if(App.enemy && App.enemy.isBoss) return 160; 
        return this.currentPattern === 'fight' ? 140 : 120;
    },
    start() { if(this.playing || this.muted || App.isPaused || !App.gameActive)return; this.playing=true; this.init(); this.loop(); },
    stop() { this.playing=false; clearTimeout(this.musicTimer); },
    loop() {
        if(this.muted||!this.playing)return;
        const pat=this.patterns[this.currentPattern]||this.patterns['walk'];
        const note=pat[this.noteIndex%pat.length];
        const bpm=this.getBPM();
        
        // --- CHANGED LOGIC START ---
        if(note&&this.notes[note]) {
            // Triangle waves are quiet, so we triple the volume (0.15) compared to Sawtooth (0.05)
            const isWalk = this.currentPattern === 'walk';
            const wave = isWalk ? 'triangle' : 'sawtooth';
            const vol = isWalk ? 0.15 : 0.05; 
            
            this.tone(this.notes[note], wave, 0.1, vol);
        }
        // --- CHANGED LOGIC END ---

        this.noteIndex++;
        this.musicTimer=setTimeout(()=>this.loop(),(60/bpm)*500);
    },
    tone(f,t,d,v=0.1,s=null) {
        if(this.muted||!this.ctx||App.isPaused||!App.gameActive)return;
        try{const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=t;o.frequency.setValueAtTime(f,this.ctx.currentTime);
        if(s)o.frequency.exponentialRampToValueAtTime(s,this.ctx.currentTime+d);
        g.gain.setValueAtTime(v,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,this.ctx.currentTime+d);
        o.connect(g);g.connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+d);}catch(e){}
    },
    sfxClick:()=>AudioSys.tone(600,'square',0.05,0.05),
    sfxAttack:()=>AudioSys.tone(800,'sawtooth',0.15,0.1,100),
    sfxHeal:()=>AudioSys.tone(400,'sine',0.3,0.1,800),
    sfxBoss:()=> { AudioSys.tone(100,'sawtooth',1.0,0.5); setTimeout(()=>AudioSys.tone(80,'sawtooth',1.0,0.5), 200); },
	sfxWarn:()=> AudioSys.tone(400, 'square', 0.2, 0.2, 100),
};
/** Dictionary: bundled, alphabetic and indexed by length for wildcard matching. */
const Dict = {
    words: new Set(), byLength: new Map(), isReady: false,
    init() {
        if (typeof WORDQUEST_WORDS !== 'string') return false;
        for (const word of WORDQUEST_WORDS.split('\n')) {
            if (!/^[A-Z]{2,64}$/.test(word)) continue;
            this.words.add(word);
            if (!this.byLength.has(word.length)) this.byLength.set(word.length, []);
            this.byLength.get(word.length).push(word);
        }
        this.isReady = this.words.size > 100000 && this.words.has('VOID');
        return this.isReady;
    },
    check(word) { return this.words.has(word); },
    solve(pattern) {
        if (!/^[A-Z?]{2,64}$/.test(pattern)) return null;
        if (!pattern.includes('?')) return this.check(pattern) ? pattern : null;
        const letters = [...pattern];
        const candidates = this.byLength.get(pattern.length) || [];
        return candidates.find(word => letters.every((char, i) => char === '?' || char === word[i])) || null;
    }
};

/** Scoring stays pure; damage and healing are applied by the controller. */
const Combat = {
    calculateTurn(tiles, word, player, enemy, biomeRule, curses, difficulty = App.difficulty) {
        let score = 0, wildBonus = 0, recoil = 0, mult = 1, text = 'CAST';
        const isHeal = tiles.some(tile => tile.special === 'heal');
        for (const tile of tiles) {
            score += tile.special === 'wild' ? 1 : tile.score;
            if (tile.special === 'wild') wildBonus += 5;
            if (tile.special === 'corrupted') recoil += 5;
        }
        let isResisted = false;
        if (curses.rot > 0) recoil += (word.match(/[AEIOU]/g) || []).length * GAME_CONFIG.rotDmgPerVowel;
        const rule = enemy?.grammar;
        if (rule?.id === 'vowel_req' && !/[AEIOU]/.test(word)) return { type: 'FAIL', text: 'NEED A VOWEL' };
        if (rule?.id === 'no_repeat' && /(.)\1/.test(word)) {
            mult *= 0.5; text = 'STUTTER'; isResisted = true;
        }
        if (rule?.id === 'ending_dst' && !/[DST]$/.test(word)) {
            mult *= 0.5; text = 'UNFINISHED'; isResisted = true;
        }
        if (rule?.id === 'len_cap' && word.length > 5) {
            recoil += (word.length - 5) * 10; mult *= 0.8; text = 'UNSTABLE';
        }
        if (biomeRule.id === 'length' && word.length < biomeRule.min) {
            mult *= 0.2; text = 'GLANCE'; isResisted = true;
        }
        if (biomeRule.id === 'no_plural' && word.endsWith('S')) {
            mult *= 0.2; text = 'WEAK'; isResisted = true;
        }
        if (biomeRule.id === 'vowel_tax') {
            mult *= Math.max(0, 1 - (word.match(/[AEIOU]/g) || []).length * GAME_CONFIG.vowelTaxRate);
        }
        if (word.length >= 5) score = Math.floor(score * 1.5);
        const power = Math.max(0, Math.floor((score + wildBonus) * mult));
        if (isHeal) {
            let healing = power * 2.5 + Math.max(0, word.length - 3) * 5;
            if (difficulty === 'easy') healing = Math.floor(healing * 1.1);
            const efficiency = difficulty === 'easy' ? 1 : 0.3 + (1 - player.hp / player.maxHp) * 0.7;
            healing = Math.min(Math.ceil(healing * efficiency), Math.floor(player.maxHp * 0.15));
            return { type: 'HEAL', val: Math.max(0, healing), recoil, text: 'MEND', isResisted };
        }
        return { type: 'ATTACK', val: power, recoil, text, isResisted };
    }
};

const GridManager = {
    grid: [], selected: [],
    weights: 'AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ',
    scores: { A:1, B:3, C:3, D:2, E:1, F:4, G:2, H:4, I:1, J:8, K:5, L:1, M:3, N:1, O:1, P:3, Q:10, R:1, S:1, T:1, U:1, V:4, W:4, X:8, Y:4, Z:10 },
    randomChar(forceVowel = false) {
        const pool = forceVowel ? 'AEIOU' : this.weights;
        return pool[Math.floor(Math.random() * pool.length)];
    },
    roll(tile, forceVowel = false) {
        tile.char = this.randomChar(forceVowel);
        tile.special = null;
        tile.chosenChar = null;
        if (Math.random() < 0.05) {
            if (Math.random() < 0.5) tile.special = 'heal';
            else if (!forceVowel && this.grid.filter(t => t !== tile && t.special === 'wild').length < GAME_CONFIG.maxWildcards) {
                tile.special = 'wild'; tile.char = '?';
            }
        }
        tile.score = tile.special === 'wild' ? 1 : this.scores[tile.char];
    },
    generate(saved = null) {
        this.selected = [];
        this.grid = [];
        const container = document.getElementById('tile-grid');
        container.replaceChildren();
        for (let i = 0; i < 64; i++) {
            const el = document.createElement('button');
            el.type = 'button'; el.className = 'tile'; el.tabIndex = i === 0 ? 0 : -1;
            const tile = { el, char: 'A', score: 1, special: null, chosenChar: null };
            if (saved) Object.assign(tile, saved[i], { el, score: saved[i].special === 'wild' ? 1 : this.scores[saved[i].char] });
            else this.roll(tile);
            el.addEventListener('click', () => this.handleClick(tile));
            el.addEventListener('keydown', event => {
                const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
                if (!(event.key in offsets)) return;
                event.preventDefault();
                const next = Math.max(0, Math.min(63, i + offsets[event.key]));
                this.grid.forEach(t => { t.el.tabIndex = -1; });
                this.grid[next].el.tabIndex = 0; this.grid[next].el.focus();
            });
            this.grid.push(tile); container.appendChild(el);
        }
        // An ordinary starting board always has at least ten usable vowels.
        if (!saved) {
            let vowels = this.grid.filter(t => 'AEIOU'.includes(t.char)).length;
            for (const tile of this.grid) {
                if (vowels >= 10) break;
                if (!'AEIOU'.includes(tile.char) && !tile.special) { this.roll(tile, true); vowels++; }
            }
        }
        this.updateVisuals();
        App.checkWord();
    },
    isSilenced(tile) { return App.curses.silence > 0 && 'AEIOU'.includes(tile.char); },
    handleClick(tile, chosenChar = null) {
        if (!App.canInteract() || this.isSilenced(tile)) return;
        AudioSys.init(); App.noteInput();
        const index = this.selected.indexOf(tile);
        if (index >= 0) { this.selected.splice(index, 1); tile.chosenChar = null; }
        else { tile.chosenChar = chosenChar; this.selected.push(tile); }
        this.updateVisuals(); AudioSys.sfxClick(); App.checkWord();
    },
    typeLetter(letter) {
        const available = this.grid.filter(t => !this.selected.includes(t) && !this.isSilenced(t));
        const matches = available.filter(t => t.char === letter && !t.el.classList.contains('aphasia'));
        const tile = matches.find(t => !t.special) || matches.find(t => t.special !== 'heal') || matches[0] || available.find(t => t.special === 'wild');
        if (tile) this.handleClick(tile, tile.special === 'wild' ? letter : null);
        else App.announce(`No available ${letter} tile.`);
    },
    undo() {
        if (!App.canInteract() || !this.selected.length) return;
        this.handleClick(this.selected[this.selected.length - 1]);
    },
    clearSelection(refresh = true) {
        for (const tile of this.selected) tile.chosenChar = null;
        this.selected = []; this.updateVisuals();
        if (refresh) App.checkWord();
    },
    renderTile(tile, scramble = false) {
        const order = this.selected.indexOf(tile);
        const silenced = this.isSilenced(tile);
        const obscured = App.curses.aphasia > 0 && order < 0 && tile.special !== 'wild';
        if (scramble || tile.obscured == null) tile.obscured = Math.random() < 0.7;
        const masked = obscured && tile.obscured;
        const char = silenced ? '·' : masked ? '█' : tile.chosenChar || tile.char;
        const label = silenced || masked ? '' : tile.special === 'wild' ? 'WILD' : tile.special === 'heal' ? '+' : tile.special === 'corrupted' ? '−5' : tile.score;
        tile.el.className = ['tile', order >= 0 ? 'selected' : '', tile.special === 'heal' ? 'multiplier' : '', tile.special === 'wild' ? 'wildcard' : '', silenced ? 'silenced' : '', tile.special === 'corrupted' || (App.curses.rot > 0 && 'AEIOU'.includes(tile.char)) ? 'rot' : '', masked ? 'aphasia' : ''].filter(Boolean).join(' ');
        tile.el.innerHTML = `<span class="tile-char">${char}</span><span class="tile-score">${label}</span>${order >= 0 ? `<span class="tile-order">${order + 1}</span>` : ''}`;
        tile.el.setAttribute('aria-pressed', String(order >= 0));
        tile.el.setAttribute('aria-disabled', String(silenced));
        tile.el.setAttribute('aria-label', silenced ? 'Silenced vowel' : masked ? 'Obscured letter' : `${tile.chosenChar || tile.char}${tile.special ? ', ' + tile.special : ', ' + tile.score + ' points'}${order >= 0 ? ', selected ' + (order + 1) : ''}`);
    },
    updateVisuals(scramble = false) { this.grid.forEach(tile => this.renderTile(tile, scramble)); },
    refillSelected() {
        const used = [...this.selected];
        let vowels = this.grid.filter(t => !used.includes(t) && 'AEIOU'.includes(t.char)).length;
        // Free every consumed special before rolling, so the wildcard limit is accurate.
        used.forEach(t => { t.special = null; });
        for (const tile of used) {
            this.roll(tile, vowels < 10);
            if ('AEIOU'.includes(tile.char)) vowels++;
        }
        this.selected = [];
        if (App.currentBiome.name === 'The Sunken Swamp') this.spreadRot();
        this.updateVisuals(); App.checkWord();
    },
    spreadRot() {
        const hp = App.player.hp / App.player.maxHp;
        const skip = App.difficulty === 'easy' ? hp < 0.25 ? 0.8 : hp < 0.5 ? 0.6 : 0.4 : 0;
        if (Math.random() < skip) return;
        const candidates = new Set();
        this.grid.forEach((tile, i) => {
            if (tile.special !== 'corrupted') return;
            const neighbours = [];
            if (i >= 8) neighbours.push(i - 8);
            if (i < 56) neighbours.push(i + 8);
            if (i % 8 > 0) neighbours.push(i - 1);
            if (i % 8 < 7) neighbours.push(i + 1);
            neighbours.forEach(j => { if (!['corrupted', 'wild'].includes(this.grid[j].special)) candidates.add(this.grid[j]); });
        });
        const pool = candidates.size ? [...candidates] : this.grid.filter(t => !['corrupted', 'wild'].includes(t.special));
        if (pool.length) {
            const tile = pool[Math.floor(Math.random() * pool.length)];
            tile.special = 'corrupted'; App.spawnParticle('ROT', tile.el, '#ef5350');
        }
    }
};