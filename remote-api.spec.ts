import { faker } from '@faker-js/faker';
import { AuthStrategy } from './auth/auth.strategy';
import { HttpService } from '@nestjs/axios';
import { RemoteAPITest } from './spec/remote-api-test';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import {
  AxiosError,
  AxiosHeaders,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import { HTTPMethods, EndpointCallParams, EndpointEventTypes } from './types';
import { getNormalizationMapping } from './decorators';
import { Logger } from '@nestjs/common';
import {
  InvalidAuthParams,
  LocalRemoteAPIRateLimitExceeded,
} from './exceptions';
import { BearerTokenAuthStrategy } from './auth/bearer-token-auth.strategy';
import { RefreshableBearerTokenAuthStrategy } from './auth/refreshable-bearer-token-auth.strategy';
import * as moment from 'moment';
import * as _ from 'lodash';
import { EventEmitter2 } from '@nestjs/event-emitter';

export function createMockAxiosResponse<T = any>({
  url,
  method,
  data = {} as T,
  status = 200,
  statusText = 'OK',
}: {
  data?: T;
  status?: number;
  statusText?: string;
  url: string;
  method: string;
}): AxiosResponse<T> {
  return {
    data,
    status,
    statusText,
    headers: new AxiosHeaders(),
    config: {
      url,
      method: method.toUpperCase(),
      headers: new AxiosHeaders(),
    },
    request: {},
  };
}

export function mockHttpServiceResponse<T = any>(
  httpService: jest.Mocked<HttpService>,
  response: {
    data?: T;
    status?: number;
    statusText?: string;
    url: string;
    method: string;
  },
) {
  httpService.request.mockImplementationOnce((config) => {
    // Return the mocked Axios response
    return of(createMockAxiosResponse(response));
  });
}

export function createMockAxiosError<T>(response: {
  data?: T;
  status?: number;
  statusText?: string;
  url: string;
  method: string;
}) {
  return Object.assign(
    new AxiosError(
      'Request failed',
      '400',
      {
        headers: new AxiosHeaders(),
      },
      {},
      createMockAxiosResponse(response),
    ),
  );
}

export function mockHttpServiceErrorResponse<T = any>(
  httpService: jest.Mocked<HttpService>,
  response: {
    data?: T;
    status?: number;
    statusText?: string;
    url: string;
    method: string;
  },
) {
  const axiosError = createMockAxiosError(response);
  httpService.request.mockReturnValueOnce(throwError(() => axiosError));
}

describe('RemoteAPITest', () => {
  let underTest: RemoteAPITest;
  let httpService: jest.Mocked<HttpService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoteAPITest,
        {
          provide: HttpService,
          useValue: {
            request: jest.fn().mockReturnValue(
              of({
                status: 200,
              }),
            ),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: (message: string) => console.log(message),
            verbose: (message: string) => console.log(message),
            error: (message: string) => console.error(message),
          },
        },
      ],
    }).compile();

    httpService = module.get<HttpService>(
      HttpService,
    ) as jest.Mocked<HttpService>;
    eventEmitter = module.get<EventEmitter2>(
      EventEmitter2,
    ) as jest.Mocked<EventEmitter2>;
    underTest = module.get<RemoteAPITest>(RemoteAPITest);
  });

  describe('baseUrl', () => {
    it('should return the correct base URL', () => {
      expect(underTest.baseUrl()).toBe('http://testapi.com');
    });
  });

  describe('defaultAuthStrategy', () => {
    it('should be None', () => {
      expect(underTest.defaultAuthStrategy()).toBe(AuthStrategy.Type.NONE);
    });
  });

  describe('defaultHeaders', () => {
    it('should be empty', () => {
      expect(underTest.defaultHeaders()).toEqual({});
    });
  });

  describe('rateLimit', () => {
    it('should be 5', () => {
      expect(underTest.rateLimit()).toBe(5);
    });
  });

  describe('rateLimitWindowLength', () => {
    it('should be 50 miliseconds', () => {
      expect(underTest.rateLimitWindowLength()).toBe(50);
    });
  });

  describe('nextRateLimitWindow', () => {
    it('should be 20 seconds from now', () => {
      const before = Date.now();
      const nextWindow = underTest.nextRateLimitWindow();
      const after = Date.now();
      expect(nextWindow).toBeGreaterThanOrEqual(before + 50);
      expect(nextWindow).toBeLessThanOrEqual(after + 50 + 10); // Allow 10ms buffer
    });
  });

  describe('@Auth decorator', () => {
    it('should make the endpoint use provided auth strategy', async () => {
      const bearerToken = 'Bearer mock_token';

      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/bearer-auth',
        method: 'GET',
      });

      await underTest.bearerAuthEndpoint({
        auth: { accessToken: 'mock_token' },
      });

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: bearerToken,
          }),
        }),
      );
    });
  });

  describe('@Get, @Post, @Patch, @Delete decorators', () => {
    it('should init endpoints for @Get decorators', async () => {
      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/get/empty',
        method: 'GET',
      });

      await underTest.getEmpty();

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://testapi.com/get/empty', // Replace with your actual URL construction logic
          method: HTTPMethods.GET, // Replace with the expected HTTP method
        }),
      );
    });

    it('should init endpoints for @Post decorators', async () => {
      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/post',
        method: 'GET',
      });

      const payload = { text: 'test' };

      await underTest.postEndpoint({ payload });

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: payload,
          method: HTTPMethods.POST,
        }),
      );
    });

    it('should init endpoints for @Delete decorators', async () => {
      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/delete',
        method: 'DELETE',
      });

      await underTest.delete();

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://testapi.com/delete',
          method: HTTPMethods.DELETE,
        }),
      );
    });

    it('should init endpoints for @Patch decorators', async () => {
      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/update',
        method: HTTPMethods.PATCH,
      });

      await underTest.update();

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://testapi.com/update',
          method: HTTPMethods.PATCH,
        }),
      );
    });
  });

  describe('@Headers decorator', () => {
    it('should make the requests go out with specified headers attached to the requests in addition to default headers', async () => {
      const defaultHeaders = underTest.defaultHeaders();

      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/with-endpoint-headers',
        method: HTTPMethods.GET,
      });

      await underTest.withEndpointHeaders();

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://testapi.com/with-endpoint-headers',
          method: HTTPMethods.GET,
          headers: expect.objectContaining({
            'my-header': 'test',
            ...defaultHeaders,
          }),
        }),
      );
    });
  });

  describe('@Normalize decorator', () => {
    describe(`when normalized with an object mapping`, () => {
      it('should normalize the response using @Normalize mapping', async () => {
        // Define a mock response
        const apiResponse = {
          tokens: {
            access_token: 'mock_access_token',
            refresh_token: 'mock_refresh_token',
          },
        };

        const expectedNormalizedResponse = {
          accessToken: 'mock_access_token',
          refreshToken: 'mock_refresh_token',
        };

        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/token',
          method: 'POST',
          data: apiResponse,
        });

        const response = await underTest.call<{
          accessToken: string;
          refreshToken: string;
        }>('getToken');

        // Verify the response is normalized
        expect(response.data).toEqual(expectedNormalizedResponse);
      });
    });

    describe(`when normalized with a custom function`, () => {
      it('should normalize the response using @Normalize function', async () => {
        // Define a mock response
        const apiResponse = {
          property1: `value 1`,
        };

        const expectedNormalizedResponse = {
          normalizedProperty: `value 1`,
          propertyFromContext: `contextValue`,
        };

        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/token',
          method: 'POST',
          data: apiResponse,
        });

        const response = await underTest.call('toBeNormalized', {
          context: {
            contextProperty: `contextValue`,
          },
        });

        // Verify the response is normalized
        expect(response.data).toEqual(expectedNormalizedResponse);
      });
    });
  });

  describe('call', () => {
    it.todo('the global rate limit is respected');

    it('should make a successful API call and return the response', async () => {
      // Configure the mock to return the mock response
      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/get/empty',
        method: 'GET',
      });

      // Call the method under test
      await underTest.call('getEmpty');

      // Assertions
      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://testapi.com/get/empty', // Replace with your actual URL construction logic
          method: HTTPMethods.GET, // Replace with the expected HTTP method
        }),
      );
    });

    it('should handle API errors gracefully', async () => {
      mockHttpServiceErrorResponse(httpService, {
        url: 'http://testapi.com/get/empty',
        method: 'GET',
        data: { message: 'Error occurred' },
        status: 400,
        statusText: 'Bad Request',
      });

      // Spy on the logger if you have one to verify error logging
      const loggerSpy = jest.spyOn(underTest['logger'] as Logger, 'error');

      // Call the method and expect it to throw
      await expect(underTest.call('getEmpty')).rejects.toThrow();

      // Assertions
      expect(httpService.request).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error occurred'),
      );
    });

    it('should use default headers correctly', async () => {
      const defaultHeaders = underTest.defaultHeaders();
      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/with-default-headers',
        method: 'GET',
      });

      await underTest.call('withDefaultHeaders');

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining(defaultHeaders),
        }),
      );
    });

    it('should pass payload correctly to axios for POST requests', async () => {
      const payload = { text: 'somp payload' };

      const expectedResponse = {
        data: { text: 'response from remote api' },
      };

      mockHttpServiceResponse(httpService, {
        url: 'http://testapi.com/post',
        method: 'POST',
        data: expectedResponse,
      });

      const response = await underTest.call('postEndpoint', {
        payload,
      });

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          data: payload,
          method: HTTPMethods.POST,
        }),
      );
    });

    it('should construct URL with path params correctly', async () => {
      const userId = faker.string.uuid();
      const expectedUrl = `http://testapi.com/users/${userId}/details`;

      mockHttpServiceResponse(httpService, {
        url: expectedUrl,
        method: 'GET',
      });

      await underTest.call('getUserDetails', { pathParams: { userId } });

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expectedUrl,
          method: HTTPMethods.GET,
        }),
      );
    });

    it('should append query params correctly to the URL', async () => {
      const query = { search: 'test', limit: 10 };
      const expectedUrl = `http://testapi.com/search?search=test&limit=10`;

      mockHttpServiceResponse(httpService, {
        url: expectedUrl,
        method: 'GET',
      });

      await underTest.call('search', { query });

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expectedUrl,
          method: HTTPMethods.GET,
          params: query,
        }),
      );
    });

    it('should use overwrite URL if provided', async () => {
      const query = { search: 'test', limit: 10 };
      const expectedUrl = `http://google.com`;

      mockHttpServiceResponse(httpService, {
        url: expectedUrl,
        method: 'GET',
      });

      await underTest.call('search', { query }, undefined, expectedUrl);

      expect(httpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expectedUrl,
          method: HTTPMethods.GET,
        }),
      );
    });

    describe('before event handlers', () => {
      it("should call the endpoint's before event handlers", async () => {
        const url = 'http://testapi.com/users/123/details';
        mockHttpServiceResponse(httpService, {
          url,
          method: 'GET',
        });

        await underTest.getUserDetails({ pathParams: { userId: '123' } });

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'RemoteAPITest.getUserDetails.before',
          expect.objectContaining({
            params: expect.objectContaining({
              pathParams: expect.objectContaining({
                userId: '123',
              }),
            }),
            apiCall: expect.objectContaining({
              request: expect.objectContaining({
                url: 'http://testapi.com/users/123/details',
              }),
            }),
          }),
        );
      });
    });

    describe('after event handlers', () => {
      it("should call the endpoint's after event handlers", async () => {
        const url = 'http://testapi.com/users/123/details';
        mockHttpServiceResponse(httpService, {
          url,
          method: 'GET',
        });

        await underTest.getUserDetails({ pathParams: { userId: '123' } });

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'RemoteAPITest.getUserDetails.after',
          expect.objectContaining({
            params: expect.objectContaining({
              pathParams: expect.objectContaining({
                userId: '123',
              }),
            }),
            apiCall: expect.objectContaining({
              request: expect.objectContaining({
                url: 'http://testapi.com/users/123/details',
              }),
            }),
          }),
        );
      });

      it("should call the endpoint's after event handlers even after an error", async () => {
        const url = 'http://testapi.com/users/123/details';
        mockHttpServiceErrorResponse(httpService, {
          url,
          method: 'GET',
        });

        await expect(
          underTest.getUserDetails({ pathParams: { userId: '123' } }),
        ).rejects.toThrow();

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'RemoteAPITest.getUserDetails.after',
          expect.objectContaining({
            params: expect.objectContaining({
              pathParams: expect.objectContaining({
                userId: '123',
              }),
            }),
            apiCall: expect.objectContaining({
              request: expect.objectContaining({
                url: 'http://testapi.com/users/123/details',
              }),
            }),
          }),
        );
      });

      it('should be able to modify the api call response', async () => {
        const url = 'http://testapi.com/users/123/details';
        mockHttpServiceResponse(httpService, {
          url,
          method: 'GET',
        });

        (eventEmitter.emit as jest.Mock).mockImplementation(
          (event, payload) => {
            if (event === 'RemoteAPITest.getUserDetails.after') {
              // Modify the response data
              payload.apiCall.response.data = {
                name: 'Modified Name',
                email: 'user@example.com',
              };
            }
            return true;
          },
        );

        const response = (await underTest.getUserDetails({
          pathParams: { userId: '123' },
        })) as any;

        expect(response.data.name).toEqual('Modified Name');
      });
    });

    describe('error event handlers', () => {
      it("should call the endpoint's error event handlers on error", async () => {
        const url = 'http://testapi.com/get/empty';
        mockHttpServiceErrorResponse(httpService, {
          url,
          method: 'GET',
        });

        await expect(underTest.call('getEmpty')).rejects.toThrow();

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'RemoteAPITest.getEmpty.error',
          expect.anything(),
        );
      });

      it('should not call error handler on success', async () => {
        const url = 'http://testapi.com/get/empty';
        mockHttpServiceResponse(httpService, {
          url,
          method: 'GET',
        });

        await underTest.call('getEmpty');

        expect(eventEmitter.emit).not.toHaveBeenCalledWith(
          'RemoteAPITest.getEmpty.error',
          expect.anything(),
        );
      });
    });

    describe('success event handlers', () => {
      it("should call the endpoint's success event handlers on success", async () => {
        const url = 'http://testapi.com/get/empty';
        mockHttpServiceResponse(httpService, {
          url,
          method: 'GET',
        });

        const response = await underTest.call('getEmpty');

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'RemoteAPITest.getEmpty.success',
          expect.anything(),
        );
      });

      it('should not call success handler on error', async () => {
        const url = 'http://testapi.com/get/empty';
        mockHttpServiceErrorResponse(httpService, {
          url,
          method: 'GET',
        });

        await expect(underTest.call('getEmpty')).rejects.toThrow();

        expect(eventEmitter.emit).not.toHaveBeenCalledWith(
          'RemoteAPITest.getEmpty.success',
          expect.anything(),
        );
      });
    });

    describe(`error handling`, () => {
      describe(`on api error`, () => {
        const mockAxiosError = (): any => {
          // Define the Axios request configuration
          const config: any = {
            url: 'https://api.test.com/token',
            method: 'post',
            headers: new AxiosHeaders({
              'Content-Type': 'application/json',
              Authorization: 'Bearer mock-token',
            }),
            data: {
              grant_type: 'authorization_code',
              code: 'mock-code',
              redirect_uri: 'https://your-app.com/oauth2callback',
            },
          };

          // Define the Axios response
          const response: any = {
            data: {
              error: 'invalid_grant',
              error_description: 'Bad Request',
            },
            status: 400,
            statusText: 'Bad Request',
            headers: new AxiosHeaders(), // Mock empty headers or populate as needed
            config,
            request: {}, // Mock request object if necessary
          };

          // Define the AxiosError object
          const error: any = {
            name: 'AxiosError',
            message: 'Request failed with status code 400',
            config,
            code: '400',
            request: {}, // Mock request object if necessary
            response,
            isAxiosError: true,
            toJSON: () => ({}), // Implement toJSON if your code uses it
          };

          return error;
        };

        it('should recognize the error as an API error', async () => {
          expect(underTest.isApiError(mockAxiosError())).toBe(true);
        });
      });
    });

    describe('Authentication Strategies', () => {
      describe('BearerTokenAuthStrategy', () => {
        it('should use BearerTokenAuthStrategy when specified with @Auth', async () => {
          const bearerToken = 'Bearer mock_token';

          mockHttpServiceResponse(httpService, {
            url: 'http://testapi.com/bearer-auth',
            method: 'GET',
          });

          await underTest.call('bearerAuthEndpoint', {
            auth: { accessToken: 'mock_token' },
          });

          expect(httpService.request).toHaveBeenCalledWith(
            expect.objectContaining({
              headers: expect.objectContaining({
                Authorization: bearerToken,
              }),
            }),
          );
        });

        it('errors out when access token is not provided with the API call', async () => {
          mockHttpServiceResponse(httpService, {
            url: 'http://testapi.com/bearer-auth',
            method: 'GET',
          });

          await expect(underTest.call('bearerAuthEndpoint')).rejects.toThrow(
            InvalidAuthParams,
          );
        });

        it('should call isAuthError and onAuthError when an auth error occurs', async () => {
          // Spy on the protected methods
          const isAuthErrorSpy = jest
            .spyOn(BearerTokenAuthStrategy.prototype as any, 'isAuthError')
            .mockReturnValue(true); // Simulate that the error is an auth error

          const onAuthErrorSpy = jest
            .spyOn(BearerTokenAuthStrategy.prototype as any, 'onAuthError')
            .mockImplementation(() => true); // Simulate successful handling

          // Mock the HTTP service to return a 401 Unauthorized error
          mockHttpServiceErrorResponse(httpService, {
            url: 'http://testapi.com/bearer-auth',
            method: 'GET',
            data: { message: 'Unauthorized' },
            status: 401,
            statusText: 'Unauthorized',
          });

          // Act & Assert
          await expect(
            underTest.call('bearerAuthEndpoint', {
              auth: { accessToken: 'mock_token' },
            }),
          ).rejects.toThrow(Error);

          // Assert that isAuthError was called with correct parameters
          expect(isAuthErrorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              // Depending on your APICall structure, adjust the expectations
              endpoint: expect.objectContaining({ name: 'bearerAuthEndpoint' }),
              request: expect.objectContaining({
                auth: expect.objectContaining({
                  accessToken: 'mock_token',
                }),
              }),
            }),
            expect.anything(), // The error object
          );

          // Assert that onAuthError was called since isAuthError returned true
          expect(onAuthErrorSpy).toHaveBeenCalledWith(
            expect.anything(), // endpointsParams
            expect.objectContaining({
              // Depending on your APICall structure, adjust the expectations
              endpoint: expect.objectContaining({ name: 'bearerAuthEndpoint' }),
              request: expect.objectContaining({
                auth: expect.objectContaining({
                  accessToken: 'mock_token',
                }),
              }),
            }),
            expect.anything(), // error
          );

          // Clean up spies
          isAuthErrorSpy.mockRestore();
          onAuthErrorSpy.mockRestore();
        });

        it('should not call onAuthError when the error is not an auth error', async () => {
          // Spy on the protected methods
          const isAuthErrorSpy = jest
            .spyOn(BearerTokenAuthStrategy.prototype as any, 'isAuthError')
            .mockReturnValue(false); // Simulate that the error is NOT an auth error

          const onAuthErrorSpy = jest
            .spyOn(BearerTokenAuthStrategy.prototype as any, 'onAuthError')
            .mockImplementation(() => true); // This should not be called

          // Mock the HTTP service to return a 500 Internal Server Error
          mockHttpServiceErrorResponse(httpService, {
            url: 'http://testapi.com/bearer-auth',
            method: 'GET',
            data: { message: 'Internal Server Error' },
            status: 500,
            statusText: 'Internal Server Error',
          });

          // Act & Assert
          await expect(
            underTest.call('bearerAuthEndpoint', {
              auth: { accessToken: 'mock_token' },
            }),
          ).rejects.toThrow(); // Adjust the error type as per your implementation

          // Assert that isAuthError was called with correct parameters
          expect(isAuthErrorSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              // Depending on your APICall structure, adjust the expectations
              endpoint: expect.objectContaining({ name: 'bearerAuthEndpoint' }),
              request: expect.objectContaining({
                auth: expect.objectContaining({
                  accessToken: 'mock_token',
                }),
              }),
            }),
            expect.anything(), // The error object
          );

          // Assert that onAuthError was NOT called since isAuthError returned false
          expect(onAuthErrorSpy).not.toHaveBeenCalled();

          // Clean up spies
          isAuthErrorSpy.mockRestore();
          onAuthErrorSpy.mockRestore();
        });
      });

      describe('RefreshableBearerToken', () => {
        it('should call isAccessTokenExpiredError as part of onApiError', async () => {
          const isAccessTokenExpiredError = jest
            .spyOn(
              underTest.authStrategy(
                AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN,
              ) as any,
              'isAccessTokenExpiredError',
            )
            .mockReturnValue(false); // Simulate that the error is an auth error

          // Mock the HTTP service to return a 401 Unauthorized error
          mockHttpServiceErrorResponse(httpService, {
            url: 'http://testapi.com/refreshable-bearer-auth',
            method: 'GET',
            data: { message: 'Access token expired' },
            status: 401,
            statusText: 'Unauthorized',
          });

          // Act & Assert
          await expect(
            underTest.call('refreshableBearerAuthEndpoint', {
              auth: { accessToken: 'mock_token' },
            }),
          ).rejects.toThrow(Error);

          // Assert that isAuthError was called with correct parameters
          expect(isAccessTokenExpiredError).toHaveBeenCalledWith(
            expect.objectContaining({
              // Depending on your APICall structure, adjust the expectations
              endpoint: expect.objectContaining({
                name: 'refreshableBearerAuthEndpoint',
              }),
              request: expect.objectContaining({
                auth: expect.objectContaining({
                  accessToken: 'mock_token',
                }),
              }),
            }),
            expect.anything(), // The error object
          );

          // Clean up spies
          isAccessTokenExpiredError.mockRestore();
        });

        it('should call refreshAccessToken when access token is expired', async () => {
          const isAccessTokenExpiredError = jest
            .spyOn(
              underTest.authStrategy(
                AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN,
              ) as any,
              'isAccessTokenExpiredError',
            )
            .mockReturnValue(true); // Simulate that the error is an auth error

          const refreshAccessToken = jest
            .spyOn(
              underTest.authStrategy(
                AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN,
              ) as any,
              'refreshAccessToken',
            )
            .mockReturnValue(true); // Simulate that the error is an auth error

          // Mock the HTTP service to return a 401 Unauthorized error
          mockHttpServiceErrorResponse(httpService, {
            url: 'http://testapi.com/refreshable-bearer-auth',
            method: 'GET',
            data: { message: 'Access token expired' },
            status: 401,
            statusText: 'Unauthorized',
          });

          // Act & Assert
          await expect(
            underTest.call('refreshableBearerAuthEndpoint', {
              auth: { accessToken: 'mock_token' },
            }),
          ).rejects.toThrow(Error);

          // Assert that isAuthError was called with correct parameters
          expect(refreshAccessToken).toHaveBeenCalledTimes(1);

          // Clean up spies
          isAccessTokenExpiredError.mockRestore();
          refreshAccessToken.mockRestore();
        });

        it('should retry the API call after refreshing the access token', async () => {
          const isAccessTokenExpiredError = jest
            .spyOn(
              underTest.authStrategy(
                AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN,
              ) as any,
              'isAccessTokenExpiredError',
            )
            .mockReturnValue(true); // Simulate that the error is an auth error

          // Mock the HTTP service to return a 401 Unauthorized error
          mockHttpServiceErrorResponse(httpService, {
            url: 'http://testapi.com/refreshable-bearer-auth',
            method: 'GET',
            data: { message: 'Access token expired' },
            status: 401,
            statusText: 'Unauthorized',
          });

          // Act & Assert
          const response = await underTest.call(
            'refreshableBearerAuthEndpoint',
            {
              auth: { accessToken: 'mock_token' },
            },
          );

          expect(httpService.request).toHaveBeenCalledTimes(2);
          expect(response.status).toBe(200);

          // Clean up spies
          isAccessTokenExpiredError.mockRestore();
        });
      });
    });

    describe('Rate limits', () => {
      it('should error out when rate limit is exceeded in a time window', async () => {
        await _.times(5, async () => {
          mockHttpServiceResponse(httpService, {
            url: 'http://testapi.com/get/empty',
            method: 'GET',
          });
          await underTest.getEmpty();
        });

        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/get/empty',
          method: 'GET',
        });

        await expect(underTest.getEmpty()).rejects.toThrow(
          LocalRemoteAPIRateLimitExceeded,
        );

        expect(underTest.rateLimitWindowCounter()).toBe(5);
      });

      it('should reset the counter at the end of the rate limiting window', async () => {
        await _.times(2, async () => {
          mockHttpServiceResponse(httpService, {
            url: 'http://testapi.com/get/empty',
            method: 'GET',
          });
          await underTest.getEmpty();
        });

        expect(underTest.rateLimitWindowCounter()).toBe(2);

        await new Promise((r) =>
          setTimeout(r, underTest.rateLimitWindowLength() + 10),
        );

        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/get/empty',
          method: 'GET',
        });
        await underTest.getEmpty();

        expect(underTest.rateLimitWindowCounter()).toBe(1);
      });
    });
  });
});
