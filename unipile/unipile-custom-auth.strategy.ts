import { InvalidAuthParams } from "../core/src/exceptions";
import { Pluggable } from "../core/src/remote-api";
import { APICall, PublicEndpointCallParams } from "../core/src/types";
import {
  AuthStrategy,
  AuthStrategyParams,
} from "../core/src/auth/auth.strategy";

export type BearerTokenAuthParams = {
  accessToken: string;
};
export class UnipileCustomAuthAuthStrategy extends AuthStrategy {
  constructor(params?: AuthStrategyParams) {
    super();

    if (params) {
      const { isAuthError, onAuthError } = params;

      isAuthError && (this.isAuthError = isAuthError);
      onAuthError && (this.onAuthError = onAuthError);
    }
  }

  type() {
    return AuthStrategy.Type.UNIPILE_CUSTOM_AUTH_BEARER_TOKEN;
  }

  execute<PayloadType, ResponseType>(
    apiService: Pluggable,
    apiCall: APICall<PayloadType, ResponseType>
  ) {
    const auth = apiCall.request.auth as BearerTokenAuthParams;

    if (!auth?.accessToken) {
      throw new InvalidAuthParams<
        BearerTokenAuthParams,
        PayloadType,
        ResponseType
      >(
        apiService,
        this,
        apiCall,
        `No access token provided for API request ${apiService.constructor.name}.${apiCall.endpoint.name}. Make sure access token is provided in apiCall.request.auth.accessToken.`
      );
    }

    apiCall.request.headers[`X-API-KEY`] = `${auth.accessToken}`;

    return apiCall;
  }
}
