import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AxiosError, AxiosResponse } from "axios";
import { format, parse } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";
import { GaxiosError } from "gaxios";
import { gmail_v1, google } from "googleapis";
import * as _ from "lodash";
import {
  IEmailManagementAPI,
  IOAuthAPI,
  ISendEmailRemoteAPI,
  Message,
  SendEmailResult,
  SendProspectEmailParams,
  Thread,
} from "../../../api/src/prospect-email-sending/providers/prospect-email-sending-provider";
import { AuthStrategy } from "./auth/auth.strategy";
import { Get, Normalize, Post } from "../decorators";
import { AuthenticationFailed, InvalidAuthParams } from "../exceptions";
import { HumanizedError, RemoteAPI } from "../remote-api";
import {
  APICall,
  GuardedEndpointCallParams,
  PublicEndpointCallParams,
} from "../types";
import { EmailThreadNotFound } from "../../../api/src/prospect-email-sending/prospect-email-sending.service";

@Injectable()
export class GMailAPI
  extends RemoteAPI
  implements ISendEmailRemoteAPI, IOAuthAPI, IEmailManagementAPI
{
  protected dryRun: boolean = false;
  protected verbose: boolean = false;

  static Events = {
    Tokens: `GMailAPI.tokens`,
  };

  constructor(protected readonly eventEmitter: EventEmitter2) {
    super(eventEmitter, null);
  }

  static authUrl(state: string): string {
    const oauth2Client = new google.auth.OAuth2(
      process.env.SCOUT_API_GOOGLE_CLIENT_ID,
      process.env.SCOUT_API_GOOGLE_CLIENT_SECRET,
      GMailAPI.redirectUrl()
    );

    const authUrl = oauth2Client.generateAuthUrl({
      // 'online' (default) or 'offline' (gets refresh_token)
      access_type: "offline",

      // If you only need one scope you can pass it as a string
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      include_granted_scopes: true,
      state,
      prompt: "consent",
    });

    return authUrl;
  }

  static redirectUrl(): string {
    return `${process.env.SCOUT_HTTP_PROTOCOL}://${process.env.SCOUT_DOMAIN}:3001/email-account/gmail-oauth-callback`;
  }

  authUrl(state: string): string {
    return GMailAPI.authUrl(state);
  }
  redirectUrl(): string {
    return GMailAPI.redirectUrl();
  }

  @Post<
    Promise<AxiosResponse<SendEmailResult>>,
    GMailAPI.UsersMesssagesSendParams
  >("/users/:userId/messages/send")
  @Normalize({
    threadId: "id",
  })
  async startThread(
    params: GMailAPI.UsersMesssagesSendParams
  ): Promise<AxiosResponse<SendEmailResult>> {
    return;
  }

  protected async doStartThread(
    gmail: gmail_v1.Gmail,
    params: GMailAPI.UsersMesssagesSendParams,
    apiCall: APICall<GMailAPI.UsersMessagesSendPayload, SendEmailResult>
  ): Promise<AxiosResponse<SendEmailResult>> {
    return (await gmail.users.messages.send({
      userId: "me",
      requestBody: apiCall.request.payload,
    })) as AxiosResponse<SendEmailResult>;
  }

  @Post<
    Promise<AxiosResponse<SendEmailResult>>,
    GMailAPI.UsersMesssagesReplyToThreadParams
  >("/users/:userId/messages/send")
  async replyToThread(
    params: GMailAPI.UsersMesssagesReplyToThreadParams
  ): Promise<AxiosResponse<SendEmailResult>> {
    return;
  }

  protected async doReplyToThread(
    gmail: gmail_v1.Gmail,
    params: GMailAPI.UsersMesssagesReplyToThreadParams,
    apiCall: APICall<
      GMailAPI.UsersMessagesReplyToThreadPayload,
      SendEmailResult
    >
  ): Promise<AxiosResponse<SendEmailResult>> {
    return (await gmail.users.messages.send({
      userId: "me",
      requestBody: apiCall.request.payload,
    })) as AxiosResponse<SendEmailResult>;
  }

  @Post<
    Promise<AxiosResponse<GMailAPI.UsersWatchResponse>>,
    GMailAPI.UsersWatchParams
  >("/users/:userId/watch")
  async watch(
    params: GMailAPI.UsersWatchParams
  ): Promise<AxiosResponse<GMailAPI.UsersWatchResponse>> {
    return;
  }

  protected async doWatch(
    gmail: gmail_v1.Gmail,
    params: GMailAPI.UsersWatchParams,
    apiCall: APICall<GMailAPI.UsersWatchPayload, GMailAPI.UsersWatchResponse>
  ): Promise<AxiosResponse<GMailAPI.UsersWatchResponse>> {
    return (await gmail.users.watch({
      userId: "me",
      ...apiCall.request.payload,
    })) as AxiosResponse<GMailAPI.UsersWatchResponse>;
  }

  @Get<Promise<AxiosResponse<Thread>>, GMailAPI.UsersThreadParams>(
    "/users/:userId/threads/:threadId"
  )
  @Normalize(GMailAPI.normalizeThreadMessages)
  async thread(
    params: GMailAPI.UsersThreadParams
  ): Promise<AxiosResponse<Thread>> {
    return;
  }

  protected async doThread(
    gmail: gmail_v1.Gmail,
    params: GMailAPI.UsersThreadParams,
    apiCall: APICall<never, Thread>
  ): Promise<AxiosResponse<Thread>> {
    const getThreadParams = params as GMailAPI.UsersThreadParams;
    const gaxios = (await gmail.users.threads.get({
      userId: params.pathParams.userId,
      id: getThreadParams.pathParams.threadId,
    })) as unknown;

    const response = gaxios as AxiosResponse<Thread>;

    return response;
  }

  async latestMessage(params: GMailAPI.UsersThreadParams): Promise<Message> {
    const messages = (await this.thread(params)).data.messages;

    return messages[messages.length - 1];
  }

  @Get<
    Promise<AxiosResponse<GMailAPI.GmailMessage>>,
    GMailAPI.UsersMessageParams
  >("/users/:userId/messages/:messageId")
  @Normalize(GMailAPI.normalizeMessage)
  async message(
    params: GMailAPI.UsersMessageParams
  ): Promise<AxiosResponse<GMailAPI.GmailMessage>> {
    return;
  }

  protected async doMessage(
    gmail: gmail_v1.Gmail,
    params: GMailAPI.UsersMessageParams,
    apiCall: APICall<never, GMailAPI.UsersMessageResponse>
  ): Promise<AxiosResponse<GMailAPI.GmailMessage>> {
    return (await gmail.users.messages.get({
      userId: params.pathParams.userId,
      id: params.pathParams.messageId,
    })) as AxiosResponse<GMailAPI.GmailMessage>;
  }

  protected static normalizeMessage(
    api: GMailAPI,
    params: GMailAPI.UsersMessageParams,
    message: GMailAPI.UsersMessageResponse
  ): GMailAPI.GmailMessage {
    const defaultTimezone = `America/Los_Angeles`;

    let body = "";

    if (message.payload.parts) {
      const obtainBody = (part: gmail_v1.Schema$MessagePart) => {
        let res: string;
        try {
          res = Buffer.from(part.body.data, "base64").toString();
        } catch {
          res = "";
        }

        if (part.parts) {
          res += res + part.parts.flatMap((p) => obtainBody(p)).join("");
        }
        return res;
      };
      body = message.payload.parts.map((part) => obtainBody(part)).join("");
    } else if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, "base64").toString();
      try {
        body = Buffer.from(message.payload.body.data, "base64").toString();
      } catch (err) {
        console.error("Error occuring when no parts is present", err);
        body = "";
      }
    }

    const cleanBody = (input: string): string => {
      const startIndex = 0;

      // Start of the manual added html
      const htmlStartIndex = input.indexOf('<div dir="ltr">');

      if (startIndex > htmlStartIndex) {
        return input;
      }

      const textBefore = input.substring(0, startIndex).trim();

      const htmlContent =
        htmlStartIndex === -1 ? "" : input.substring(htmlStartIndex);

      return `${textBefore}\n${htmlContent}`;
    };

    const headers = message.payload.headers;

    const dateHeader = headers.find((header) => header.name === "Date")?.value;
    const fromHeader = headers.find((header) => header.name === "From")?.value;

    const regex = /<([^>]+)>/;
    const match = fromHeader.match(regex);

    const regexName = /^(.*?)\s*</;
    const matchHeader = fromHeader.match(regexName);

    const fromName = matchHeader ? matchHeader[1].trim() : "";

    let fromEmail = "";
    if (match) {
      fromEmail = match[1];
    }

    const referencesHeader = headers.find(
      (header) => header.name === "References"
    )?.value;

    let formattedDate = "";
    if (dateHeader) {
      const cleanedDateHeader = dateHeader.replace(/\s*\(.*?\)$/, "");

      const parsedDate = parse(
        cleanedDateHeader,
        "E, d MMM yyyy HH:mm:ss X",
        new Date()
      );
      formattedDate = format(
        utcToZonedTime(parsedDate, params.context?.timezone || defaultTimezone),
        "E, MMM d, yyyy 'at' h:mm a"
      );

      /**
       * If using default timezone, attach information
       * about it in the date
       */
      if (!params.context?.timezone) {
        formattedDate += ` PST`;
      }
    }

    const cleanedBody = cleanBody(body);

    const quotedLinePrefix = `On ${formattedDate} ${fromName} <<a href="mailto:${fromEmail}">${fromEmail}<a/>> wrote:\n`;
    const bodyWithConversationHistory = `<br><div class="gmail_quote"><div class="gmail_attr">${quotedLinePrefix}</div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${cleanedBody}</blockquote></div>`;

    return {
      headers,
      body: cleanedBody,
      bodyWithConversationHistory,
      threadId: message.threadId,
      dateHeader,
      fromHeader,
      formattedDate,
      referencesHeader,
      fromEmail,
      fromName,
    } as GMailAPI.GmailMessage;
  }

  @Get<
    Promise<AxiosResponse<GMailAPI.UsersHistoryListResponse>>,
    GMailAPI.UsersHistoryListParams
  >("/users/:userId/history")
  async historyList(
    params: GMailAPI.UsersHistoryListParams
  ): Promise<AxiosResponse<GMailAPI.UsersHistoryListResponse>> {
    return;
  }

  protected async doHistoryList(
    gmail: gmail_v1.Gmail,
    params: GMailAPI.UsersHistoryListParams,
    apiCall: APICall<never, GMailAPI.UsersHistoryListResponse>
  ): Promise<AxiosResponse<GMailAPI.UsersHistoryListResponse>> {
    return (await gmail.users.history.list({
      userId: params.pathParams.userId,
      historyTypes: params.query.historyTypes,
      startHistoryId: params.query.startHistoryId,
      labelId: params.query.labelId,
    })) as AxiosResponse<GMailAPI.UsersHistoryListResponse>;
  }

  @Post<Promise<AxiosResponse<void>>, GMailAPI.UsersStopParams>(
    "/users/:userId/stop"
  )
  async stop(params: GMailAPI.UsersStopParams): Promise<AxiosResponse<void>> {
    return;
  }

  protected async doStop(
    gmail: gmail_v1.Gmail,
    params: GMailAPI.UsersStopParams,
    apiCall: APICall<never, never>
  ): Promise<AxiosResponse<never>> {
    return (await gmail.users.stop({
      userId: params.pathParams.userId,
    })) as AxiosResponse<never>;
  }

  /**
   * Override how the API class handles actual
   * sending of the requests. This API wrapper is
   * not using Axios HTTP service from Nest. Instead
   * it uses Google gmail client.
   *
   * Utilize the pattern of methods do${endpointName} to
   * provide the implementation to use for the endpoint
   *
   * @param endpointParams
   * @param apiCall
   * @returns
   */
  protected override async doCall<PayloadType, ResponseType>(
    endpointParams: GMailAPI.GuardedGmailEndpointCallParams<
      any,
      any,
      PayloadType,
      any
    >,
    apiCall: APICall<PayloadType, ResponseType, any>
  ): Promise<AxiosResponse<ResponseType>> {
    if (!this.dryRun) {
      const gmail = this.gmailSDK(endpointParams, apiCall);

      // This is jush for reference and debugging. The GMail SDK client
      // takes care of this on it's own
      apiCall.request.headers["Authorization"] =
        `Bearer ${endpointParams.auth.accessToken}`;

      const implementationMethodName = `do${_.upperFirst(
        apiCall.endpoint.name
      )}`;

      if (
        !this[implementationMethodName] ||
        typeof this[implementationMethodName] !== "function"
      ) {
        throw new Error(
          `Endpoint ${this.constructor.name}.${apiCall.endpoint.name} defined but the implementation method ${implementationMethodName} seems to be missing. Make sure that every defined endpoint in GMailAPI has a matching do{endpointName} method to call the appropriate functions of the Gmail client.`
        );
      }

      return await this[implementationMethodName](
        gmail,
        endpointParams,
        apiCall
      );
    } else {
      this.logger.warn(
        `GmailService running in dry run mode... the Gmail send API request was skipped.`
      );
    }
  }

  protected oAuthClient<PayloadType, ResponseType>(
    callParams: GMailAPI.GuardedGmailEndpointCallParams<
      any,
      any,
      PayloadType,
      any
    >,
    apiCall: APICall<PayloadType, ResponseType, GMailAPI.AuthParams>
  ) {
    if (
      !apiCall.request.auth.accessToken ||
      !apiCall.request.auth.refreshToken
    ) {
      throw new InvalidAuthParams(this, undefined, apiCall);
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.SCOUT_API_GOOGLE_CLIENT_ID,
      process.env.SCOUT_API_GOOGLE_CLIENT_SECRET,
      process.env.SCOUT_API_GOOGLE_CALLBACK_URL
    );

    oAuth2Client.setCredentials({
      access_token: apiCall.request.auth.accessToken,
      refresh_token: apiCall.request.auth.refreshToken,
    });

    oAuth2Client.on("tokens", (tokens) => {
      this.eventEmitter.emit(GMailAPI.Events.Tokens, {
        params: callParams,
        apiCall,
        tokens,
      });
    });

    return oAuth2Client;
  }

  protected gmailSDK<PayloadType, ResponseType>(
    callParams: GMailAPI.GuardedGmailEndpointCallParams<
      any,
      any,
      PayloadType,
      any
    >,
    apiCall: APICall<PayloadType, ResponseType, GMailAPI.AuthParams>
  ) {
    const gmail = google.gmail({
      version: "v1",
      auth: this.oAuthClient(callParams, apiCall),
    });

    return gmail;
  }

  /**
   * Outlook's API base URL
   * @returns string
   */
  baseUrl(): string {
    // base url from here is not really used, as the
    // implementation uses GMail client anyway
    return "https://gmail.googleapis.com/gmail/v1";
  }

  /**
   * What is the global rate limit
   */
  rateLimit(): number {
    return 1000;
  }

  /**
   * What is the length of the rate limit window
   */
  rateLimitWindowLength(): number {
    return 10 * 1000;
  }

  isAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: GaxiosError
  ): boolean {
    if (error.response.data.error == `invalid_grant`) {
      return true;
    }
  }

  onAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiService: RemoteAPI,
    authStrategy: AuthStrategy,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: GaxiosError
  ): boolean {
    throw new AuthenticationFailed(
      apiService,
      authStrategy,
      endpointParams,
      apiCall,
      error,
      `Authentication failed: ${error.response.data.error} ${error.response.data.error_description}`
    );
  }

  protected override onApiError<
    PayloadType = undefined,
    ResponseType = undefined,
    AuthParamsType = undefined,
  >(
    endpointParams: PublicEndpointCallParams,
    authStrategy: AuthStrategy,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: any
  ): boolean {
    if (this.isAuthError(apiCall, error)) {
      this.onAuthError(this, authStrategy, endpointParams, apiCall, error);
    }

    if (error.response?.data?.error?.status === "NOT_FOUND") {
      throw new EmailThreadNotFound();
    }

    return super.onApiError(endpointParams, authStrategy, apiCall, error);
  }

  override isApiError(error: any) {
    return (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      error.response &&
      "data" in error.response &&
      error.response.data &&
      "error" in error.response.data
    );
  }

  protected override logApiError<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    error: AxiosError
  ): void {
    this.logger.error(
      `🔌❌ ${this.dryRun ? "(dry run)" : ""} ${apiCall}\n\n` +
        `API error: ${error.response?.status} ${error.response
          ?.statusText}\n${JSON.stringify(error.response?.data, null, 2)}\n\n` +
        `Stack:\n${error.stack}`
    );
  }

  protected static normalizeThreadMessages(
    api: GMailAPI,
    params: GMailAPI.UsersThreadParams,
    payload: GMailAPI.UsersThreadResponse
  ): Thread {
    const messages = payload.messages;

    return {
      messages: messages.map((msg) => {
        const contentParts = GMailAPI.extractContentParts(msg.payload);

        const content = contentParts
          .map((part) => GMailAPI.decodeBase64(part.body.data))
          .join("\n");
        const cleanedContent = GMailAPI.cleanEmailContent(content);

        const headers = msg.payload.headers;
        const fromHeader = headers.find((header) => header.name === "From");
        const [senderName, senderEmail] = GMailAPI.parseSenderInfo(
          fromHeader ? fromHeader.value : "Unknown"
        );

        return {
          id: msg.id,
          date: new Date(parseInt(msg.internalDate)).toISOString(),
          writtenBy: senderName,
          email: senderEmail,
          content: cleanedContent,
        };
      }),
    };
  }

  protected static extractContentParts(part, contentParts = []) {
    if (part.parts) {
      part.parts.forEach((subPart) =>
        GMailAPI.extractContentParts(subPart, contentParts)
      );
    } else if (
      part.mimeType === "text/plain" ||
      part.mimeType === "text/html"
    ) {
      contentParts.push(part);
    }
    return contentParts;
  }

  protected static parseSenderInfo(senderInfo) {
    const senderParts = senderInfo.split(" ");
    const email = senderParts.pop().replace(/[<>]/g, "");
    const name = senderParts.join(" ").trim();

    return [name, email];
  }

  protected static decodeBase64(encodedData) {
    if (!encodedData) {
      return "";
    }
    return Buffer.from(encodedData, "base64").toString("utf8");
  }

  protected static cleanEmailContent(content) {
    let text = GMailAPI.stripHtmlTags(content);
    const nestedReplyPattern = /On\s.*?\swrote:.*?(?=(On\s.*?\swrote:|$))/gs;
    text = text.replace(nestedReplyPattern, "");
    text = GMailAPI.removeSignature(text);
    return text.trim();
  }

  protected static removeSignature(text) {
    const signatureIndex = text.indexOf("\n--\n");
    if (signatureIndex !== -1) {
      return text.substring(0, signatureIndex);
    }
    return text;
  }

  protected static stripHtmlTags(html) {
    return html.replace(/<img[^>]*>/gm, "");
  }

  protected removeQuotedText(text) {
    return text.replace(/^>.*$/gm, ""); // Simple quoted text remover
  }

  protected extractContentParts(part, contentParts = []) {
    if (part.parts) {
      part.parts.forEach((subPart) =>
        this.extractContentParts(subPart, contentParts)
      );
    } else if (
      part.mimeType === "text/plain" ||
      part.mimeType === "text/html"
    ) {
      contentParts.push(part);
    }
    return contentParts;
  }

  protected parseSenderInfo(senderInfo) {
    const senderParts = senderInfo.split(" ");
    const email = senderParts.pop().replace(/[<>]/g, "");
    const name = senderParts.join(" ").trim();

    return [name, email];
  }

  protected decodeBase64(encodedData) {
    if (!encodedData) {
      return "";
    }
    return Buffer.from(encodedData, "base64").toString("utf8");
  }
}

// Merge the namespace with the class
export namespace GMailAPI {
  export type AuthParams = {
    accessToken: string;
    refreshToken: string;
  };
  export type GuardedGmailEndpointCallParams<
    PathParamsType = undefined,
    QueryParamsType = undefined,
    PayloadType = undefined,
    ContextType = undefined,
  > = GuardedEndpointCallParams<
    GMailAPI.AuthParams, // auth params
    PathParamsType,
    QueryParamsType,
    PayloadType,
    ContextType
  >;

  export type UsersMesssagesSendContext = Partial<SendProspectEmailParams>;

  export type UsersMesssagesSendParams = Omit<
    GuardedGmailEndpointCallParams<
      {
        userId: string;
      },
      never, // query params
      UsersMessagesSendPayload, // payload
      UsersMesssagesSendContext // context
    >,
    "pathParams"
  > & {
    pathParams: {
      userId: string;
    };
  };

  export type UsersMessagesSendPayload = {
    raw: string;
  };

  export type UsersMesssagesReplyToThreadContext = UsersMesssagesSendContext;

  export type UsersMesssagesReplyToThreadParams = Omit<
    GuardedGmailEndpointCallParams<
      undefined, // overwrite path params type to make it required
      never, // query params
      UsersMessagesReplyToThreadPayload, // payload
      UsersMesssagesSendContext // context
    >,
    "pathParams"
  > & {
    pathParams: {
      userId: string;
    };
  };

  export type UsersMessagesReplyToThreadPayload = {
    raw: string;
    threadId: string;
  };

  export type UsersWatchParams = Omit<
    GuardedGmailEndpointCallParams<
      undefined, // overwrite path params type to make it required
      never, // query params
      UsersWatchPayload,
      any // context
    >,
    "pathParams"
  > & {
    pathParams: {
      userId: string;
    };
  };

  export type UsersWatchPayload = {
    labelIds?: string[];
    labelFilterBehavior: "include" | "exclude";
    topicName: string;
  };

  export type UsersWatchResponse = {
    historyId: string;
    expiration: string;
  };

  export type UsersThreadParams = Omit<
    GuardedGmailEndpointCallParams<
      undefined, // overwrite path params type to make it required
      {
        format?: "full" | "metadata" | "minimal";
        metadataHeaders?: string[];
      }, // query params
      never,
      any // context
    >,
    "pathParams"
  > & {
    pathParams: {
      userId: string;
      threadId: string;
    }; // path params
  };

  export type UsersThreadResponse = gmail_v1.Schema$Thread;

  export type UsersMessageParams = Omit<
    GuardedGmailEndpointCallParams<
      undefined, // overwrite path params type to make it required
      {
        format?: "full" | "metadata" | "minimal";
        metadataHeaders?: string[];
      }, // query params
      never,
      any // context
    >,
    "pathParams"
  > & {
    pathParams: {
      userId: string;
      messageId: string;
    }; // path params
  };

  export type UsersMessageResponse = gmail_v1.Schema$Message;

  export type UsersHistoryListParams = Omit<
    GuardedGmailEndpointCallParams<
      undefined, // overwrite path params type to make it required
      undefined, // overwrite query params type to make it required
      never, // no payload
      any // context
    >,
    "pathParams" | "query"
  > & {
    pathParams: {
      userId: string;
    }; // path params
    query: {
      maxResults?: number;
      pageToken?: string;
      startHistoryId: string;
      labelId?: string;
      historyTypes?: (
        | "messageAdded"
        | "messageDeleted"
        | "labelAdded"
        | "labelRemoved"
      )[];
    }; // query params
  };

  export type UsersHistoryListResponse = {
    history: gmail_v1.Schema$History[];
    nextPageToken: string;
    historyId: string;
  };

  export type UsersStopParams = Omit<
    GuardedGmailEndpointCallParams<
      undefined, // overwrite path params type to make it required
      never, // query
      never, // payload
      any // context
    >,
    "pathParams"
  > & {
    pathParams: {
      userId: string;
    }; // path params
  };

  export type GmailMessage = Message & {
    headers: gmail_v1.Schema$MessagePartHeader[];
    body: string;
    bodyWithConversationHistory;
    threadId: string;
    dateHeader: string;
    fromHeader: string;
    formattedDate: string;
    referencesHeader: string;
    fromEmail: string;
    fromName: string;
  };
}
