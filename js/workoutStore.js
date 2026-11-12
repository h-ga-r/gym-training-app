// Keep the original key and payload readable by older releases. Asset versions are unrelated.
const workoutStore = (() => {
  const key = "gymTrainingApp.workoutData";
  const previousKey = key + ".previous";
  const damagedKey = key + ".unreadable";
  const app = "gym-training-app";
  const originals = new WeakMap();
  const empty = () => ({ exerciseMaster: [], workoutLogs: [], userProfile: {} });
  const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const text = (v) => typeof v === "string" && v.length > 0;
  const number = (v) => (typeof v === "number" || (text(v) && v.trim() !== "")) &&
    Number.isFinite(Number(v));
  const count = (v) => number(v) && Number.isInteger(Number(v)) && Number(v) > 0;
  const validSet = (s) => object(s) && number(s.weight) && Number(s.weight) >= 0 &&
    (count(s.reps) || s.reps === null || s.toFailure === true);

  // Accept both historical log shapes. Never rebuild a partial record as empty arrays.
  function valid(d) {
    return object(d) && Array.isArray(d.exerciseMaster) && Array.isArray(d.workoutLogs) &&
      (!("userProfile" in d) || object(d.userProfile)) &&
      d.exerciseMaster.every(e => object(e) && text(e.id) && text(e.name) && text(e.bodyPart)) &&
      d.workoutLogs.every(l => object(l) && text(l.exerciseId) && /^\d{4}-\d{2}-\d{2}$/.test(l.date) &&
        (Array.isArray(l.sets) ? l.sets.every(validSet) : validSet(l) && count(l.setNumber)));
  }

  function decode(raw) {
    try {
      const data = JSON.parse(raw);
      return valid(data) ? data : null;
    } catch { return null; }
  }

  function get(k) {
    try { return localStorage.getItem(k); }
    catch { throw new Error("このブラウザの保存領域を読み取れません。サイトデータを消さず、普段のブラウザで開き直してください。"); }
  }

  function put(k, raw) {
    try { localStorage.setItem(k, raw); }
    catch { throw new Error("保存できませんでした。元の記録は変更していません。保存容量やブラウザの設定を確認してください。"); }
  }

  const blank = d => d && !d.exerciseMaster.length && !d.workoutLogs.length &&
    !Object.keys(d.userProfile || {}).length;
  const looksReset = (current, previous) => blank(current) && previous && !blank(previous);

  function read() {
    const raw = get(key);
    let data = decode(raw);
    if (!data) {
      if (raw !== null || get(previousKey) !== null) {
        throw new Error("記録を正常に読み込めないため、上書きを止めました。「記録のバックアップ・復元」を開いてください。");
      }
      data = empty(); // A new installation remains read-only until an actual save.
    } else if (blank(data) && looksReset(data, decode(get(previousKey)))) {
      throw new Error("現在の記録は空ですが、保存前の控えが残っています。新しく記録する前に復元内容を確認してください。");
    }
    originals.set(data, raw);
    return data;
  }

  function save(data) {
    const raw = get(key);
    if (!valid(data) || !originals.has(data) || originals.get(data) !== raw ||
        (raw === null && get(previousKey) !== null)) {
      throw new Error("記録の状態が変わったため保存していません。画面を開き直して確認してください。");
    }
    const next = JSON.stringify(data);
    if (next === raw) return;
    if (raw !== null) put(previousKey, raw); // If this fails, leave the original intact.
    put(key, next);
    originals.set(data, next);
  }

  function exportFile() {
    const data = read();
    return JSON.stringify({ app, version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
  }

  function parseFile(contents) {
    let file;
    try { file = JSON.parse(contents.replace(/^\uFEFF/, "")); } catch { /* invalid file */ }
    if (!object(file) || file.app !== app || file.version !== 1 || !valid(file.data)) {
      throw new Error("このアプリの対応するバックアップファイルを選んでください。記録は変更していません。");
    }
    return file.data;
  }

  function totals(data) {
    return { exercises: data.exerciseMaster.length,
      sets: data.workoutLogs.reduce((n, l) => n + (Array.isArray(l.sets) ? l.sets.length : 1), 0) };
  }

  // Current values win on collision; importing the same file twice cannot duplicate sets.
  function merge(current, incoming) {
    if (!current) return incoming;
    const result = { ...incoming, ...current,
      userProfile: { ...incoming.userProfile, ...current.userProfile },
      exerciseMaster: [...current.exerciseMaster], workoutLogs: [...current.workoutLogs] };
    const ids = new Set(current.exerciseMaster.map(e => e.id));
    for (const e of incoming.exerciseMaster) {
      if (!ids.has(e.id)) { ids.add(e.id); result.exerciseMaster.push(e); }
    }
    const setId = (log, n) => JSON.stringify([log.date, log.exerciseId, Number(n)]);
    const numbers = l => Array.isArray(l.sets) ? l.sets.map((_, i) => i + 1) : [Number(l.setNumber)];
    const known = new Set();
    for (const l of current.workoutLogs) for (const n of numbers(l)) known.add(setId(l, n));
    for (const l of incoming.workoutLogs) {
      const all = numbers(l);
      const extra = all.filter(n => !known.has(setId(l, n)));
      if (!extra.length) continue;
      if (extra.length === all.length) result.workoutLogs.push(l);
      else {
        // Preserve original set numbers when only part of a historical nested log is missing.
        const { sets, ...meta } = l;
        for (const n of extra) result.workoutLogs.push({ ...meta, ...sets[n - 1],
          date: l.date, exerciseId: l.exerciseId, setNumber: n });
      }
      for (const n of extra) known.add(setId(l, n));
    }
    return result;
  }

  function preview(fileData) {
    const raw = get(key), previous = get(previousKey);
    const current = decode(raw), backup = decode(previous);
    const incoming = fileData ?? backup;
    if (!valid(incoming)) throw new Error("このブラウザに読み込める控えがありません。保存しておいたファイルを選んでください。");
    const base = looksReset(current, backup) ? merge(current, backup) : current || backup;
    const result = merge(base, incoming);
    return { raw, previous, result, before: totals(current || empty()), after: totals(result) };
  }

  function restore(plan) {
    if (get(key) !== plan.raw || get(previousKey) !== plan.previous) {
      throw new Error("確認中に記録が変わりました。もう一度、復元する内容を選んでください。");
    }
    const next = JSON.stringify(plan.result);
    if (next === plan.raw) return;
    if (plan.raw !== null) {
      // On explicit recovery preserve unreadable source bytes separately from the good copy.
      const current = decode(plan.raw);
      if (!current) put(damagedKey, plan.raw);
      else if (!looksReset(current, decode(plan.previous))) put(previousKey, plan.raw);
    }
    put(key, next);
  }

  function damagedSource() {
    const raw = get(key);
    return raw !== null && !decode(raw) ? raw : get(damagedKey);
  }

  return { read, save, exportFile, parseFile, preview, restore, damagedSource };
})();
