import { brandStorageKey, BRAND_TAGLINE, BRAND_TAGLINE_EN } from "./brand.ts";
import "./marketing.css";

type Language = "ko" | "en";
type Product = {
  title: [string, string];
  description: [string, string];
  features: [string[], string[]];
  nodes: [string[], string[]];
  caption: string;
};
const products: Record<string, Product> = {
  console: {
    title: [
      "운영의 전체 그림을 한눈에.",
      "The full operational picture, at a glance.",
    ],
    description: [
      "생산 실적, 설비 상태, 품질 예외와 현장 영상을 하나의 대시보드에서 확인하세요. 관리자와 오퍼레이터의 역할에 맞게 접근 권한을 나눕니다.",
      "Review production performance, equipment status, quality exceptions and shop-floor video in one dashboard, with role-based access for administrators and operators.",
    ],
    features: [
      [
        "생산·품질·설비 통합 현황",
        "CCTV·기기 카메라 위젯",
        "한국어·English 워크스페이스",
      ],
      [
        "Production, quality & equipment overview",
        "CCTV & device-camera widgets",
        "Korean & English workspaces",
      ],
    ],
    nodes: [
      ["생산 실적", "설비 상태", "품질 예외", "현장 영상"],
      ["Production", "Equipment", "Quality", "Live video"],
    ],
    caption: "Operations, connected.",
  },
  agents: {
    title: [
      "전문성은 나누고, 판단은 연결합니다.",
      "Specialist agents. Shared intelligence.",
    ],
    description: [
      "20개 기능 에이전트가 공유 맥락과 도구 기록을 바탕으로 협업합니다. 카탈로그에서 선택하고, 구성과 의존성을 편집해 운영에 맞춥니다.",
      "Twenty specialist agents collaborate through shared context and tool records. Select agents from the catalog and adapt their configuration and dependencies to your operations.",
    ],
    features: [
      [
        "공용 18개 · 라면 공정 전용 2개",
        "구성·리비전·의존성 관리",
        "제안 검토·승인과 실행 기록",
      ],
      [
        "18 reusable & 2 ramen-specific agents",
        "Configuration, revisions & dependencies",
        "Reviewed proposals & execution records",
      ],
    ],
    nodes: [
      ["생산 진단", "재고 점검", "LOT 추적", "BOM 검증"],
      ["Production", "Inventory", "LOT tracing", "BOM checks"],
    ],
    caption: "Intelligence, coordinated.",
  },
  panel: {
    title: [
      "필요한 정보를, 일하는 현장에.",
      "The right information, where work happens.",
    ],
    description: [
      "라인별 TV와 터치 패널에 화면과 위젯을 배분합니다. 게시 전 미리보기로 구성을 확인하고, 독립 패널 뷰에서 운영 화면을 비교합니다.",
      "Distribute screens and widgets to line TVs and touch panels. Preview drafts before publishing and compare published screens in a dedicated panel viewer.",
    ],
    features: [
      [
        "라인별 화면·위젯 배분",
        "미리보기·게시·화면 순환",
        "독립 조회·전체 화면·멀티뷰",
      ],
      [
        "Per-line screens & widget assignment",
        "Preview, publishing & screen rotation",
        "Dedicated views, full screen & multi-view",
      ],
    ],
    nodes: [
      ["라인 전광판", "작업 지침", "에이전트 위젯", "CCTV"],
      ["Line boards", "Work guidance", "Agent widgets", "CCTV"],
    ],
    caption: "The floor, informed.",
  },
  connect: {
    title: [
      "데이터의 다음 연결을 준비합니다.",
      "Prepare data for its next connection.",
    ],
    description: [
      "재고·LOT·BOM과 설비 데이터를 소유자, 스키마, 계보가 있는 데이터 제품으로 정리합니다. 선택형 플러그인으로 거버넌스와 외부 데이터 플랫폼 연동을 준비합니다.",
      "Organize inventory, LOT, BOM and equipment data as products with ownership, schemas and lineage. Optional plugins provide a foundation for governance and data-platform integration.",
    ],
    features: [
      [
        "데이터 제품·스키마·계보",
        "MQTT·Kafka 전송 플러그인",
        "읽기 전용 MCP 도구",
      ],
      [
        "Data products, schemas & lineage",
        "MQTT & Kafka publishing plugins",
        "Read-only MCP tools",
      ],
    ],
    nodes: [
      ["데이터 제품", "MQTT", "Kafka", "MCP"],
      ["Data products", "MQTT", "Kafka", "MCP"],
    ],
    caption: "Data, ready to connect.",
  },
};
const storageKey = brandStorageKey("axentra-locale");
let language: Language = "ko";
let selected = "console";
try {
  const value =
    new URLSearchParams(location.search).get("lang") ||
    localStorage.getItem(storageKey);
  if (value === "en") language = "en";
} catch {
  /* Default language works without storage. */
}
const languageSelect =
  document.querySelector<HTMLSelectElement>("#site-language")!;
const tabs = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-product]"),
];
function renderProduct() {
  const product = products[selected];
  const index = language === "en" ? 1 : 0;
  document.querySelector("#product-title")!.textContent = product.title[index];
  document.querySelector("#product-description")!.textContent =
    product.description[index];
  for (const [id, values] of [
    ["product-features", product.features[index]],
    ["blueprint-nodes", product.nodes[index]],
  ] as const) {
    document.getElementById(id)!.replaceChildren(
      ...values.map((value) => {
        const item = document.createElement(
          id === "product-features" ? "li" : "span",
        );
        item.textContent = value;
        return item;
      }),
    );
  }
  document.querySelector(".product-number")!.textContent =
    `0${Object.keys(products).indexOf(selected) + 1} / AXENTRA ${selected.toUpperCase()}`;
  document.querySelector("#blueprint-name")!.textContent =
    selected.toUpperCase();
  document.querySelector("#blueprint-caption")!.textContent = product.caption;
  document.querySelector<HTMLElement>(".product-blueprint")!.dataset.mode =
    selected;
  document
    .querySelector("#product-detail")!
    .setAttribute("aria-labelledby", `tab-${selected}`);
  for (const tab of tabs) {
    const active = tab.dataset.product === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
}
function renderLanguage() {
  document.documentElement.lang = language;
  languageSelect.value = language;
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-ko][data-en]",
  ))
    element.textContent = element.dataset[language]!;
  document.title = `Axentra · ${language === "ko" ? BRAND_TAGLINE : BRAND_TAGLINE_EN}`;
  const description =
    language === "ko"
      ? `Axentra — ${BRAND_TAGLINE} 생산·물류·현장 패널·공용 AI 에이전트를 연결하는 제조 운영 플랫폼.`
      : `Axentra — ${BRAND_TAGLINE_EN} A manufacturing operations platform connecting production, logistics, shop-floor panels and reusable AI agents.`;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content =
    description;
  document.querySelector<HTMLMetaElement>(
    'meta[property="og:title"]',
  )!.content = document.title;
  document.querySelector<HTMLMetaElement>(
    'meta[property="og:description"]',
  )!.content = description;
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    "[data-demo]",
  )) {
    const url = new URL(anchor.getAttribute("href")!, location.href);
    url.searchParams.set("lang", language);
    anchor.href = url.href;
  }
  renderProduct();
}
languageSelect.addEventListener("change", () => {
  language = languageSelect.value === "en" ? "en" : "ko";
  try {
    localStorage.setItem(storageKey, language);
  } catch {
    /* In-memory selection works without storage. */
  }
  const url = new URL(location.href);
  url.searchParams.set("lang", language);
  history.replaceState(null, "", url);
  renderLanguage();
});
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    selected = tab.dataset.product!;
    renderProduct();
  });
  tab.addEventListener("keydown", (event) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  });
});
// Preserve bookmarked console/panel routes after making the introduction the home page.
const legacyRoute =
  /^(?:overview|edge|data|twin|simulator|ai|agent|robot|physical|orders|settings|panels|panel-view|cctv|supply|integrations)(?:$|\?)|^panel\//;
if (legacyRoute.test(location.hash.slice(1)))
  location.replace(`./demo.html${location.search}${location.hash}`);
else renderLanguage();
