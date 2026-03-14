import meta from "../../../pages/_meta.js";
import guides_meta from "../../../pages/guides/_meta.js";
export const pageMap = [{
  data: meta
}, {
  name: "aivm",
  route: "/aivm",
  frontMatter: {
    "sidebarTitle": "Aivm"
  }
}, {
  name: "api",
  route: "/api",
  frontMatter: {
    "sidebarTitle": "API"
  }
}, {
  name: "architecture",
  route: "/architecture",
  frontMatter: {
    "sidebarTitle": "Architecture"
  }
}, {
  name: "faq",
  route: "/faq",
  frontMatter: {
    "sidebarTitle": "Faq"
  }
}, {
  name: "guides",
  route: "/guides",
  children: [{
    data: guides_meta
  }, {
    name: "contributing",
    route: "/guides/contributing",
    frontMatter: {
      "sidebarTitle": "Contributing"
    }
  }, {
    name: "database",
    route: "/guides/database",
    frontMatter: {
      "sidebarTitle": "Database"
    }
  }, {
    name: "deploy",
    route: "/guides/deploy",
    frontMatter: {
      "sidebarTitle": "Deploy"
    }
  }, {
    name: "environments",
    route: "/guides/environments",
    frontMatter: {
      "sidebarTitle": "Environments"
    }
  }, {
    name: "operations",
    route: "/guides/operations",
    frontMatter: {
      "sidebarTitle": "Operations"
    }
  }, {
    name: "scripts",
    route: "/guides/scripts",
    frontMatter: {
      "sidebarTitle": "Scripts"
    }
  }, {
    name: "security",
    route: "/guides/security",
    frontMatter: {
      "sidebarTitle": "Security"
    }
  }]
}, {
  name: "how-it-works",
  route: "/how-it-works",
  frontMatter: {
    "sidebarTitle": "How It Works"
  }
}, {
  name: "index",
  route: "/",
  frontMatter: {
    "sidebarTitle": "Index"
  }
}, {
  name: "ios",
  route: "/ios",
  frontMatter: {
    "sidebarTitle": "iOS"
  }
}, {
  name: "protocol",
  route: "/protocol",
  frontMatter: {
    "sidebarTitle": "Protocol"
  }
}];