import { AuthStrategy } from "./auth/auth.strategy";
import { Pluggable } from "./pluggable";
import { APICall, EndpointCallParams } from "./types";

/**
 * Rate limit programmed into Scout for a third party API has been exceeded.
 *
 * This is a little different than the third party API returning a HTTP error
 * due to rate limiting logic on their side. This error is throw when
 * rate limits coded into the Scout platform are exceeded, but before
 * sending the API call to the third party.
 */
export class LocalRemoteAPIRateLimitExceeded<
  PayloadType = undefined,
  ResponseType = undefined,
  AuthParamsType = undefined,
> extends Error {
  constructor(
    public readonly apiService: Pluggable,
    public readonly apiCall: APICall<PayloadType, ResponseType, AuthParamsType>
  ) {
    super(
      `Global remote API rate limit exceeded when calling ${apiService.constructor.name}.${apiCall.endpoint.name}`
    );
  }
}
export class InvalidAuthParams<
  AuthParamsType,
  PayloadType = undefined,
  ResponseType = undefined,
> extends Error {
  constructor(
    public readonly apiService: Pluggable,
    public readonly authStrategy: AuthStrategy,
    public readonly apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    message: string = "Auth parameters provided with API call are invalid."
  ) {
    super(message);
  }
}

export class RetryAPICall<
  PayloadType = undefined,
  ResponseType = undefined,
  AuthParamsType = undefined,
> extends Error {
  constructor(
    public readonly apiService: Pluggable,
    public readonly callParams: EndpointCallParams,
    public readonly authStrategy: AuthStrategy,
    public readonly apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    message: string = "Retry attached API call"
  ) {
    super(message);
  }
}

export class AuthenticationFailed<
  PayloadType = undefined,
  ResponseType = undefined,
  AuthParamsType = undefined,
> extends Error {
  constructor(
    public readonly apiService: Pluggable,
    public readonly authStrategy: AuthStrategy,
    public readonly callParams: EndpointCallParams,
    public readonly apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    public readonly error: any,
    message = `Authentication failed`
  ) {
    super(message);
  }
}
