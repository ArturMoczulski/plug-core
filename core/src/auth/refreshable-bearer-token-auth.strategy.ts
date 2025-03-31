import { AxiosResponse } from "axios";
import { RetryAPICall } from "../exceptions";
import { Pluggable } from "../remote-api";
import {
  APICall,
  EndpointCallParams,
  GuardedEndpointCallParams,
} from "../types";
import { AuthStrategy, AuthStrategyParams } from "./auth.strategy";
import { BearerTokenAuthStrategy } from "./bearer-token-auth.strategy";

export type RefreshableBearerTokenAuthStrategyParams<
  RefreshAccessTokensParamsType,
> = AuthStrategyParams & {
  /**
   * Function to determine if an error is due to an expired access token
   */
  isAccessTokenExpiredError: (apiCall: APICall, error: any) => boolean;

  /**
   * Function to request a new access token
   */
  refreshAccessToken: (
    params: RefreshAccessTokensParamsType
  ) => Promise<AxiosResponse<AccessTokenResponse>>;
};

export type AccessTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number; // Seconds until expiration
  tokenType?: string; // Typically 'Bearer'
};

/**
 * Abstract Auth Strategy that extends BearerTokenAuthStrategy
 * to handle access token expiration by requesting a new token.
 */
export class RefreshableBearerTokenAuthStrategy<
  RefreshAccessTokensParamsType = EndpointCallParams,
> extends BearerTokenAuthStrategy {
  type() {
    return AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN;
  }

  /**
   * Function to determine if an error is due to an expired access token
   */
  public isAccessTokenExpiredError: <PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any
  ) => boolean;

  /**
   * Function to request a new access token
   */
  public refreshAccessToken: (
    params: RefreshAccessTokensParamsType
  ) => Promise<AxiosResponse<AccessTokenResponse>>;

  /**
   * @param params - Extended parameters including auth error detection and token refresh functions
   */
  constructor(
    params: RefreshableBearerTokenAuthStrategyParams<RefreshAccessTokensParamsType>
  ) {
    super({
      isAuthError: params.isAuthError,
      onAuthError: params.onAuthError,
    });

    this.isAccessTokenExpiredError = params.isAccessTokenExpiredError;
    this.refreshAccessToken = params.refreshAccessToken;
  }

  public buildRefreshAccessTokenPayload: (
    callParams: GuardedEndpointCallParams
  ) => any;
  /**w
   * Overrides the onApiError method to handle access token expiration.
   * If the error indicates an expired token, it attempts to refresh the token.
   * @param apiCall - The API call that resulted in an error
   * @param error - The error encountered during the API call
   * @returns boolean indicating whether the error was handled
   */
  public override async onApiError<
    PayloadType = undefined,
    ResponseType = undefined,
    AuthParamsType = undefined,
  >(
    apiService: Pluggable,
    callParams: EndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any
  ): Promise<boolean> {
    if (this.isAccessTokenExpiredError(apiCall, error)) {
      if (typeof this.buildRefreshAccessTokenPayload !== "function") {
        throw new Error(
          "buildRefreshAccessTokenPayload not provided. Make sure to provide a function that returns the payload for the refresh access token request"
        );
      }
      const originalPayload = callParams.payload as any;

      callParams.payload = this.buildRefreshAccessTokenPayload(callParams);

      const newTokens = (
        await this.refreshAccessToken(
          callParams as RefreshAccessTokensParamsType
        )
      ).data;

      // Update the API call and context
      apiCall.request.auth = {
        ...(apiCall.request.auth || {}),
        accessToken: newTokens.accessToken,
      } as AuthParamsType;

      const authenticatedCallParams = callParams as GuardedEndpointCallParams;

      const newApiCall = apiService.buildApiCall(
        apiCall.endpoint,
        {
          ...authenticatedCallParams,
          auth: {
            ...authenticatedCallParams.auth,
            accessToken: newTokens.accessToken,
          },
          payload: originalPayload,
        },
        this
      );

      // Trigger retry
      throw new RetryAPICall(apiService, callParams, this, newApiCall);
    }
    return super.onApiError(apiService, callParams, apiCall, error);
  }
}
