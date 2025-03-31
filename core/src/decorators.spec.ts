// decorators.spec.ts
import "reflect-metadata";
import { AxiosResponse } from "axios";
import {
  Get,
  Post,
  Delete,
  Patch,
  Auth,
  Headers,
  Normalize,
  getNormalizationMapping,
} from "./decorators";
import { AuthStrategy } from "./auth/auth.strategy";
import { Pluggable } from "./pluggable";
import { HTTPMethods } from "./types";

// Create a concrete test API class that extends Pluggable and defines endpoint methods via decorators.
class TestAPI extends Pluggable {
  baseUrl(): string {
    return "http://api.test.com";
  }

  // Endpoint methods now accept an extra parameter (the API response) and return that response.
  @Get<void, anyy>("/get/empty")
  async getEmpty(
    params?: any,
    response?: Promise<AxiosResponse<void>>
  ): Promise<AxiosResponse<void>> {
    return response;
  }

  @Post("/post")
  postEndpoint(
    params?: any,
    response?: AxiosResponse<any>
  ): Promise<AxiosResponse<any>> {
    return response;
  }
  d;
  @Delete("/delete")
  deleteEndpoint(
    params?: any,
    response?: AxiosResponse<any>
  ): Promise<AxiosResponse<any>> {
    return response;
  }

  @Patch("/patch")
  patchEndpoint(
    params?: any,
    response?: AxiosResponse<any>
  ): Promise<AxiosResponse<any>> {
    return response;
  }

  @Auth(AuthStrategy.Type.BEARER_TOKEN)
  @Get("/auth/test")
  authEndpoint(
    params?: any,
    response?: AxiosResponse<any>
  ): Promise<AxiosResponse<any>> {
    return response;
  }

  @Headers({ "X-Custom-Header": "value" })
  @Get("/headers/test")
  headersEndpoint(
    params?: any,
    response?: AxiosResponse<any>
  ): Promise<AxiosResponse<any>> {
    return response;
  }

  @Normalize({ normalized: "data.value" })
  @Post("/normalize")
  normalizeEndpoint(
    params?: any,
    response?: AxiosResponse<any>
  ): Promise<AxiosResponse<any>> {
    return response;
  }
}

describe("TestAPI with decorators", () => {
  let api: TestAPI;
  let mockAxios: { request: jest.Mock };
  let mockEmitter: { emit: jest.Mock };
  let mockLogger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    // Create mocks for axios, event emitter, and logger.
    mockAxios = {
      request: jest.fn().mockResolvedValue({
        data: { result: "success", data: { value: "normalized-value" } },
        status: 200,
        statusText: "OK",
      }),
    };
    mockEmitter = {
      emit: jest.fn(),
    };
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Instantiate the TestAPI with the mocks.
    api = new TestAPI(mockAxios as any, mockEmitter as any, mockLogger as any);
  });

  describe("Metadata", () => {
    it("should attach correct metadata for HTTP methods", () => {
      const getMeta = Reflect.getMetadata(
        "http:method",
        TestAPI.prototype,
        "getEmpty"
      );
      expect(getMeta).toEqual({ method: "GET", url: "/get/empty" });

      const postMeta = Reflect.getMetadata(
        "http:method",
        TestAPI.prototype,
        "postEndpoint"
      );
      expect(postMeta).toEqual({ method: "POST", url: "/post" });

      const deleteMeta = Reflect.getMetadata(
        "http:method",
        TestAPI.prototype,
        "deleteEndpoint"
      );
      expect(deleteMeta).toEqual({ method: "DELETE", url: "/delete" });

      const patchMeta = Reflect.getMetadata(
        "http:method",
        TestAPI.prototype,
        "patchEndpoint"
      );
      expect(patchMeta).toEqual({ method: "PATCH", url: "/patch" });
    });

    it("should attach authentication metadata", () => {
      const authMeta = Reflect.getMetadata(
        "http:auth",
        TestAPI.prototype,
        "authEndpoint"
      );
      expect(authMeta).toBe(AuthStrategy.Type.BEARER_TOKEN);
    });

    it("should attach headers metadata", () => {
      const headersMeta = Reflect.getMetadata(
        "http:headers",
        TestAPI.prototype,
        "headersEndpoint"
      );
      expect(headersMeta).toEqual({ "X-Custom-Header": "value" });
    });

    it("should attach normalization mapping metadata", () => {
      const normMeta = Reflect.getMetadata(
        "normalize:mapping",
        TestAPI.prototype,
        "normalizeEndpoint"
      );
      expect(normMeta).toEqual({ normalized: "data.value" });
      // Also test helper function
      const mapping = getNormalizationMapping(
        TestAPI.prototype,
        "normalizeEndpoint"
      );
      expect(mapping).toEqual({ normalized: "data.value" });
    });
  });

  describe("Default implementation", () => {
    it("getEmpty should construct proper URL and call axios", async () => {
      const response = await api.getEmpty({ query: { a: 1 } });
      expect(mockAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "http://api.test.com/get/empty",
          method: "GET",
          params: { a: 1 },
        })
      );
      // Verify that the response is returned unmodified.
      expect(response.data).toEqual({
        result: "success",
        data: { value: "normalized-value" },
      });
    });

    it("postEndpoint should use POST and construct URL correctly", async () => {
      const response = await api.postEndpoint({ payload: { key: "value" } });
      expect(mockAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "http://api.test.com/post",
          method: "POST",
          data: { key: "value" },
        })
      );
      expect(response.data).toEqual({
        result: "success",
        data: { value: "normalized-value" },
      });
    });

    it("authEndpoint should trigger authentication metadata", async () => {
      const response = await api.authEndpoint();
      expect(mockAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "http://api.test.com/auth/test",
          method: "GET",
        })
      );
      expect(response.data).toEqual({
        result: "success",
        data: { value: "normalized-value" },
      });
    });

    it("headersEndpoint should merge headers with defaults", async () => {
      const response = await api.headersEndpoint();
      expect(mockAxios.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "http://api.test.com/headers/test",
          method: "GET",
          headers: expect.objectContaining({
            "X-Custom-Header": "value",
          }),
        })
      );
      expect(response.data).toEqual({
        result: "success",
        data: { value: "normalized-value" },
      });
    });

    it("normalizeEndpoint should normalize response data", async () => {
      const response = await api.normalizeEndpoint();
      // The Normalize decorator mapping { normalized: "data.value" } should transform the response data.
      expect(response.data).toEqual({ normalized: "normalized-value" });
    });
  });
});
