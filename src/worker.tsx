import { Hono } from "hono";
import type { Context } from "hono";
import { requestId } from "hono/request-id";

import {
  HOLIDAYS,
  normalizeBudget,
  normalizeYear,
  recommendLeavePlans,
  type SupportedYear,
} from "./domain/calendar";

export type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 413 | 415,
  ) {
    super(code);
  }
}

const canonicalOrigin = "https://yasumi-kumi.yhay81.com";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const telemetryNames = new Set([
  "visited",
  "recommended",
  "leave_selected",
  "plan_copied",
  "calendar_downloaded",
  "saved",
  "returned",
]);
const nowSeconds = () => Math.floor(Date.now() / 1000);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const enforceSameOrigin = (c: AppContext) => {
  const fetchSite = c.req.header("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ApiError("cross_site_request", 403);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new ApiError("cross_site_request", 403);
};

const parseJson = async (c: AppContext, maximumBytes = 1024) => {
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json"))
    throw new ApiError("unsupported_media_type", 415);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > maximumBytes)
    throw new ApiError("payload_too_large", 413);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};

const objectPayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ApiError("invalid_request", 400);
  return payload as Record<string, unknown>;
};

const recordEvent = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-yasumi-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(await sha256(session), name, c.req.header("x-yasumi-qa") === "1" ? 1 : 0, nowSeconds())
    .run();
};

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width,initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      {noindex ? <meta content="noindex,nofollow" name="robots" /> : null}
      <link href={canonical} rel="canonical" />
      <meta content="website" property="og:type" />
      <meta content="休み組み" property="og:site_name" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${canonicalOrigin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#334a45" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
      <script defer src="/app.js" />
    </head>
    <body>
      <a class="skip-link" href="#main">
        本文へ
      </a>
      <header class="site-header">
        <a aria-label="休み組み ホーム" class="wordmark" href="/">
          <span aria-hidden="true" class="mini-calendar">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>休み組み</span>
        </a>
        <nav aria-label="案内">
          <a href="/guide">使い方</a>
          <a href="/source">出典</a>
          <a href="/privacy">保存</a>
        </nav>
      </header>
      {children}
      <footer class="site-footer">
        <span>出典：内閣府「国民の祝日について」</span>
        <span>
          <a href="https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html" rel="noopener noreferrer">
            公式の祝日一覧
          </a>
          <a href="https://www.cao.go.jp/notice/rule.html" rel="noopener noreferrer">
            利用規約
          </a>
        </span>
      </footer>
    </body>
  </html>
);

const YearTape = ({ year }: { year: SupportedYear }) => (
  <div aria-hidden="true" class="year-tape">
    <div class="tape-spool left-spool">
      <i />
    </div>
    <div class="tape-track">
      {Array.from({ length: 12 }, (_, index) => (
        <span class={index === 4 || index === 8 ? "month-block has-holiday" : "month-block"}>
          <b>{String(index + 1).padStart(2, "0")}</b>
          <i />
          <i />
          <i />
        </span>
      ))}
      <strong>{year}</strong>
    </div>
    <div class="tape-spool right-spool">
      <i />
    </div>
    <span class="leave-ticket">休暇</span>
  </div>
);

const PlannerControls = ({ year }: { year: SupportedYear }) => (
  <div class="planner-controls">
    <div class="year-tabs" aria-label="年を選ぶ">
      <a aria-current={year === 2026 ? "page" : undefined} href="/2026">
        2026
      </a>
      <a aria-current={year === 2027 ? "page" : undefined} href="/2027">
        2027
      </a>
    </div>
    <label class="budget-control" for="budget">
      <span>使える休暇</span>
      <strong>
        <output for="budget" id="budget-output">
          2
        </output>
        日
      </strong>
      <input id="budget" max="5" min="1" step="1" type="range" value="2" />
      <span class="budget-scale">
        <i>1</i>
        <i>2</i>
        <i>3</i>
        <i>4</i>
        <i>5</i>
      </span>
    </label>
    <button class="recommend-button" id="recommend-button" type="button">
      連休候補を組む
    </button>
    <p class="planner-status" id="planner-status" role="status">
      休暇日数を選ぶと、週末と祝日をつないだ候補を出します
    </p>
  </div>
);

const HolidayLedger = ({ year }: { year: SupportedYear }) => (
  <section class="holiday-ledger" aria-labelledby="holiday-heading">
    <header>
      <p>公式一覧</p>
      <h2 id="holiday-heading">{year}年の祝日・休日</h2>
      <span>{HOLIDAYS[year].length}日</span>
    </header>
    <div class="holiday-list">
      {HOLIDAYS[year].map((holiday) => (
        <article>
          <time datetime={holiday.date}>{holiday.date.slice(5).replace("-", "/")}</time>
          <div>
            <b>{holiday.name}</b>
            {holiday.note ? <small>{holiday.note}</small> : null}
          </div>
        </article>
      ))}
    </div>
  </section>
);

const PlannerPage = ({ canonicalPath, year }: { canonicalPath: string; year: SupportedYear }) => {
  const description = `${year}年の内閣府公式祝日と週末を見ながら、1〜5日の休暇でつくれる連休候補を比べ、選んだ休暇をカレンダーへ保存できます。`;
  return (
    <Layout
      canonical={`${canonicalOrigin}${canonicalPath}`}
      description={description}
      title={`${year}年の祝日と連休 | 休み組み`}
    >
      <main class="home" id="main">
        <section class="planner-board" aria-labelledby="product-title">
          <div class="product-heading">
            <p class="eyebrow">祝日 × 週末 × 休暇</p>
            <h1 id="product-title">休む日を置く。連休がつながる。</h1>
            <p>公式の祝日を土台に、使える休暇で長い休みを組み立てます。</p>
          </div>
          <YearTape year={year} />
          <PlannerControls year={year} />
        </section>
        <div class="source-ribbon">
          <span>内閣府公式</span>
          <span>{year}年</span>
          <span>登録なし</span>
          <a href="/source">収録と出典</a>
        </div>
        <section
          class="planner-shell"
          data-holidays={JSON.stringify(HOLIDAYS[year])}
          data-today={new Date().toISOString().slice(0, 10)}
          data-year={year}
          id="planner"
        >
          <div class="calendar-area">
            <div class="section-heading">
              <div>
                <p>一年の盤面</p>
                <h2>{year}年カレンダー</h2>
              </div>
              <span id="selected-count">休暇 0日</span>
            </div>
            <div class="calendar-legend">
              <span class="legend-holiday">祝日・休日</span>
              <span class="legend-weekend">週末</span>
              <span class="legend-leave">選んだ休暇</span>
            </div>
            <div class="calendar-grid" id="calendar-grid" />
          </div>
          <aside class="recommendation-tray" aria-labelledby="recommendation-heading">
            <div class="tray-handle">
              <i />
            </div>
            <header>
              <p>おすすめ</p>
              <h2 id="recommendation-heading">連休候補</h2>
            </header>
            <div class="recommendation-list" id="recommendation-list">
              <p class="empty-recommendation">「連休候補を組む」を押すと、休暇札が並びます。</p>
            </div>
          </aside>
        </section>
        <section class="selected-plan" aria-labelledby="selected-heading">
          <div class="selected-summary">
            <p>あなたの組み方</p>
            <h2 id="selected-heading">休暇をカレンダーに置く</h2>
            <strong id="longest-break">最長 — 日</strong>
            <span id="selected-dates">平日を選ぶとここに並びます</span>
          </div>
          <div class="selected-actions">
            <button id="copy-plan" type="button" disabled>
              予定をコピー
            </button>
            <button id="download-calendar" type="button" disabled>
              休暇をカレンダー保存
            </button>
            <button class="clear-button" id="clear-plan" type="button" disabled>
              選択を外す
            </button>
          </div>
        </section>
        <HolidayLedger year={year} />
      </main>
    </Layout>
  );
};

const GuidePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/guide`}
    description="休み組みで祝日・週末・休暇をつないで連休を計画する方法。"
    title="使い方 | 休み組み"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">組</span>
        <div>
          <p>使い方</p>
          <h1>休暇札を置いて、休みをつなぐ</h1>
        </div>
      </header>
      <div class="instruction-grid">
        <section>
          <b>一</b>
          <h2>使える日数を決める</h2>
          <p>1〜5日の範囲で、今回使える休暇日数を選びます。</p>
        </section>
        <section>
          <b>二</b>
          <h2>候補を置く</h2>
          <p>おすすめを一括で置くか、カレンダー上の平日を自分で選びます。</p>
        </section>
        <section>
          <b>三</b>
          <h2>予定へ持ち出す</h2>
          <p>連休の範囲をコピーし、選んだ休暇だけをカレンダーファイルに保存できます。</p>
        </section>
      </div>
      <a class="page-cta" href="/">
        休みを組む
      </a>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${canonicalOrigin}/source`}
    description="休み組みが利用する内閣府の国民の祝日データ、収録範囲、出典と加工の説明。"
    title="出典と収録 | 休み組み"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">典</span>
        <div>
          <p>出典と収録</p>
          <h1>公式の祝日を一年の盤面に</h1>
        </div>
      </header>
      <div class="source-grid">
        <section class="source-ledger">
          <h2>出典</h2>
          <p>
            出典：内閣府「
            <a
              href="https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html"
              rel="noopener noreferrer"
            >
              国民の祝日について
            </a>
            」。公式CSVと同ページが公表する2026年・2027年の祝日・休日を使用します。
          </p>
        </section>
        <section class="source-ledger">
          <h2>表示の加工</h2>
          <p>
            日付、名称、振替休日等の備考を選択し、週末と利用者が選んだ休暇を重ねて連続日数を計算します。内閣府が作成した画面ではありません。
          </p>
        </section>
        <section class="source-ledger">
          <h2>利用条件と更新</h2>
          <p>
            <a href="https://www.cao.go.jp/notice/rule.html" rel="noopener noreferrer">
              内閣府ホームページ利用規約
            </a>
            と公共データ利用規約第1.0版に従い、出典と加工を表示します。2028年分は内閣府公表後に追加します。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${canonicalOrigin}/privacy`}
    description="休み組みの選択した休暇、匿名利用計測、保存範囲。"
    title="保存とプライバシー | 休み組み"
  >
    <main class="content-page" id="main">
      <header class="content-heading">
        <span class="page-index">守</span>
        <div>
          <p>保存</p>
          <h1>休暇予定はこの端末だけ</h1>
        </div>
      </header>
      <div class="privacy-grid">
        <section>
          <h2>休暇の選択</h2>
          <p>
            年と選んだ休暇日は、このブラウザのlocalStorageだけに年ごと最大40日保存します。サーバーへ送りません。
          </p>
        </section>
        <section>
          <h2>連休候補</h2>
          <p>
            年、休暇日数、当日以降という条件だけを計算APIへ送ります。個人の予定、勤務先、氏名、連絡先は扱いません。
          </p>
        </section>
        <section>
          <h2>利用計測</h2>
          <p>
            ランダム端末IDのハッシュ、許可済み操作名、QA判定、時刻だけを35日保持します。選んだ日付や日数の列はありません。
          </p>
        </section>
      </div>
    </main>
  </Layout>
);

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", requestId());
app.use("*", async (c, next) => {
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});

app.get("/", (c) => {
  c.header("Cache-Control", "public,max-age=60,s-maxage=300");
  const current = new Date().getUTCFullYear() >= 2027 ? 2027 : 2026;
  return c.html(<PlannerPage canonicalPath="/" year={current} />);
});
app.get("/2026", (c) => c.html(<PlannerPage canonicalPath="/2026" year={2026} />));
app.get("/2027", (c) => c.html(<PlannerPage canonicalPath="/2027" year={2027} />));
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));

app.post("/api/recommend", async (c) => {
  enforceSameOrigin(c);
  const payload = objectPayload(await parseJson(c, 512));
  const year = normalizeYear(payload.year);
  const budget = normalizeBudget(payload.budget);
  const requestedAfter = typeof payload.after === "string" ? payload.after : "";
  const after =
    /^\d{4}-\d{2}-\d{2}$/u.test(requestedAfter) && requestedAfter.startsWith(`${year}-`)
      ? requestedAfter
      : `${year}-01-01`;
  const plans = recommendLeavePlans(year, budget, after);
  await recordEvent(c, "recommended");
  c.header("Cache-Control", "no-store");
  return c.json({ budget, plans, year });
});

app.post("/api/telemetry", async (c) => {
  enforceSameOrigin(c);
  const payload = objectPayload(await parseJson(c, 256));
  const name = typeof payload.name === "string" ? payload.name : "";
  if (!telemetryNames.has(name)) throw new ApiError("invalid_event", 400);
  await recordEvent(c, name);
  return c.body(null, 202);
});

app.get("/health", async (c) => {
  const database = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({ years: [2026, 2027], ok: database?.ok === 1, service: "yasumi-kumi" });
});

app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/2026", "/2027", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/sitemap/0.9">${paths.map((path) => `<url><loc>${canonicalOrigin}${path}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=3600,s-maxage=86400");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});

app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${canonicalOrigin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | 休み組み"
    >
      <main class="not-found" id="main">
        <span>404</span>
        <h1>この年の予定表はありません</h1>
        <p>2026年か2027年の盤面へ戻ってください。</p>
        <a href="/">休みを組む</a>
      </main>
    </Layout>,
  );
});

app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.code, requestId: c.get("requestId") }, error.status);
  console.error(
    "request_failed",
    c.get("requestId"),
    error instanceof Error ? error.message : "unknown",
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export { app };
export default { fetch: app.fetch, scheduled };
