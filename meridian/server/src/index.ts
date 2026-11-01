import { migrate, get } from "./db.js";
import { createApp } from "./app.js";
import { seed } from "./seed.js";

migrate();
if (!get("SELECT id FROM users LIMIT 1")) {
  console.log("[meridian] empty database — seeding demo data");
  seed();
}
const port = Number(process.env.PORT || 4000);
createApp().listen(port, () => console.log(`[meridian] API listening on http://localhost:${port}`));
