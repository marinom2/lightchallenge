import { DocsThemeConfig } from "nextra-theme-docs";

const config: DocsThemeConfig = {
  logo: (
    <span style={{ fontWeight: 700, fontSize: 18 }}>
      <span style={{ background: "linear-gradient(135deg, #6B5CFF, #00D4FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Light</span>
      Challenge
    </span>
  ),
  project: {
    link: "https://github.com/marinom2/lightchallenge",
  },
  docsRepositoryBase: "https://github.com/marinom2/lightchallenge/tree/main/docs-site/pages",
  footer: {
    text: (
      <span>
        {new Date().getFullYear()} LightChallenge Protocol — Powered by{" "}
        <a href="https://lightchain.ai" target="_blank" rel="noopener noreferrer">
          Lightchain AI
        </a>
      </span>
    ),
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="LightChallenge — Challenges verified by decentralized AI" />
      <meta name="og:title" content="LightChallenge Documentation" />
    </>
  ),
  useNextSeoProps() {
    return { titleTemplate: "%s — LightChallenge Docs" };
  },
  sidebar: {
    defaultMenuCollapseLevel: 1,
    toggleButton: true,
  },
  toc: {
    float: true,
  },
  navigation: {
    prev: true,
    next: true,
  },
  primaryHue: 250,
};

export default config;
