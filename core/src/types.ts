// types.ts

import { AxiosResponse } from "axios";
import { AuthStrategy } from "./auth/auth.strategy";
import { Pluggable } from "./pluggable";

export enum HTTPMethods {
  GET = "GET",
  POST = "POST",
  PATCH = "PATCH",
  DELETE = "DELETE",
}

export type Endpoint<Payload = undefined, Response = any> = {
  name: string; // Unique identifier for the endpoint
  method: HTTPMethods;
  url: string;
  authentication?: AuthStrategy.Type;
  headers?: Record<string, string>;

  // Optionally, specify path parameters if needed
  pathParams?: Record<string, any>;

  // Optional normalization mapping
  normalizationMapping?:
    | Record<string, string>
    | ((
        api: Pluggable,
        params: EndpointCallParams,
        payload: any
      ) => Record<string, any>);

  // endpoint-scoped rate limits curently not yet supported
  // rateLimits?: ApiRateLimit;
} & (Payload extends undefined ? {} : { payloadType: Payload }) &
  (Response extends undefined ? {} : { responseType: Response });

export type EndpointsRegistry = Record<string, Endpoint>;

export enum EndpointEventTypes {
  BEFORE = "before",
  AFTER = "after",
  SUCCESS = "success",
  ERROR = "error",
}

export type RateLimit = {
  maxCalls: number;
  windowLength: number;
};

export class APICall<
  PayloadType = undefined,
  ResponseType = undefined,
  AuthParamsType = undefined,
> {
  constructor(
    public readonly endpoint: Endpoint,
    public request: {
      method: HTTPMethods;
      url: string;
      query?: Record<string, any>;
      headers?: Record<string, string>;
      /**
       * Data needed for authentication like accessToken
       */
      auth?: AuthParamsType;
      payload?: PayloadType;
    }
  ) {}

  public response: AxiosResponse<ResponseType, any>;

  public toString() {
    return (
      `${this.endpoint.name}: ${this.endpoint.method} ${this.endpoint.url}` +
      (this.endpoint.url != this.request.url
        ? `\nURL: ${this.request.url}`
        : ``) +
      (this.request.query
        ? `\nQuery: ${
            this.request.query
              ? JSON.stringify(this.request.query, null, 2)
              : "N/A"
          }`
        : "") +
      (this.request.headers
        ? `\nHeaders: ${
            this.request.headers
              ? JSON.stringify(this.request.headers, null, 2)
              : "N/A"
          }`
        : "") +
      (this.request.payload
        ? `\nPayload: ${
            this.request.payload
              ? JSON.stringify(this.request.payload, null, 2)
              : "N/A"
          }`
        : "") +
      (this.response
        ? `\nResponse: ${this.response.status} ${this.response.statusText}\n${
            this.response.data
              ? JSON.stringify(this.response.data, null, 2)
              : "N/A"
          }`
        : "")
    );
  }
}

export type EndpointCallParams =
  | PublicEndpointCallParams
  | GuardedEndpointCallParams;

export type PublicEndpointCallParams<
  PathParamsType extends Record<string, any> | never = {},
  QueryType extends Record<string, any> | never = {},
  PayloadType = undefined,
  ContextType = any,
> = {
  pathParams?: PathParamsType;
  query?: QueryType;
  payload?: PayloadType;
  context?: ContextType;
};

export type GuardedEndpointCallParams<
  AuthParamsType = any,
  PathParamsType extends Record<string, any> | never = {},
  QueryType extends Record<string, any> | never = {},
  PayloadType = any,
  ContextType = any,
> = PublicEndpointCallParams<
  PathParamsType,
  QueryType,
  PayloadType,
  ContextType
> & {
  auth?: AuthParamsType;
};

// Type Guard to check if params include auth
export function isGuarded(
  params: EndpointCallParams
): params is GuardedEndpointCallParams {
  return (params as GuardedEndpointCallParams).auth !== undefined;
}

export function defineEndpoint<Payload = undefined, Response = any>(config: {
  method: HTTPMethods;
  url: string;
  authentication?: AuthStrategy.Type;
  headers?: Record<string, string>;
  pathParams?: Record<string, any>;
}): Endpoint<Payload, Response> {
  // Regular expression to match path parameters in the URL (e.g., :subscriptionId)
  const pathParamRegex = /:([a-zA-Z0-9_]+)/g;
  const pathParams: Record<string, string> = {};
  let match: RegExpExecArray | null;

  // Extract all path parameters from the URL
  while ((match = pathParamRegex.exec(config.url)) !== null) {
    const paramName = match[1];
    pathParams[paramName] = "string"; // Assuming all path params are strings. Adjust as needed.
  }

  return {
    ...config,
    pathParams: Object.keys(pathParams).length > 0 ? pathParams : undefined,
  } as Endpoint<Payload, Response>;
}

// Utility type to extract PayloadType from EndpointCallParamsType
export type ExtractPayload<T> = T extends { payload: infer P } ? P : undefined;

// Utility type to extract AuthParamsType from EndpointCallParamsType
export type ExtractAuthParams<T> = T extends { auth: infer A } ? A : undefined;

export type EndpointEventParams<
  EndpointCallParamsType extends EndpointCallParams,
  APICallType,
  ContextType = any,
> = {
  params: EndpointCallParamsType;
  apiCall: APICallType;
  context?: ContextType;
};
