import { AxiosError, AxiosResponse } from "axios";
import "reflect-metadata";
import { AuthStrategy } from "./auth/auth.strategy";
import { LocalRemoteAPIRateLimitExceeded } from "./exceptions";
import { ILogger } from "./logger";
import { Pluggable } from "./pluggable";
import { HTTPMethods } from "./types";

// Create a dummy BearerToken auth strategy to test auth functionality.
class DummyBearerTokenAuthStrategy extends AuthStrategy {
  type(): AuthStrategy.Type {
    return DummyBearerTokenAuthStrategy.Type.BEARER_TOKEN;
  }

  execute(pluggable: Pluggable, apiCall: any) {
    if (!apiCall.request.auth || !apiCall.request.auth.accessToken) {
      throw new Error("Invalid auth parameters");
    }
    apiCall.request.headers = {
      ...apiCall.request.headers,
      Authorization: `Bearer ${apiCall.request.auth.accessToken}`,
    };
    return apiCall;
  }
}

// Create a concrete subclass of Pluggable for testing.
class PluggableTest extends Pluggable {
  baseUrl(): string {
    return "http://testapi.com";
  }

  // Dummy endpoints. The actual logic will be handled via the inherited `call` method.
  getEmpty(params?: any) {
    return this.call("getEmpty", params);
  }

  postEndpoint(params?: any) {
    return this.call("postEndpoint", params);
  }

  deleteEndpoint(params?: any) {
    return this.call("deleteEndpoint", params);
  }

  update(params?: any) {
    return this.call("update", params);
  }

  withEndpointHeaders(params?: any) {
    return this.call("withEndpointHeaders", params);
  }

  getUserDetails(params: any) {
    return this.call("getUserDetails", params);
  }

  search(params: any, eventContext?: any, overwriteUrl?: string) {
    return this.call("search", params, eventContext, overwriteUrl);
  }

  bearerAuthEndpoint(params?: any) {
    return this.call("bearerAuthEndpoint", params);
  }

  // Endpoint to test response normalization.
  normalizeTest(params?: any) {
    return this.call("normalizeTest", params);
  }
}

// Define metadata for endpoints on PluggableTest.
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.GET, url: "/get/empty" },
  PluggableTest.prototype,
  "getEmpty"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.POST, url: "/post" },
  PluggableTest.prototype,
  "postEndpoint"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.DELETE, url: "/delete" },
  PluggableTest.prototype,
  "deleteEndpoint"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.PATCH, url: "/update" },
  PluggableTest.prototype,
  "update"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.GET, url: "/with-endpoint-headers" },
  PluggableTest.prototype,
  "withEndpointHeaders"
);
Reflect.defineMetadata(
  "http:headers",
  { "my-header": "test" },
  PluggableTest.prototype,
  "withEndpointHeaders"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.GET, url: "/users/:userId/details" },
  PluggableTest.prototype,
  "getUserDetails"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.GET, url: "/search" },
  PluggableTest.prototype,
  "search"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.GET, url: "/bearer-auth" },
  PluggableTest.prototype,
  "bearerAuthEndpoint"
);
Reflect.defineMetadata(
  "http:auth",
  AuthStrategy.Type.BEARER_TOKEN,
  PluggableTest.prototype,
  "bearerAuthEndpoint"
);
Reflect.defineMetadata(
  "http:method",
  { method: HTTPMethods.POST, url: "/normalize" },
  PluggableTest.prototype,
  "normalizeTest"
);
// For normalization, we simulate an object mapping.
Reflect.defineMetadata(
  "normalize:mapping",
  { accessToken: "tokens.access_token", refreshToken: "tokens.refresh_token" },
  PluggableTest.prototype,
  "normalizeTest"
);

describe("Pluggable", () => {
  let pluggable: PluggableTest;
  let axiosInstance: any;
  let eventEmitter: any;
  let logger: ILogger;

  beforeEach(() => {
    // Create a simple mock for axiosInstance.request.
    axiosInstance = {
      request: jest.fn(),
    };

    // Create a simple mock for eventEmitter.
    eventEmitter = {
      emit: jest.fn(),
    };

    // Use a dummy logger.
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Instantiate PluggableTest with our mocks.
    pluggable = new PluggableTest(axiosInstance, eventEmitter, logger);

    // Inject our dummy auth strategy.
    pluggable["_authStrategies"][AuthStrategy.Type.BEARER_TOKEN] =
      new DummyBearerTokenAuthStrategy();
  });

  describe("basic configuration", () => {
    it("should return correct baseUrl", () => {
      expect(pluggable.baseUrl()).toBe("http://testapi.com");
    });

    it("should return default auth strategy as NONE", () => {
      expect(pluggable.defaultAuthStrategy()).toBe(AuthStrategy.Type.NONE);
    });

    it("should return empty default headers", () => {
      expect(pluggable.defaultHeaders()).toEqual({});
    });

    it("should return rateLimit of 450", () => {
      expect(pluggable.rateLimit()).toBe(450);
    });

    it("should return rateLimitWindowLength of 20000 ms", () => {
      expect(pluggable.rateLimitWindowLength()).toBe(20000);
    });

    it("nextRateLimitWindow should be current window start plus window length", () => {
      const start = pluggable.currentRateLimitWindowStart();
      expect(pluggable.nextRateLimitWindow()).toBe(start + 20000);
    });
  });

  describe("URL construction", () => {
    it("should construct URL with baseUrl and endpoint path", () => {
      axiosInstance.request.mockResolvedValueOnce({ data: {}, status: 200 });
      return pluggable.getEmpty().then(() => {
        expect(axiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: "http://testapi.com/get/empty",
            method: HTTPMethods.GET,
          })
        );
      });
    });

    it("should construct URL with path parameters", () => {
      axiosInstance.request.mockResolvedValueOnce({ data: {}, status: 200 });
      const userId = "123";
      return pluggable.getUserDetails({ pathParams: { userId } }).then(() => {
        expect(axiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `http://testapi.com/users/${userId}/details`,
            method: HTTPMethods.GET,
          })
        );
      });
    });

    it("should append query params correctly", () => {
      axiosInstance.request.mockResolvedValueOnce({ data: {}, status: 200 });
      const query = { search: "test", limit: 10 };
      return pluggable.search({ query }).then(() => {
        expect(axiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: "http://testapi.com/search",
            params: query,
            method: HTTPMethods.GET,
          })
        );
      });
    });

    it("should use overwrite URL if provided", () => {
      axiosInstance.request.mockResolvedValueOnce({ data: {}, status: 200 });
      const overwriteUrl = "http://google.com";
      return pluggable
        .search({ query: { test: 1 } }, undefined, overwriteUrl)
        .then(() => {
          expect(axiosInstance.request).toHaveBeenCalledWith(
            expect.objectContaining({
              url: overwriteUrl,
              method: HTTPMethods.GET,
            })
          );
        });
    });
  });

  describe("headers", () => {
    it("should merge default and endpoint headers", () => {
      axiosInstance.request.mockResolvedValueOnce({ data: {}, status: 200 });
      // Override defaultHeaders for this test.
      jest
        .spyOn(pluggable, "defaultHeaders")
        .mockReturnValue({ "default-header": "default" });
      return pluggable.withEndpointHeaders().then(() => {
        expect(axiosInstance.request).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              "default-header": "default",
              "my-header": "test",
            }),
          })
        );
      });
    });
  });

  describe("API call and event emission", () => {
    it("should emit before, success, and after events on successful call", async () => {
      const responseData = { success: true };
      axiosInstance.request.mockResolvedValueOnce({
        data: responseData,
        status: 200,
      });

      await pluggable.getEmpty();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining("getEmpty.before"),
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining("getEmpty.success"),
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining("getEmpty.after"),
        expect.any(Object)
      );
    });

    it("should emit error and after events on failed call", async () => {
      const axiosError = new AxiosError("Error");
      axiosInstance.request.mockRejectedValueOnce(axiosError);

      await expect(pluggable.getEmpty()).rejects.toThrow();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining("getEmpty.error"),
        expect.any(Object)
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining("getEmpty.after"),
        expect.any(Object)
      );
    });
  });

  describe("authentication", () => {
    it("should add Authorization header for bearerAuthEndpoint", () => {
      const responseData = { success: true };
      axiosInstance.request.mockResolvedValueOnce({
        data: responseData,
        status: 200,
      });

      const token = "mock_token";
      return pluggable
        .bearerAuthEndpoint({ auth: { accessToken: token } })
        .then(() => {
          expect(axiosInstance.request).toHaveBeenCalledWith(
            expect.objectContaining({
              headers: expect.objectContaining({
                Authorization: `Bearer ${token}`,
              }),
            })
          );
        });
    });

    it("should throw an error if auth parameters are missing for bearerAuthEndpoint", async () => {
      axiosInstance.request.mockResolvedValueOnce({ data: {}, status: 200 });
      await expect(pluggable.bearerAuthEndpoint()).rejects.toThrow();
    });
  });

  describe("normalization", () => {
    it("should normalize response data using object mapping", async () => {
      const apiResponse = {
        tokens: { access_token: "abc", refresh_token: "def" },
      };
      const normalizedResponse = { accessToken: "abc", refreshToken: "def" };
      axiosInstance.request.mockResolvedValueOnce({
        data: apiResponse,
        status: 200,
      });

      const response: AxiosResponse = await pluggable.normalizeTest();
      // Verify that the request was made correctly.
      expect(axiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "http://testapi.com/normalize",
          method: HTTPMethods.POST,
        })
      );
      // Check that the response data was normalized.
      expect(response.data).toEqual(normalizedResponse);
    });
  });

  describe("rate limiting", () => {
    it("should enforce global rate limit", async () => {
      // For testing, override rateLimit to a smaller number.
      jest.spyOn(pluggable, "rateLimit").mockReturnValue(3);
      axiosInstance.request.mockResolvedValue({ data: {}, status: 200 });
      await pluggable.getEmpty();
      await pluggable.getEmpty();
      await pluggable.getEmpty();

      await expect(pluggable.getEmpty()).rejects.toThrow(
        LocalRemoteAPIRateLimitExceeded
      );
      expect(pluggable.rateLimitWindowCounter()).toBe(3);
    });

    it("should reset rate limit counter after the window", async () => {
      jest.spyOn(pluggable, "rateLimit").mockReturnValue(2);
      axiosInstance.request.mockResolvedValue({ data: {}, status: 200 });

      await pluggable.getEmpty();
      await pluggable.getEmpty();
      expect(pluggable.rateLimitWindowCounter()).toBe(2);

      // Wait for window length plus a short delay.
      await new Promise((r) =>
        setTimeout(r, pluggable.rateLimitWindowLength() + 10)
      );
      axiosInstance.request.mockResolvedValue({ data: {}, status: 200 });
      await pluggable.getEmpty();
      expect(pluggable.rateLimitWindowCounter()).toBe(1);
    });
  });
});
