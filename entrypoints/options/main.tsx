import { createRoot } from "react-dom/client";
import App from "@/entrypoints/options/App";
import "@/assets/styles/index.css";
document.documentElement.lang = chrome.i18n.getUILanguage();
createRoot(document.getElementById("root")!).render(<App />);
