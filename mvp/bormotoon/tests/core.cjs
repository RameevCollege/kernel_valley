const assert = require("node:assert/strict");
const C = require("../game-core.js");
const advance = (s, secs) => {
  for (let t = 0; t < secs; t += 0.1) C.tick(s, 0.1);
};
const s = C.create(42);
assert.deepEqual(s, C.create(42), "same seed produces same world");
assert.notDeepEqual(
  s.trees,
  C.create(43).trees,
  "different seed changes perimeter",
);
s.player.x = 1;
s.player.y = 2;
assert.equal(C.move(s, -1, 0), false, "boundary collision");
s.player.x = 4;
s.player.y = 5;
assert.equal(C.move(s, 0, -1), false, "building collision");
const initial = s.credits;
C.build(s, 0, 0, "factory");
assert.equal(s.credits, initial, "invalid placement costs nothing");
// Complete the actual production recipe; one missing belt prevents production.
for (let x = 16; x < 20; x++) C.build(s, x, 9, "belt");
C.build(s, 21, 9, "factory");
assert.equal(C.connected(s), false);
C.build(s, 20, 9, "belt");
assert.equal(C.connected(s), true);
const after = s.credits;
C.build(s, 20, 9, "belt");
assert.equal(s.credits, after, "duplicate rejected");
C.build(s, 20, 9, "erase");
assert.equal(s.credits, after + 2, "demolition refunded");
C.build(s, 20, 9, "belt");
// Kill three bugs through the damage/cooldown mechanism, preventing theft in crop test.
for (const b of s.bugs) {
  s.player.x = b.x - 1;
  s.player.y = b.y;
  for (let i = 0; i < 3; i++) {
    s.attack = 0;
    C.attack(s);
  }
}
assert.equal(s.kills, 3);
s.player.x = 4;
s.player.y = 7;
C.interact(s, 4, 8);
assert.equal(s.plots[0].age, 0);
C.interact(s, 4, 8);
assert.equal(s.harvests, 0);
advance(s, 12.2);
C.interact(s, 4, 8);
assert.equal(s.corn, 2);
assert.equal(s.harvests, 1);
advance(s, 3.2);
assert.equal(s.patches, 1);
assert.equal(s.corn, 0);
assert.equal(C.answer(s, 0, 0), false);
assert.equal(s.patches, 1, "wrong answer consumes no patch");
assert.equal(C.answer(s, 0, 1), true);
assert.equal(s.patches, 0);
assert.equal(C.answer(s, 0, 1), false, "no repeat rewards");
assert.equal(C.buy(s, "helper"), true);
assert.equal(s.helper, true);
const credits = s.credits;
assert.equal(C.buy(s, "helper"), false);
assert.equal(s.credits, credits);
advance(s, 70);
assert.ok(s.produced >= 3, "helper and production automate harvest");
assert.ok(s.patches >= 2);
C.answer(s, 1, 0);
C.answer(s, 2, 2);
assert.equal(C.buy(s, "home"), true);
C.tick(s, 0.1);
assert.equal(s.won, true, "mission can finish with economy");
s.drone[0] = 1;
const saved = C.restore(JSON.stringify(s));
assert.ok(saved);
assert.equal(saved.drone[0], 1);
assert.equal(saved.won, true);
assert.equal(C.restore("{no"), null);
assert.equal(C.restore(JSON.stringify({ ...s, credits: Infinity })), null);
assert.equal(
  C.restore(JSON.stringify({ ...s, player: { ...s.player, x: 999 } })),
  null,
);
assert.equal(
  C.restore(
    JSON.stringify({ ...s, builds: [{ x: 16, y: 9, type: "script" }] }),
  ),
  null,
);
const theft = C.create(9);
theft.plots[0].age = C.GROW;
theft.bugs[0].x = 4;
theft.bugs[0].y = 9;
advance(theft, 1);
assert.equal(theft.plots[0].age, -1, "bugs steal mature corn");
const death = C.create(9);
death.player.hp = 0;
C.tick(death, 0.1);
assert.equal(death.player.hp, 6);
assert.equal(death.player.x, 4);
assert.equal(death.credits, 21);
const attack = C.create(5);
attack.player.x = 11;
attack.player.y = 13;
C.attack(attack);
C.attack(attack);
assert.equal(attack.bugs[0].hp, 2, "attack cooldown");
console.log(
  "PASS: generation, collision, farming, factory connectivity, economy, combat, theft, revival, quests, full win, save validation.",
);
