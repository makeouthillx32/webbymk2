import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { endWhepSession, whepSessionUrl, type SessionHandle } from "./whepSession";

// These run on the live broadcast path. The failure they prevent is not a
// crash: it is a WebRTC reader left attached to MediaMTX after the viewer moved
// on, which nothing in either player would ever surface.

const originalFetch = globalThis.fetch;
let calls: Array<{ url: string; method?: string; keepalive?: boolean }> = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method,
      keepalive: init?.keepalive,
    });
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function responseWith(location: string | null): Response {
  const headers = new Headers();
  if (location !== null) headers.set("Location", location);
  return new Response(null, { status: 201, headers });
}

describe("finding the session resource", () => {
  test("an absolute Location is used as given", () => {
    const url = whepSessionUrl(
      responseWith("https://media.tank.unenter.live/cameras/cam-1/whep/session/abc"),
      "https://media.tank.unenter.live/cameras/cam-1/whep",
    );
    expect(url).toBe("https://media.tank.unenter.live/cameras/cam-1/whep/session/abc");
  });

  test("a relative Location resolves against the request URL", () => {
    // MediaMTX sends a relative Location. Treating it as absolute would produce
    // a DELETE to nowhere, and the session would leak exactly as before while
    // the code looked like it was cleaning up.
    const url = whepSessionUrl(
      responseWith("whep/session/abc"),
      "https://media.tank.unenter.live/cameras/cam-1/whep",
    );
    expect(url).toBe("https://media.tank.unenter.live/cameras/cam-1/whep/session/abc");
  });

  test("a root-relative Location resolves against the origin", () => {
    const url = whepSessionUrl(
      responseWith("/whepsession/xyz"),
      "https://media.tank.unenter.live/cameras/cam-1/whep",
    );
    expect(url).toBe("https://media.tank.unenter.live/whepsession/xyz");
  });

  test("no Location header means no session to release", () => {
    expect(whepSessionUrl(responseWith(null), "https://example.test/whep")).toBeNull();
  });

  test("an unparseable Location yields null rather than throwing", () => {
    // A throw here would land inside the handshake's try/catch and be reported
    // as "WHEP failed", dumping a perfectly good connection onto HLS.
    expect(whepSessionUrl(responseWith("http://["), "not a url either")).toBeNull();
  });
});

describe("releasing the session", () => {
  test("a DELETE is sent, with keepalive", () => {
    // keepalive matters: the session most needs releasing exactly when the page
    // is going away (an OBS scene change), and a plain fetch is cancelled then.
    const handle: SessionHandle = { current: "https://media.test/whep/session/1" };
    endWhepSession(handle);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://media.test/whep/session/1");
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].keepalive).toBe(true);
  });

  test("the handle is cleared, so a double release sends one DELETE", () => {
    // Both the effect cleanup and the unmount cleanup call this on the same
    // handle. Two DELETEs for one session is harmless but noisy; more to the
    // point, clearing first is what makes the calls idempotent.
    const handle: SessionHandle = { current: "https://media.test/whep/session/2" };
    endWhepSession(handle);
    endWhepSession(handle);
    expect(handle.current).toBeNull();
    expect(calls).toHaveLength(1);
  });

  test("an empty handle sends nothing", () => {
    endWhepSession({ current: null });
    expect(calls).toHaveLength(0);
  });

  test("a failing DELETE never throws at the caller", () => {
    // This runs during teardown on a live broadcast. A rejection escaping here
    // would become an unhandled rejection in the OBS browser source.
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
    const handle: SessionHandle = { current: "https://media.test/whep/session/3" };
    expect(() => endWhepSession(handle)).not.toThrow();
    expect(handle.current).toBeNull();
  });

  test("a synchronously throwing fetch is also contained", () => {
    globalThis.fetch = (() => {
      throw new Error("blocked");
    }) as typeof fetch;
    const handle: SessionHandle = { current: "https://media.test/whep/session/4" };
    expect(() => endWhepSession(handle)).not.toThrow();
    expect(handle.current).toBeNull();
  });
});
