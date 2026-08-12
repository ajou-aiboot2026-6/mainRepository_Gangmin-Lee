import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
createApp(config).listen(config.port, "0.0.0.0", () => {
  console.log(`Seoul Stay Pathfinder listening on :${config.port}`);
});
