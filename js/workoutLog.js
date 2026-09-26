const WORKOUT_STORAGE_KEY = "gymTrainingApp.workoutData";
const ENTRY_DRAFT_KEY = "gymTrainingApp.entryDraft";
const BODY_PARTS = ["胸", "背中", "脚", "肩", "腕", "腹", "有酸素", "その他"];
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

let workoutScreen;
let workoutContent;
let workoutStatus;
let homeScreen;
let selectedBodyPart = null;
let selectedExerciseId = null;
let selectedWorkoutDate = null;
let navigationSource = "home";
let isWorkoutLogInitialized = false;
let isHomeInitialized = false;
let displayedCalendarYear;
let displayedCalendarMonth;

function createEmptyWorkoutData() {
  return {
    exerciseMaster: [],
    workoutLogs: [],
    userProfile: {},
  };
}

function readWorkoutData() {
  try {
    const savedData = JSON.parse(localStorage.getItem(WORKOUT_STORAGE_KEY));

    if (savedData && typeof savedData === "object") {
      return {
        exerciseMaster: Array.isArray(savedData.exerciseMaster)
          ? savedData.exerciseMaster
          : [],
        workoutLogs: Array.isArray(savedData.workoutLogs)
          ? savedData.workoutLogs
          : [],
        userProfile:
          savedData.userProfile &&
          typeof savedData.userProfile === "object" &&
          !Array.isArray(savedData.userProfile)
            ? savedData.userProfile
            : {},
      };
    }
  } catch {
    // 壊れた保存データは初期状態に戻す。
  }

  const emptyData = createEmptyWorkoutData();
  saveWorkoutData(emptyData);
  return emptyData;
}

function saveWorkoutData(data) {
  localStorage.setItem(WORKOUT_STORAGE_KEY, JSON.stringify(data));
}

function createId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateString, amount) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + amount);
  return getLocalDateString(date);
}

function daysBetween(fromDate, toDate) {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatDisplayDate(dateString) {
  const date = parseLocalDate(dateString);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDaysAgo(days) {
  if (days === 0) {
    return "今日";
  }

  if (days === 1) {
    return "1日前";
  }

  return `${days}日前`;
}

function getMondayOfWeek(dateString) {
  const date = parseLocalDate(dateString);
  const weekday = date.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - offset);
  return getLocalDateString(date);
}

function setWorkoutStatus(message, isError = false) {
  workoutStatus.textContent = message;
  workoutStatus.classList.toggle("app-status--error", isError);
}

function createButton(label, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function formatCalendarDate(year, month, day) {
  return [
    String(year),
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function getExerciseMap(data) {
  return new Map(data.exerciseMaster.map((exercise) => [exercise.id, exercise]));
}

function expandLogSets(log) {
  if (Array.isArray(log.sets)) {
    return log.sets.map((set, index) => ({
      ...set,
      setNumber: index + 1,
      date: log.date,
      exerciseId: log.exerciseId,
    }));
  }

  return [log];
}

function getBodyPartsForDate(date, data) {
  const exerciseMap = getExerciseMap(data);

  return [
    ...new Set(
      data.workoutLogs
        .filter((log) => log.date === date)
        .map((log) => exerciseMap.get(log.exerciseId)?.bodyPart)
        .filter(Boolean),
    ),
  ];
}

function getRecordedSets(data, date, exerciseId) {
  return data.workoutLogs
    .filter((log) => log.date === date && log.exerciseId === exerciseId)
    .flatMap(expandLogSets)
    .sort((a, b) => (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0));
}

function getPreviousExerciseDate(data, exerciseId, today) {
  const dates = [
    ...new Set(
      data.workoutLogs
        .filter((log) => log.exerciseId === exerciseId && log.date < today)
        .map((log) => log.date),
    ),
  ].sort();

  return dates.at(-1) ?? null;
}

function getLatestDateBefore(data, today) {
  const dates = [
    ...new Set(data.workoutLogs.map((log) => log.date).filter((date) => date < today)),
  ].sort();

  return dates.at(-1) ?? null;
}

function countTodayLogs(data, today) {
  const todayLogs = data.workoutLogs.filter((log) => log.date === today);
  const exerciseIds = new Set(todayLogs.map((log) => log.exerciseId));
  return {
    setCount: todayLogs.flatMap(expandLogSets).length,
    exerciseCount: exerciseIds.size,
  };
}

function getLastDateByBodyPart(data) {
  const exerciseMap = getExerciseMap(data);
  const lastDates = new Map();

  data.workoutLogs.forEach((log) => {
    const bodyPart = exerciseMap.get(log.exerciseId)?.bodyPart;

    if (!bodyPart) {
      return;
    }

    const current = lastDates.get(bodyPart);
    if (!current || log.date > current) {
      lastDates.set(bodyPart, log.date);
    }
  });

  return lastDates;
}

function getWeekTrainingDays(data, today) {
  const weekStart = getMondayOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const trainedDates = [
    ...new Set(
      data.workoutLogs
        .map((log) => log.date)
        .filter((date) => date >= weekStart && date <= weekEnd && date <= today),
    ),
  ].sort();

  return { weekStart, weekEnd, trainedDates };
}

function formatSetLine(set) {
  const reps = set.toFailure || set.reps === null ? "限界まで" : `${set.reps}回`;
  return `${set.setNumber}セット目：${set.weight}kg × ${reps}`;
}

function readEntryDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(ENTRY_DRAFT_KEY));

    if (
      draft &&
      typeof draft.exerciseId === "string" &&
      typeof draft.date === "string"
    ) {
      return draft;
    }
  } catch {
    // 下書きが壊れていても記録データには触れない。
  }

  return null;
}

function saveEntryDraft(draft) {
  sessionStorage.setItem(ENTRY_DRAFT_KEY, JSON.stringify(draft));
}

function clearEntryDraft() {
  sessionStorage.removeItem(ENTRY_DRAFT_KEY);
}

function suggestedWeight(todaySets, previousSets, setNumber) {
  if (todaySets.length > 0) {
    const latestToday = [...todaySets].sort(
      (a, b) =>
        (Number(b.recordedAt) || 0) - (Number(a.recordedAt) || 0) ||
        (Number(b.setNumber) || 0) - (Number(a.setNumber) || 0),
    )[0];

    if (Number.isFinite(Number(latestToday.weight))) {
      return String(latestToday.weight);
    }
  }

  const sameNumber = previousSets.find(
    (set) => Number(set.setNumber) === Number(setNumber),
  );
  if (Number.isFinite(Number(sameNumber?.weight))) {
    return String(sameNumber.weight);
  }

  const lastPrevious = previousSets.at(-1);
  if (Number.isFinite(Number(lastPrevious?.weight))) {
    return String(lastPrevious.weight);
  }

  return "";
}

function navigateToHome() {
  document.dispatchEvent(
    new CustomEvent("app:navigate", {
      detail: { screenName: "home", source: "workout" },
    }),
  );
}

function startTodayWorkout() {
  if (!ensureWorkoutLogInitialized()) {
    return;
  }

  selectedWorkoutDate = getLocalDateString();
  navigationSource = "home";
  renderBodyPartSelection();
}

function openWorkoutCalendar() {
  if (!ensureWorkoutLogInitialized()) {
    return;
  }

  navigationSource = "calendar";
  renderCalendar();
}

function openDailyRecords(date, { from = "calendar" } = {}) {
  if (!ensureWorkoutLogInitialized() || typeof date !== "string") {
    return;
  }

  navigationSource = from;
  displayedCalendarYear = parseLocalDate(date).getFullYear();
  displayedCalendarMonth = parseLocalDate(date).getMonth();
  renderDailyRecords(date);
}

function renderCalendar(year = new Date().getFullYear(), month = new Date().getMonth()) {
  displayedCalendarYear = year;
  displayedCalendarMonth = month;
  selectedBodyPart = null;
  selectedExerciseId = null;
  workoutContent.replaceChildren();
  setWorkoutStatus("振り返りたい日付を選んでください");

  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const navigation = document.createElement("div");
  navigation.className = "workout-log__calendar-navigation";

  const previousButton = createButton("← 前月", () => {
    const previousMonth = new Date(year, month - 1, 1);
    renderCalendar(previousMonth.getFullYear(), previousMonth.getMonth());
  });
  const heading = document.createElement("h2");
  heading.textContent = `${year}年${month + 1}月`;
  const nextButton = createButton("次月 →", () => {
    const nextMonth = new Date(year, month + 1, 1);
    renderCalendar(nextMonth.getFullYear(), nextMonth.getMonth());
  });
  nextButton.disabled = isCurrentMonth;
  navigation.append(previousButton, heading, nextButton);

  const calendar = document.createElement("div");
  calendar.className = "workout-log__calendar";
  ["日", "月", "火", "水", "木", "金", "土"].forEach((weekday) => {
    const weekdayLabel = document.createElement("div");
    weekdayLabel.className = "workout-log__weekday";
    weekdayLabel.textContent = weekday;
    calendar.append(weekdayLabel);
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const data = readWorkoutData();
  const todayString = getLocalDateString();

  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement("div");
    blank.className = "workout-log__calendar-blank";
    calendar.append(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = formatCalendarDate(year, month, day);
    const bodyParts = getBodyPartsForDate(date, data);
    const dateButton = createButton(
      String(day),
      () => {
        if (date === todayString) {
          selectedWorkoutDate = date;
          navigationSource = "calendar";
          renderBodyPartSelection();
        } else {
          renderDailyRecords(date);
        }
      },
      "workout-log__calendar-day",
    );

    if (date === todayString) {
      dateButton.classList.add("workout-log__calendar-day--today");
      dateButton.setAttribute("aria-label", `${day}日 今日 記録する`);
    }

    if (bodyParts.length > 0) {
      const labels = document.createElement("span");
      labels.className = "workout-log__body-part-labels";
      labels.textContent = bodyParts.join("・");
      dateButton.append(labels);
    }

    calendar.append(dateButton);
  }

  workoutContent.append(navigation, calendar);
}

function renderDailyRecords(date) {
  workoutContent.replaceChildren();
  setWorkoutStatus(
    date === getLocalDateString()
      ? "今日の記録です。追加する場合は種目を選び直してください"
      : "この日は閲覧専用です",
  );

  const backButton = createButton(
    navigationSource === "home" ? "← ホームへ戻る" : "← カレンダーへ戻る",
    () => {
      if (navigationSource === "home") {
        navigateToHome();
      } else {
        renderCalendar(displayedCalendarYear, displayedCalendarMonth);
      }
    },
    "workout-log__back",
  );
  const heading = document.createElement("h2");
  heading.textContent = `${date.replaceAll("-", "/")}の記録`;
  const records = document.createElement("div");
  records.className = "workout-log__daily-records";

  const data = readWorkoutData();
  const logs = data.workoutLogs.filter((log) => log.date === date);
  const exerciseMap = getExerciseMap(data);
  const logsByExercise = new Map();

  logs.forEach((log) => {
    const exerciseLogs = logsByExercise.get(log.exerciseId) ?? [];
    exerciseLogs.push(log);
    logsByExercise.set(log.exerciseId, exerciseLogs);
  });

  if (logsByExercise.size === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "この日のトレーニング記録はありません。";
    records.append(emptyMessage);
  }

  logsByExercise.forEach((exerciseLogs, exerciseId) => {
    const exercise = exerciseMap.get(exerciseId);
    const section = document.createElement("section");
    section.className = "workout-log__daily-exercise";
    const exerciseHeading = document.createElement("h3");
    exerciseHeading.textContent = exercise
      ? `${exercise.name}（${exercise.bodyPart}）`
      : "不明な種目";
    const setList = document.createElement("ol");
    setList.className = "workout-log__daily-sets";
    exerciseLogs
      .flatMap(expandLogSets)
      .sort((a, b) => (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0))
      .forEach((set) => {
        const item = document.createElement("li");
        item.textContent = formatSetLine(set);
        setList.append(item);
      });
    section.append(exerciseHeading, setList);
    records.append(section);
  });

  workoutContent.append(backButton, heading, records);
}

function renderBodyPartSelection() {
  selectedBodyPart = null;
  selectedExerciseId = null;
  workoutContent.replaceChildren();
  setWorkoutStatus("部位を選択してください");

  const heading = document.createElement("h2");
  heading.textContent = "部位を選択";
  const backButton = createButton(
    navigationSource === "calendar" ? "← カレンダーへ戻る" : "← ホームへ戻る",
    () => {
      if (navigationSource === "calendar") {
        renderCalendar(new Date().getFullYear(), new Date().getMonth());
      } else {
        navigateToHome();
      }
    },
    "workout-log__back",
  );
  const bodyPartList = document.createElement("div");
  bodyPartList.className = "workout-log__body-parts";

  BODY_PARTS.forEach((bodyPart) => {
    bodyPartList.append(
      createButton(
        bodyPart,
        () => renderExerciseSelection(bodyPart),
        "workout-log__body-part-button",
      ),
    );
  });

  workoutContent.append(backButton, heading, bodyPartList);
}

function renderAddExerciseForm(bodyPart) {
  workoutContent.replaceChildren();
  setWorkoutStatus("新しい種目名を入力してください");

  const heading = document.createElement("h2");
  heading.textContent = "新規種目を追加";
  const selectedPart = document.createElement("p");
  selectedPart.className = "workout-log__selected-body-part";
  selectedPart.textContent = `選択中の部位：${bodyPart}`;
  const form = document.createElement("form");
  form.className = "workout-log__add-form";
  const nameLabel = document.createElement("label");
  nameLabel.className = "workout-log__field";
  const nameLabelText = document.createElement("span");
  nameLabelText.textContent = "種目名";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.required = true;
  nameInput.maxLength = 100;
  nameInput.autocomplete = "off";
  nameLabel.append(nameLabelText, nameInput);

  const actions = document.createElement("div");
  actions.className = "workout-log__add-form-actions";
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "workout-log__add-button";
  submitButton.textContent = "追加";
  const cancelButton = createButton(
    "キャンセル",
    () => renderExerciseSelection(bodyPart),
    "workout-log__cancel-add-button",
  );

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();

    if (!name) {
      setWorkoutStatus("空白だけの種目名は登録できません", true);
      nameInput.focus();
      return;
    }

    const data = readWorkoutData();
    data.exerciseMaster.push({
      id: createId(),
      name,
      bodyPart,
      lastUsedAt: 0,
      isHidden: false,
    });
    saveWorkoutData(data);
    renderExerciseSelection(bodyPart);
    setWorkoutStatus(`「${name}」を追加しました`);
  });

  actions.append(submitButton, cancelButton);
  form.append(nameLabel, actions);
  workoutContent.append(heading, selectedPart, form);
  nameInput.focus();
}

function hideExercise(exerciseId, bodyPart) {
  const data = readWorkoutData();
  const exercise = data.exerciseMaster.find((item) => item.id === exerciseId);

  if (!exercise || !window.confirm(`「${exercise.name}」を一覧から削除しますか？`)) {
    return;
  }

  exercise.isHidden = true;
  saveWorkoutData(data);
  renderExerciseSelection(bodyPart);
  setWorkoutStatus(`「${exercise.name}」を一覧から削除しました`);
}

function renderExerciseSelection(bodyPart) {
  selectedBodyPart = bodyPart;
  selectedExerciseId = null;
  workoutContent.replaceChildren();
  setWorkoutStatus(`${bodyPart}の種目を選択してください`);

  const heading = document.createElement("h2");
  heading.textContent = `${bodyPart}の種目`;
  const backButton = createButton(
    "← 部位選択へ戻る",
    renderBodyPartSelection,
    "workout-log__back",
  );
  const exerciseList = document.createElement("div");
  exerciseList.className = "workout-log__exercise-list";
  const exercises = readWorkoutData()
    .exerciseMaster.filter(
      (exercise) => exercise.bodyPart === bodyPart && !exercise.isHidden,
    )
    .sort((a, b) => (Number(b.lastUsedAt) || 0) - (Number(a.lastUsedAt) || 0));

  if (exercises.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "app-muted";
    emptyMessage.textContent = "登録済みの種目はありません。";
    exerciseList.append(emptyMessage);
  }

  exercises.forEach((exercise) => {
    const row = document.createElement("div");
    row.className = "workout-log__exercise-row";
    row.append(
      createButton(
        exercise.name,
        () => renderWorkoutEntry(exercise.id),
        "workout-log__exercise-button",
      ),
      createButton(
        "削除",
        () => hideExercise(exercise.id, bodyPart),
        "workout-log__delete-button",
      ),
    );
    exerciseList.append(row);
  });

  const addButton = createButton(
    "新規種目を追加",
    () => renderAddExerciseForm(bodyPart),
    "workout-log__add-button",
  );
  workoutContent.append(backButton, heading, exerciseList, addButton);
}

function createNumberInput(labelText, options) {
  const label = document.createElement("label");
  label.className = "workout-log__field";
  const labelName = document.createElement("span");
  labelName.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  Object.entries(options).forEach(([key, value]) => {
    input[key] = value;
  });
  label.append(labelName, input);
  return { label, input };
}

function createSelect(labelText, choices, selectedValue) {
  const label = document.createElement("label");
  label.className = "workout-log__field";
  const labelName = document.createElement("span");
  labelName.textContent = labelText;
  const select = document.createElement("select");
  choices.forEach(({ value, label: optionLabel }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = optionLabel;
    select.append(option);
  });
  select.value = selectedValue;
  label.append(labelName, select);
  return { label, select };
}

function createSetList(title, sets, emptyText) {
  const section = document.createElement("section");
  section.className =
    title.startsWith("今日") ? "workout-log__recorded-sets" : "workout-log__previous-sets";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);

  if (sets.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "app-muted";
    emptyMessage.textContent = emptyText;
    section.append(emptyMessage);
    return section;
  }

  const list = document.createElement("ol");
  sets.forEach((set) => {
    const item = document.createElement("li");
    item.textContent = formatSetLine(set);
    list.append(item);
  });
  section.append(list);
  return section;
}

function startWorkoutRest(workoutDate, exerciseId) {
  if (workoutDate !== getLocalDateString()) {
    renderCalendar();
    setWorkoutStatus("日付が変わったため、カレンダーから今日を選び直してください", true);
    return;
  }

  const exercise = readWorkoutData().exerciseMaster.find(
    (item) => item.id === exerciseId && !item.isHidden,
  );

  if (!exercise) {
    renderCalendar();
    setWorkoutStatus("種目が見つからないため休憩を開始できません", true);
    return;
  }

  if (!window.prepareWorkoutRestTimer?.({ date: workoutDate, exerciseId })) {
    setWorkoutStatus("休憩タイマーの準備に失敗しました", true);
    return;
  }

  document.dispatchEvent(
    new CustomEvent("app:navigate", {
      detail: {
        screenName: "timer",
        source: "workout-rest",
      },
    }),
  );
}

function renderWorkoutEntry(exerciseId, { showPostSaveActions = false } = {}) {
  const data = readWorkoutData();
  const exercise = data.exerciseMaster.find(
    (item) => item.id === exerciseId && !item.isHidden,
  );

  if (!exercise) {
    renderExerciseSelection(selectedBodyPart);
    setWorkoutStatus("種目が見つかりませんでした", true);
    return;
  }

  const workoutDate = selectedWorkoutDate ?? getLocalDateString();

  if (workoutDate !== getLocalDateString()) {
    renderCalendar();
    setWorkoutStatus("日付が変わったため、カレンダーから今日を選び直してください", true);
    return;
  }

  const recordedSets = getRecordedSets(data, workoutDate, exerciseId);
  const previousDate = getPreviousExerciseDate(data, exerciseId, workoutDate);
  const previousSets = previousDate
    ? getRecordedSets(data, previousDate, exerciseId)
    : [];
  selectedExerciseId = exerciseId;
  workoutContent.replaceChildren();
  setWorkoutStatus("1セット分の重量と回数を入力してください");

  const backButton = createButton(
    "← 種目選択へ戻る",
    () => renderExerciseSelection(exercise.bodyPart),
    "workout-log__back",
  );
  const heading = document.createElement("h2");
  heading.textContent = exercise.name;

  workoutContent.append(
    backButton,
    heading,
    createSetList(
      previousDate
        ? `前回（${formatDisplayDate(previousDate)}）`
        : "前回の記録",
      previousSets,
      "前回の記録はまだありません。今日の内容から記録できます。",
    ),
    createSetList("今日の記録", recordedSets, "まだ今日の記録はありません。"),
  );

  const recordedSetNumbers = new Set(
    recordedSets
      .map((set) => Number(set.setNumber))
      .filter((setNumber) => Number.isInteger(setNumber) && setNumber >= 1 && setNumber <= 10),
  );
  const hasRecordedAllSets = recordedSetNumbers.size === 10;

  if (hasRecordedAllSets) {
    const completeMessage = document.createElement("p");
    completeMessage.className = "workout-log__complete";
    completeMessage.textContent = "1〜10セット目まですべて記録済みです。";
    workoutContent.append(completeMessage);
    setWorkoutStatus("この種目は10セットの上限に到達しました");
    return;
  }

  if (showPostSaveActions) {
    const actions = document.createElement("section");
    actions.className = "workout-log__post-save-actions";
    const actionHeading = document.createElement("h3");
    actionHeading.textContent = "次の操作";
    actions.append(
      actionHeading,
      createButton(
        "休憩する",
        () => startWorkoutRest(workoutDate, exerciseId),
        "workout-log__rest-button",
      ),
      createButton(
        "休憩せず続けて記録",
        () => renderWorkoutEntry(exerciseId),
        "workout-log__continue-button",
      ),
    );
    workoutContent.append(actions);
    return;
  }

  const setNumberChoices = Array.from({ length: 10 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1}セット目`,
  }));
  const firstUnusedSetNumber =
    setNumberChoices.find(({ value }) => !recordedSetNumbers.has(Number(value)))
      ?.value ?? "10";
  const draft = readEntryDraft();
  const canUseDraft =
    draft?.exerciseId === exerciseId &&
    draft.date === workoutDate &&
    !recordedSetNumbers.has(Number(draft.setNumber));
  const initialSetNumber = canUseDraft
    ? String(draft.setNumber)
    : firstUnusedSetNumber;
  const initialWeight = canUseDraft && draft.weight !== ""
    ? String(draft.weight)
    : suggestedWeight(recordedSets, previousSets, initialSetNumber);
  const initialReps = canUseDraft && draft.reps ? String(draft.reps) : "10";

  const { label: setNumberLabel, select: setNumberInput } = createSelect(
    "何セット目か",
    setNumberChoices,
    initialSetNumber,
  );
  const { label: weightLabel, input: weightInput } = createNumberInput("重量 (kg)", {
    min: "0",
    step: "0.1",
    required: true,
    value: initialWeight,
    inputMode: "decimal",
  });
  const repChoices = ["3", "5", "6", "9", "10", "12", "15", "18", "20"].map(
    (value) => ({ value, label: value }),
  );
  repChoices.push({ value: "failure", label: "限界まで" });
  const { label: repsLabel, select: repsInput } = createSelect(
    "回数",
    repChoices,
    initialReps,
  );

  let lastSuggestedWeight = initialWeight;
  const persistDraft = () => {
    saveEntryDraft({
      exerciseId,
      date: workoutDate,
      setNumber: setNumberInput.value,
      weight: weightInput.value,
      reps: repsInput.value,
    });
  };

  setNumberInput.addEventListener("change", () => {
    const nextSuggestion = suggestedWeight(
      recordedSets,
      previousSets,
      setNumberInput.value,
    );
    if (weightInput.value === "" || weightInput.value === lastSuggestedWeight) {
      weightInput.value = nextSuggestion;
      lastSuggestedWeight = nextSuggestion;
    }
    persistDraft();
  });
  weightInput.addEventListener("input", persistDraft);
  repsInput.addEventListener("change", persistDraft);

  const form = document.createElement("form");
  form.className = "workout-log__form";
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "workout-log__save-button";
  submitButton.textContent = "1セットを保存";

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    const setNumber = Number(setNumberInput.value);
    const weight = Number(weightInput.value);
    const repsValue = repsInput.value;
    const toFailure = repsValue === "failure";
    const reps = toFailure ? null : Number(repsValue);

    if (
      !Number.isInteger(setNumber) ||
      setNumber < 1 ||
      setNumber > 10 ||
      !Number.isFinite(weight) ||
      weight < 0 ||
      (!toFailure &&
        (!Number.isInteger(reps) || ![3, 5, 6, 9, 10, 12, 15, 18, 20].includes(reps)))
    ) {
      setWorkoutStatus("セット、重量、回数を正しく入力してください", true);
      return;
    }

    if (workoutDate !== getLocalDateString()) {
      renderCalendar();
      setWorkoutStatus("日付が変わったため保存しませんでした。今日を選び直してください", true);
      return;
    }

    const latestData = readWorkoutData();
    const latestExercise = latestData.exerciseMaster.find(
      (item) => item.id === selectedExerciseId && !item.isHidden,
    );

    if (!latestExercise) {
      renderExerciseSelection(exercise.bodyPart);
      setWorkoutStatus("種目が見つからないため保存できませんでした", true);
      return;
    }

    if (
      getRecordedSets(latestData, workoutDate, latestExercise.id).some(
        (set) => Number(set.setNumber) === setNumber,
      )
    ) {
      setWorkoutStatus(`${setNumber}セット目はすでに記録されています`, true);
      return;
    }

    latestData.workoutLogs.push({
      date: workoutDate,
      exerciseId: latestExercise.id,
      setNumber,
      weight,
      reps,
      toFailure,
      recordedAt: Date.now(),
    });
    latestExercise.lastUsedAt = Date.now();
    saveWorkoutData(latestData);
    clearEntryDraft();
    renderWorkoutEntry(latestExercise.id, { showPostSaveActions: true });
    setWorkoutStatus(`${setNumber}セット目を保存しました`);
  });

  form.append(setNumberLabel, weightLabel, repsLabel, submitButton);
  workoutContent.append(form);
  persistDraft();
}

function renderHome() {
  const today = getLocalDateString();
  const data = readWorkoutData();
  const previousDate = getLatestDateBefore(data, today);
  const todayCounts = countTodayLogs(data, today);
  const lastDates = getLastDateByBodyPart(data);
  const week = getWeekTrainingDays(data, today);

  homeScreen.replaceChildren();
  const heading = document.createElement("h1");
  heading.textContent = "ホーム";
  homeScreen.append(heading);

  const previousCard = document.createElement("section");
  previousCard.className = "app-card";
  const previousHeading = document.createElement("h2");
  previousHeading.textContent = "前回のトレーニング";
  previousCard.append(previousHeading);

  if (!previousDate) {
    const empty = document.createElement("p");
    empty.className = "app-muted";
    empty.textContent = "まだ過去の記録はありません。今日の内容から残せます。";
    previousCard.append(empty);
  } else {
    const daysAgo = daysBetween(previousDate, today);
    const parts = getBodyPartsForDate(previousDate, data);
    const summary = document.createElement("p");
    summary.className = "home-meta";
    const dateChip = document.createElement("span");
    dateChip.className = "home-chip";
    dateChip.textContent = formatDisplayDate(previousDate);
    const agoChip = document.createElement("span");
    agoChip.className = "home-chip";
    agoChip.textContent = formatDaysAgo(daysAgo);
    summary.append(dateChip, agoChip);
    const partText = document.createElement("p");
    partText.textContent = parts.length > 0 ? `部位：${parts.join("・")}` : "部位：記録あり";
    previousCard.append(
      summary,
      partText,
      createButton(
        "内容を見る",
        () => {
          document.dispatchEvent(
            new CustomEvent("app:navigate", {
              detail: {
                screenName: "workout-log",
                source: "view-date",
                returnContext: { date: previousDate },
              },
            }),
          );
        },
        "app-secondary",
      ),
    );
  }

  homeScreen.append(previousCard);

  if (todayCounts.setCount > 0) {
    const todayCard = document.createElement("section");
    todayCard.className = "app-card";
    const todayHeading = document.createElement("h2");
    todayHeading.textContent = "今日の記録";
    const todayText = document.createElement("p");
    todayText.textContent = `${todayCounts.exerciseCount}種目・${todayCounts.setCount}セットを記録済みです。`;
    todayCard.append(todayHeading, todayText);
    homeScreen.append(todayCard);
  }

  const ctaWrap = document.createElement("div");
  ctaWrap.className = "home-cta";
  ctaWrap.append(
    createButton(
      todayCounts.setCount > 0 ? "今日のトレーニングを続ける" : "今日のトレーニングを始める",
      () => {
        document.dispatchEvent(
          new CustomEvent("app:navigate", {
            detail: { screenName: "workout-log", source: "home-start" },
          }),
        );
      },
      "app-primary",
    ),
  );
  homeScreen.append(ctaWrap);

  const bodyCard = document.createElement("section");
  bodyCard.className = "app-card";
  const bodyHeading = document.createElement("h2");
  bodyHeading.textContent = "部位ごとの最終記録";
  const note = document.createElement("p");
  note.className = "app-muted";
  note.textContent = "最後に記録した日から数えています。回復の目安ではなく、振り返り用です。";
  const list = document.createElement("div");
  list.className = "home-body-parts";
  BODY_PARTS.forEach((bodyPart) => {
    const row = document.createElement("div");
    row.className = "home-body-part";
    const name = document.createElement("span");
    name.textContent = bodyPart;
    const value = document.createElement("span");
    const lastDate = lastDates.get(bodyPart);
    if (!lastDate) {
      value.textContent = "未記録";
    } else {
      value.textContent = `${formatDisplayDate(lastDate)}（${formatDaysAgo(daysBetween(lastDate, today))}）`;
    }
    row.append(name, value);
    list.append(row);
  });
  bodyCard.append(bodyHeading, note, list);
  homeScreen.append(bodyCard);

  const weekCard = document.createElement("section");
  weekCard.className = "app-card";
  const weekHeading = document.createElement("h2");
  weekHeading.textContent = "今週の取り組み";
  const weekText = document.createElement("p");
  weekText.textContent = `月曜からの1週間で、${week.trainedDates.length}日トレーニングしています。`;
  const weekdays = document.createElement("div");
  weekdays.className = "home-weekdays";
  WEEKDAY_LABELS.forEach((label, index) => {
    const date = addDays(week.weekStart, index);
    const item = document.createElement("div");
    const trained = week.trainedDates.includes(date);
    item.className = trained ? "home-weekday home-weekday--done" : "home-weekday";
    item.append(label);
    const mark = document.createElement("small");
    mark.textContent = trained ? "実施" : "—";
    item.append(mark);
    weekdays.append(item);
  });
  weekCard.append(weekHeading, weekText, weekdays);
  homeScreen.append(weekCard);

  const calendarCard = document.createElement("section");
  calendarCard.className = "app-card";
  const calendarHeading = document.createElement("h2");
  calendarHeading.textContent = "カレンダー";
  const calendarText = document.createElement("p");
  calendarText.className = "app-muted";
  calendarText.textContent = "過去の記録を日付から振り返ります。";
  calendarCard.append(
    calendarHeading,
    calendarText,
    createButton(
      "カレンダーを開く",
      () => {
        document.dispatchEvent(
          new CustomEvent("app:navigate", {
            detail: { screenName: "calendar", source: "home" },
          }),
        );
      },
      "app-secondary",
    ),
  );
  homeScreen.append(calendarCard);
}

function ensureWorkoutLogInitialized() {
  if (isWorkoutLogInitialized) {
    return true;
  }

  workoutScreen = document.querySelector("#workout-log-screen");

  if (!workoutScreen) {
    return false;
  }

  isWorkoutLogInitialized = true;
  readWorkoutData();
  workoutScreen.replaceChildren();
  workoutScreen.classList.add("app-screen", "workout-log");
  const heading = document.createElement("h1");
  heading.textContent = "トレーニング記録";
  workoutStatus = document.createElement("p");
  workoutStatus.className = "app-status";
  workoutStatus.setAttribute("role", "status");
  workoutContent = document.createElement("div");
  workoutScreen.append(heading, workoutStatus, workoutContent);
  return true;
}

function initializeHome() {
  homeScreen = document.querySelector("#home-screen");

  if (!homeScreen) {
    return;
  }

  homeScreen.classList.add("app-screen", "home");
  isHomeInitialized = true;
  readWorkoutData();
  renderHome();
}

function initializeWorkoutLog() {
  startTodayWorkout();
}

function resumeWorkoutAfterRest(returnContext) {
  if (!ensureWorkoutLogInitialized()) {
    return;
  }

  if (
    !returnContext ||
    typeof returnContext.date !== "string" ||
    typeof returnContext.exerciseId !== "string"
  ) {
    renderCalendar();
    setWorkoutStatus("タイマーが終了しました。カレンダーから記録を選択してください");
    return;
  }

  if (returnContext.date !== getLocalDateString()) {
    renderCalendar();
    setWorkoutStatus("日付が変わったため、次セット画面には復帰しませんでした", true);
    return;
  }

  const exercise = readWorkoutData().exerciseMaster.find(
    (item) => item.id === returnContext.exerciseId,
  );

  if (!exercise || exercise.isHidden) {
    renderCalendar();
    setWorkoutStatus(
      exercise
        ? "対象の種目が非表示のため、次セット画面には復帰しませんでした"
        : "対象の種目が見つからないため、次セット画面には復帰しませんでした",
      true,
    );
    return;
  }

  selectedWorkoutDate = returnContext.date;
  selectedBodyPart = exercise.bodyPart;
  navigationSource = "home";
  renderWorkoutEntry(exercise.id);
  setWorkoutStatus("休憩が終了しました。次のセットを記録できます");
}

window.initializeHome = initializeHome;
window.initializeWorkoutLog = initializeWorkoutLog;
window.startTodayWorkout = startTodayWorkout;
window.openWorkoutCalendar = openWorkoutCalendar;
window.openDailyRecords = openDailyRecords;
window.resumeWorkoutAfterRest = resumeWorkoutAfterRest;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeHome, { once: true });
} else {
  initializeHome();
}
