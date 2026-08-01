import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("product surface", () => {
  const worker = read("src/worker.tsx");
  const domain = read("src/domain/calendar.ts");
  const client = read("public/app.js");
  const css = read("public/styles.css");
  const migration = read("migrations/0001_telemetry.sql");
  const source = read("SOURCE.md");

  it("communicates through a year planner, tape, tickets, and calendar without oversized type", () => {
    expect(worker).toContain('class="year-tape"');
    expect(worker).toContain(': "month-block"');
    expect(worker).toContain('class="leave-ticket"');
    expect(worker).toContain('class="recommendation-tray"');
    expect(client).toContain('panel.className = "month-card"');
    expect(client).toContain('card.className = "leave-ticket-card"');
    expect(css.toLowerCase()).not.toContain("gradient");
    expect(css).not.toMatch(/h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px/su);
  });

  it("keeps selected dates out of APIs, telemetry, and product URLs", () => {
    expect(worker).toContain('app.post("/api/recommend"');
    expect(worker).toContain('c.header("Cache-Control", "no-store")');
    expect(client).toContain("localStorage");
    expect(client).toContain("slice(0, 40)");
    expect(migration).not.toMatch(/selected_date|leave_date|budget|year|email|phone|advertising/iu);
    expect(migration).toContain("CHECK(event_name IN");
    expect(client).not.toMatch(/history\.(?:pushState|replaceState)|location\.search\s*=/u);
  });

  it("uses bounded official years and a deterministic recommendation order", () => {
    expect(domain).toContain("export const SUPPORTED_YEARS = [2026, 2027]");
    expect(domain).toContain("Math.min(5, Math.max(1, number))");
    expect(domain).toContain(".slice(0, 6)");
    expect(domain).toContain("right.days - left.days");
    expect(worker).not.toContain('fetch("https://');
  });

  it("renders user-controlled values as text and creates a local calendar file", () => {
    expect(client).not.toContain("innerHTML");
    expect(worker).not.toContain("dangerouslySetInnerHTML");
    expect(client).toContain("textContent");
    expect(client).toContain('type: "text/calendar;charset=utf-8"');
    expect(client).toContain('"BEGIN:VCALENDAR"');
  });

  it("states the official source, use terms, range, and transformation", () => {
    expect(source).toContain("内閣府");
    expect(source).toContain("syukujitsu.csv");
    expect(source).toContain("公共データ利用規約第1.0版");
    expect(source).toContain("2026年および2027年");
    expect(source).toContain("加工内容");
    expect(worker).toContain("内閣府が作成した画面ではありません");
  });

  it("marks automated QA and needs no account for local plans", () => {
    expect(client).toContain("navigator.webdriver === true");
    expect(client).toContain('"X-Yasumi-QA"');
    expect(`${worker}\n${client}`).not.toMatch(/better-auth|betterAuth/iu);
  });
});
