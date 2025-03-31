import { Injectable } from "@nestjs/common";
import { AxiosError, AxiosResponse } from "axios";
import { EmailAccount } from "../../../api/src/prismaGenerated";
import {
  IEmailManagementAPI,
  IOAuthAPI,
  ISendEmailRemoteAPI,
  Message,
  SendProspectEmailParams,
  Thread,
} from "../../../api/src/prospect-email-sending/providers/prospect-email-sending-provider";
import { AuthStrategy } from "../core/auth/auth.strategy";
import {
  AccessTokenResponse,
  RefreshableBearerTokenAuthStrategy,
} from "../core/auth/refreshable-bearer-token-auth.strategy";
import { Auth, Delete, Get, Headers, Normalize, Post } from "../decorators";
import { AuthenticationFailed } from "../exceptions";
import { RemoteAPI } from "../remote-api";
import {
  APICall,
  EndpointEventParams,
  GuardedEndpointCallParams,
  PublicEndpointCallParams,
} from "../types";
import { HumanizedError } from "../remote-api";

@Injectable()
export class OutlookAPI
  extends RemoteAPI
  implements ISendEmailRemoteAPI, IOAuthAPI, IEmailManagementAPI
{
  protected verbose = false;
  protected dryRun: boolean = false;

  static authUrl(state: string): string {
    const CLIENT_ID = process.env.SCOUT_API_OUTLOOK_CLIENT_ID;
    const SCOPES = [
      "Mail.Send",
      "Mail.Read",
      "Mail.ReadWrite",
      "offline_access",
      "User.Read",
    ].join(" ");
    const REDIRECT_URI = OutlookAPI.redirectUrl();

    const authUrl =
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize" +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` + // app's client ID
      `&scope=${encodeURIComponent(SCOPES)}` + // scopes being requested by the app
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` + // where to send the user after the consent page
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code`;

    return authUrl;
  }

  static redirectUrl(): string {
    return `${process.env.SCOUT_HTTP_PROTOCOL}://${process.env.SCOUT_DOMAIN}:3001/email-account/outlook-oauth-callback`;
  }

  authUrl(state: string): string {
    return OutlookAPI.authUrl(state);
  }
  redirectUrl(): string {
    return OutlookAPI.redirectUrl();
  }

  /**
   * Outlook's API base URL
   * @returns string
   */
  baseUrl(): string {
    return `https://graph.microsoft.com/v1.0`;
  }

  /**
   * What is the global rate limit
   */
  rateLimit(): number {
    return 450;
  }

  /**
   * What is the length of the rate limit window
   */
  rateLimitWindowLength(): number {
    return 20 * 1000; // 20 seconds
  }

  /**
   * Define authentication strategies for different Outlook API
   * auth types
   * @returns
   */
  protected override useAuthStrategies(): Partial<AuthStrategy[]> {
    return [
      new RefreshableBearerTokenAuthStrategy<OutlookAPI.TokenParams>({
        isAccessTokenExpiredError: this.isAccessTokenExpiredError.bind(this),
        refreshAccessToken: this.token.bind(this),
        isAuthError: this.isAuthError.bind(this),
        onAuthError: this.onAuthError.bind(this),
      }),
    ];
  }

  /**
   * Default auth strategy for Outlook is bearer token
   *
   * This means, the ApiCalls will have to provide the
   * accessToken field in the auth property
   * @returns string
   */
  override defaultAuthStrategy(): AuthStrategy.Type {
    return AuthStrategy.Type.REFRESHABLE_BEARER_TOKEN;
  }

  /**
   * Default headers that will be added to all the
   * requests, unless the endpoint definition says
   * otherwise
   * @returns
   */
  override defaultHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
    };
  }

  /**
   * Detects if the error is an invalid access token error
   * which would trigger token refresh
   * @param error Error response from the GMail API
   * @returns bool
   */
  isAccessTokenExpiredError(apiCall: any, error: any) {
    return (
      error.response?.data?.error?.code == "InvalidAuthenticationToken" ||
      error.response?.data?.error == "invalid_grant"
    );
  }

  /**
   * Send Mail Endpoint
   */
  @Post<void, OutlookAPI.SendMailParams>("/me/sendMail")
  async startThread(
    params: OutlookAPI.SendMailParams
  ): Promise<AxiosResponse<void>> {
    // The actual implementation is handled by the decorator
    return;
  }

  /**
   * Delete Subscription Endpoint
   */
  @Delete<void, OutlookAPI.DeleteSubscriptionParams>(
    "/subscriptions/:subscriptionId"
  )
  async deleteSubscription(
    params: OutlookAPI.DeleteSubscriptionParams
  ): Promise<AxiosResponse> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Refresh Access Token Endpoint
   */
  @Post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
  @Auth(AuthStrategy.Type.NONE)
  @Headers({
    "Content-Type": "application/x-www-form-urlencoded",
  })
  @Normalize({
    accessToken: "access_token",
    refreshToken: "refresh_token",
    expiresIn: "expires_in",
    tokenType: "token_type",
  })
  async token(
    params: OutlookAPI.TokenParams
  ): Promise<AxiosResponse<AccessTokenResponse>> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Reauthorize subscription Endpoint
   */
  @Post("https://graph.microsoft.com/beta/subscriptions/:subscriptionId")
  async reauthorizeSubscription(
    params: OutlookAPI.ReauthorizeSubscriptionParams
  ): Promise<AxiosResponse<void>> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Reply to Thread Endpoint
   */
  @Post<void, OutlookAPI.ReplyToThreadParams>("/me/messages/:messageId/reply")
  async replyToThread(
    params: OutlookAPI.ReplyToThreadParams
  ): Promise<AxiosResponse<void>> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Me Endpoint
   */
  @Get<OutlookAPI.MeResponse>("/me")
  async me(
    params: OutlookAPI.MeParams
  ): Promise<AxiosResponse<OutlookAPI.MeResponse>> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Inbox Endpoint
   */
  @Get<OutlookAPI.MailFolderResponse>("/me/mailFolders/:folderId")
  async mailFolder(
    params: OutlookAPI.MailFolderParams
  ): Promise<AxiosResponse<OutlookAPI.MailFolderResponse>> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Get Message Details Endpoint
   */
  @Get<OutlookAPI.OutlookMessage, OutlookAPI.MessageParams>(
    "/users/:userId/messages/:messageId"
  )
  @Headers({
    Prefer: 'outlook.body-content-type="text"',
  })
  async message(
    params: OutlookAPI.MessageParams
  ): Promise<AxiosResponse<OutlookAPI.OutlookMessage>> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Get Messages Endpoint
   */
  @Get<OutlookAPI.GetMessagesResponse, OutlookAPI.GetMessagesParams>(
    "/me/messages"
  )
  async getMessages(
    params: OutlookAPI.GetMessagesParams
  ): Promise<AxiosResponse<OutlookAPI.GetMessagesResponse>> {
    // Implementation handled by the decorator
    return;
  }

  async thread(
    params: OutlookAPI.ThreadParams
  ): Promise<AxiosResponse<Thread>> {
    const response = (await this.getMessages({
      ...params,
      query: {
        $filter: `conversationId eq '${params.query.threadId}'`,
      },
    })) as any;

    response.data = OutlookAPI.normalizeThreadMessages(response.data.value);

    return response as AxiosResponse<Thread>;
  }

  /**
   * Create Subscription Endpoint
   */
  @Post("/subscriptions")
  async createSubscription(
    params: OutlookAPI.CreateSubscriptionParams
  ): Promise<AxiosResponse<OutlookAPI.CreateSubscriptionResponse>> {
    // Implementation handled by the decorator
    return;
  }

  /**
   * Get Subscriptions Endpoint
   */
  @Get("/subscriptions")
  async getSubscriptions(
    params: OutlookAPI.GetSubscriptionsParams
  ): Promise<AxiosResponse<OutlookAPI.GetSubscriptionsResponse>> {
    // Implementation handled by the decorator
    return;
  }

  protected onApiError<
    PayloadType = undefined,
    ResponseType = undefined,
    AuthParamsType = undefined,
  >(
    endpointParams: PublicEndpointCallParams,
    authStrategy: AuthStrategy,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any
  ): boolean {
    if (
      error.response?.data?.error == `invalid_grant` &&
      error.response?.data?.error_codes?.includes(500341)
    ) {
      /**
       * AADSTS500341: The user account {EUII Hidden} has been deleted from the 98da37f9-a162-49ec-851c-445619eed81f directory. To sign into this application, the account must be added to the directory. Trace ID: 9e4075ec-7ee7-4f83-b34d-21fec2324001 Correlation ID: 5152beb0-20de-4da5-a127-ffce7e46b314 Timestamp: 2025-01-01 23:39:08Z
       *
       * This is an error thrown by the `token` endpoint, which is a public endpoint,
       * so the Auth strategy does not take care of handling this.
       *
       * However it does indicate that the access token for the user cannot be refreshed and
       * thus the email account should be disconnected
       */
      super.onApiError(endpointParams, authStrategy, apiCall, error);
      throw new AuthenticationFailed(
        this,
        authStrategy,
        endpointParams,
        apiCall,
        error,
        `Authentication failed: ${error.response.data.error_description}`
      );
    } else if (
      error.response?.data?.error == `invalid_grant` &&
      error.response?.data?.error_codes?.includes(50173)
    ) {
      /**
       * AADSTS50173: The provided grant has expired due to it being revoked, a fresh auth token is needed. The user might have changed or reset their password. The grant was issued on '2024-08-20T11:27:50.1621824Z' and the TokensValidFrom date (before which tokens are not valid) for this user is '2024-11-26T23:01:05.0000000Z'. Trace ID: 52c9a463-2b51-450e-bb65-59614d90e801 Correlation ID: 21fa9fb8-1bcc-4f90-8dd6-881b9fcfedc8 Timestamp: 2025-01-02 16:11:59Z
       *
       * This is an error thrown by the `token` endpoint, which is a public endpoint,
       * so the Auth strategy does not take care of handling this.
       *
       * However it does indicate that the access token for the user cannot be refreshed and
       * thus the email account should be disconnected. Due to a changed password
       */
      super.onApiError(endpointParams, authStrategy, apiCall, error);
      throw new AuthenticationFailed(
        this,
        authStrategy,
        endpointParams,
        apiCall,
        error,
        `Authentication failed: ${error.response.data.error_description}`
      );
    } else if (
      error.response?.data?.error == `invalid_grant` &&
      error.response?.data?.error_codes?.includes(700082)
    ) {
      /**
       * AADSTS700082: The refresh token has expired due to inactivity. The token was issued on 2024-07-31T08:00:26.4486159Z and was inactive for 90.00:00:00. Trace ID: 7481cb06-28be-4b36-8333-b717d54d6800 Correlation ID: 00ee8c68-d7c1-47cb-a165-cd2ce97d65c2 Timestamp: 2025-01-02 16:21:38Z
       *
       * This is an error thrown by the `token` endpoint, which is a public endpoint,
       * so the Auth strategy does not take care of handling this.
       *
       * However it does indicate that the access token for the user cannot be refreshed and
       * thus the email account should be disconnected. Due to inactivity over 90 days
       */
      super.onApiError(endpointParams, authStrategy, apiCall, error);
      throw new AuthenticationFailed(
        this,
        authStrategy,
        endpointParams,
        apiCall,
        error,
        `Authentication failed: ${error.response.data.error_description}`
      );
    } else if (
      error.response?.data?.error == `invalid_grant` &&
      error.response?.data?.error_codes?.includes(70000)
    ) {
      /**
       * AADSTS70000: User account is found to be in service abuse mode. Trace ID: 8f20ec83-6753-434c-8f83-4f86150f0605 Correlation ID: 615035e4-81d1-4c45-9fa8-726fa1fabd45 Timestamp: 2025-01-06 02:07:12Z
       *
       * This is an error thrown by the `token` endpoint, which is a public endpoint,
       * so the Auth strategy does not take care of handling this.
       *
       * However it does indicate that the access token for the user cannot be refreshed and
       * thus the email account should be disconnected.
       */
      super.onApiError(endpointParams, authStrategy, apiCall, error);
      throw new AuthenticationFailed(
        this,
        authStrategy,
        endpointParams,
        apiCall,
        error,
        `Authentication failed: ${error.response.data.error_description}`
      );
    } else if (
      error.response?.data?.error == `invalid_grant` &&
      error.response?.data?.error_codes?.includes(50076)
    ) {
      /**
       * AADSTS50076: Due to a configuration change made by your administrator, or because you moved to a new location, you must use multi-factor authentication to access '00000003-0000-0000-c000-000000000000
       *
       * This is an error thrown by the `token` endpoint, which is a public endpoint,
       * so the Auth strategy does not take care of handling this.
       *
       * However it does indicate that the access token for the user cannot be refreshed and
       * thus the email account should be disconnected.
       */
      super.onApiError(endpointParams, authStrategy, apiCall, error);
      throw new AuthenticationFailed(
        this,
        authStrategy,
        endpointParams,
        apiCall,
        error,
        `Authentication failed: ${error.response.data.error_description}`
      );
    }

    return super.onApiError(endpointParams, authStrategy, apiCall, error);
  }

  isAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    axiosError: AxiosError<{ error: { code: string; message: string } }>
  ): boolean {
    if (
      axiosError.response.data.error.code == `InvalidAuthenticationToken` ||
      axiosError.response.data.error.code == `invalid_grant`
    ) {
      return true;
    }
  }

  onAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiService: RemoteAPI,
    authStrategy: RefreshableBearerTokenAuthStrategy,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    axiosError: AxiosError<{ error: { code: string; message: string } }>
  ): boolean {
    throw new AuthenticationFailed(
      apiService,
      authStrategy,
      endpointParams,
      apiCall,
      axiosError,
      `Authentication failed: ${axiosError.response.data.error.message}`
    );
  }

  humanizeError(error: any): HumanizedError {
    if (error instanceof AuthenticationFailed) {
      return {
        title: `Email account access denied`,
        detail: `Looks like your email account authorization is expired or was never established. Please, reconnect your email account. Here is a message from your email provider: ${
          error.error?.response?.data?.error_description || ""
        }`,
      };
    }

    return super.humanizeError(error);
  }

  protected static normalizeThreadMessages(
    messages: OutlookAPI.EmailMessage[]
  ): Thread {
    return {
      messages: messages.map((msg: any) => {
        return {
          id: msg.id,
          date: new Date(msg.receivedDateTime).toISOString(),
          writtenBy: msg.from?.emailAddress?.name,
          email: msg.from?.emailAddress?.address,
          content: OutlookAPI.cleanEmailContent(msg.body.content),
        };
      }),
    } as Thread;
  }

  protected static cleanEmailContent(content) {
    let text = OutlookAPI.stripHtmlTags(content);
    text = OutlookAPI.removeNestedReplies(text);
    text = OutlookAPI.removeSignature(text);
    text = OutlookAPI.removeQuotedText(text);
    text = OutlookAPI.removeBrAtEnd(text);
    return text.trim();
  }

  protected static removeNestedReplies(text) {
    const nestedReplyPattern = /On\s.*?\swrote:.*?(?=(On\s.*?\swrote:|$))/gs;
    return text.replace(nestedReplyPattern, "");
  }

  protected static removeQuotedText(text) {
    return text.replace(/^>.*$/gm, ""); // Simple quoted text remover
  }

  protected static removeBrAtEnd(text) {
    return text.replace(/<br>\s*$/, "");
  }

  protected static removeSignature(text) {
    const signatureIndex = text.indexOf("\n--\n");
    if (signatureIndex !== -1) {
      return text.substring(0, signatureIndex);
    }
    return text;
  }

  protected static stripHtmlTags(html) {
    return html.replace(
      /<(?!br\s*\/?|\/br|a\s|\/a|b\s|\/b|ul\s|\/ul|ol\s|\/ol|p\s|\/p)[^>]+>/gi,
      ""
    );
  }
}

// Merge the namespace with the class
export namespace OutlookAPI {
  // Existing type definitions
  export type EmailAddress = {
    name?: string;
    address: string;
  };

  export type Recipient = {
    emailAddress: EmailAddress;
  };

  export type MessageHeader = {
    name: string;
    value: string;
  };

  export enum EmailBodyContentType {
    HTML = "HTML",
    TEXT = "Text",
  }

  export type EmailBody = {
    contentType: EmailBodyContentType; // Specifies the type of content
    content: string; // The actual body content
  };

  export interface Subscription {
    id: string;
    resource: string;
    changeType?: string;
    notificationUrl?: string;
    expirationDateTime?: string;
    clientState?: string;
    // Add other relevant fields as needed
  }

  export interface GetMessagesResponse {
    value: EmailMessage[];
    "@odata.context": string;
  }

  export interface EmailMessage {
    id?: string;
    conversationId?: string;
    sender: Recipient;
    internetMessageHeaders?: MessageHeader[];
    toRecipients: Recipient[];
    ccRecipients?: Recipient[];
    bccRecipients?: Recipient[];
    subject?: string;
    body: EmailBody;
    email?: string;
    bodyPreview?: string;
    // Add other relevant fields as needed
  }

  // Nested Types for Payloads and Responses

  export type SendMailPayload = {
    message: EmailMessage;
    saveToSentItems?: boolean;
  };

  export type CreateSubscriptionPayload = {
    changeType: string; // e.g., "created,updated,deleted"
    notificationUrl: string;
    resource: string; // e.g., "/me/messages"
    expirationDateTime: string; // ISO 8601 format
    clientState?: string;
    // Optional fields based on resource type
    latestSupportedTlsVersion?: string;
    includeResourceData?: boolean;
    encryptionCertificate?: string;
    encryptionCertificateId?: string;
  };

  export type TokenPayload = {
    client_id: string;
    client_secret: string;
    scope?: string;
    grant_type: "refresh_token" | string; // Typically 'refresh_token'
    refresh_token?: string;
    redirect_uri?: string;
    code?: string;
  };

  export type TokenResponse = {
    access_token: string;
    refresh_token?: string;
    expires_in: number; // Seconds until expiration
    token_type: string; // Typically 'Bearer'
  };

  export type AuthParams = {
    accessToken: string;
  };

  export type GuardedOutlookEndpointCallParams<
    PathParamsType = undefined,
    QueryParamsType = undefined,
    PayloadType = undefined,
    ContextType = undefined,
  > = GuardedEndpointCallParams<
    OutlookAPI.AuthParams, // auth params
    PathParamsType,
    QueryParamsType,
    PayloadType,
    ContextType
  >;

  export type SendMailParams = GuardedOutlookEndpointCallParams<
    never, // path params
    never, // query params
    OutlookAPI.SendMailPayload, // body payload
    Partial<SendProspectEmailParams> // context
  >;

  export type UsersRelationsParams = Omit<
    GuardedOutlookEndpointCallParams<
      never, // path params
      undefined, // overwrite query params to make them required
      never // payload
    >,
    "query"
  > & {
    query: {
      account_id: string;
      cursor?: string;
      filter?: string;
      limit?: number;
    };
  };

  export type UsersRelationsResponse = {
    family: [];
    friends: [];
  };

  export type DeleteSubscriptionParams = Omit<
    GuardedOutlookEndpointCallParams<
      undefined, // overwrite path params type to make it required
      never, // query params
      void,
      any
    >,
    "pathParams"
  > & {
    pathParams: {
      subscriptionId: string;
    };
  };

  export type ReplyToThreadPayload = {
    message: {
      // Optionally, you can include other fields like attachments
      subject?: string;
      toRecipients?: Recipient[];
      ccRecipients?: Recipient[];
    };
    comment: string;
    saveToSentItems?: boolean;
  };

  export type ReplyToThreadParams = Omit<
    GuardedOutlookEndpointCallParams<
      undefined, // overwrite path params type to make it required
      never, // query params
      OutlookAPI.ReplyToThreadPayload, // body payload
      Partial<SendProspectEmailParams> // context
    >,
    "pathParams"
  > & {
    pathParams: { messageId: string }; // path params
  };

  export type GetMessagesParams = GuardedOutlookEndpointCallParams<
    never, // path params
    {
      $filter: string;
    }, // query params
    never
  >;

  export type ThreadParams = GuardedOutlookEndpointCallParams<
    never, // path params
    {
      threadId: string;
    }, // query params
    never,
    any
  >;

  export type CreateSubscriptionParams = GuardedOutlookEndpointCallParams<
    never, // path params
    never, // query params
    OutlookAPI.CreateSubscriptionPayload, // body payload
    any
  >;

  export type CreateSubscriptionResponse = {
    id: string;
    changeType: "created";
    notificationUrl: string;
    resource: string;
    includeResourceData: boolean;
    encryptionCertificate: string;
    encryptionCertificateId: "scout-new-key";
    expirationDateTime;
    clientState: string;
    lifecycleNotificationUrl: string;
  };

  export type GetSubscriptionsParams = GuardedOutlookEndpointCallParams<
    never, // path params
    never, // query params
    never
  >;

  export type GetSubscriptionsResponse = {
    value: Subscription[];
    "@odata.nextLink"?: string;
  };

  export type TokenParams = PublicEndpointCallParams<
    never, // path params
    never, // query params
    OutlookAPI.TokenPayload
  >;

  export type RefreshAccessTokensEventsContext = {
    emailAccount: EmailAccount;
  };

  export type RefreshAccessTokensEventParams = EndpointEventParams<
    OutlookAPI.TokenParams,
    APICall<OutlookAPI.TokenPayload, AccessTokenResponse>,
    OutlookAPI.RefreshAccessTokensEventsContext
  >;

  export type MeResponse = User;

  export type MeParams = GuardedOutlookEndpointCallParams<
    never, // path params
    never, // query params
    never,
    any
  >;

  export type MailFolderParams = GuardedOutlookEndpointCallParams<
    {
      folderId: string;
    }, // path params
    never, // query params
    never,
    any
  >;

  export type MailFolderResponse = {
    id: string;
    displayName: string;
    parentFolderId: string;
    childFolderCount: number;
    unreadItemCount: number;
    totalItemCount: number;
    isHidden: boolean;
  };

  export type MessageResponse = EmailMessage;

  export type MessageParams = Omit<
    GuardedOutlookEndpointCallParams<
      undefined, // overwrite path params type to make it required
      {
        $select?: string;
      },
      never,
      any
    >,
    "pathParams"
  > & {
    pathParams: {
      userId: string;
      messageId: string;
    };
  };

  export type ReauthorizeSubscriptionParams = Omit<
    GuardedOutlookEndpointCallParams<
      undefined, // overwrite path params type to make it required
      never,
      {
        expirationDateTime: string;
      }
    >,
    "pathParams"
  > & {
    pathParams: {
      subscriptionId: string;
    };
  };

  export type MessageInfo = {
    date: string;
    writtenBy: string;
    email: string;
    content: string;
  };

  export type User = {
    businessPhones?: string[];
    displayName?: string;
    givenName?: string;
    jobTitle?: string;
    mail?: string;
    mobilePhone?: string;
    officeLocation?: string;
    preferredLanguage?: string;
    surname?: string;
    userPrincipalName: string;
    id?: string;
  };

  export type OutlookMessage = Message & OutlookAPI.EmailMessage;
}
