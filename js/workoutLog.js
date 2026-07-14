const WORKOUT_STORAGE_KEY = "gymTrainingApp.workoutData";
const BODY_PARTS = ["胸", "背中", "脚", "肩", "腕", "腹", "有酸素", "その他"];

let workoutScreen;
let workoutContent;
let workoutStatus;
let selectedBodyPart = null;
let selectedExerciseId = null;
let selectedWorkoutDate = null;
let isWorkoutLogInitialized = false;
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

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setWorkoutStatus(message, isError = false) {
  workoutStatus.textContent = message;
  workoutStatus.classList.toggle("workout-log__status--error", isError);
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

function getBodyPartsForDate(date, data) {
  const exerciseBodyParts = new Map(
    data.exerciseMaster.map((exercise) => [exercise.id, exercise.bodyPart]),
  );

  return [
    ...new Set(
      data.workoutLogs
        .filter((log) => log.date === date)
        .map((log) => exerciseBodyParts.get(log.exerciseId))
        .filter(Boolean),
    ),
  ];
}

function renderCalendar(year = new Date().getFullYear(), month = new Date().getMonth()) {
  displayedCalendarYear = year;
  displayedCalendarMonth = month;
  selectedBodyPart = null;
  selectedExerciseId = null;
  workoutContent.replaceChildren();
  setWorkoutStatus("日付を選択してください");

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const isCurrentMonth = year === currentYear && month === currentMonth;

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
  setWorkoutStatus("この日は閲覧専用です");

  const backButton = createButton(
    "← カレンダーへ戻る",
    () => renderCalendar(displayedCalendarYear, displayedCalendarMonth),
    "workout-log__back",
  );
  const heading = document.createElement("h2");
  heading.textContent = `${date.replaceAll("-", "/")}の記録`;
  const records = document.createElement("div");
  records.className = "workout-log__daily-records";

  const data = readWorkoutData();
  const logs = data.workoutLogs.filter((log) => log.date === date);
  const exerciseMap = new Map(
    data.exerciseMaster.map((exercise) => [exercise.id, exercise]),
  );
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
      .flatMap((log) => {
        if (Array.isArray(log.sets)) {
          return log.sets.map((set, index) => ({
            ...set,
            setNumber: index + 1,
          }));
        }
        return [log];
      })
      .sort((a, b) => (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0))
      .forEach((set) => {
        const item = document.createElement("li");
        const reps = set.toFailure || set.reps === null ? "限界まで" : `${set.reps}回`;
        item.textContent = `${set.setNumber}セット目：${set.weight}kg × ${reps}`;
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
  heading.textContent = "1. 部位を選択";

  const backButton = createButton(
    "← カレンダーへ戻る",
    () => renderCalendar(new Date().getFullYear(), new Date().getMonth()),
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

function addExercise(bodyPart) {
  const enteredName = window.prompt(`${bodyPart}の新しい種目名を入力してください`);
  const name = enteredName?.trim();

  if (!name) {
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
  heading.textContent = `2. ${bodyPart}の種目を選択`;

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
    "＋ 新規種目を追加",
    () => addExercise(bodyPart),
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

function getRecordedSets(data, date, exerciseId) {
  return data.workoutLogs
    .filter((log) => log.date === date && log.exerciseId === exerciseId)
    .flatMap((log) => {
      if (Array.isArray(log.sets)) {
        return log.sets.map((set, index) => ({
          ...set,
          setNumber: index + 1,
        }));
      }
      return [log];
    })
    .sort((a, b) => (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0));
}

function renderWorkoutEntry(exerciseId) {
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
  const recordedSets = getRecordedSets(data, workoutDate, exerciseId);
  selectedExerciseId = exerciseId;
  workoutContent.replaceChildren();
  setWorkoutStatus("1セット分の重量と回数を入力してください");

  const backButton = createButton(
    "← 種目選択へ戻る",
    () => renderExerciseSelection(exercise.bodyPart),
    "workout-log__back",
  );
  const heading = document.createElement("h2");
  heading.textContent = `3. ${exercise.name}を記録`;

  const recordedSection = document.createElement("section");
  recordedSection.className = "workout-log__recorded-sets";
  const recordedHeading = document.createElement("h3");
  recordedHeading.textContent = "記録済みセット";
  recordedSection.append(recordedHeading);

  if (recordedSets.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "まだ記録はありません。";
    recordedSection.append(emptyMessage);
  } else {
    const recordedList = document.createElement("ol");
    recordedSets.forEach((set) => {
      const item = document.createElement("li");
      const reps = set.toFailure || set.reps === null ? "限界まで" : `${set.reps}回`;
      item.textContent = `${set.setNumber}セット目：${set.weight}kg × ${reps}`;
      recordedList.append(item);
    });
    recordedSection.append(recordedList);
  }

  const setNumberChoices = Array.from({ length: 10 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1}セット目`,
  }));
  const firstUnusedSetNumber =
    setNumberChoices.find(
      ({ value }) => !recordedSets.some((set) => Number(set.setNumber) === Number(value)),
    )?.value ?? "10";
  const { label: setNumberLabel, select: setNumberInput } = createSelect(
    "何セット目か",
    setNumberChoices,
    firstUnusedSetNumber,
  );

  const { label: weightLabel, input: weightInput } = createNumberInput("重量 (kg)", {
    min: "0",
    step: "0.1",
    required: true,
    value: "",
    inputMode: "decimal",
  });

  const repChoices = ["3", "5", "6", "9", "10", "12", "15", "18", "20"].map(
    (value) => ({ value, label: value }),
  );
  repChoices.push({ value: "failure", label: "限界まで" });
  const { label: repsLabel, select: repsInput } = createSelect(
    "回数",
    repChoices,
    "10",
  );

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
    renderWorkoutEntry(latestExercise.id);
    setWorkoutStatus(`${setNumber}セット目を保存しました`);
  });

  form.append(setNumberLabel, weightLabel, repsLabel, submitButton);
  workoutContent.append(backButton, heading, recordedSection, form);
}

function installWorkoutLogStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .workout-log {
      box-sizing: border-box;
      max-width: 40rem;
      margin: 0 auto;
      padding: 1.25rem;
    }
    .workout-log h1,
    .workout-log h2 {
      margin-top: 0;
    }
    .workout-log__status {
      min-height: 1.5em;
    }
    .workout-log__status--error {
      color: #b00020;
    }
    .workout-log__calendar-navigation {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: .5rem;
      margin-bottom: 1rem;
    }
    .workout-log__calendar-navigation h2 {
      margin: 0;
      text-align: center;
      white-space: nowrap;
    }
    .workout-log__calendar {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: .25rem;
    }
    .workout-log__weekday {
      padding: .4rem 0;
      font-weight: 700;
      text-align: center;
    }
    .workout-log__calendar-day {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-height: 4.5rem;
      overflow: hidden;
      text-align: left;
    }
    .workout-log__calendar-day--today {
      border: 3px solid #1769aa;
      font-weight: 700;
    }
    .workout-log__body-part-labels {
      display: block;
      width: 100%;
      margin-top: .25rem;
      overflow: hidden;
      color: #1769aa;
      font-size: .7rem;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .workout-log__daily-records {
      display: grid;
      gap: 1rem;
    }
    .workout-log__daily-exercise {
      padding: .75rem;
      border: 1px solid #ccc;
      border-radius: .5rem;
    }
    .workout-log__daily-exercise h3 {
      margin-top: 0;
    }
    .workout-log__daily-sets {
      margin-bottom: 0;
      padding-left: 1.5rem;
    }
    .workout-log__body-parts {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: .75rem;
    }
    .workout-log button,
    .workout-log input,
    .workout-log select {
      min-height: 3rem;
      padding: .6rem;
      font: inherit;
      box-sizing: border-box;
    }
    .workout-log button {
      touch-action: manipulation;
    }
    .workout-log button.workout-log__calendar-day {
      min-height: 4.5rem;
    }
    .workout-log__body-part-button,
    .workout-log__add-button,
    .workout-log__save-button {
      font-weight: 700;
    }
    .workout-log__exercise-list {
      display: grid;
      gap: .75rem;
      margin-bottom: 1rem;
    }
    .workout-log__exercise-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: .5rem;
    }
    .workout-log__exercise-button {
      text-align: left;
    }
    .workout-log__add-button,
    .workout-log__save-button {
      width: 100%;
    }
    .workout-log__back {
      margin-bottom: 1rem;
    }
    .workout-log__recorded-sets {
      margin-bottom: 1rem;
      padding: .75rem;
      border: 1px solid #ccc;
      border-radius: .5rem;
    }
    .workout-log__recorded-sets h3 {
      margin-top: 0;
    }
    .workout-log__recorded-sets ol {
      margin-bottom: 0;
      padding-left: 1.5rem;
    }
    .workout-log__form,
    .workout-log__sets {
      display: grid;
      gap: 1rem;
    }
    .workout-log__field {
      display: grid;
      gap: .35rem;
      flex: 1;
    }
    .workout-log__set {
      display: flex;
      gap: .75rem;
      margin: 0;
      padding: .75rem;
    }
    @media (max-width: 28rem) {
      .workout-log__calendar-navigation {
        grid-template-columns: 1fr 1fr;
      }
      .workout-log__calendar-navigation h2 {
        grid-column: 1 / -1;
        grid-row: 1;
      }
      .workout-log__calendar-day {
        padding: .3rem;
      }
      .workout-log button.workout-log__calendar-day {
        min-height: 3.75rem;
      }
      .workout-log__set {
        display: grid;
      }
    }
  `;
  document.head.append(style);
}

function initializeWorkoutLog() {
  if (isWorkoutLogInitialized) {
    renderCalendar();
    return;
  }

  workoutScreen = document.querySelector("#workout-log-screen");

  if (!workoutScreen) {
    return;
  }

  isWorkoutLogInitialized = true;
  readWorkoutData();
  installWorkoutLogStyles();
  workoutScreen.replaceChildren();
  workoutScreen.classList.add("workout-log");

  const heading = document.createElement("h1");
  heading.textContent = "トレーニング記録";

  workoutStatus = document.createElement("p");
  workoutStatus.className = "workout-log__status";
  workoutStatus.setAttribute("role", "status");

  workoutContent = document.createElement("div");
  workoutScreen.append(heading, workoutStatus, workoutContent);
  renderCalendar();
}

