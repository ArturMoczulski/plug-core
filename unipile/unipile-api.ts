import { Injectable } from "@nestjs/common";
import { AxiosError, AxiosResponse } from "axios";
import { EmailAccount } from "../../../api/src/prismaGenerated";
import {
  ISendEmailRemoteAPI,
  SendEmailResult,
  SendProspectEmailParams,
} from "../../../api/src/prospect-email-sending/providers/prospect-email-sending-provider";
import { AuthStrategy } from "../core/auth/auth.strategy";
import { AccessTokenResponse } from "../core/auth/refreshable-bearer-token-auth.strategy";
import { UnipileCustomAuthAuthStrategy } from "../core/auth/unipile-custom-auth.strategy";
import { Get, Normalize, Post } from "../decorators";
import { AuthenticationFailed } from "../exceptions";
import { HumanizedError, RemoteAPI } from "../remote-api";
import {
  APICall,
  EndpointEventParams,
  GuardedEndpointCallParams,
  PublicEndpointCallParams,
} from "../types";

@Injectable()
export class UnipileAPI extends RemoteAPI implements ISendEmailRemoteAPI {
  protected verbose = true;
  protected dryRun: boolean = false;

  /**
   * Outlook's API base URL
   * @returns string
   */
  baseUrl(): string {
    return `https://api8.unipile.com:13823/api/v1`;
  }

  /**
   * What is the global rate limit
   */
  rateLimit(): number {
    return 10;
  }

  /**
   * What is the length of the rate limit window
   */
  rateLimitWindowLength(): number {
    return 20 * 1000; // 20 seconds
  }

  /**
   * Default auth strategy for Outlook is bearer token
   *
   * This means, the ApiCalls will have to provide the
   * accessToken field in the auth property
   * @returns string
   */
  override defaultAuthStrategy(): AuthStrategy.Type {
    return AuthStrategy.Type.UNIPILE_CUSTOM_AUTH_BEARER_TOKEN;
  }

  override useAuthStrategies(): Partial<AuthStrategy[]> {
    return [
      new UnipileCustomAuthAuthStrategy({
        isAuthError: this.isAuthError.bind(this),
        onAuthError: this.onAuthError.bind(this),
      }),
    ];
  }

  isAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    axiosError: AxiosError<{
      status: number;
      type: string;
      title: string;
      detail: string;
    }>
  ): boolean {
    //@ts-ignore
    if (axiosError.response?.message?.includes("timeout")) {
      /** If axios times out, just return */
      return false;
    }
    if (
      axiosError.response.data.type == "errors/disconnected_account" ||
      axiosError.response.data.title == "Disconnected account"
    ) {
      return true;
    }
  }

  onAuthError<PayloadType, ResponseType, AuthParamsType>(
    apiService: RemoteAPI,
    authStrategy: UnipileCustomAuthAuthStrategy,
    endpointParams: PublicEndpointCallParams,
    apiCall: APICall<PayloadType, ResponseType, AuthParamsType>,
    axiosError: AxiosError<{
      status: number;
      type: string;
      title: string;
      detail: string;
    }>
  ): boolean {
    throw new AuthenticationFailed(
      apiService,
      authStrategy,
      endpointParams,
      apiCall,
      axiosError,
      `Authentication failed: ${axiosError.response.data.title} - ${axiosError.response.data.detail}`
    );
  }
  // override useAuthStrategies(): Partial<AuthStrategy[]> {
  //   return [
  //     new BearerTokenAuthStrategy(),
  //     new RefreshableBearerTokenAuthStrategy<{
  //       payload: { refreshToken: string };
  //     }>({
  //       isAccessTokenExpiredError: (error: any) => {
  //         return false;
  //       },
  //       refreshAccessToken: async (params: {
  //         payload: { refreshToken: string };
  //       }) => {
  //         return {
  //           data: {
  //             accessToken: '123',
  //             expiresOn: moment().toDate().toString(),
  //           },
  //         } as AxiosResponse;
  //       },
  //     }),
  //   ];
  // }

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
  isAccessTokenExpiredError(error: any) {
    return (
      error.response?.data?.error?.code == "InvalidAuthenticationToken" ||
      error.response?.data?.error == "invalid_grant"
    );
  }

  /** This is used in the Linkedin Service "sendLinkedinMessage" function */
  @Post<UnipileAPI.StartNewChatReturnType, UnipileAPI.StartNewChatParams>(
    "/chats"
  )
  @Normalize({
    threadId: "chat_id",
    messageId: "message_id",
  })
  async startThread(
    params: UnipileAPI.StartNewChatParams
  ): Promise<AxiosResponse<SendEmailResult>> {
    // The actual implementation is handled by the decorator
    return;
  }

  /** This is used in the Linkedin Service "sendLinkedinMessage" function */
  @Post<
    UnipileAPI.SendMessageInChatReturnType,
    UnipileAPI.SendMessageInChatParams
  >("/chats/:chatId/messages")
  @Normalize({
    messageId: "message_id",
  })
  async replyToThread(
    params: UnipileAPI.SendMessageInChatParams
  ): Promise<AxiosResponse<SendEmailResult>> {
    // Implementation handled by the decorator
    return;
  }

  @Get<
    UnipileAPI.UserRelationsReturnType,
    UnipileAPI.UserRelationsParamsEndpoint
  >("/users/relations")
  async fetchLinkedinRelations(
    params: UnipileAPI.UserRelationsParamsEndpoint
  ): Promise<AxiosResponse<UnipileAPI.UserRelationsReturnType>> {
    return;
  }

  /** This is used in the Linkedin Service "decorateProspectWithProviderId" function */
  @Get<
    UnipileAPI.RetrieveLinkedinProfileReturnType,
    UnipileAPI.RetrieveLinkedinProfileEndpoint
  >("/users/:linkedinId")
  async retrieveLinkedinProfile(
    params: UnipileAPI.RetrieveLinkedinProfileEndpoint
  ): Promise<AxiosResponse<UnipileAPI.RetrieveLinkedinProfileReturnType>> {
    return;
  }

  /** This is used in the Linkedin Service "fetchLinkedinProviderIdFromUnipile" function */
  @Get<
    UnipileAPI.RetriveUnipileAccountReturnType,
    UnipileAPI.RetrieveUnipileAccountEndpoint
  >("/accounts/:accountId")
  async retrieveUnipileAccount(
    params: UnipileAPI.RetrieveUnipileAccountEndpoint
  ): Promise<AxiosResponse<UnipileAPI.RetriveUnipileAccountReturnType>> {
    return;
  }

  /** This is used in the Linkedin Service "fetchLinkedinRelations" function */
  @Post<
    UnipileAPI.FetchLinkedinSearchReturnType,
    UnipileAPI.FetchLinkedinSearchEndpoint
  >("/linkedin/search")
  async fetchLinkedinSearch(
    params: UnipileAPI.FetchLinkedinSearchEndpoint
  ): Promise<AxiosResponse<UnipileAPI.FetchLinkedinSearchReturnType>> {
    // The actual implementation is handled by the decorator
    return;
  }

  /**
   * Transform an error from the Outlook api into a human friendly form
   * that can be displayed on the frontend
   *
   * @param error An error from the Outlook api
   * @returns
   */
  override humanizeError(error: any): HumanizedError {
    if (error && error.response) {
      const response = error.response as AxiosResponse<any, any>;

      if (response?.data?.error?.message) {
        return {
          title: "",
          detail: response?.data?.error?.message,
        };
      } else {
        return {
          title: response?.data?.error,
          detail: response?.data?.error_description,
        };
      }
    } else if (error instanceof Error) {
      return {
        title: "",
        detail: error.message,
      };
    } else if (typeof error === "string") {
      return {
        title: "",
        detail: error,
      };
    } else {
      return { title: "", detail: "Unknown error" };
    }
  }
}

// Merge the namespace with the class
export namespace UnipileAPI {
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

  export type EmailBody = {
    contentType: "HTML" | "Text"; // Specifies the type of content
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
    // Add other relevant fields as needed
  }

  // Nested Types for Payloads and Responses

  export type StartNewChatPayload = {
    account_id: string;
    text: string;
    attendees_ids: [string];
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

  export type GuardedUnipileEndpointCallParams<
    PathParamsType = undefined,
    QueryParamsType = undefined,
    PayloadType = undefined,
    ContextType = undefined,
  > = GuardedEndpointCallParams<
    UnipileAPI.AuthParams, // auth params
    PathParamsType,
    QueryParamsType,
    PayloadType,
    ContextType
  >;

  export type UserRelationsReturnType = {
    object: string;
    items: Array<{
      object: string;
      first_name: string;
      last_name: string;
      headline: string;
      public_identifier: string;
      public_profile_url: string;
      created_at: 0;
      member_id: string;
      member_urn: string;
      connection_urn: string;
      profile_picture_url: string;
    }>;
  };

  export type UserRelationsParamsEndpoint = Omit<
    GuardedUnipileEndpointCallParams<
      never, // path params
      undefined, // query params
      undefined, // body payload
      undefined // context
    >,
    "queryParams"
  > & {
    queryParams: {
      account_id: string;
      limit: number;
      filter?: string;
      cursor?: string;
    };
  };

  export type FetchLinkedinSearchEndpoint = Omit<
    GuardedUnipileEndpointCallParams<
      undefined, // path params
      undefined, // query params
      undefined, // body payload
      undefined // context
    >,
    "queryParams" | "payload"
  > & {
    queryParams: {
      cursor?: string;
      limit: number;
    };
    payload: {
      api: "classic";
      category: "people";
      url: string;
    };
  };

  export type FetchLinkedinSearchReturnType = {
    object: "LinkedinSearch";
    items: {
      object: "SearchResult";
      type: "PEOPLE" | "COMPANY" | "POST" | "JOB";
      id: string;
      // For PEOPLE
      public_identifier?: string;
      public_profile_url?: string;
      profile_url?: string;
      profile_picture_url?: string;
      profile_picture_url_large?: string;
      member_urn?: string;
      name?: string;
      first_name?: string;
      last_name?: string;
      network_distance?: "SELF";
      location?: string;
      industry?: string;
      keywords_match?: string;
      headline?: string;
      connections_count?: number;
      pending_invitation?: boolean;
      can_send_inmail?: boolean;
      recruiter_candidate_id?: string;
      premium?: boolean;
      open_profile?: boolean;
      shared_connections_count?: number;
      recent_posts_count?: number;
      recently_hired?: boolean;
      mentioned_in_the_news?: boolean;
      last_outreach_activity?: {
        type: "SEND_MESSAGE";
        performed_at: string;
      };
      current_positions?: {
        company: string;
        company_id: string;
        description: string;
        role: string;
        location: string;
        tenure_at_role: {
          years: number;
          months: number;
        };
        tenure_at_company: {
          years: number;
          months: number;
        };
        start: {
          year: number;
          month: number;
        };
        end: {
          year: number;
          month: number;
        };
      }[];
      education?: {
        degree: string;
        school: string;
        school_id: string;
        start: {
          year: number;
          month: number;
        };
        end: {
          year: number;
          month: number;
        };
      }[];
      work_experience?: {
        company: string;
        company_id: string;
        role: string;
        industry: string;
        start: {
          year: number;
          month: number;
        };
        end: {
          year: number;
          month: number;
        };
      }[];

      // For COMPANY
      summary?: string;
      followers_count?: number;
      job_offers_count?: number;
      headcount?: string;

      // For POST
      provider?: "LINKEDIN";
      social_id?: string;
      share_url?: string;
      title?: string;
      text?: string;
      date?: string;
      parsed_datetime?: string;
      reaction_counter?: number;
      comment_counter?: number;
      repost_counter?: number;
      impressions_counter?: number;
      author?: {
        public_identifier: string;
        name: string;
        is_company: boolean;
      };
      permissions?: {
        can_react: boolean;
        can_share: boolean;
        can_post_comments: boolean;
      };
      is_repost?: boolean;
      repost_id?: string;
      reposted_by?: {
        public_identifier: string;
        name: string;
        is_company: boolean;
      };
      repost_content?: {
        id: string;
        date: string;
        parsed_datetime: string;
        author: {
          public_identifier: string;
          name: string;
          is_company: boolean;
        };
        text: string;
      };
      attachments?: {
        id: string;
        file_size: number;
        unavailable: boolean;
        mimetype: string;
        url: string;
        url_expires_at: number;
        type: "img" | "video" | "audio" | "file" | "linkedin_post";
        size?: {
          width: number;
          height: number;
        };
        sticker?: boolean;
        gif?: boolean;
        duration?: number;
        voice_note?: boolean;
        file_name?: string;
      }[];
      poll?: {
        id: string;
        total_votes_count: number;
        question: string;
        is_open: boolean;
        options: {
          id: string;
          text: string;
          win: boolean;
          votes_count: number;
        }[];
      };

      // For JOB
      reference_id?: string;
      posted_at?: string;
      reposted?: boolean;
      url?: string;
      company?: {
        id: string;
        public_identifier: string;
        name: string;
        profile_url: string;
        profile_picture_url: string;
      };
    }[];
    config: {
      params: {
        api: string;
        category: string;
        keywords: string;
        industry: string[];
        location: string[];
        profile_language: string[];
        network_distance: number[];
        company: string[];
        past_company: string[];
        school: string[];
        service: string[];
        connections_of: string[];
        followers_of: string[];
        open_to: string[];
        advanced_keywords: {
          first_name: string;
          last_name: string;
          title: string;
          company: string;
          school: string;
        };
      };
    };
    paging: {
      start: number;
      page_count: number;
      total_count: number;
    };
    cursor: string;
  };

  export type RetrieveUnipileAccountEndpoint = Omit<
    GuardedUnipileEndpointCallParams<
      undefined, // path params
      undefined, // query params
      undefined, // body payload
      undefined // context
    >,
    "pathParams"
  > & {
    pathParams: {
      accountId: string;
    };
  };

  export type RetriveUnipileAccountReturnType = {
    object: "Account";
    type: "MOBILE";
    connection_params: {
      im: {
        phone_number: string;
        sim_serial_number: string;
      };
      call: {
        phone_number: string;
        sim_serial_number: string;
      };
    };
    last_fetched_at: string; // ISO 8601 date-time string
    id: string;
    name: string;
    created_at: string; // ISO 8601 date-time string
    current_signature: string;
    signatures: {
      title: string;
      content: string;
    }[];
    groups: string[];
    sources: {
      id: string;
      status: string;
    }[];
  };

  export type RetrieveLinkedinProfileEndpoint = Omit<
    GuardedUnipileEndpointCallParams<
      undefined,
      undefined,
      undefined, // body payload
      undefined // context
    >,
    "pathParams" | "query"
  > & {
    pathParams: {
      linkedinId: string;
    }; // path params
    query: {
      account_id: string;
    };
  };

  export type RetrieveLinkedinProfileReturnType = {
    provider: string;
    provider_id: string;
    public_identifier: string;
    first_name: string;
    last_name: string;
    headline: string;
    summary: string;
    contact_info: {
      emails: string[];
      phones: string[];
      addresses: string[];
      socials: {
        type: string;
        name: string;
      }[];
    };
    birthdate: {
      month: number;
      day: number;
    };
    primary_locale: {
      country: string;
      language: string;
    };
    location: string;
    websites: string[];
    profile_picture_url: string;
    profile_picture_url_large: string;
    background_picture_url: string;
    hashtags: string[];
    can_send_inmail: boolean;
    is_open_profile: boolean;
    is_premium: boolean;
    is_influencer: boolean;
    is_creator: boolean;
    is_hiring: boolean;
    is_open_to_work: boolean;
    is_saved_lead: boolean;
    is_crm_imported: boolean;
    is_relationship: boolean;
    is_self: boolean;
    invitation: {
      type: "SENT" | "RECEIVED";
      status: "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
    };
    work_experience: {
      position: string;
      company_id: string;
      company: string;
      location: string;
      description: string;
      current: boolean;
      status: string;
      start: string;
      end: string;
    }[];
    volunteering_experience: {
      company: string;
      description: string;
      role: string;
      cause: string;
      start: string;
      end: string;
    }[];
    education: {
      degree: string;
      school: string;
      field_of_study: string;
      start: string;
      end: string;
    }[];
    skills: {
      name: string;
      endorsement_count: number;
    }[];
    languages: {
      name: string;
      proficiency: string;
    }[];
    certifications: {
      name: string;
      organization: string;
      url: string;
    }[];
    projects: {
      name: string;
      description: string;
      skills: string[];
      start: string;
      end: string;
    }[];
    follower_count: number;
    connections_count: number;
    shared_connections_count: number;
    network_distance:
      | "FIRST_DEGREE"
      | "SECOND_DEGREE"
      | "THIRD_DEGREE"
      | "OUTSIDE_NETWORK";
    public_profile_url: string;
    object: "UserProfile";
  };

  export type StartNewChatParams = Omit<
    GuardedUnipileEndpointCallParams<
      never, // path params
      never, // query params
      never, // body payload
      Partial<SendProspectEmailParams> // context
    >,
    "payload"
  > & {
    payload: UnipileAPI.StartNewChatPayload;
  };

  export type StartNewChatReturnType = {
    object: "ChatStarted";
    chat_id: "string";
    message_id: "string";
  };

  export type DeleteSubscriptionParams = GuardedUnipileEndpointCallParams<
    {
      subscriptionId: string;
    }, // path params
    never, // query params
    void
  >;

  export type SendMessageInChatParams = Omit<
    GuardedUnipileEndpointCallParams<
      never, // path params
      never, // query params
      never, // body payload
      Partial<SendProspectEmailParams> // context
    >,
    "pathParams" | "payload"
  > & {
    pathParams: { chatId: string };
    payload: {
      text: string;
    };
  };

  export type SendMessageInChatReturnType = {
    object: "MessageSent";
    message_id: "string";
  };

  export type GetMessagesParams = GuardedUnipileEndpointCallParams<
    never, // path params
    {
      $filter: string;
    }, // query params
    never
  >;

  export type CreateSubscriptionParams = GuardedUnipileEndpointCallParams<
    never, // path params
    never, // query params
    UnipileAPI.CreateSubscriptionPayload // body payload
  >;

  export type CreateSubscriptionResponse = {
    id: string;
    changeType: "created";
    notificationUrl: string;
    resource: string;
    includeResourceData: boolean;
    encryptionCertificate: string;
    encryptionCertificateId: "scout-key";
    expirationDateTime;
    clientState: string;
    lifecycleNotificationUrl: string;
  };

  export type GetSubscriptionsParams = GuardedUnipileEndpointCallParams<
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
    UnipileAPI.TokenPayload
  >;

  export type RefreshAccessTokensEventsContext = {
    emailAccount: EmailAccount;
  };

  export type RefreshAccessTokensEventParams = EndpointEventParams<
    UnipileAPI.TokenParams,
    APICall<UnipileAPI.TokenPayload, AccessTokenResponse>,
    UnipileAPI.RefreshAccessTokensEventsContext
  >;

  export type MeResponse = {
    mail: string;
    userPrincipalName: string;
  };

  export type MeParams = GuardedUnipileEndpointCallParams<
    never, // path params
    never, // query params
    never
  >;

  export type GetMessageDetailsResponse = EmailMessage;

  export type GetMessageDetailsParams = GuardedUnipileEndpointCallParams<
    {
      userId: string;
      messageId: string;
    },
    {
      $select: string;
    },
    never
  >;

  export type MessageInfo = {
    date: string;
    writtenBy: string;
    email: string;
    content: string;
  };
}
