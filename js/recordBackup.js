function showRecordProblem(message) {
  document.getElementById("record-problem-text").textContent = message;
  document.getElementById("record-problem").hidden = false;
}

(() => {
  const el = id => document.getElementById(id);
  const panel = el("record-backup");
  const picker = el("record-import");
  const message = el("record-message");
  let plan = null;
  let selection = 0;

  function cancelPreview() {
    selection += 1;
    plan = null;
    picker.value = "";
    el("record-preview").hidden = true;
    message.textContent = "";
  }

  function preview(candidate) {
    plan = candidate;
    const counts = t => t.exercises + "種目・" + t.sets + "セット";
    el("record-counts").textContent = "現在：" + counts(plan.before) + " ／ 復元後：" + counts(plan.after);
    el("record-preview").hidden = false;
    el("record-confirm").focus();
  }

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name + "-" + new Date().toISOString().slice(0, 10);
    link.download += type === "application/json" ? ".json" : ".txt";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  el("open-record-tools").addEventListener("click", () => {
    document.querySelector('[data-screen-target="home"]').click();
    panel.open = true;
    panel.scrollIntoView({ block: "start" });
  });
  panel.addEventListener("toggle", () => {
    if (!panel.open) { cancelPreview(); return; }
    try { el("record-raw").hidden = workoutStore.damagedSource() === null; }
    catch (error) { message.textContent = error.message; }
  });
  el("record-export").addEventListener("click", () => {
    try {
      download(workoutStore.exportFile(), "gym-records", "application/json");
      message.textContent = "保存先を確認してください。iPhoneでは「ファイル」に保存できます。";
    } catch (error) { message.textContent = error.message; }
  });
  el("record-raw").addEventListener("click", () => {
    try {
      const raw = workoutStore.damagedSource();
      if (raw !== null) download(raw, "gym-records-recovery", "text/plain");
    } catch (error) { message.textContent = error.message; }
  });
  picker.addEventListener("change", async () => {
    const file = picker.files[0];
    cancelPreview();
    const selected = selection;
    if (!file) return;
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error("このファイルは大きすぎます。記録は変更していません。");
      const contents = await file.text();
      if (selection === selected) preview(workoutStore.preview(workoutStore.parseFile(contents)));
    } catch (error) { if (selection === selected) message.textContent = error.message; }
  });
  el("record-previous").addEventListener("click", () => {
    cancelPreview();
    try { preview(workoutStore.preview()); }
    catch (error) { message.textContent = error.message; }
  });
  el("record-cancel").addEventListener("click", cancelPreview);
  el("record-confirm").addEventListener("click", () => {
    if (!plan) return;
    try {
      workoutStore.restore(plan);
      cancelPreview();
      el("record-problem").hidden = true;
      window.initializeHome();
      message.textContent = "復元しました。ホームとカレンダーで記録を確認できます。";
    } catch (error) { cancelPreview(); message.textContent = error.message; }
  });
})();
