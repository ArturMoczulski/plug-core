// decorators.ts
import 'reflect-metadata';
import { AuthStrategy } from './auth/auth.strategy';
import { RemoteAPI } from './remote-api';
import {
  PublicEndpointCallParams,
  GuardedEndpointCallParams,
  EndpointCallParams,
} from './types';
import { AxiosResponse } from 'axios';

export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH';

interface HttpMethodMetadata {
  method: HttpMethod;
  /**
   * If url contains '://' then it's an obsolute URL for
   * the endpoint in the API's base URL will not be
   * used to construct the API call URL
   */
  url: string;
}

// Shared decorator factory
function createHttpMethodDecorator(httpMethod: HttpMethod) {
  return function <
    ResponseType = undefined,
    ParamsType extends EndpointCallParams = undefined,
  >(url: string) {
    return function (
      target: RemoteAPI,
      propertyKey: string,
      descriptor: PropertyDescriptor,
    ) {
      // Define metadata for the HTTP method and URL
      const metadata: HttpMethodMetadata = { method: httpMethod, url };
      Reflect.defineMetadata('http:method', metadata, target, propertyKey);

      // Retrieve existing decorators' metadata (e.g., Auth, Headers)
      const authMetadata: any = Reflect.getMetadata(
        'http:auth',
        target,
        propertyKey,
      );
      const headersMetadata: any = Reflect.getMetadata(
        'http:headers',
        target,
        propertyKey,
      );

      // Preserve the original method for potential future use
      const originalMethod = descriptor.value;

      descriptor.value = async function (
        this: RemoteAPI,
        params: ParamsType | never = undefined,
      ) {
        // Use 'this' to ensure the correct context is maintained
        return (await this.call<ResponseType, ParamsType>(
          propertyKey,
          params,
        )) as AxiosResponse<ResponseType>;
      };

      return descriptor;
    };
  };
}

// Export HTTP method decorators using the factory
export const Get = createHttpMethodDecorator('GET');
export const Post = createHttpMethodDecorator('POST');
export const Delete = createHttpMethodDecorator('DELETE');
export const Patch = createHttpMethodDecorator('PATCH');

// Auth Decorator
export function Auth(type: AuthStrategy.Type) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata('http:auth', type, target, propertyKey);
  };
}

// Headers Decorator
export function Headers(headers: Record<string, string>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    Reflect.defineMetadata('http:headers', headers, target, propertyKey);
  };
}

/**
 * Normalize Decorator
 *
 * This decorator defines a normalization mapping between the API response
 * and the desired return type. It uses JSON paths to extract and map data.
 *
 * @param mapping - An object where keys are the properties of the desired return type
 *                  and values are the JSON paths in the API response. It can also be
 *                  a function that will perform the transformation
 * @returns MethodDecorator
 *
 * @example
 * @Normalize<AccessTokenResponse>({
 *   accessToken: 'data.access_token',
 *   refreshToken: 'data.refresh_token',
 * })
 * @Normalize<AccessTokenResponse>((payload: any) => ({
 *   accessToken: decode(payload.encodedAccessToken)
 * }))
 */
export function Normalize(
  mapping:
    | Record<string, string>
    | ((
      api: RemoteAPI,
      params: EndpointCallParams,
      payload: any,
    ) => Record<string, any>),
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    Reflect.defineMetadata('normalize:mapping', mapping, target, propertyKey);
  };
}

/**
 * Retrieves the normalization mapping for a given method.
 *
 * @param target - The prototype of the class.
 * @param propertyKey - The name of the method.
 * @returns The normalization mapping object or undefined if not set.
 */
export function getNormalizationMapping(
  target: any,
  propertyKey: string | symbol,
):
  | Record<string, string>
  | ((
    api: RemoteAPI,
    params: EndpointCallParams,
    payload: any,
  ) => Record<string, any>)
  | undefined {
  return Reflect.getMetadata('normalize:mapping', target, propertyKey);
}
