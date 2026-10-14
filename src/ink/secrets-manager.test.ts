import { describe, expect, test } from "bun:test";
import { diffKeys, parseDotenv, renderAppEnv, renderDbEnv, secretsConfig, siteUrl, validKeys, infisicalMailEnv, vaultLinkFor, vaultProjectUrl, infisicalProjectFile } from "./secrets-manager";

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

describe("Infisical mail comes from the site's SMTP", () => {
  test("maps the site's names to Infisical's, so Forgot password can send", () => {
    const env = infisicalMailEnv({ SMTP_HOST: "smtp.example", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASS: "p", SMTP_ADMIN_EMAIL: "a@example", SMTP_SENDER_NAME: "site" });
    expect(env).toContain("SMTP_HOST=smtp.example");
    expect(env).toContain("SMTP_USERNAME=u");
    expect(env).toContain("SMTP_PASSWORD=p");
    expect(env).toContain("SMTP_FROM_ADDRESS=a@example");
  });

  test("no SMTP on the site means no mail settings, not half of them", () => {
    expect(infisicalMailEnv({ SMTP_HOST: "smtp.example" })).toEqual([]);
  });
});

describe("each UNAXIS project has its own vault project", () => {
  const P = "0b775aa1-1617-4d9d-80be-d201d3ae6545", O = "bc905aa3-16f3-4d34-bab6-4393bf854c64";
  test("links are kept per project; bad ids are dropped", () => {
    const c = secretsConfig({ projects: { "unenter.live": { projectId: P, orgId: O, environment: "dev" }, junk: { projectId: "x", orgId: O } } });
    expect(vaultLinkFor(c, "unenter.live")).toEqual({ projectId: P, orgId: O, environment: "dev" });
    expect(vaultLinkFor(c, "junk")).toBeNull();
    expect(vaultLinkFor(c, "other")).toBeNull();
  });

  test("the web UI link opens that project", () => {
    expect(vaultProjectUrl("http://100.78.83.20:8222/", { orgId: O, projectId: P }))
      .toBe(`http://100.78.83.20:8222/organizations/${O}/projects/secret-management/${P}/overview`);
  });

  test(".infisical.json carries ids only, no secrets and no server address", () => {
    const f = JSON.parse(infisicalProjectFile({ projectId: P, environment: "dev" }));
    expect(f).toEqual({ workspaceId: P, defaultEnvironment: "dev", gitBranchToEnvironmentMapping: null });
  });
});
