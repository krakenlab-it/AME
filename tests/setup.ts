import { randomBytes } from "node:crypto";

// Claves efímeras solo para pruebas
process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.HASH_PEPPER = randomBytes(48).toString("base64url");
process.env.APP_BASE_URL = "https://portal.test";
