/* eslint-disable @typescript-eslint/no-unused-vars */
import NextAuth from "next-auth";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    id: string | undefined;
    jwt: string | undefined;
    /** "SessionExpired" when the Strapi refresh token is dead — client signs out quietly. */
    error?: "SessionExpired";
    user: {
      name: string;
      email: string;
    };
  }

  interface User {
    id: string;
    jwt: string;
    refreshToken?: string;
  }

  interface Token {
    id: string;
    jwt: string;
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    /** OpenID ID Token */
    id?: string;
    jwt?: string;
    /** Strapi users-permissions refresh token (jwtManagement: 'refresh'). Server-side only. */
    refreshToken?: string;
    error?: "SessionExpired";
  }
}
