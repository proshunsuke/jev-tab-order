import { defineConfig } from "wxt";
export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/i18n/module"],
  manifest: {
    name: "Jev Tab Order",
    description: "__MSG_extensionDescription__",
    default_locale: "en",
    minimum_chrome_version: "138",
    permissions: ["storage", "tabs", "tabGroups", "contextMenus"],
    host_permissions: ["https://api.typesafe.ai/*"],
    action: { default_title: "__MSG_organize__" },
    commands: {
      organize: { description: "__MSG_organize__" },
      undo: { description: "__MSG_undo__" },
    },
  },
  outDir: "dist",
  dev: { server: { port: 5790 } },
});
