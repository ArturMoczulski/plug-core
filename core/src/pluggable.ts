import { AxiosError, AxiosInstance, AxiosResponse, isAxiosError } from "axios";
import { EventEmitter2 } from "eventemitter2";
import * as _ from "lodash";
import { AuthStrategy } from "./auth/auth.strategy";
import { NoneAuthStrategy } from "./auth/none-auth.strategy";
import { getNormalizationMapping } from "./decorators";
import {
  AuthenticationFailed,
  InvalidAuthParams,
  LocalRemoteAPIRateLimitExceeded,
  RetryAPICall,
} from "./exceptions";
import { ILogger, Logger } from "./logger";
import {
  APICall,
  Endpoint,
  EndpointCallParams,
  EndpointEventParams,
  EndpointEventTypes,
  ExtractAuthParams,
  ExtractPayload,
  PublicEndpointCallParams,
} from "./types";

export type HumanizedError = {
  title?: string;
  detail?: string;
};

export abstract class Pluggable {
  // Removed hardcoded logger assignment.
  protected verbose: boolean = false;
  protected dryRun: boolean = false;

  // List of endpoints defined for this service.
  protected _endpoints: Record<string, Endpoint>;
  protected _authStrategies: Partial<Record<AuthStrategy.Type, AuthStrategy>> =
    {};

  // Rate limiting properties.
  protected _rateLimitWindowCounter = 0;
  protected _lastWindowOverflow: number = 0;
  protected _currentRateLimitWindowStart = Date.now();
  protected _rateLimitedApiCalls: any[] = [];

  constructor(
    protected readonly axiosInstance: AxiosInstance,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly logger: ILogger = new Logger()
  ) {
    this._endpoints = this.initEndpoints();
    this._authStrategies = _.keyBy(this.useAuthStrategies(), (strategy) =>
      strategy.type()
    );
  }

  public static defaultHumanizedError(error: any): HumanizedError {
    return {
      title: `Unknown error`,
      detail: `Oops... looks like something went wrong and we are not sure what exactly. Please, report this issue.`,
    };
  }

  humanizeError(error: any): HumanizedError {
    if (error instanceof AuthenticationFailed) {
      return {
        title: `Email account access denied`,
        detail: `Looks like your email account authorization is expired or was never established. Please, reconnect your email account.`,
      };
    } else if (error instanceof InvalidAuthParams) {
      return {
        title: `Your email account access token is missing or invalid`,
        detail: `Sorry, this should have not happened and is probably a problem on our side.`,
      };
    } else if (
      error &&
      error.message &&
      error.message.includes("Prospect does not have an email")
    ) {
      return {
        title: `Missing Prospect Email`,
        detail: `The prospect does not have an email address registered. Please update the prospect information with a valid email address.`,
      };
    } else {
      return Pluggable.defaultHumanizedError(error);
    }
  }

  /**
   * @returns base endpoints URL
   */
  abstract baseUrl(): string;

  isApiError(error: any): boolean {
    return isAxiosError(error);
  }

  defaultAuthStrategy(): AuthStrategy.Type {
    return AuthStrategy.Type.NONE;
  }

  /**
   * Define authentication strategies for different API auth types.
   * Override this in subclasses if needed.
   */
  protected useAuthStrategies(): Partial<AuthStrategy[]> {
    return [];
  }

  public authStrategy(type: AuthStrategy.Type): AuthStrategy {
    return this._authStrategies[type];
  }

  defaultHeaders(): Record<string, string> {
    return {};
  }

  rateLimit(): number {
    return 450;
  }

  rateLimitWindowLength(): number {
    return 20 * 1000; // 20 seconds
  }

  nextRateLimitWindow(): number {
    return this.currentRateLimitWindowStart() + this.rateLimitWindowLength();
  }

  lastWindowOverflow(): number {
    return this._lastWindowOverflow;
  }

  setLastWindowOverflow(value: number): void {
    this._lastWindowOverflow = value;
  }

  currentRateLimitWindowStart(): number {
    return this._currentRateLimitWindowStart;
  }

  setCurrentRateLimitWindowStart(value: number): void {
    this._currentRateLimitWindowStart = value;
  }

  rateLimitWindowCounter(): number {
    return this._rateLimitWindowCounter;
  }

  incrementRateLimitWindowCounter() {
    this._rateLimitWindowCounter++;
  }

  resetRateLimitWindowCounter() {
    this._rateLimitWindowCounter = 0;
  }

  public setVerbose(value: boolean) {
    this.verbose = value;
  }

  public getAuthStrategy(type: AuthStrategy.Type): AuthStrategy {
    return this._authStrategies[type];
  }

  protected onApiSuccessResponse<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ) {
    if (this.dryRun && !this.verbose) {
      this.logger.log(
        `RemoteAPI: ${this.dryRun ? "(dry run)" : ""} ${apiCall.endpoint.name}`
      );
    } else {
      this.verbose && this.logApiResponse(apiCall);
    }
  }

  protected initEndpoints(): Record<string, Endpoint> {
    const endpoints: Record<string, Endpoint> = {};
    let prototype = Object.getPrototypeOf(this);

    while (prototype && prototype !== Pluggable.prototype) {
      const propertyNames = Object.getOwnPropertyNames(prototype).filter(
        (prop) => prop !== "constructor" && typeof this[prop] === "function"
      );

      for (const propertyName of propertyNames) {
        const methodMetadata: any = Reflect.getMetadata(
          "http:method",
          prototype,
          propertyName
        );

        if (methodMetadata) {
          const authMetadata: any = Reflect.getMetadata(
            "http:auth",
            prototype,
            propertyName
          );
          const headersMetadata: any = Reflect.getMetadata(
            "http:headers",
            prototype,
            propertyName
          );
          const normalizationMapping = getNormalizationMapping(
            prototype,
            propertyName
          );

          const endpoint: Endpoint = {
            name: propertyName,
            method: methodMetadata.method,
            url: methodMetadata.url,
            authentication: authMetadata
              ? authMetadata
              : this.defaultAuthStrategy(),
            headers: headersMetadata,
            normalizationMapping: normalizationMapping,
          };

          endpoints[propertyName] = endpoint;
        }
      }

      prototype = Object.getPrototypeOf(prototype);
    }

    return endpoints;
  }

  protected logApiResponse<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ): void {
    this.logger.log(`RemoteAPI: Successful API call: ${apiCall.endpoint.name}`);
  }

  protected logApiError<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: AxiosError
  ): void {
    this.logger.error(
      `RemoteAPI: API error on ${apiCall.endpoint.name}\nAPI error: ${error
        .response?.status} ${error.response?.statusText}\n${JSON.stringify(
        error.response?.data,
        null,
        2
      )}\nStack:\n${error.stack}`
    );
  }

  protected onApiError<
    PayloadType = undefined,
    ResponseType = undefined,
    AuthParamsType = undefined,
  >(
    endpointParams: PublicEndpointCallParams,
    authStrategy: AuthStrategy,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any
  ): boolean {
    this.verbose && this.logApiError(apiCall, error);
    return true;
  }

  public buildApiCall<
    ResponseType,
    ParamsType extends EndpointCallParams | never,
  >(
    endpoint: Endpoint,
    params: ParamsType,
    authStrategy: AuthStrategy,
    overwriteUrl?: string
  ): APICall<
    ExtractPayload<EndpointCallParams>,
    ResponseType,
    ExtractAuthParams<EndpointCallParams>
  > {
    type PayloadType = ExtractPayload<ParamsType>;
    type AuthParamsType = ExtractAuthParams<ParamsType>;

    let apiCall = new APICall<PayloadType, ResponseType, AuthParamsType>(
      endpoint,
      {
        method: endpoint.method,
        url:
          overwriteUrl || this.constructUrl(endpoint.url, params?.pathParams),
        headers: endpoint.headers || {},
        payload: params?.payload,
        auth: params ? ("auth" in params ? params.auth : undefined) : undefined,
        query: params?.query,
      }
    );

    apiCall.request = this.addDefaultHeaders(apiCall);
    apiCall = authStrategy.execute(this, apiCall);
    return apiCall;
  }

  public async call<
    ResponseType = undefined,
    ParamsType extends EndpointCallParams | never = undefined,
  >(
    endpointName: string,
    params?: ParamsType,
    eventContext?: any,
    overwriteUrl?: string
  ): Promise<AxiosResponse<ResponseType>> {
    const endpoint = this._endpoints[endpointName];

    if (!endpoint) {
      throw new Error(
        `Endpoint ${this.constructor.name}.${String(endpointName)} not found`
      );
    }

    const authStrategy = this.buildAuthStrategy(endpoint);
    let apiCall = this.buildApiCall<ResponseType, ParamsType>(
      endpoint,
      params,
      authStrategy,
      overwriteUrl
    );
    this.validateApiCall(apiCall);

    this.emit(endpointName, EndpointEventTypes.BEFORE, { params, apiCall });
    try {
      await this.executeApiCall(params, apiCall, authStrategy);
    } catch (error) {
      if (error instanceof RetryAPICall) {
        apiCall = error.apiCall;
        try {
          await this.executeApiCall(params, apiCall, authStrategy);
        } catch (retryError) {
          if (retryError instanceof RetryAPICall) {
            throw new AuthenticationFailed(
              this,
              authStrategy,
              params,
              apiCall,
              retryError,
              `Authentication failed: Retrying ${this.constructor.name}.${endpointName} failed.`
            );
          }
        }
      } else {
        this.emit(endpointName, EndpointEventTypes.ERROR, { params, apiCall });
        this.emit(endpointName, EndpointEventTypes.AFTER, { params, apiCall });
        throw error;
      }
    }

    this.onApiSuccessResponse(apiCall);
    this.normalizeResponse(params, apiCall);
    this.emit(endpointName, EndpointEventTypes.SUCCESS, { params, apiCall });
    this.emit(endpointName, EndpointEventTypes.AFTER, { params, apiCall });

    return apiCall.response;
  }

  public emit<APICall>(
    endpointName: string,
    eventType: EndpointEventTypes,
    emitParams: EndpointEventParams<any, APICall>
  ) {
    this.eventEmitter.emit(
      `${this.constructor.name}.${endpointName}.${eventType.toString()}`,
      emitParams
    );
  }

  protected constructUrl(
    url: string,
    pathParams?: Record<string, any>
  ): string {
    const resolvedUrl = this.resolveBaseUrl(url);
    const requiredPathParams = this.extractPathParamNames(resolvedUrl);
    this.validatePathParams(url, requiredPathParams, pathParams);
    const urlWithPathParams = this.replacePathParams(resolvedUrl, pathParams);
    return urlWithPathParams;
  }

  protected resolveBaseUrl(url: string): string {
    return url.includes("://") ? url : this.baseUrl() + url;
  }

  protected extractPathParamNames(url: string): string[] {
    const pathParamRegex = /\/:([a-zA-Z0-9_]+)/g;
    const pathParams: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pathParamRegex.exec(url)) !== null) {
      pathParams.push(match[1]);
    }
    return pathParams;
  }

  protected validatePathParams(
    url: string,
    requiredPathParams: string[],
    pathParams?: Record<string, any>
  ): void {
    if (requiredPathParams.length === 0) {
      return;
    }
    if (!pathParams) {
      throw new Error(
        `Missing path parameters for URL '${url}': [${requiredPathParams.join(
          ", "
        )}]. Expected pathParams argument in the API call.`
      );
    }
    const missingParams = requiredPathParams.filter(
      (param) => !(param in pathParams)
    );
    if (missingParams.length > 0) {
      throw new Error(
        `Missing path parameter(s) for URL '${url}: [${missingParams.join(
          ", "
        )}].`
      );
    }
  }

  protected replacePathParams(
    url: string,
    pathParams: Record<string, any>
  ): string {
    if (!pathParams) return url;
    return Object.entries(pathParams).reduce((acc, [key, value]) => {
      const encodedValue = String(value);
      return acc.replace(new RegExp(`:${key}(?=/|$)`, "g"), encodedValue);
    }, url);
  }

  protected appendQueryParams(
    url: string,
    query?: Record<string, any>
  ): string {
    if (!query || Object.keys(query).length === 0) {
      return url;
    }
    const queryString = Object.entries(query)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      )
      .join("&");
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${queryString}`;
  }

  protected addDefaultHeaders<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ): APICall<PayloadType, ResponseType, AuthParamsType>["request"] {
    apiCall.request.headers = {
      ...this.defaultHeaders(),
      ...apiCall.request.headers,
    };
    return apiCall.request;
  }

  protected buildAuthStrategy<PayloadType, ResponseType, AuthParamsType>(
    endpoint: Endpoint
  ): AuthStrategy | undefined {
    let { authentication: strategyType, name: endpointName } = endpoint;
    if (!strategyType) {
      strategyType = this.defaultAuthStrategy();
    }
    let strategy: AuthStrategy;
    switch (strategyType) {
      case AuthStrategy.Type.NONE:
        strategy = new NoneAuthStrategy();
        break;
      case AuthStrategy.Type.BEARER_TOKEN:
        strategy = this._authStrategies[AuthStrategy.Type.BEARER_TOKEN];
        break;
      default:
        strategy = this._authStrategies[strategyType];
        break;
    }
    if (!strategy) {
      throw new Error(
        `Authentication strategy ${strategyType} not implemented for ${this.constructor.name}.${endpointName}. Make sure to implement useAuthStrategies() and add all the AuthStrategy objects.`
      );
    }
    return strategy;
  }

  protected validateApiCall<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ) {
    const method = apiCall.request.method.toLowerCase();
    if (!["get", "post", "delete", "patch"].includes(method)) {
      throw new Error(`Method ${method} is not a valid HTTP method`);
    }
    return true;
  }

  protected async doCall<
    PayloadType = undefined,
    ResponseType = undefined,
    AuthParamsType = undefined,
  >(
    endpointParams: EndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ): Promise<AxiosResponse<ResponseType>> {
    const method = apiCall.request.method.toUpperCase();
    return await this.axiosInstance.request<ResponseType>({
      url: apiCall.request.url,
      method: method as string,
      data: apiCall.request.payload,
      headers: apiCall.request.headers,
      params: apiCall.request.query,
    });
  }

  protected async executeApiCall<PayloadType, ResponseType, AuthParamsType>(
    endpointParams: EndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    authStrategy?: AuthStrategy
  ): Promise<APICall<PayloadType, ResponseType, AuthParamsType>> {
    if (this.enforceGlobalRateLimit(apiCall)) {
      throw new LocalRemoteAPIRateLimitExceeded(this, apiCall);
    }
    let response: AxiosResponse<ResponseType>;
    if (!this.dryRun) {
      try {
        response = await this.doCall<PayloadType, ResponseType, AuthParamsType>(
          endpointParams,
          apiCall
        );
      } catch (error) {
        let bubbleUp = true;
        if (this.isApiError(error)) {
          if (authStrategy) {
            try {
              bubbleUp = await authStrategy.onApiError<
                PayloadType,
                ResponseType,
                AuthParamsType
              >(this, endpointParams, apiCall, error);
              bubbleUp = this.onApiError<
                PayloadType,
                ResponseType,
                AuthParamsType
              >(endpointParams, authStrategy, apiCall, error);
            } catch (err) {
              if (!(err instanceof RetryAPICall)) {
                bubbleUp = this.onApiError<
                  PayloadType,
                  ResponseType,
                  AuthParamsType
                >(endpointParams, authStrategy, apiCall, error);
              }
              throw err;
            }
          } else {
            bubbleUp = this.onApiError<
              PayloadType,
              ResponseType,
              AuthParamsType
            >(endpointParams, authStrategy, apiCall, error);
          }
        }
        if (bubbleUp) throw error;
      }
    } else {
      this.logger.warn(`RemoteAPI: Running in dry run mode...`);
      response = {
        data: {
          message: "dry-run-response",
        },
      } as AxiosResponse<any>;
    }
    apiCall.response = response;
    return apiCall;
  }

  protected normalizeResponse<PayloadType, ResponseType, AuthParamsType>(
    params: EndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ): APICall<PayloadType, ResponseType, AuthParamsType> {
    const endpoint = apiCall.endpoint;
    if (endpoint.normalizationMapping) {
      let normalizedResponse: Partial<ResponseType>;
      if (typeof endpoint.normalizationMapping == "function") {
        normalizedResponse = endpoint.normalizationMapping(
          this,
          params,
          apiCall.response.data
        ) as ResponseType;
      } else if (typeof endpoint.normalizationMapping == "object") {
        normalizedResponse = this.normalizeWithObjectMapping(
          endpoint.normalizationMapping,
          apiCall.response.data
        );
      }
      apiCall.response.data = normalizedResponse as ResponseType;
    }
    return apiCall;
  }

  protected normalizeWithObjectMapping<ResponseType>(
    mapping: Record<string, string>,
    payload: any
  ): Partial<ResponseType> {
    const normalizedResponse: Partial<ResponseType> = {};
    for (const [key, path] of Object.entries(mapping)) {
      const value = _.get(payload, path);
      if (value !== undefined) {
        normalizedResponse[key] = value;
      } else {
        this.logger.warn(
          `RemoteAPI: Error while normalizing response: path "${path}" not found in the API response for key "${key}".`
        );
      }
    }
    return normalizedResponse;
  }

  protected enforceGlobalRateLimit<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ): boolean {
    const now = Date.now();
    if (now >= this.nextRateLimitWindow()) {
      const rateLimited = this._rateLimitedApiCalls.length;
      if (rateLimited > 0) {
        const stats = {
          rateLimited,
          overflowDeltaSinceLastWindow: rateLimited - this.lastWindowOverflow(),
          reason: `GLOBAL_${this.constructor.name}_RATE_LIMIT`,
        };
        if (
          this.lastWindowOverflow() > 0 &&
          rateLimited > this.lastWindowOverflow()
        ) {
          this.logger.error(
            `RemoteAPI: Rate limit exceeded and growing:\n${JSON.stringify(
              stats,
              null,
              2
            )}`
          );
        } else {
          this.logger.warn(
            `RemoteAPI: Rate limited:\n${JSON.stringify(stats, null, 2)}`
          );
        }
        this.setLastWindowOverflow(rateLimited);
      } else {
        this.setLastWindowOverflow(0);
      }
      this.setCurrentRateLimitWindowStart(now);
      this.resetRateLimitWindowCounter();
      this._rateLimitedApiCalls = [];
    }
    if (this.rateLimitWindowCounter() >= this.rateLimit()) {
      this._rateLimitedApiCalls.push(apiCall);
      return true;
    }
    this.incrementRateLimitWindowCounter();
    return false;
  }
}
