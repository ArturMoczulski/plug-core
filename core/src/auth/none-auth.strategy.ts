import { Pluggable } from "../pluggable";
import { APICall, PublicEndpointCallParams } from "../types";
import { AuthStrategy } from "./auth.strategy";

export class NoneAuthStrategy extends AuthStrategy {
  execute(apiService: Pluggable, apiCall: APICall) {
    return apiCall;
  }

  async onApiError(
    apiService: Pluggable,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall,
    error: any
  ): Promise<boolean> {
    return true;
  }

  type() {
    return AuthStrategy.Type.NONE;
  }
}
