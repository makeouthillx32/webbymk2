import { describe, expect, test } from "bun:test";
import { diffKeys, parseDotenv, renderAppEnv, renderDbEnv, secretsConfig, siteUrl, validKeys } from "./secrets-manager";

describe(".env handling", () => {
  test("parses the way .env files are written, CRLF included", () => {
    const text = 'A=1\r\n# comment\r\nexport B="two words"\nC=\'x=y\'\nBAD LINE\nD=\n';
    expect(parseDotenv(text)).toEqual({ A: "1", B: "two words", C: "x=y", D: "" });
  });
  test("diff reports names only", () => {
    const d = diffKeys({ A: "1", B: "2", C: "3" }, { A: "1", B: "changed", E: "5" });
    expect(d).toEqual({ onlyLocal: ["C"], onlyRemote: ["E"], changed: ["B"] });
  });
});

const keys = { encryptionKey: "0123456789abcdef0123456789abcdef", authSecret: Buffer.alloc(32, 7).toString("base64"), dbPassword: "p@ss/word+with=chars-000000" };

describe("secrets manager config", () => {
  test("site URL is derived from the host unless overridden", () => {
    expect(siteUrl(secretsConfig(), "100.64.0.2")).toBe("http://100.64.0.2:8222");
    expect(siteUrl(secretsConfig({ siteUrl: "https://secrets.example.test/" }), "x")).toBe("https://secrets.example.test");
  });

  test("app env points at its own db and redis, telemetry off, password URL-encoded", () => {
    const env = renderAppEnv(secretsConfig(), "100.64.0.2", keys);
    expect(env).toContain("TELEMETRY_ENABLED=false");
    expect(env).toContain("REDIS_URL=redis://unt_secrets_redis:6379");
    expect(env.find((e) => e.startsWith("DB_CONNECTION_URI="))).toBe(
      `DB_CONNECTION_URI=postgres://infisical:${encodeURIComponent(keys.dbPassword)}@unt_secrets_db:5432/infisical`);
    expect(renderDbEnv(keys)).toContain(`POSTGRES_PASSWORD=${keys.dbPassword}`);
  });

  test("keys must match Infisical's formats", () => {
    expect(validKeys(keys)).toBe(true);
    expect(validKeys({ ...keys, encryptionKey: "short" })).toBe(false);
    expect(validKeys({ ...keys, authSecret: "abc" })).toBe(false);
  });
});
