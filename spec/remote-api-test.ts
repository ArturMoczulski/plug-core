import { Injectable } from '@nestjs/common';
import { AxiosResponse } from 'axios';
import * as moment from 'moment';
import { AuthStrategy } from '../auth/auth.strategy';
import {
  BearerTokenAuthParams,
  BearerTokenAuthStrategy,
} from '../auth/bearer-token-auth.strategy';
import { RefreshableBearerTokenAuthStrategy } from '../auth/refreshable-bearer-token-auth.strategy';
import {
  Auth,
  Delete,
  Get,
  Headers,
  Normalize,
  Patch,
  Post,
} from '../decorators';
import { HumanizedError, RemoteAPI } from '../remote-api';
import {
  APICall,
  Endpoint,
  EndpointCallParams,
  GuardedEndpointCallParams,
} from '../types';

@Injectable()
export class RemoteAPITest extends RemoteAPI {
  protected verbose: boolean = false;

  humanizeError(error: any): HumanizedError {
    return error.message;
  }

  baseUrl(): string {
    return 'http://testapi.com';
  }

  override rateLimit() {
    return 5;
  }

  override rateLimitWindowLength() {
    return 50;
  }

  protected useAuthStrategies(): Partial<AuthStrategy[]> {
    return [
      new BearerTokenAuthStrategy(),
      new RefreshableBearerTokenAuthStrategy<{
        payload: { refreshToken: string };
      }>({
        isAccessTokenExpiredError: (error: any) => {
          return false;
        },
        refreshAccessToken: async (params: {
          payload: { refreshToken: string };
        }) => {
          return {
            data: {
              accessToken: '123',
              expiresOn: moment().toDate().toString(),
            },
          } as AxiosResponse;
        },
      }),
    ];
  }

  @Get('/get/empty')
  async getEmpty(): Promise<void> {
    // Implementation handled by the decorator
    return;
  }

  @Get<{ userId: string }>('/get/response')
  async getResponse(): Promise<{ userId: string }> {
    // Implementation handled by the decorator
    return;
  }

  @Get('/with-default-headers')
  withDefaultHeaders() {
    return;
  }

  @Get('/with-endpoint-headers')
  @Headers({
    'my-header': 'test',
  })
  withEndpointHeaders() {
    return;
  }

  @Post<void, { payload: { text: string } }>('/post')
  postEndpoint(params: { payload: { text: string } }) {
    return;
  }

  @Delete('/delete')
  delete() {
    return;
  }

  @Patch('/update')
  update() {
    return;
  }

  @Get<void, { pathParams: { userId: string } }>('/users/:userId/details')
  getUserDetails(params: { pathParams: { userId: string } }) {
    return;
  }

  @Get('/search')
  search(query: any) {
    return;
  }

  beforeSearch(
    endpoint: Endpoint,
    params: any,
    apiCall: APICall,
    authStrategy: AuthStrategy,
  ) {}

  @Post('/token')
  @Normalize({
    accessToken: 'tokens.access_token',
    refreshToken: 'tokens.refresh_token',
  })
  getToken() {
    return;
  }

  @Post('/to-be-normalized')
  @Normalize((api: RemoteAPI, params: EndpointCallParams, payload: any) => {
    return {
      normalizedProperty: payload.property1,
      propertyFromContext: params.context.contextProperty,
    };
  })
  toBeNormalized() {
    return;
  }

  @Get('/bearer-auth')
  @Auth(AuthStrategy.Type.BEARER_TOKEN)
  bearerAuthEndpoint(params: GuardedEndpointCallParams<BearerTokenAuthParams>) {
    return;
  }

  @Get('/refreshable-bearer-auth')
  @Auth(AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN)
  refreshableBearerAuthEndpoint(
    params: GuardedEndpointCallParams<BearerTokenAuthParams>,
  ) {
    return;
  }
}
