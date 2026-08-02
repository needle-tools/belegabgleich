import { mount } from "svelte";
import App from "./App.svelte";

// Global styles live in public/site.css so the generated marketing pages and
// this app share one stylesheet (see site/layout.mjs).
mount(App, { target: document.getElementById("app")! });
