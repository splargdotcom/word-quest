import assert from 'node:assert/strict';
import fs from 'node:fs';
import { boot } from './harness.mjs';
const root = new URL('..', import.meta.url).pathname;
const env = boot(root);
const { run, document, window } = env;
let passed = 0, failed = 0;
const test = (name, fn) => {
    try { fn(); passed++; console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}\n  ${error.stack}`); }
};
const equal = (source, expected) => assert.equal(run(source), expected);
function start({ combat = true, level = 1, hp = 200, difficulty = 'normal', boss = false } = {}) {
    run(`App.setDifficulty(${JSON.stringify(difficulty)}); App.startGame(); App.level=${level}; App.setBiome(${level - 1}); App.player.hp=${hp};`);
    if (combat) run(boss ? 'App.spawnBoss();' : 'App.spawnEnemy();');
}
function word(text, specials = {}) {
    run(`GridManager.clearSelection(); GridManager.grid.slice(0,${text.length}).forEach((tile,i)=>{
        tile.char=${JSON.stringify(text)}[i]; tile.special=(${JSON.stringify(specials)})[i] || null;
        if(tile.special==='wild') tile.char='?';
        tile.score=tile.special==='wild'?1:GridManager.scores[tile.char]; tile.chosenChar=null;
    }); GridManager.updateVisuals(); GridManager.grid.slice(0,${text.length}).forEach(tile=>GridManager.handleClick(tile));`);
}
function press(key, id = 'play-surface', options = {}) {
    const event = new window.KeyboardEvent('keydown', { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, ...options });
    document.getElementById(id).dispatchEvent(event);
    return event;
}

test('Full original dictionary loads offline', () => { equal('Dict.words.size', 370079); equal("Dict.check('VOID') && Dict.check('COLOUR') && Dict.check('COLOR')", true); });
test('Missing dictionary fails clearly without starting a run', () => {
    const missing = boot(root, { noDictionary: true });
    assert.equal(missing.run('App.startGame(); App.gameActive'), false);
    assert.match(missing.document.getElementById('dictionary-status').textContent, /Dictionary missing/);
    missing.close();
});
test('Two and three wildcard patterns resolve valid words', () => {
    for (const p of ['Z?BR?', '??Z', '?A??', '???', 'A??LE']) {
        const solved = run(`Dict.solve(${JSON.stringify(p)})`);
        assert.ok(solved && new RegExp('^' + p.replaceAll('?', '[A-Z]') + '$').test(solved));
        assert.equal(run(`Dict.check(${JSON.stringify(solved)})`), true);
    }
});
test('Invalid and one-letter dictionary patterns are rejected', () => {
    for (const p of ['A', 'ZZZZZZZZZZZZZZ', '<IMG>', 'CA.*', '']) equal(`Dict.solve(${JSON.stringify(p)})`, null);
});
test('Combat healing restores HP and leaves enemy HP unchanged', () => {
    start(); word('CAT', { 1: 'heal' }); const before = run('App.enemy.hp'), gain = run('App.currentAction.val');
    run('App.submit()'); equal('App.player.hp', 200 + gain); equal('App.enemy.hp', before);
});
test('Walking healing still works', () => { start({ combat: false }); word('CAT', { 1: 'heal' }); run('App.submit()'); assert.ok(run('App.player.hp') > 200); });
test('Ordinary walking word stays prepared and cannot heal or score', () => {
    start({ combat: false }); word('CAT'); run('App.submit()'); equal('App.player.hp', 200); equal('App.player.score', 0); equal('GridManager.selected.length', 3);
    run('App.spawnEnemy()'); assert.ok(run('App.currentAction?.type') === 'ATTACK');
});
test('Ordinary combat attack damages only the foe', () => {
    start(); word('CAT'); const hp = run('App.enemy.hp'), damage = run('App.currentAction.val'); run('App.submit()');
    equal('App.enemy.hp', hp - damage); equal('App.player.hp', 200); equal('App.player.score', damage);
});
test('Healing at full health cannot farm score', () => {
    start({ hp: 500 }); word('CAT', { 1: 'heal' }); equal('App.currentAction', null); run('App.submit()'); equal('App.player.score', 0);
});
test('Only actual healing counts towards score', () => {
    start({ hp: 499 }); word('CAT', { 1: 'heal' }); run('App.submit()'); equal('App.player.hp', 500); equal('App.player.score', 1);
});
test('Fatal recoil cannot heal, damage the foe or resume play', () => {
    start({ hp: 4 }); word('CAT', { 0: 'corrupted', 1: 'heal' }); const hp = run('App.enemy.hp'); run('App.submit()');
    equal('App.player.hp', 0); equal('App.enemy.hp', hp); equal('App.state', 'EPITAPH'); equal('App.gameActive', false);
    run('App.update(10)'); equal('App.state', 'GAMEOVER'); equal('App.gameActive', false);
});
test('Fatal recoil cannot kill a boss or unlock the next biome', () => {
    start({ hp: 4, boss: true }); run('App.enemy.hp=1'); word('CAT', { 0: 'corrupted' }); run('App.submit()');
    equal('App.enemy.hp', 1); equal('App.state', 'EPITAPH');
});
test('Non-fatal recoil is paid before healing', () => {
    start(); word('CAT', { 0: 'corrupted', 1: 'heal' }); const gain=run('App.currentAction.val'); run('App.submit()'); equal('App.player.hp', 195 + gain);
});
test('Phasing protects against enemies, not sacrifice or recoil', () => {
    start(); run('App.curses.phased=2; App.takeDamage(20,{avoidable:true});'); equal('App.player.hp', 200); equal('App.curses.phased', 1);
    run('App.takeDamage(5)'); equal('App.player.hp', 195); equal('App.curses.phased', 1);
    run('App.triggerSacrifice()'); equal('App.player.hp', 145); equal('App.curses.phased', 1);
});
test('Sacrifice rerolls all 64 tiles even with no selection', () => {
    start(); const old = [...run('GridManager.grid')]; run('App.triggerSacrifice()');
    equal('App.player.hp', 150); equal('GridManager.grid.length', 64); equal('GridManager.selected.length', 0);
    assert.ok(run('GridManager.grid').every(t => !old.includes(t)));
});
test('Sacrifice cannot kill the player', () => {
    start({ hp: 50 }); const old = run('GridManager.grid[0]'); run('App.triggerSacrifice()'); equal('App.player.hp', 50); assert.equal(run('GridManager.grid[0]'), old);
});
test('Fresh boards have vowels and obey the wildcard cap', () => {
    start(); for (let i=0;i<60;i++) {
        run('GridManager.generate()'); assert.ok(run("GridManager.grid.filter(t=>'AEIOU'.includes(t.char)).length") >= 10);
        assert.ok(run("GridManager.grid.filter(t=>t.special==='wild').length") <= 3);
    }
});
test('Wildcard scoring is fixed, not inherited from an invisible letter', () => {
    start(); const score=run("Combat.calculateTurn([{special:'wild',score:10},{special:null,score:1}], 'AT',App.player,null,{id:'none'},App.curses).val"); assert.equal(score,7);
});
test('Vowel tax never makes attack power negative', () => {
    start(); equal("Combat.calculateTurn(Array.from({length:12},()=>({score:1,special:null})), 'AAAAAAAAAAAA',App.player,null,{id:'vowel_tax'},App.curses).val",0);
});
test('Long words earn the existing power bonus', () => {
    start(); equal("Combat.calculateTurn(Array.from({length:5},()=>({score:1,special:null})), 'STONE',App.player,null,{id:'none'},App.curses).val",7);
});
test('Biome length and ending rules match their displayed penalties', () => {
    start({ level:2 }); word('CAT'); equal('App.currentAction.val',1);
    start({ level:3 }); word('CATS'); equal('App.currentAction.val',1);
});
test('Boss vowel requirement blocks an otherwise valid word', () => {
    start({ boss:true }); word('SHY'); equal('App.currentAction',null); assert.match(document.getElementById('action-btn').textContent,/VOWEL/);
});
test('Boss phase curse consumes every tile in the submitted word', () => {
    start({ level:4, boss:true }); run('App.enemy.hp=App.enemy.maxHp*0.66+1'); word('CAT'); run('App.submit()');
    equal('GridManager.selected.length',0); assert.ok(run('App.curses.silence')>0);
});
test('Silence removes selected vowels and blocks reselection', () => {
    start(); word('CAT'); run("App.inflictCurse('silence',8); GridManager.handleClick(GridManager.grid[1]);");
    equal("GridManager.selected.some(t=>t.char==='A')",false); equal('GridManager.selected.length',2);
});
test('Curse expiry refreshes a waiting action preview', () => {
    start(); word('CAT'); run("App.inflictCurse('rot',0.05)"); equal('App.currentAction.recoil',15);
    run('App.update(0.1)'); equal('App.currentAction.recoil',0);
});
test('Damage refreshes the healing preview without extra tile clicks', () => {
    start({ hp:450 }); word('CAT', {1:'heal'}); const first=run('App.currentAction.val');
    run('App.takeDamage(300)'); assert.ok(run('App.currentAction.val')>first);
});
test('Submitting recomputes stale curses before applying damage', () => {
    start(); word('CAT'); run('App.curses.rot=10; App.submit()'); equal('App.player.hp',185);
});
test('Pausing works during boss fights', () => {
    start({ boss:true }); run('App.togglePause()'); equal('App.isPaused',true);
    assert.equal(document.getElementById('menu-pause').classList.contains('hidden'),false);
});
test('Paused timers, HP and curse durations do not advance', () => {
    start({ boss:true }); run('App.curses.rot=8; App.enemy.timer=2; App.idleSeconds=1; App.togglePause(); App.update(30);');
    equal('App.curses.rot',8); equal('App.enemy.timer',2); equal('App.idleSeconds',1); equal('App.player.hp',200);
});
test('Pause does not trigger instant inactivity rage on resume', () => {
    start(); run('App.idleSeconds=1;App.togglePause()'); env.setNow(600000); run('App.togglePause();App.update(0.1)');
    equal('App.idleSeconds',1.1); assert.ok(run('App.enemy.timer') < .2);
});
test('Paused clicks and casts cannot modify the board or health', () => {
    start(); word('CAT', {1:'heal'}); run('App.togglePause(); App.submit(); GridManager.handleClick(GridManager.grid[4]); App.triggerSacrifice();');
    equal('App.player.hp',200); equal('GridManager.selected.length',3);
});
test('Loss of window focus auto-pauses combat', () => {
    start({boss:true}); window.dispatchEvent(new window.Event('blur')); equal('App.isPaused',true);
});
test('Enemy defeat delay freezes while paused', () => {
    start(); run('App.enemy.hp=1'); word('CAT'); run('App.submit();App.togglePause();App.update(10)'); equal('App.enemy.dead',true); equal('App.encounterDelay',.4);
    run('App.togglePause();App.update(.4)'); equal('App.state','WALKING'); equal('App.enemy',null);
});
test('Prepared attacks cannot repeatedly hit an already dead enemy', () => {
    start();run('App.enemy.hp=1');word('CAT');run('App.submit()');const score=run('App.player.score');run('App.submit()');equal('App.player.score',score);equal('App.stats.kills',1);
});
test('No stale defeat callback can restart a finished run', () => {
    start();run('App.enemy.hp=1');word('CAT');run('App.submit();App.takeDamage(999);App.update(20)');equal('App.gameActive',false);equal('App.state','GAMEOVER');
});
test('Keyboard selection, undo and clear work through DOM events', () => {
    start();word('CAT');run('GridManager.clearSelection()');press('c');press('a');press('t');equal('GridManager.selected.length',3);
    press('Backspace');equal('GridManager.selected.length',2);press('Delete');equal('GridManager.selected.length',0);
});
test('Keyboard Enter casts from the play surface', () => {
    start();word('CAT');press('Enter');equal('App.stats.words',1);
});
test('Typing after clicking a tile returns Enter to casting', () => {
    start();word('CAT');run('GridManager.clearSelection()');
    const tile=document.querySelector('.tile');tile.focus();
    tile.dispatchEvent(new window.KeyboardEvent('keydown',{key:'c',bubbles:true,cancelable:true}));
    assert.equal(document.activeElement.id,'play-surface');press('a');press('t');press('Enter');equal('App.stats.words',1);
});
test('Keyboard Enter on toolbar buttons retains native button activation', () => {
    start();word('CAT');const event=press('Enter','pause-btn');assert.equal(event.defaultPrevented,false);equal('App.stats.words',0);
});
test('Keyboard shortcuts ignore modifier keys and repeated keydown', () => {
    start();word('CAT');run('GridManager.clearSelection()');press('c','play-surface',{ctrlKey:true});press('c','play-surface',{repeat:true});equal('GridManager.selected.length',0);
});
test('Typed missing letter can use a wildcard with that exact letter', () => {
    start(); run("GridManager.grid.forEach(t=>{t.char='A';t.score=1;t.special=null;});GridManager.grid[0].special='wild';GridManager.grid[0].char='?';GridManager.updateVisuals()");
    press('z');equal('GridManager.selected[0].chosenChar','Z');
});
test('Selected tiles expose their order and pressed state', () => {
    start();word('CAT');assert.equal(document.querySelectorAll('.tile[aria-pressed="true"]').length,3);
    assert.match(document.querySelector('.tile[aria-pressed="true"]').getAttribute('aria-label'),/selected 1/);
});
test('VOID remains depth-gated and cannot be cast while walking', () => {
    start({level:2});word('VOID');equal('App.currentAction',null);
    start({level:3,combat:false});word('VOID');equal('App.currentAction',null);
});
test('VOID defeats a normal foe, charges HP and grants two dodges', () => {
    start({level:3});word('VOID');run('App.submit()');equal('App.player.hp',20);equal('App.enemy.dead',true);equal('App.curses.phased',2);equal('App.stats.words',1);
    run('App.update(.8)');equal('App.state','WALKING');equal('AudioSys.playing',true);
});
test('VOID boss victory forfeits next-biome healing', () => {
    start({level:3,boss:true});word('VOID');run('App.submit()');equal('App.state','LEVELUP');run('App.nextLevel()');equal('App.player.hp',20);equal('App.level',4);equal('App.voidCurse',false);
});
test('Ordinary boss victory heals at the next biome and clears curses', () => {
    start({boss:true});run('App.enemy.hp=1;App.curses.rot=5');word('CAT');run('App.submit();App.nextLevel()');equal('App.player.hp',500);equal('App.level',2);equal('App.curses.rot',0);
});
test('Final boss leads to crossroads, then endless play without changing campaign rules', () => {
    start({level:4,boss:true});run('App.enemy.hp=1');word('CAT');run('App.submit()');equal('App.state','CROSSROADS');run('App.chooseDescend()');
    equal('App.endlessMode',true);equal('App.currentBiome.rule.id','none');equal('Biomes[3].rule.id','vowel_tax');
    run('App.startGame();App.setBiome(3)');equal('App.currentBiome.rule.id','vowel_tax');
});
test('Ascending saves a best depth and clears the resumable run', () => {
    start({level:4,boss:true});run('App.player.depth=805;App.enemy.hp=1');word('CAT');run('App.submit();App.chooseAscend()');
    equal('App.state','GAMEOVER');equal('App.victory',true);equal("Storage.get('wq_run_v2')",null);assert.ok(run('App.deepestDescent')>=805);
});
test('Endless encounters do not spawn bosses', () => {
    start({level:4});run('App.endlessMode=true;App.player.depth=2000;App.spawnEncounter()');equal('App.enemy.isBoss',false);
});
test('Save-and-title then continue restores board, selection, HP and timer', () => {
    start({level:2});word('CAT');run('App.enemy.timer=2;App.curses.aphasia=3;App.togglePause();App.saveAndQuit()');equal('App.state','MENU');
    run('App.continueRun()');equal('App.state','COMBAT');equal('App.player.hp',200);equal('App.enemy.timer',2);equal('GridManager.selected.length',3);equal('App.curses.aphasia',3);
});
test('Fresh page restores a saved run without losing a typed wildcard', () => {
    start();word('CAT',{0:'wild'});run("GridManager.selected[0].chosenChar='C';App.saveRun()");
    const second=boot(root,{stored:Object.fromEntries(env.values)});second.run('App.continueRun()');assert.equal(second.run('GridManager.selected[0].chosenChar'),'C');assert.equal(second.run('App.player.hp'),200);second.close();
});
test('Biome crossing can be saved and continued', () => {
    start({boss:true});run('App.enemy.hp=1');word('CAT');run('App.submit()');equal('App.state','LEVELUP');run('App.returnToTitle();App.continueRun()');equal('App.state','LEVELUP');run('App.nextLevel()');equal('App.level',2);
});
test('Final crossroads can be saved and continued', () => {
    start({level:4,boss:true});run('App.enemy.hp=1');word('CAT');run('App.submit();App.returnToTitle();App.continueRun()');equal('App.state','CROSSROADS');
});
test('Invalid saved JSON never prevents starting', () => {
    env.values.set('wq_run_v2','broken');run('App.refreshTitle();App.startGame()');equal('App.gameActive',true);
});
test('Invalid saved states are rejected before they can freeze a run', () => {
    start();run('App.saveRun()');const valid=JSON.parse(env.values.get('wq_run_v2'));
    const invalid = [
        {...valid,level:99}, {...valid,grid:[]}, {...valid,selected:[0,0]}, {...valid,player:{...valid.player,hp:-1}},
        {...valid,enemy:{...valid.enemy,dead:true,hp:0},encounterDelay:0},
        {...valid,state:'LEVELUP',level:4,enemy:{...valid.enemy,dead:true,isBoss:true,hp:0}}
    ];
    for(const bad of invalid) {env.values.set('wq_run_v2',JSON.stringify(bad));equal('App.readSave()',null);}
});
test('Blocked storage cannot prevent play or death', () => {
    const blocked=boot(root,{blockStorage:true});blocked.run('App.startGame();App.takeDamage(9999)');assert.equal(blocked.run('App.state'),'EPITAPH');assert.equal(blocked.errors.length,0);blocked.close();
});
test('Legacy depth record survives the update; obsolete cache is removed', () => {
    const legacy=boot(root,{stored:{void_deepest_descent:'1234',wq_dict_comp:'old cache',wq_dict_version:'1.2'}});
    assert.equal(legacy.run('App.deepestDescent'),1234);assert.equal(legacy.values.has('wq_dict_comp'),false);legacy.close();
});
test('Retry resets enemy, curses, pause and the previous VOID penalty', () => {
    start();run('App.voidCurse=true;App.curses.rot=10;App.takeDamage(999);App.update(3);App.startGame()');
    equal('App.enemy',null);equal('App.isPaused',false);equal('App.voidCurse',false);equal('App.curses.rot',0);equal('App.player.hp',500);equal('App.stats.words',0);
});
test('Sound preference persists and mute does not restart paused music', () => {
    start();run('App.togglePause();AudioSys.muted=true;AudioSys.toggleMute()');equal('AudioSys.playing',false);equal("Storage.get('wq_muted')",'false');
});
test('Combat music uses the correct faster tempo', () => {
    start();run("AudioSys.currentPattern='fight'");equal('AudioSys.getBPM()',140);run('App.spawnBoss()');equal('AudioSys.getBPM()',160);
});
test('The renderer executes without errors across normal and death states', () => {
    start();run('App.renderer.draw(true,0.016);App.triggerRealityBreak();App.renderer.draw(true,0.016);App.finishRun(false,"Test");App.epitaphTimer=2;App.renderer.draw(false,0.016)');
    assert.deepEqual(env.errors,[]);
});
test('Menus expose dialogs, every referenced DOM id exists and assets are local', () => {
    const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../engine.js',import.meta.url),'utf8');
    for(const match of source.matchAll(/getElementById\('([^']+)'\)/g)) assert.ok(document.getElementById(match[1]),match[1]);
    for(const el of document.querySelectorAll('[src],link[href]')) {
        const file=el.getAttribute('src')||el.getAttribute('href');assert.ok(!/https?:/.test(file));assert.ok(fs.existsSync(new URL('../'+file,import.meta.url)));
    }
    assert.equal(document.querySelectorAll('.overlay[role="dialog"][aria-modal="true"]').length,document.querySelectorAll('.overlay').length);
});

await env.close();
console.log(`\n${passed} passed; ${failed} failed. DOM and game-logic checks; no real browser or audio engine is simulated.`);
process.exitCode=failed?1:0;