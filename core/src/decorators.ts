// decorators.ts
import { AxiosResponse } from "axios";
import "reflect-metadata";
import { AuthStrategy } from "./auth/auth.strategy";
import { Pluggable } from "./pluggable";
import { EndpointCallParams } from "./types";

export type HttpMethod = "GET" | "POST" | "DELETE" | "PATCH";

interface HttpMethodMetadata {
  method: HttpMethod;
  /**
   * If the URL contains '://', then it's an absolute URL and the API's base URL
   * will not be used to construct the API call URL.
   */
  url: string;
}

/**
 * Factory for HTTP method decorators.
 *
 * When applied to an async endpoint method, the decorator:
 * 1. Attaches HTTP metadata (method and URL) to the target.
 * 2. Wraps the original method so that:
 *    - It first calls this.call(endpointName, params) to obtain the Axios response.
 *    - It then invokes the original method with its original arguments plus the response appended.
 *    - If the original method returns undefined, the Axios response is returned.
 */
function createHttpMethodDecorator(httpMethod: HttpMethod) {
  return function <
    ResponseType = undefined,
    ParamsType extends EndpointCallParams = undefined,
  >(url: string) {
    return function (
      target: any,
      propertyKey: string,
      descriptor?: PropertyDescriptor
    ): PropertyDescriptor {
      // If descriptor is not provided, attempt to get it.
      if (!descriptor) {
        descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
      }
      // If still missing, create a default descriptor.
      if (!descriptor) {
        descriptor = {
          configurable: true,
          enumerable: true,
          writable: true,
          value: undefined,
        };
      }
      // Attach HTTP metadata.
      const metadata: HttpMethodMetadata = { method: httpMethod, url };
      Reflect.defineMetadata("http:method", metadata, target, propertyKey);

      const originalMethod = descriptor.value;
      descriptor.value = async function (
        ...args: any[]
      ): Promise<AxiosResponse<ResponseType>> {
        const params: ParamsType = args[0];
        // Call the API via this.call.
        const response = await (
          this.call as <R, P>(
            endpointName: string,
            params?: P,
            eventContext?: any,
            overwriteUrl?: string
          ) => Promise<AxiosResponse<R>>
        )(propertyKey, params);
        // Call the original method with original args plus the response appended.
        const result = await originalMethod.apply(this, [...args, response]);
        // If the original method returns undefined, fall back to the API response.
        return (
          result === undefined ? response : result
        ) as AxiosResponse<ResponseType>;
      };

      // Cast the returned descriptor as any to satisfy TypeScript.
      return descriptor as any;
    };
  };
}

export const Get = createHttpMethodDecorator("GET");
export const Post = createHttpMethodDecorator("POST");
export const Delete = createHttpMethodDecorator("DELETE");
export const Patch = createHttpMethodDecorator("PATCH");

export function Auth(type: AuthStrategy.Type) {
  return function (
    target: any,
    propertyKey: string,
    descriptor?: PropertyDescriptor
  ): void {
    Reflect.defineMetadata("http:auth", type, target, propertyKey);
  };
}

export function Headers(headers: Record<string, string>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor?: PropertyDescriptor
  ): void {
    Reflect.defineMetadata("http:headers", headers, target, propertyKey);
  };
}

/**
 * Normalize Decorator
 *
 * Attaches a normalization mapping (or transformation function) to the method.
 */
export function Normalize(
  mapping:
    | Record<string, string>
    | ((
        api: Pluggable,
        params: EndpointCallParams,
        payload: any
      ) => Record<string, any>)
): MethodDecorator {
  return function (
    target: any,
    propertyKey: string,
    descriptor?: PropertyDescriptor
  ): void {
    Reflect.defineMetadata("normalize:mapping", mapping, target, propertyKey);
  };
}

/**
 * Retrieves the normalization mapping for a given method.
 */
export function getNormalizationMapping(
  target: any,
  propertyKey: string | symbol
):
  | Record<string, string>
  | ((
      api: Pluggable,
      params: EndpointCallParams,
      payload: any
    ) => Record<string, any>)
  | undefined {
  return Reflect.getMetadata("normalize:mapping", target, propertyKey);
}
