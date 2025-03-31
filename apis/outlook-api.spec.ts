import { Test, TestingModule } from '@nestjs/testing';
import { OutlookAPI } from './outlook-api';
import { AuthStrategy } from '../auth/auth.strategy';
import { RefreshableBearerTokenAuthStrategy } from '../auth/refreshable-bearer-token-auth.strategy';
import { mockHttpServiceResponse } from '../remote-api.spec';
import { HttpService } from '@nestjs/axios';
import { HTTPMethods } from '../types';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { of } from 'rxjs';
import { Logger } from '@nestjs/common';
import { HumanizedError } from '../remote-api';
import { faker } from '@faker-js/faker';
import { EmailAccount, User } from '../../../prismaGenerated';

/**
 * Generates a mock User object with realistic data using Faker.
 */
export const generateMockUser = (): OutlookAPI.User => ({
  businessPhones: [
    faker.phone.number('+1 ### ### ####'), // Generates a US phone number
  ],
  displayName: faker.name.fullName(),
  givenName: faker.name.firstName(),
  jobTitle: faker.name.jobTitle(),
  mail: faker.internet.email(),
  mobilePhone: faker.phone.number('+1 ### ### ####'),
  officeLocation: `${faker.address.secondaryAddress()}`, // e.g., "Suite 123"
  preferredLanguage: faker.helpers.arrayElement([
    'en-US',
    'fr-FR',
    'es-ES',
    'de-DE',
    'zh-CN',
  ]),
  surname: faker.name.lastName(),
  userPrincipalName: faker.internet.email(),
  id: faker.datatype.uuid(),
});

describe('OutlookAPI', () => {
  let outlookAPI: OutlookAPI;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookAPI,
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
            warn: (message: string) => console.warn(message),
          },
        },
      ],
    }).compile();

    httpService = module.get<HttpService>(
      HttpService,
    ) as jest.Mocked<HttpService>;

    outlookAPI = module.get<OutlookAPI>(OutlookAPI);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(outlookAPI).toBeDefined();
    });
  });

  describe('Configuration Methods', () => {
    it('should return the correct baseUrl', () => {
      expect(outlookAPI.baseUrl()).toBe('https://graph.microsoft.com/v1.0');
    });

    it('should return the correct rate limit', () => {
      expect(outlookAPI.rateLimit()).toBe(450);
    });

    it('should return the correct rate limit window length', () => {
      expect(outlookAPI.rateLimitWindowLength()).toBe(20000);
    });

    it('should return the correct default auth strategy', () => {
      expect(outlookAPI.defaultAuthStrategy()).toBe(
        AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN,
      );
    });

    it('should return the correct default headers', () => {
      expect(outlookAPI.defaultHeaders()).toEqual({
        'Content-Type': 'application/json',
      });
    });

    it('should use the correct auth strategies', () => {
      const strategies = outlookAPI['useAuthStrategies']();
      expect(strategies).toHaveLength(1);
      expect(strategies[0]).toBeInstanceOf(RefreshableBearerTokenAuthStrategy);
    });
  });

  describe('Error Handling', () => {
    it('should identify expired access tokens correctly', () => {
      const expiredError1 = {
        response: {
          data: {
            error: {
              code: 'InvalidAuthenticationToken',
            },
          },
        },
      };
      const expiredError2 = {
        response: {
          data: {
            error: 'invalid_grant',
          },
        },
      };
      const validError = {
        response: {
          data: {
            error: {
              code: 'SomeOtherError',
            },
          },
        },
      };

      expect(outlookAPI.isAccessTokenExpiredError(expiredError1)).toBe(true);
      expect(outlookAPI.isAccessTokenExpiredError(expiredError2)).toBe(true);
      expect(outlookAPI.isAccessTokenExpiredError(validError)).toBe(false);
    });

    describe('humanizeError', () => {
      it('should return detail from response.data.error.message when available', () => {
        const error = {
          response: {
            data: {
              error: {
                message: 'Detailed error message from API.',
              },
            },
          },
        };

        const expected: HumanizedError = {
          title: '',
          detail: 'Detailed error message from API.',
        };

        const result = outlookAPI.humanizeError(error);
        expect(result).toEqual(expected);
      });

      it('should return title and detail from response.data.error and response.data.error_description when message is not available', () => {
        const error = {
          response: {
            data: {
              error: 'ErrorTitle',
              error_description: 'Detailed description of the error.',
            },
          },
        };

        const expected: HumanizedError = {
          title: 'ErrorTitle',
          detail: 'Detailed description of the error.',
        };

        const result = outlookAPI.humanizeError(error);
        expect(result).toEqual(expected);
      });

      it('should return title empty and detail from error.message when error is an instance of Error', () => {
        const error = new Error('This is an error message.');

        const expected: HumanizedError = {
          title: '',
          detail: 'This is an error message.',
        };

        const result = outlookAPI.humanizeError(error);
        expect(result).toEqual(expected);
      });

      it('should return title empty and detail from error string when error is a string', () => {
        const error = 'A simple error string.';

        const expected: HumanizedError = {
          title: '',
          detail: 'A simple error string.',
        };

        const result = outlookAPI.humanizeError(error);
        expect(result).toEqual(expected);
      });

      it('should return title empty and detail as "Unknown error" for unknown error types', () => {
        const error = { unexpected: 'structure' };

        const expected: HumanizedError = {
          title: '',
          detail: 'Unknown error',
        };

        const result = outlookAPI.humanizeError(error);
        expect(result).toEqual(expected);
      });

      it('should handle null and undefined errors gracefully', () => {
        const nullError = null;
        const undefinedError = undefined;

        const expected: HumanizedError = {
          title: '',
          detail: 'Unknown error',
        };

        expect(outlookAPI.humanizeError(nullError)).toEqual(expected);
        expect(outlookAPI.humanizeError(undefinedError)).toEqual(expected);
      });

      it('should handle error.response without data gracefully', () => {
        const error = {};

        const expected: HumanizedError = {
          title: '',
          detail: 'Unknown error',
        };

        const result = outlookAPI.humanizeError(error);
        expect(result).toEqual(expected);
      });

      it('should handle error.response.data.error without message or description gracefully', () => {
        const error = {
          response: {
            data: {
              error: `Some message`,
              error_description: `Details about the error`,
            },
          },
        };

        const expected: HumanizedError = {
          detail: 'Details about the error',
          title: `Some message`,
        };

        const result = outlookAPI.humanizeError(error);
        expect(result).toEqual(expected);
      });
    });
  });

  describe('API Methods', () => {
    describe('startThread', () => {
      it('should send a POST request to /me/sendMail', async () => {
        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/bearer-auth',
          method: 'GET',
        });

        const payload = {
          message: { subject: 'test email' },
        } as OutlookAPI.SendMailPayload;

        const response = await outlookAPI.startThread({
          auth: {
            accessToken: '123',
          },
          payload,
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `${outlookAPI.baseUrl()}/me/sendMail`,
            method: HTTPMethods.POST,
            data: payload,
          }),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('deleteSubscription', () => {
      it('should send a DELETE request to /subscriptions/:subscriptionId', async () => {
        const subscriptionId = 'sub123';

        mockHttpServiceResponse(httpService, {
          url: `${outlookAPI.baseUrl()}/subscriptions/${subscriptionId}`,
          method: HTTPMethods.DELETE,
        });

        const response = await outlookAPI.deleteSubscription({
          auth: {
            accessToken: '123',
          },
          pathParams: {
            subscriptionId,
          },
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `${outlookAPI.baseUrl()}/subscriptions/${subscriptionId}`,
            method: HTTPMethods.DELETE,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('token', () => {
      it('should send a POST request to the token URL with correct payload', async () => {
        mockHttpServiceResponse(httpService, {
          url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          method: HTTPMethods.POST,
        });

        const payload = {
          client_id: 'client-id',
          client_secret: 'client-secret',
          grant_type: 'refresh_token',
          refresh_token: 'refresh-token',
        };

        const response = await outlookAPI.token({
          payload,
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            method: HTTPMethods.POST,
            data: payload,
          }),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('replyToThread', () => {
      it('should send a POST request to /me/messages/:messageId/reply', async () => {
        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/bearer-auth',
          method: 'GET',
        });

        const messageId = 'msg123';
        const payload = {
          message: {
            comment: 'Replying to your message',
          },
          saveToSentItems: true,
        };

        const response = await outlookAPI.replyToThread({
          auth: {
            accessToken: '123',
          },
          pathParams: {
            messageId,
          },
          payload,
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `${outlookAPI.baseUrl()}/me/messages/${messageId}/reply`,
            method: HTTPMethods.POST,
            data: payload,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('me', () => {
      it('should send a GET request to /me and return user info', async () => {
        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/bearer-auth',
          method: 'GET',
        });

        const response = await outlookAPI.me({
          auth: {
            accessToken: '123',
          },
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `${outlookAPI.baseUrl()}/me`,
            method: HTTPMethods.GET,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('getMessageDetails', () => {
      it('should send a GET request to /users/:userId/messages/:messageId with query params', async () => {
        mockHttpServiceResponse(httpService, {
          url: `https://graph.microsoft.com/v1.0/users/user123/messages/msg123?%24select=subject%2Cbody`,
          method: 'GET',
        });

        const userId = 'user123';
        const messageId = 'msg123';
        const query = {
          $select: 'subject,body',
        };

        const response = await outlookAPI.getMessageDetails({
          auth: {
            accessToken: '123',
          },
          pathParams: {
            userId,
            messageId,
          },
          query,
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `https://graph.microsoft.com/v1.0/users/user123/messages/msg123?%24select=subject%2Cbody`,
            method: HTTPMethods.GET,
            params: query,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('getMessages', () => {
      const buildMockMessageData = () => ({
        useHtml: true,
        message: 'Hello World',
        emailAccount: { accessToken: 'access-token' } as EmailAccount,
        subject: 'Test Subject',
        to: 'recipient@example.com',
        bccs: 'bcc@example.com',
        emailId: 'email123',
        user: {} as User,
        from: 'sender@example.com',
      });

      beforeEach(() => {
        const data = buildMockMessageData();

        const message = () => {
          return {
            id: faker.string.uuid(),
            toRecipients: [{ emailAddress: { address: data.to } }],
            internetMessageHeaders: [
              { name: 'X-Unique-ID', value: 'sended-by-scout:' + data.emailId },
            ],
            bccRecipients: [{ emailAddress: { address: data.bccs } }],
            subject: data.subject,
            body: {
              contentType: 'HTML',
              content: data.message,
            },
            receivedDateTime: new Date(),
          };
        };

        mockHttpServiceResponse(httpService, {
          url: `https://graph.microsoft.com/v1.0/me/messages?%24filter=isRead%20eq%20false`,
          method: 'GET',
          data: {
            value: [message(), message()],
          },
        });
      });

      it('should send a GET request to /me/messages with query params', async () => {
        const query = {
          $filter: 'isRead eq false',
        };

        const response = await outlookAPI.getMessages({
          auth: {
            accessToken: '123',
          },
          query,
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `https://graph.microsoft.com/v1.0/me/messages?%24filter=isRead%20eq%20false`,
            method: HTTPMethods.GET,
            params: query,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);
        expect(response.data.value[0].subject).toBe(`Test Subject`);
      });
    });

    describe('thread', () => {
      const buildMockMessageData = () => ({
        useHtml: true,
        message: 'Hello World',
        emailAccount: { accessToken: 'access-token' } as EmailAccount,
        subject: 'Test Subject',
        to: 'recipient@example.com',
        bccs: 'bcc@example.com',
        emailId: 'email123',
        user: {} as User,
        from: 'sender@example.com',
      });

      const threadId = '123';

      beforeEach(() => {
        const data = buildMockMessageData();

        const message = () => {
          return {
            id: faker.string.uuid(),
            toRecipients: [{ emailAddress: { address: data.to } }],
            internetMessageHeaders: [
              { name: 'X-Unique-ID', value: 'sended-by-scout:' + data.emailId },
            ],
            bccRecipients: [{ emailAddress: { address: data.bccs } }],
            subject: data.subject,
            body: {
              contentType: 'HTML',
              content: data.message,
            },
            receivedDateTime: new Date(),
          };
        };

        mockHttpServiceResponse(httpService, {
          url: `https://graph.microsoft.com/v1.0/me/messages?%24filter=conversationId%20eq%20${threadId}`,
          method: 'GET',
          data: {
            value: [message(), message()],
          },
        });
      });

      it('should send a GET request to /me/messages with thread id in query params', async () => {
        const response = await outlookAPI.thread({
          auth: {
            accessToken: '123',
          },
          query: {
            threadId,
          },
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `https://graph.microsoft.com/v1.0/me/messages?%24filter=conversationId%20eq%20'123'`,
            method: HTTPMethods.GET,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);

        expect(response.data.messages[0].content).toBe(`Hello World`);
      });
    });

    describe('createSubscription', () => {
      it('should send a POST request to /subscriptions with correct payload', async () => {
        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/bearer-auth',
          method: 'GET',
        });

        const payload = {
          changeType: 'created,updated,deleted',
          notificationUrl: 'https://example.com/notifications',
          resource: '/me/messages',
          expirationDateTime: '2024-12-14T18:23:45.9356913Z',
          clientState: 'secretClientValue',
        };

        const response = await outlookAPI.createSubscription({
          auth: {
            accessToken: '123',
          },
          payload,
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `${outlookAPI.baseUrl()}/subscriptions`,
            method: HTTPMethods.POST,
            data: payload,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);
      });
    });

    describe('getSubscriptions', () => {
      it('should send a GET request to /subscriptions and return subscriptions', async () => {
        mockHttpServiceResponse(httpService, {
          url: 'http://testapi.com/bearer-auth',
          method: 'GET',
        });

        const response = await outlookAPI.getSubscriptions({
          auth: {
            accessToken: '123',
          },
        });

        expect(httpService.request).toHaveBeenCalledWith(
          expect.objectContaining({
            url: `${outlookAPI.baseUrl()}/subscriptions`,
            method: HTTPMethods.GET,
            headers: {
              Authorization: `Bearer 123`,
              'Content-Type': 'application/json',
            },
          }),
        );
        expect(response.status).toBe(200);
      });
    });
  });
});
