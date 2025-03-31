import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { HumanizedError } from "../remote-api";
import { GMailAPI } from "../apis/gmail-api";
import { faker } from "@faker-js/faker";
import { AuthenticationFailed, InvalidAuthParams } from "../exceptions";
import { AuthStrategy } from "../auth/auth.strategy";

describe("GMailAPI", () => {
  let gmailApi: GMailAPI;
  let gmailClient: {
    users: {
      messages: {
        send: jest.Mock;
        get: jest.Mock;
      };
      watch: jest.Mock;
      stop: jest.Mock;
      threads: {
        get: jest.Mock;
      };
      history: {
        list: jest.Mock;
      };
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GMailAPI,
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

    gmailApi = module.get<GMailAPI>(GMailAPI);
    gmailClient = {
      users: {
        messages: {
          send: jest.fn().mockReturnValue({
            status: 200,
          }),
          get: jest.fn().mockReturnValue({
            status: 200,
          }),
        },
        threads: {
          get: jest.fn().mockReturnValue({
            status: 200,
          }),
        },
        history: {
          list: jest.fn().mockReturnValue({
            status: 200,
          }),
        },
        watch: jest.fn().mockReturnValue({
          status: 200,
        }),
        stop: jest.fn().mockReturnValue({
          status: 200,
        }),
      },
    };
    gmailApi["gmailSDK"] = jest.fn().mockReturnValue(gmailClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should be defined", () => {
      expect(gmailApi).toBeDefined();
    });
  });

  describe("Configuration Methods", () => {
    it("should return the correct baseUrl", () => {
      expect(gmailApi.baseUrl()).toBe(
        "https://gmail.googleapis.com/upload/gmail/v1"
      );
    });

    it("should return the correct rate limit", () => {
      expect(gmailApi.rateLimit()).toBe(1000);
    });

    it("should return the correct rate limit window length", () => {
      expect(gmailApi.rateLimitWindowLength()).toBe(10 * 1000);
    });
  });

  describe("Error Handling", () => {
    const invalidGrantError = {
      config: {
        method: "POST",
        url: "https://oauth2.googleapis.com/token",
        data: "<<REDACTED> - See `errorRedactor` option in `gaxios` for configuration>.",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "google-api-nodejs-client/9.2.0",
          "x-goog-api-client": "gl-node/20.2.0",
        },
        body: "<<REDACTED> - See `errorRedactor` option in `gaxios` for configuration>.",
        responseType: "unknown",
      },
      response: {
        config: {
          method: "POST",
          url: "https://oauth2.googleapis.com/token",
          data: "<<REDACTED> - See `errorRedactor` option in `gaxios` for configuration>.",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "google-api-nodejs-client/9.2.0",
            "x-goog-api-client": "gl-node/20.2.0",
          },
          body: "<<REDACTED> - See `errorRedactor` option in `gaxios` for configuration>.",
          responseType: "unknown",
        },
        data: {
          error: "invalid_grant",
          error_description: "Bad Request",
        },
        headers: {
          "alt-svc": 'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000',
          "cache-control": "no-cache, no-store, max-age=0, must-revalidate",
          "content-encoding": "gzip",
          "content-type": "application/json; charset=utf-8",
          date: "Wed, 18 Dec 2024 11:46:11 GMT",
          expires: "Mon, 01 Jan 1990 00:00:00 GMT",
          pragma: "no-cache",
          server: "scaffolding on HTTPServer2",
          "transfer-encoding": "chunked",
          vary: "Origin, X-Origin, Referer",
          "x-content-type-options": "nosniff",
          "x-frame-options": "SAMEORIGIN",
          "x-xss-protection": "0",
        },
        status: 400,
        statusText: "Bad Request",
        request: {
          responseURL: "https://oauth2.googleapis.com/token",
        },
      },
      status: 400,
    };

    describe("isApiError", () => {
      it("should recognize the error as an API error", async () => {
        expect(gmailApi.isApiError(invalidGrantError)).toBe(true);
      });

      describe("on invalid_grant", () => {
        beforeEach(() => {
          gmailClient.users.threads.get.mockRejectedValueOnce(
            invalidGrantError
          );
        });

        it("shoulh throw AuthenticationFailed", async () => {
          await expect(
            gmailApi.thread({
              auth: {
                accessToken: "none",
                refreshToken: "none",
              },
              pathParams: {
                userId: "me",
                threadId: "123",
              },
            })
          ).rejects.toThrow(AuthenticationFailed);
        });
      });
    });

    describe("humanizeError", () => {
      describe(`for AuthenticationFailed error`, () => {
        let error: AuthenticationFailed;
        beforeEach(() => {
          error = new AuthenticationFailed(
            gmailApi,
            {} as any,
            {},
            {} as any,
            {}
          );
        });

        it("should humanize the error", () => {
          const result = gmailApi.humanizeError(error);
          expect(result.title).toEqual(`GMail account access denied`);
          expect(result.detail).toEqual(
            `Looks like your Gmail account authorization is expired or was never established. Please, reconnect your Gmail Account.`
          );
        });
      });

      describe(`for InvalidAuthParams error`, () => {
        let error: InvalidAuthParams<GMailAPI.AuthParams>;

        beforeEach(() => {
          error = new InvalidAuthParams<GMailAPI.AuthParams>(
            gmailApi,
            {} as any,
            {} as any
          );
        });

        it("should humanize the error", () => {
          const result = gmailApi.humanizeError(error);
          expect(result.title).toEqual(
            `Your GMail account credentials are incorrect or missing`
          );
          expect(result.detail).toEqual(
            `Sorry, this should have not happened and is probably a problem on our side. Please, report the issue to Scout's customer service.`
          );
        });
      });

      describe(`for an unrecognized error`, () => {
        let error = undefined;

        it("should humanize the error", () => {
          const result = gmailApi.humanizeError(error);
          expect(result.title).toEqual(`Unknown error`);
        });
      });
    });
  });

  describe("API endpoints", () => {
    describe("startThread", () => {
      it("should trigger gmail.users.messages.send without thread id", async () => {
        const payload = {
          raw: {},
        } as GMailAPI.UsersMessagesSendPayload;

        const response = await gmailApi.startThread({
          auth: {
            accessToken: "123",
            refreshToken: "ref-token",
          },
          pathParams: {
            userId: "me",
          },
          payload,
        });

        expect(gmailClient.users.messages.send).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "me",
            requestBody: payload,
          })
        );
        expect(response.status).toBe(200);
      });
    });

    describe("replyToThread", () => {
      it("should trigger gmail.users.messages.send with the thread id", async () => {
        const payload = {
          raw: {},
          threadId: "4456",
        } as GMailAPI.UsersMessagesReplyToThreadPayload;

        const response = await gmailApi.replyToThread({
          auth: {
            accessToken: "123",
            refreshToken: "ref-token",
          },
          pathParams: {
            userId: "me",
          },
          payload,
        });

        expect(gmailClient.users.messages.send).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "me",
            requestBody: payload,
          })
        );
        expect(response.status).toBe(200);
      });
    });

    describe("watch", () => {
      it("should trigger gmail.users.watch", async () => {
        const payload = {
          labelFilterBehavior: "include",
          topicName: `mock-topic`,
        } as GMailAPI.UsersWatchPayload;

        const response = await gmailApi.watch({
          auth: {
            accessToken: "123",
            refreshToken: "ref-token",
          },
          pathParams: {
            userId: "me",
          },
          payload,
        });

        expect(gmailClient.users.watch).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "me",
            ...payload,
          })
        );
        expect(response.status).toBe(200);
      });
    });

    describe("thread", () => {
      beforeEach(() => {
        const message = () => {
          return {
            id: faker.string.uuid(),
            payload: {
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: `Part 1`,
                  },
                },
                {
                  mimeType: "text/plain",
                  body: {
                    data: `Part 2`,
                  },
                },
              ],
              headers: [
                {
                  name: "From",
                  value: "Artur <test@example.com>",
                },
              ],
            },
            internalDate: Date.now(),
          };
        };

        gmailClient.users.threads.get.mockResolvedValueOnce({
          data: {
            messages: [message(), message()],
          },
          status: 200,
        });
      });

      it("should trigger gmail.users.threads.get", async () => {
        const response = await gmailApi.thread({
          auth: {
            accessToken: "123",
            refreshToken: "ref-token",
          },
          pathParams: {
            userId: "me",
            threadId: "456",
          },
        });

        expect(gmailClient.users.threads.get).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "me",
            id: "456",
          })
        );

        console.log(response.data);

        expect(response.status).toBe(200);
        expect(response.data.messages.length).toBe(2);
        expect(response.data.messages[0].email).toBe("test@example.com");
      });
    });

    describe("message", () => {
      it("should trigger gmail.users.messages.get", async () => {
        const response = await gmailApi.message({
          auth: {
            accessToken: "123",
            refreshToken: "ref-token",
          },
          pathParams: {
            userId: "me",
            messageId: "456",
          },
        });

        expect(gmailClient.users.messages.get).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "me",
            id: "456",
          })
        );
        expect(response.status).toBe(200);
      });
    });

    describe("historyList", () => {
      it("should trigger gmail.users.history.list", async () => {
        const response = await gmailApi.historyList({
          auth: {
            accessToken: "123",
            refreshToken: "ref-token",
          },
          pathParams: {
            userId: "me",
          },
          query: {
            startHistoryId: `789`,
            historyTypes: ["messageAdded"],
          },
        });

        expect(gmailClient.users.history.list).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "me",
            startHistoryId: `789`,
            historyTypes: ["messageAdded"],
          })
        );
        expect(response.status).toBe(200);
      });
    });

    describe("stop", () => {
      it("should trigger gmail.users.stop", async () => {
        const response = await gmailApi.stop({
          auth: {
            accessToken: "123",
            refreshToken: "ref-token",
          },
          pathParams: {
            userId: "me",
          },
        });

        expect(gmailClient.users.stop).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "me",
          })
        );
        expect(response.status).toBe(200);
      });
    });
  });
});
