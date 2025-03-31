import { InvalidAuthParams } from '../exceptions';
import { RemoteAPI } from '../remote-api';
import { APICall, PublicEndpointCallParams } from '../types';
import { AuthStrategy, AuthStrategyParams } from './auth.strategy';

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
        apiService: RemoteAPI,
        apiCall: APICall<PayloadType, ResponseType>,
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
                `No access token provided for API request ${apiService.constructor.name}.${apiCall.endpoint.name}. Make sure access token is provided in apiCall.request.auth.accessToken.`,
            );
        }

        apiCall.request.headers[`X-API-KEY`] = `${auth.accessToken}`;

        return apiCall;
    }

}
