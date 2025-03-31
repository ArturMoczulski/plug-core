import { RemoteAPI } from '../remote-api';
import { APICall, PublicEndpointCallParams } from '../types';
import { AuthStrategy } from './auth.strategy';

export class NoneAuthStrategy extends AuthStrategy {
  execute(apiService: RemoteAPI, apiCall: APICall) {
    return apiCall;
  }

  async onApiError(
    apiService: RemoteAPI,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall,
    error: any,
  ): Promise<boolean> {
    return true;
  }

  type() {
    return AuthStrategy.Type.NONE;
  }
}
