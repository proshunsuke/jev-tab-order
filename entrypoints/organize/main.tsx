import { createRoot } from "react-dom/client";
import App from "@/entrypoints/organize/App";
import "@/assets/styles/index.css";
document.documentElement.lang = chrome.i18n.getUILanguage();
createRoot(document.getElementById("root")!).render(<App />);
