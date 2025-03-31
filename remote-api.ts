import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AxiosError, AxiosResponse, isAxiosError } from 'axios';
import * as _ from 'lodash';
import { get } from 'lodash';
import { firstValueFrom } from 'rxjs';
import { AuthStrategy } from './auth/auth.strategy';
import { NoneAuthStrategy } from './auth/none-auth.strategy';
import { getNormalizationMapping } from './decorators';
import {
  AuthenticationFailed,
  InvalidAuthParams,
  LocalRemoteAPIRateLimitExceeded,
  RetryAPICall,
} from './exceptions';
import {
  APICall,
  Endpoint,
  EndpointCallParams,
  EndpointEventParams,
  EndpointEventTypes,
  ExtractAuthParams,
  ExtractPayload,
  PublicEndpointCallParams,
} from './types';

@Injectable()
export abstract class RemoteAPI {
  constructor(
    protected readonly eventEmitter: EventEmitter2,
    protected readonly httpService: HttpService,
  ) {
    this.logger = new Logger(this.constructor.name);
    this._endpoints = this.initEndpoints();

    this._authStrategies = _.keyBy(this.useAuthStrategies(), (strategy) =>
      strategy.type(),
    );
  }

  public readonly logger: Logger;
  protected verbose: boolean = false;
  protected dryRun: boolean = false;

  // List of endpoints defined for this service
  protected _endpoints: Record<string, Endpoint>;
  protected _authStrategies: Partial<Record<AuthStrategy.Type, AuthStrategy>> =
    {};

  // Rate limiting properties
  protected _rateLimitWindowCounter = 0;
  protected _lastWindowOverflow: number = 0;
  protected _currentRateLimitWindowStart = Date.now();
  protected _rateLimitedApiCalls: any[] = [];

  public static defaultHumanizedError(error: any): HumanizedError {
    return {
      title: `Unknown error`,
      detail: `Oops... looks like something went wrong and we are not sure what exactly. Please, report this issue to Scout's customer service.`,
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
        detail: `Sorry, this should have not happened and is probably a problem on our side. Please, report the issue to Scout's customer service.`,
      };
    } else if (
      error &&
      error.message &&
      error.message.includes('Prospect does not have an email')
    ) {
      return {
        title: `Missing Prospect Email`,
        detail: `The prospect does not have an email address registered. Please update the prospect information with a valid email address.`,
      };
    } else {
      return RemoteAPI.defaultHumanizedError(error);
    }
  }

  /**
   * @returns base endpoints URL
   */
  abstract baseUrl(): string;

  isApiError(error: any): boolean {
    return isAxiosError(error);
  }

  /**
   * @returns ApiAuthStrategyEnum
   */
  defaultAuthStrategy(): AuthStrategy.Type {
    return AuthStrategy.Type.NONE;
  }

  /**
   * Define authentication strategies for different Outlook API
   * auth types
   *
   * AuthStrategy.Type.NONE is built-in and does
   * not have to be redefined here
   * @returns
   */
  protected useAuthStrategies(): Partial<AuthStrategy[]> {
    return [];
  }

  /**
   * Get a strategy object by type
   * @param type AuthStrategy.Type
   * @returns
   */
  public authStrategy(type: AuthStrategy.Type): AuthStrategy {
    return this._authStrategies[type];
  }

  /**
   * @returns ApiAuthStrategyEnum
   */
  defaultHeaders(): Record<string, string> {
    return {};
  }

  /**
   * What is the global rate limit
   */
  rateLimit(): number {
    return 450;
  }

  /**
   * What is the length of the rate limit window
   */
  rateLimitWindowLength(): number {
    return 20 * 1000; // 20 seconds
  }

  /**
   * When does the next rate limiting window start in timestamp
   */
  nextRateLimitWindow(): number {
    return this.currentRateLimitWindowStart() + this.rateLimitWindowLength();
  }

  /**
   * How many emails didn't make it to the last rate limiting
   * window
   */
  lastWindowOverflow(): number {
    return this._lastWindowOverflow;
  }
  /**
   * Save the counter of the emails that didn't make it to the
   * last rate limiting window
   * @param value
   */
  setLastWindowOverflow(value: number): void {
    this._lastWindowOverflow = value;
  }

  /**
   * When did the current rate limiting window start as timestamp
   */
  currentRateLimitWindowStart(): number {
    return this._currentRateLimitWindowStart;
  }

  /**
   * Save when did the current rate limiting window start (timestamp)
   * @param value
   */
  setCurrentRateLimitWindowStart(value: number): void {
    this._currentRateLimitWindowStart = value;
  }

  /**
   * The counter of emails in the current rate limiting window
   */
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
  /**
   * Hook to call on a response from the provider's API
   * @param error
   * @returns boolean on true, bubble up the error
   */
  protected onApiSuccessResponse<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ) {
    if (this.dryRun && !this.verbose) {
      this.logger.verbose(`🔌 ${this.dryRun ? '(dry run)' : ''} ${apiCall.endpoint.name}`);
    } else {
      this.verbose &&
        this.logApiResponse<PayloadType, ResponseType, AuthParamsType>(apiCall);
    }
  }

  /**
   * Validates inheriting class and assigns the endpoints
   * object to the instance
   */
  protected initEndpoints(): Record<string, Endpoint> {
    const endpoints: Record<string, Endpoint> = {};
    let prototype = Object.getPrototypeOf(this); // Start with the immediate prototype

    // Traverse the prototype chain until reaching RemoteAPI.prototype
    while (prototype && prototype !== RemoteAPI.prototype) {
      const propertyNames = Object.getOwnPropertyNames(prototype).filter(
        (prop) => prop !== 'constructor' && typeof this[prop] === 'function',
      );

      for (const propertyName of propertyNames) {
        const methodMetadata: any = Reflect.getMetadata(
          'http:method',
          prototype,
          propertyName,
        );

        if (methodMetadata) {
          const authMetadata: any = Reflect.getMetadata(
            'http:auth',
            prototype,
            propertyName,
          );

          const headersMetadata: any = Reflect.getMetadata(
            'http:headers',
            prototype,
            propertyName,
          );

          const normalizationMapping:
            | Record<string, string>
            | ((
                api: RemoteAPI,
                params: EndpointCallParams,
                payload: any,
              ) => Record<string, any>)
            | undefined = getNormalizationMapping(prototype, propertyName);

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

      // Move up the prototype chain
      prototype = Object.getPrototypeOf(prototype);
    }

    return endpoints;
  }

  /**
   * Logs successful HTTP responses.
   * @param method The HTTP method used.
   * @param url The request URL.
   * @param payload The request data.
   * @param response The response data.
   */
  protected logApiResponse<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ): void {
    this.logger.verbose(`🔌✅ ${this.dryRun ? '(dry run)' : ''} ${apiCall}`);
  }

  /**
   * Logs HTTP errors.
   * @param method The HTTP method used.
   * @param url The request URL.
   * @param payload The request data.
   * @param error The error object.
   */
  protected logApiError<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: AxiosError,
  ): void {
    this.logger.error(
      `🔌❌ ${this.dryRun ? '(dry run)' : ''} ${apiCall}\n\n` +
        `API error: ${error.response?.status} ${
          error.response?.statusText
        }\n${JSON.stringify(error.response?.data, null, 2)}\n\n` +
        `Stack:\n${error.stack}`,
    );
  }

  /**
   * Process provider's API error
   * @param error
   * @returns boolean on false, bubble up the error
   */
  protected onApiError<
    PayloadType = undefined,
    ResponseType = undefined,
    AuthParamsType = undefined,
  >(
    endpointParams: PublicEndpointCallParams,
    authStrategy: AuthStrategy,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any,
  ): boolean {
    /**
     * TODO: due to refersh outlook token interval trying to refresh thousands
     * of emails, this floods the log with failed api calls logs. Need
     * to turn it off for now
     */

    this.verbose &&
      this.logApiError<PayloadType, ResponseType, AuthParamsType>(
        apiCall,
        error,
      );

    return true;
  }

  public buildApiCall<
    ResponseType,
    ParamsType extends EndpointCallParams | never,
  >(
    endpoint: Endpoint,
    params: ParamsType,
    authStrategy: AuthStrategy,
    overwriteUrl?: string,
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
        auth: params
          ? 'auth' in params
            ? params?.auth
            : undefined
          : undefined,
        query: params?.query,
      },
    );

    apiCall.request = this.addDefaultHeaders(apiCall);

    apiCall = authStrategy.execute(this, apiCall);

    return apiCall;
  }

  /**
   * Perform a third-party API call with rate limiting enforcement
   * and API call object validation and logging.
   * @param endpointName
   * @param params
   * @param eventContext Context data that will be passed to event listeners
   * @param overwriteUrl force a specific URL instead of relying on
   * this class constructing the URL from query and path params
   * @returns
   */
  public async call<
    ResponseType = undefined,
    ParamsType extends EndpointCallParams | never = undefined,
  >(
    endpointName: string,
    params?: ParamsType,
    eventContext?: any,
    overwriteUrl?: string,
  ): Promise<AxiosResponse<ResponseType>> {
    const endpoint = this._endpoints[endpointName];

    if (!endpoint) {
      throw new Error(
        `Endpoint ${this.constructor.name}.${String(endpointName)} not found`,
      );
    }
    const authStrategy = this.buildAuthStrategy(endpoint);

    let apiCall = this.buildApiCall<ResponseType, ParamsType>(
      endpoint,
      params,
      authStrategy,
      overwriteUrl,
    );

    this.validateApiCall(apiCall);

    this.emit(endpointName, EndpointEventTypes.BEFORE, {
      params,
      apiCall,
    });
    try {
      await this.executeApiCall(params, apiCall, authStrategy);
    } catch (error) {
      if (error instanceof RetryAPICall) {
        apiCall = error.apiCall;
        // The Access token has been refreshed, try the api call again
        try {
          await this.executeApiCall(params, apiCall, authStrategy);
        } catch (retryError) {
          if (retryError instanceof RetryAPICall) {
            // Retry failed treated as authentication failed
            throw new AuthenticationFailed(
              this,
              authStrategy,
              params,
              apiCall,
              retryError,
              `Authentication failed: Retrying ${this.constructor.name}.${endpointName} failed.`,
            );
          }
        }
      } else {
        this.emit(endpointName, EndpointEventTypes.ERROR, {
          params,
          apiCall,
        });
        this.emit(endpointName, EndpointEventTypes.AFTER, {
          params,
          apiCall,
        });
        throw error;
      }
    }

    this.onApiSuccessResponse(apiCall);

    this.normalizeResponse(params, apiCall);

    this.emit(endpointName, EndpointEventTypes.SUCCESS, {
      params,
      apiCall,
    });

    this.emit(endpointName, EndpointEventTypes.AFTER, { params, apiCall });

    return apiCall.response;
  }

  public emit<APICall>(
    endpointName: string,
    eventType: EndpointEventTypes,
    emitParams: EndpointEventParams<any, APICall>,
  ) {
    this.eventEmitter.emit(
      `${this.constructor.name}.${endpointName}.${eventType.toString()}`,
      emitParams,
    );
  }

  /**
   * Constructs a full URL by replacing path parameters and appending query parameters.
   * Ensures all path parameters in the URL are provided in the pathParams argument.
   * @param url The URL template containing path parameters (e.g., '/users/:userId/posts/:postId').
   * @param pathParams An object containing values for path parameters.
   * @param query An object containing query parameters.
   * @returns The fully constructed URL as a string.
   * @throws Error if any required path parameter is missing.
   */
  protected constructUrl(
    url: string,
    pathParams?: Record<string, any>,
  ): string {
    // Resolve the full URL (absolute or relative)
    const resolvedUrl = this.resolveBaseUrl(url);

    // Extract required path parameters from the URL
    const requiredPathParams = this.extractPathParamNames(resolvedUrl);

    // Validate the presence of all required path parameters
    this.validatePathParams(url, requiredPathParams, pathParams);

    // Replace path parameters with actual values
    const urlWithPathParams = this.replacePathParams(resolvedUrl, pathParams);

    return urlWithPathParams;
  }

  /**
   * Resolves the full URL by prepending the base URL if the provided URL is relative.
   * @param url The URL template.
   * @returns The absolute URL as a string.
   */
  protected resolveBaseUrl(url: string): string {
    return url.includes('://') ? url : this.baseUrl() + url;
  }

  /**
   * Extracts all path parameter names from the URL.
   * Path parameters are defined with a colon (e.g., ':userId').
   * @param url The URL containing path parameters.
   * @returns An array of path parameter names without the colon.
   */
  protected extractPathParamNames(url: string): string[] {
    // OLD regex: const pathParamRegex = /:([a-zA-Z0-9_]+)/g;

    // Regex updated to match only path parameters and exclude ports
    const pathParamRegex = /\/:([a-zA-Z0-9_]+)/g;
    const pathParams: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pathParamRegex.exec(url)) !== null) {
      pathParams.push(match[1]);
    }

    return pathParams;
  }

  /**
   * Validates that all required path parameters are present in the provided pathParams object.
   * @param requiredPathParams An array of required path parameter names.
   * @param pathParams The object containing path parameter values.
   * @throws Error if any required path parameter is missing.
   */
  protected validatePathParams(
    url: string,
    requiredPathParams: string[],
    pathParams?: Record<string, any>,
  ): void {
    if (requiredPathParams.length === 0) {
      // No path parameters required; nothing to validate
      return;
    }

    if (!pathParams) {
      throw new Error(
        `Missing path parameters for URL '${url}': [${requiredPathParams.join(
          ', ',
        )}]. Expected pathParams argument in the API call.`,
      );
    }

    const missingParams = requiredPathParams.filter(
      (param) => !(param in pathParams),
    );

    if (missingParams.length > 0) {
      throw new Error(
        `Missing path parameter(s) for URL '${url}: [${missingParams.join(
          ', ',
        )}].`,
      );
    }
  }

  /**
   * Replaces all path parameter placeholders in the URL with their corresponding values.
   * @param url The URL containing path parameter placeholders.
   * @param pathParams An object containing path parameter values.
   * @returns The URL with path parameters replaced by actual values.
   */
  protected replacePathParams(
    url: string,
    pathParams: Record<string, any>,
  ): string {
    if (!pathParams) return url;

    return Object.entries(pathParams).reduce((acc, [key, value]) => {
      const encodedValue = String(value);
      return acc.replace(new RegExp(`:${key}(?=/|$)`, 'g'), encodedValue);
    }, url);
  }

  /**
   * Appends query parameters to the URL if provided.
   * @param url The URL to append query parameters to.
   * @param query An object containing query parameters.
   * @returns The URL with appended query parameters.
   */
  protected appendQueryParams(
    url: string,
    query?: Record<string, any>,
  ): string {
    if (!query || Object.keys(query).length === 0) {
      return url;
    }

    const queryString = Object.entries(query)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      )
      .join('&');

    // Determine if the URL already has a query string
    const separator = url.includes('?') ? '&' : '?';

    return `${url}${separator}${queryString}`;
  }

  /**
   * Adds default headers to the API call, but preserves
   * the values defined in API endpoints definitions
   * @param apiCall
   * @returns
   */
  protected addDefaultHeaders<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ): APICall<PayloadType, ResponseType, AuthParamsType>['request'] {
    apiCall.request.headers = {
      ...this.defaultHeaders(),
      ...apiCall.request.headers,
    };

    return apiCall.request;
  }

  protected buildAuthStrategy<PayloadType, ResponseType, AuthParamsType>(
    endpoint: Endpoint,
  ): AuthStrategy | undefined {
    let { authentication: strategyType, name: endpointName } = endpoint;

    if (!strategyType) {
      strategyType = this.defaultAuthStrategy();
    } else {
      strategyType = strategyType;
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
        `Authentication strategy ${strategyType} not implemented for ${this.constructor.name}.${endpointName}. Make sure to implement useAuthStrategies() and add all the use AuthStrategy objects there.`,
      );
    }

    return strategy;
  }

  /**
   * Make sure the API call object is constructed sufficiently and
   * correctly
   * @param apiCall
   * @returns
   */
  protected validateApiCall<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ) {
    const method = apiCall.request.method.toLowerCase();

    if (!['get', 'post', 'delete', 'patch'].includes(method)) {
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
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ): Promise<AxiosResponse<ResponseType>> {
    const method = apiCall.request.method.toUpperCase();

    return await firstValueFrom<AxiosResponse<ResponseType>>(
      this.httpService.request<ResponseType>({
        url: apiCall.request.url,
        method: method as string,
        data: apiCall.request.payload,
        headers: apiCall.request.headers,
        params: apiCall.request.query,
      }),
    );
  }

  /**
   * Perform the API call and store the response in the response field of the
   * API object
   * @param apiCall
   * @returns
   */
  protected async executeApiCall<PayloadType, ResponseType, AuthParamsType>(
    endpointParams: EndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    authStrategy?: AuthStrategy,
  ): Promise<APICall<PayloadType, ResponseType, AuthParamsType>> {
    // Enforce global API limits
    if (this.enforceGlobalRateLimit(apiCall)) {
      throw new LocalRemoteAPIRateLimitExceeded(this, apiCall);
    }

    let response: AxiosResponse<ResponseType>;

    if (!this.dryRun) {
      try {
        response = await this.doCall<PayloadType, ResponseType, AuthParamsType>(
          endpointParams,
          apiCall,
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

              /**
               * Very importantly this throw is responsible for bubbling up the
               * RetryAPICall exception which triggers trying the API call
               * again if authentication strategy indicates so. This is
               * vital part of how i.e. RefreshableAccessTokenAuthStrategy works
               */
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
      this.logger.warn(
        `=== API ${this.constructor.name} is running in dry run mode... ===`,
      );

      response = {
        data: {
          message: 'dry-run-response',
        },
      } as AxiosResponse<any>;
    }

    apiCall.response = response;

    return apiCall;
  }

  /**
   * Do a final optional transformation on the response object
   * to make it adhere to a universal data type
   *
   * Like response from som refreshAccessToken() call to normalized
   * AccessTokenResponse type
   *
   * @param apiCall
   * @returns
   */
  protected normalizeResponse<PayloadType, ResponseType, AuthParamsType>(
    params: EndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ): APICall<PayloadType, ResponseType, AuthParamsType> {
    const endpoint = apiCall.endpoint;

    if (endpoint.normalizationMapping) {
      let normalizedResponse: Partial<ResponseType>;
      if (typeof endpoint.normalizationMapping == 'function') {
        normalizedResponse = endpoint.normalizationMapping(
          this,
          params,
          apiCall.response.data,
        ) as ResponseType;
      } else if (typeof endpoint.normalizationMapping == 'object') {
        normalizedResponse = this.normalizeWithObjectMapping(
          endpoint.normalizationMapping,
          apiCall.response.data,
        );
      }

      apiCall.response.data = normalizedResponse as ResponseType;
    }

    return apiCall;
  }

  protected normalizeWithObjectMapping<ResponseType>(
    mapping: Record<string, string>,
    payload: any,
  ): Partial<ResponseType> {
    const normalizedResponse: Partial<ResponseType> = {};

    for (const [key, path] of Object.entries(mapping)) {
      const value = get(payload, path);
      if (value !== undefined) {
        normalizedResponse[key] = value;
      } else {
        this.logger.warn(
          `Error while normalizing response: path "${path}" not found in the API response for key "${key}".`,
        );
      }
    }

    return normalizedResponse;
  }

  protected enforceGlobalRateLimit<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ): boolean {
    const now = Date.now();

    // Check if the current rate limit window has expired
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
            `=== ❌ ${
              this.constructor.name
            } SENDING RATE LIMITED AND GROWING ❌ ===\n${JSON.stringify(
              stats,
              null,
              2,
            )}`,
          );
        } else {
          this.logger.warn(
            `=== 🔶 ${
              this.constructor.name
            } SENDING RATE LIMITED 🔶 ===\n${JSON.stringify(stats, null, 2)}`,
          );
        }

        this.setLastWindowOverflow(rateLimited);
      } else {
        this.setLastWindowOverflow(0);
      }

      // Reset the rate limit window
      this.setCurrentRateLimitWindowStart(now);

      this.resetRateLimitWindowCounter();
      this._rateLimitedApiCalls = [];
    }

    // Check if the rate limit has been exceeded
    if (this.rateLimitWindowCounter() >= this.rateLimit()) {
      this._rateLimitedApiCalls.push(apiCall);
      return true;
    }

    // Increment the rate limit counter and allow the request
    this.incrementRateLimitWindowCounter();
    return false;
  }
}

export type HumanizedError = {
  title?: string;
  detail?: string;
};
