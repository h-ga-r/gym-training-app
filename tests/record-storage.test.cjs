const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const script = readFileSync(join(__dirname, "../js/workoutStore.js"), "utf8");
const key = "gymTrainingApp.workoutData";
const previous = key + ".previous";
const app = (storage) => vm.runInNewContext(script + "\nworkoutStore;", { localStorage: storage });
const data = () => ({
  exerciseMaster: [{ id: "x", name: "テスト種目", bodyPart: "胸", isHidden: true }],
  workoutLogs: [{ date: "2026-07-14", exerciseId: "x", sets: [
    { weight: 15, reps: 8 }, { weight: 20, reps: null, toFailure: true }
  ] }],
  userProfile: { note: "fixture" }, extra: { preserved: true }
});
const file = d => JSON.stringify({ app: "gym-training-app", version: 1, data: d });
function disk(initial) {
  const rows = new Map(initial ? [[key, initial]] : []);
  return { getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, v),
    removeItem: k => rows.delete(k), rows };
}

test("opening/upgrading writes nothing, including for a new installation", () => {
  const blank = disk(); app(blank).read();
  assert.equal(blank.rows.size, 0);
  const raw = JSON.stringify(data(), null, 2);
  const d = disk(raw);
  d.setItem("gymTrainingApp.intervalTimer", "working timer");
  const a = app(d), loaded = a.read();
  assert.equal(loaded.workoutLogs[0].sets.length, 2);
  assert.equal(d.getItem(key), raw);
  assert.equal(d.getItem(previous), null);
  loaded.exerciseMaster[0].isHidden = false;
  a.save(loaded);
  assert.equal(d.getItem(previous), raw);
  const reloaded = app(d).read();
  assert.equal(reloaded.extra.preserved, true);
  assert.equal(reloaded.workoutLogs[0].sets[1].toFailure, true);
  assert.equal(d.getItem("gymTrainingApp.intervalTimer"), "working timer");
});

test("malformed, incomplete, and unknown layouts never become new blank records", () => {
  for (const raw of ["{", "null", "[]", '{"exerciseMaster":[]}', '{"exerciseMaster":[],"workoutLogs":[null]}']) {
    const d = disk(raw), a = app(d);
    assert.throws(() => a.read()); assert.throws(() => a.save(data()));
    assert.equal(d.getItem(key), raw); assert.equal(d.rows.size, 1);
  }
});

test("blocked storage and quota failures leave the last saved record intact", () => {
  const raw = JSON.stringify(data());
  const blocked = disk(raw); blocked.getItem = () => { throw Error("denied"); };
  assert.throws(() => app(blocked).read(), /読み取れません/);
  assert.equal(blocked.rows.get(key), raw);
  for (const failsAt of [previous, key]) {
    const d = disk(raw), a = app(d), edit = a.read();
    const write = d.setItem;
    d.setItem = (k, v) => { if (k === failsAt) throw Error("QuotaExceededError"); write(k, v); };
    edit.userProfile.note = "changed";
    assert.throws(() => a.save(edit), /保存できません/); assert.equal(d.getItem(key), raw);
  }
});

test("a file survives complete local data removal; invalid files cannot be imported", () => {
  const origin = disk(JSON.stringify(data()));
  const exported = app(origin).exportFile();
  origin.rows.clear();
  const fresh = app(origin);
  for (const invalid of ["{}", "null", file({}), exported.replace('"version": 1', '"version": 2')]) {
    assert.throws(() => fresh.parseFile(invalid)); assert.equal(origin.rows.size, 0);
  }
  const p = fresh.preview(fresh.parseFile(exported));
  assert.equal(origin.rows.size, 0); // Cancel by simply not confirming.
  fresh.restore(p);
  assert.deepEqual(JSON.parse(origin.getItem(key)), data());
});

test("import adds only absent sets, keeps local edits, and is repeatable", () => {
  const current = data();
  current.workoutLogs = [{ date: "2026-07-14", exerciseId: "x", setNumber: 2,
    weight: 30, reps: 12, toFailure: false }];
  current.userProfile.note = "newer";
  const d = disk(JSON.stringify(current)), a = app(d);
  const imported = a.parseFile(file(data()));
  const p = a.preview(imported);
  assert.equal(p.before.sets, 1); assert.equal(p.after.sets, 2);
  a.restore(p); a.restore(a.preview(imported));
  const saved = a.read(); assert.equal(saved.workoutLogs.length, 2);
  assert.equal(saved.workoutLogs[0].weight, 30);
  assert.equal(saved.workoutLogs[1].setNumber, 1);
  assert.equal(saved.userProfile.note, "newer");
});

test("missing/damaged primary plus surviving previous copy requires explicit recovery", () => {
  for (const raw of [null, "{unreadable"]) {
    const d = disk(raw), a = app(d), good = JSON.stringify(data());
    d.setItem(previous, good);
    assert.throws(() => a.read()); assert.throws(() => a.save(data()));
    const p = a.preview();
    assert.equal(d.getItem(key), raw);
    a.restore(p); assert.equal(a.read().workoutLogs.length, 1);
    assert.equal(d.getItem(previous), good);
    if (raw !== null) assert.equal(a.damagedSource(), raw);
  }
});

test("a newer write after read or import preview cannot be overwritten by a stale tab", () => {
  const d = disk(JSON.stringify(data())), a = app(d), b = app(d);
  const snapshot = a.read(), p = a.preview(a.parseFile(file(data())));
  const other = b.read(); other.userProfile.note = "newest"; b.save(other);
  assert.throws(() => a.save(snapshot)); assert.throws(() => a.restore(p));
  assert.equal(a.read().userProfile.note, "newest");
});

test("an empty primary from an old release cannot displace a surviving populated copy", () => {
  const blank = JSON.stringify({ exerciseMaster: [], workoutLogs: [], userProfile: {} });
  const good = JSON.stringify(data()), d = disk(blank), a = app(d);
  d.setItem(previous, good);
  assert.throws(() => a.read()); assert.equal(d.getItem(previous), good);
  const other = data(); other.workoutLogs[0].date = "2026-11-10";
  const p = a.preview(a.parseFile(file(other)));
  assert.equal(p.after.sets, 4); a.restore(p);
  assert.equal(d.getItem(previous), good);
  assert.equal(a.read().workoutLogs.length, 2);
});
