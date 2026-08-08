import { randomBytes } from "node:crypto";

console.log("AUTH_SECRET=" + randomBytes(32).toString("hex"));
console.log("ADMIN_SETUP_KEY=" + randomBytes(24).toString("base64url"));
console.log("\nGuarde a ADMIN_SETUP_KEY: ela será pedida uma única vez em /admin.");
