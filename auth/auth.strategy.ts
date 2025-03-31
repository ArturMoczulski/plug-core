import { AuthenticationFailed } from '../exceptions';
import { RemoteAPI } from '../remote-api';
import { APICall, PublicEndpointCallParams } from '../types';

export abstract class AuthStrategy {
  constructor(params?: AuthStrategyParams) {
    if (params) {
      const { isAuthError, onAuthError } = params;

      isAuthError && (this.isAuthError = isAuthError);
      onAuthError && (this.onAuthError = onAuthError);
    }
  }

  abstract execute<PayloadType, ResponseType, AuthParamsType>(
    apiService: RemoteAPI,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
  ): APICall<PayloadType, ResponseType, AuthParamsType>;

  abstract type(): AuthStrategy.Type;

  public isAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any,
  ) {
    return false;
  }

  public onAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiService: RemoteAPI,
    authStrategy: AuthStrategy,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any,
  ): boolean {
    throw new AuthenticationFailed(
      apiService,
      this,
      endpointParams,
      apiCall,
      error,
    );
  }

  public async onApiError<
    PayloadType = undefined,
    ResponseType = undefined,
    AuthParamsType = undefined,
  >(
    apiService: RemoteAPI,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any,
  ): Promise<boolean> {
    if (this.isAuthError(apiCall, error)) {
      return this.onAuthError(apiService, this, endpointParams, apiCall, error);
    }

    return true;
  }
}

export type AuthStrategyParams = {
  isAuthError?: <PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any,
  ) => boolean;
  onAuthError?: <PayloadType, ResponseType, AuthParamsType>(
    apiService: RemoteAPI,
    authStrategy: AuthStrategy,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any,
  ) => boolean;
};

export namespace AuthStrategy {
  export enum Type {
    NONE = 'NONE',
    /**
     * If bearer token is used, make sure to pass the
     * accessToken property in the auth object of
     * the API call object
     *
     * Also implement isAuthError() and onAuthError()
     * methods in the API service.
     */
    BEARER_TOKEN = 'BEARER_TOKEN',
    /**
     * Refreshable bearer tokens will require
     * additional logic to determine how to detect an
     * expired access token and how to refresh it
     */
    REFRESHABLE_BEARER_TOKEN = 'REFRESHABLE_BEARER_TOKEN',

    UNIPILE_CUSTOM_AUTH_BEARER_TOKEN = 'UNIPILE_CUSTOM_AUTH_BEARER_TOKEN',
  }
}
