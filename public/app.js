(() => {
  "use strict";

  const sessionKey = "yasumi-kumi-session-v1";
  const seenKey = "yasumi-kumi-seen-v1";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const isQa =
    new URLSearchParams(location.search).get("qa") === "1" ||
    location.hostname === "localhost" ||
    navigator.webdriver === true;

  const readLocal = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeLocal = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      return false;
    }
    return true;
  };
  const readJson = (key, fallback) => {
    try {
      return JSON.parse(readLocal(key) ?? "null") ?? fallback;
    } catch {
      return fallback;
    }
  };

  const oldSession = readLocal(sessionKey) ?? "";
  const session = uuidPattern.test(oldSession) ? oldSession : crypto.randomUUID();
  writeLocal(sessionKey, session);
  const headers = () => ({
    "Content-Type": "application/json",
    "X-Yasumi-QA": isQa ? "1" : "0",
    "X-Yasumi-Session": session,
  });
  const emit = (name) => {
    fetch("/api/telemetry", {
      body: JSON.stringify({ name }),
      headers: headers(),
      keepalive: true,
      method: "POST",
    }).catch(() => undefined);
  };

  const previousVisit = Number(readLocal(seenKey) ?? 0);
  emit("visited");
  if (previousVisit && Date.now() - previousVisit > 8 * 60 * 60 * 1000) emit("returned");
  writeLocal(seenKey, String(Date.now()));

  const planner = document.querySelector("#planner");
  if (!planner) return;

  const year = Number(planner.dataset.year);
  const today = planner.dataset.today ?? `${year}-01-01`;
  const holidayItems = (() => {
    try {
      const value = JSON.parse(planner.dataset.holidays ?? "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  })();
  const holidayMap = new Map(
    holidayItems
      .filter((item) => item && typeof item.date === "string" && typeof item.name === "string")
      .map((item) => [item.date, item]),
  );
  const selectedKey = `yasumi-kumi-selected-${year}-v1`;
  const savedOnceKey = `yasumi-kumi-saved-${year}-v1`;
  const isoPattern = new RegExp(`^${year}-\\d{2}-\\d{2}$`, "u");
  const dateValue = (value) => new Date(`${value}T00:00:00Z`);
  const toIso = (date) => date.toISOString().slice(0, 10);
  const isWeekend = (value) => [0, 6].includes(dateValue(value).getUTCDay());
  const isPast = (value) => year === Number(today.slice(0, 4)) && value < today;
  const selectable = (value) =>
    isoPattern.test(value) &&
    toIso(dateValue(value)) === value &&
    !isWeekend(value) &&
    !holidayMap.has(value);
  const formatDate = (value, weekday = true) =>
    new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      ...(weekday ? { weekday: "short" } : {}),
      timeZone: "UTC",
    }).format(dateValue(value));
  const formatRange = (start, end) => `${formatDate(start)}〜${formatDate(end)}`;

  const initial = readJson(selectedKey, []);
  let selected = new Set(
    (Array.isArray(initial) ? initial : [])
      .filter((value) => typeof value === "string" && selectable(value))
      .slice(0, 40),
  );

  const grid = document.querySelector("#calendar-grid");
  const selectedCount = document.querySelector("#selected-count");
  const selectedDates = document.querySelector("#selected-dates");
  const longestBreak = document.querySelector("#longest-break");
  const copyPlan = document.querySelector("#copy-plan");
  const downloadCalendar = document.querySelector("#download-calendar");
  const clearPlan = document.querySelector("#clear-plan");
  const recommendButton = document.querySelector("#recommend-button");
  const recommendationList = document.querySelector("#recommendation-list");
  const status = document.querySelector("#planner-status");
  const budget = document.querySelector("#budget");
  const budgetOutput = document.querySelector("#budget-output");
  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  const dateButtons = new Map();

  const allDates = () => {
    const values = [];
    const cursor = new Date(Date.UTC(year, 0, 1));
    while (cursor.getUTCFullYear() === year) {
      values.push(toIso(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return values;
  };
  const dates = allDates();
  const dayOff = (value) => isWeekend(value) || holidayMap.has(value) || selected.has(value);

  const bestBreak = () => {
    const spans = [];
    let start = "";
    let includesLeave = false;
    dates.forEach((value, index) => {
      if (dayOff(value)) {
        if (!start) start = value;
        if (selected.has(value)) includesLeave = true;
      }
      if (start && (!dayOff(value) || index === dates.length - 1)) {
        const endIndex = dayOff(value) && index === dates.length - 1 ? index : index - 1;
        const startIndex = dates.indexOf(start);
        spans.push({
          days: endIndex - startIndex + 1,
          end: dates[endIndex],
          includesLeave,
          start,
        });
        start = "";
        includesLeave = false;
      }
    });
    const eligible = selected.size ? spans.filter((span) => span.includesLeave) : spans;
    return eligible.sort(
      (left, right) => right.days - left.days || left.start.localeCompare(right.start),
    )[0];
  };

  const announce = (message) => {
    if (status) status.textContent = message;
  };
  const persist = () => {
    const values = [...selected].sort().slice(0, 40);
    selected = new Set(values);
    writeLocal(selectedKey, JSON.stringify(values));
    if (values.length && !readLocal(savedOnceKey)) {
      writeLocal(savedOnceKey, "1");
      emit("saved");
    }
  };
  const update = () => {
    dateButtons.forEach((button, value) => {
      const active = selected.has(value);
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const values = [...selected].sort();
    if (selectedCount) selectedCount.textContent = `休暇 ${values.length}日`;
    if (selectedDates)
      selectedDates.textContent = values.length
        ? values.map((value) => formatDate(value)).join("・")
        : "平日を選ぶとここに並びます";
    const best = bestBreak();
    if (longestBreak)
      longestBreak.textContent = best
        ? `最長 ${best.days}日　${formatRange(best.start, best.end)}`
        : "最長 — 日";
    [copyPlan, downloadCalendar, clearPlan].forEach((button) => {
      if (button) button.disabled = values.length === 0;
    });
  };
  const setSelected = (values, message) => {
    selected = new Set(values.filter((value) => selectable(value) && !isPast(value)).slice(0, 40));
    persist();
    update();
    announce(message);
  };
  const toggleDate = (value) => {
    if (selected.has(value)) selected.delete(value);
    else {
      if (selected.size >= 40) {
        announce("休暇は年40日まで選べます");
        return;
      }
      selected.add(value);
      emit("leave_selected");
    }
    persist();
    update();
    announce(
      selected.has(value)
        ? `${formatDate(value)}を休暇にしました`
        : `${formatDate(value)}を外しました`,
    );
  };

  const buildCalendar = () => {
    if (!grid) return;
    grid.replaceChildren();
    for (let month = 0; month < 12; month += 1) {
      const panel = document.createElement("section");
      panel.className = "month-card";
      const heading = document.createElement("header");
      const number = document.createElement("strong");
      number.textContent = String(month + 1).padStart(2, "0");
      const label = document.createElement("span");
      label.textContent = `${month + 1}月`;
      heading.append(number, label);
      const weekdays = document.createElement("div");
      weekdays.className = "weekday-row";
      weekdayLabels.forEach((value) => {
        const item = document.createElement("span");
        item.textContent = value;
        weekdays.append(item);
      });
      const days = document.createElement("div");
      days.className = "month-days";
      const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
      for (let index = 0; index < firstDay; index += 1) {
        const blank = document.createElement("span");
        blank.className = "empty-day";
        days.append(blank);
      }
      const lastDate = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      for (let day = 1; day <= lastDate; day += 1) {
        const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const holiday = holidayMap.get(value);
        const weekend = isWeekend(value);
        const cell = document.createElement(selectable(value) ? "button" : "span");
        cell.className = "calendar-day";
        cell.textContent = String(day);
        cell.dataset.date = value;
        if (cell instanceof HTMLButtonElement) {
          cell.type = "button";
          cell.setAttribute("aria-label", `${formatDate(value)}を休暇にする`);
          cell.setAttribute("aria-pressed", "false");
          if (isPast(value)) {
            cell.disabled = true;
            cell.classList.add("is-past");
          } else {
            cell.addEventListener("click", () => toggleDate(value));
          }
          dateButtons.set(value, cell);
        }
        if (weekend) cell.classList.add("is-weekend");
        if (holiday) {
          cell.classList.add("is-holiday");
          cell.title = holiday.note ? `${holiday.name}（${holiday.note}）` : holiday.name;
          cell.setAttribute("aria-label", `${formatDate(value)} ${holiday.name}`);
        }
        if (value === today) cell.classList.add("is-today");
        days.append(cell);
      }
      panel.append(heading, weekdays, days);
      grid.append(panel);
    }
  };

  const text = (tag, value, className = "") => {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  };
  const renderRecommendations = (plans) => {
    if (!recommendationList) return;
    recommendationList.replaceChildren();
    if (!plans.length) {
      recommendationList.append(
        text("p", "この条件で新しくつながる連休はありません。", "empty-recommendation"),
      );
      return;
    }
    plans.forEach((plan, index) => {
      const card = document.createElement("article");
      card.className = "leave-ticket-card";
      const rank = text("span", String(index + 1).padStart(2, "0"), "ticket-rank");
      const body = document.createElement("div");
      const days = text("strong", `${plan.days}日間`);
      const range = text("p", formatRange(plan.start, plan.end));
      const leave = text(
        "small",
        `休暇 ${plan.leaveDates.length}日：${plan.leaveDates.map((value) => formatDate(value, false)).join("・")}`,
      );
      const holidays = text(
        "span",
        plan.holidayNames.length ? plan.holidayNames.join("・") : "週末につなぐ",
        "ticket-holidays",
      );
      body.append(days, range, leave, holidays);
      const apply = text("button", "この札を置く");
      apply.type = "button";
      apply.addEventListener("click", () => {
        setSelected(plan.leaveDates, `${plan.days}日間の候補をカレンダーへ置きました`);
        document.querySelector(`[data-date="${plan.leaveDates[0]}"]`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
      card.append(rank, body, apply);
      recommendationList.append(card);
    });
  };

  const requestRecommendations = async () => {
    if (!recommendButton || !budget) return;
    recommendButton.disabled = true;
    recommendButton.classList.add("is-loading");
    announce("祝日と週末をつないでいます…");
    const after = year === Number(today.slice(0, 4)) ? today : `${year}-01-01`;
    try {
      const response = await fetch("/api/recommend", {
        body: JSON.stringify({ after, budget: Number(budget.value), year }),
        headers: headers(),
        method: "POST",
      });
      if (!response.ok) throw new Error("recommend_failed");
      const payload = await response.json();
      renderRecommendations(Array.isArray(payload.plans) ? payload.plans : []);
      announce(`${payload.budget}日の休暇でつくれる上位候補を並べました`);
    } catch {
      announce("候補を計算できませんでした。少し待ってもう一度お試しください");
    } finally {
      recommendButton.disabled = false;
      recommendButton.classList.remove("is-loading");
    }
  };

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  };
  copyPlan?.addEventListener("click", async () => {
    const values = [...selected].sort();
    const best = bestBreak();
    const lines = [
      `休暇予定（${year}年）`,
      ...values.map((value) => `・${formatDate(value)}`),
      best ? `連休：${formatRange(best.start, best.end)}（${best.days}日間）` : "",
    ].filter(Boolean);
    await copyText(lines.join("\n"));
    announce("休暇予定をコピーしました");
    emit("plan_copied");
  });

  const icsDate = (value) => value.replaceAll("-", "");
  const escapeIcs = (value) =>
    value.replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;");
  downloadCalendar?.addEventListener("click", () => {
    const events = [...selected]
      .sort()
      .map((value) => {
        const next = dateValue(value);
        next.setUTCDate(next.getUTCDate() + 1);
        return [
          "BEGIN:VEVENT",
          `UID:${value}-${session}@yasumi-kumi.yhay81.com`,
          `DTSTAMP:${new Date()
            .toISOString()
            .replaceAll(/[-:]/gu, "")
            .replace(/\.\d{3}Z$/u, "Z")}`,
          `DTSTART;VALUE=DATE:${icsDate(value)}`,
          `DTEND;VALUE=DATE:${icsDate(toIso(next))}`,
          `SUMMARY:${escapeIcs("休暇")}`,
          "TRANSP:TRANSPARENT",
          "END:VEVENT",
        ].join("\r\n");
      })
      .join("\r\n");
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//yhay81//Yasumi Kumi//JA",
      "CALSCALE:GREGORIAN",
      events,
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `yasumi-kumi-${year}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce("選んだ休暇をカレンダーファイルに保存しました");
    emit("calendar_downloaded");
  });

  clearPlan?.addEventListener("click", () => setSelected([], "選んだ休暇をすべて外しました"));
  recommendButton?.addEventListener("click", () => void requestRecommendations());
  budget?.addEventListener("input", () => {
    if (budgetOutput) budgetOutput.textContent = budget.value;
    announce(`${budget.value}日の休暇で候補を組めます`);
  });

  buildCalendar();
  update();
})();
