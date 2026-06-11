import NextAuth, { User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import axios from "axios";
import { createWebAuthService } from "@/services";
import { BASE_URL, apiUrl } from "@/static/const";
import { Session } from "next-auth";
import { JWT } from "next-auth/jwt";

const authService = createWebAuthService({ baseURL: BASE_URL });

// Strapi users-permissions runs jwtManagement: 'refresh' — /auth/local returns
// a short-lived access token (UP_ACCESS_TOKEN_LIFESPAN, 2h) plus a refresh
// token good for 30 days. The NextAuth cookie also lives ~30 days, so without
// refreshing, every signed-in user starts getting 401s on profile/checkout
// calls exactly 2 hours after login while still looking "logged in".
// The jwt callback below rotates the access token through /auth/refresh.

/** Seconds-since-epoch expiry baked into a Strapi JWT, or null if unreadable. */
function jwtExpiry(jwt?: string): number | null {
  if (!jwt) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64").toString("utf8")
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

// Refresh slightly early so a token that's about to lapse never reaches a
// data call. 5 minutes is comfortably under the 2h lifespan.
const REFRESH_SKEW_SECONDS = 5 * 60;

async function refreshStrapiToken(token: JWT): Promise<JWT> {
  const exp = jwtExpiry(token.jwt);
  // No usable access token and nothing to refresh with → mark dead.
  if (!token.jwt || exp == null) {
    return token.refreshToken ? await doRefresh(token) : markExpired(token);
  }
  const now = Date.now() / 1000;
  if (now < exp - REFRESH_SKEW_SECONDS) return token; // still fresh

  if (!token.refreshToken) {
    // Sessions created before refresh-token support landed have no way to
    // renew — flag them once the access token actually lapses so the client
    // can drop to guest instead of 401-ing forever.
    return now >= exp ? markExpired(token) : token;
  }
  return doRefresh(token);
}

function markExpired(token: JWT): JWT {
  return { ...token, jwt: undefined, error: "SessionExpired" as const };
}

async function doRefresh(token: JWT): Promise<JWT> {
  try {
    const res = await axios.post(
      apiUrl("/auth/refresh"),
      { refreshToken: token.refreshToken },
      { headers: { "Content-Type": "application/json" } }
    );
    const newJwt = res.data?.jwt;
    if (!newJwt) return markExpired(token);
    return {
      ...token,
      jwt: newJwt,
      // Strapi rotates refresh tokens; keep the old one if it didn't.
      refreshToken: res.data?.refreshToken ?? token.refreshToken,
      error: undefined,
    };
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    // 4xx → the refresh token itself is dead; anything else is transient
    // (network blip, Strapi restart) — keep the current state and let the
    // next session access retry instead of logging the user out.
    if (status && status >= 400 && status < 500) return markExpired(token);
    return token;
  }
}

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_KEY as string,
      clientSecret: process.env.GOOGLE_SECRET_KEY as string,
    }),
    CredentialsProvider({
      name: "Sign in with Email",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        /**
         * This function is used to define if the user is authenticated or not.
         * If authenticated, the function should return an object contains the user data.
         * If not, the function should return `null`.
         */
        if (credentials == null) return null;
        /**
         * credentials is defined in the config above.
         * We can expect it contains two properties: `email` and `password`
         */
        try {
          const response = await authService.signInWithCredential({
            email: credentials.email,
            password: credentials.password,
          });

          if (response) {
            return {
              ...response.user,
              jwt: response.jwt,
              refreshToken: response.refreshToken,
            };
          } else {
            return null;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
          // Sign In Fail
          throw new Error(error);
        }
      },
    }),
  ],
  callbacks: {
    // The session callback is called whenever a session is checked.
    // By default, only a subset of the token is returned for increased security.
    session: async ({ session, token }: { session: Session; token: JWT }) => {
      // Send properties to the client, like an access_token from a provider.
      session.id = token.id;
      session.jwt = token.jwt;
      // "SessionExpired" → the refresh token is dead too; the client quietly
      // signs out (see SessionExpiryGuard in _app.tsx). The refresh token
      // itself never leaves the server-side NextAuth JWT cookie payload.
      session.error = token.error;
      return Promise.resolve(session);
    },

    // This callback is called whenever a JSON Web Token is created (i.e. at sign in)
    // or updated (i.e whenever a session is accessed in the client).
    // TODO: CHECKING IF USER IS BLOCKED OR NOT
    jwt: async ({
      token,
      user,
      account,
    }: {
      token: JWT;
      user: User;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      account: any;
    }) => {
      // Persist the OAuth access_token to the token right after signin
      const isSignIn = user ? true : false;

      if (isSignIn) {
        // If provider credential. just set the user id and jwt token because its already fetched
        if (account?.provider === "credentials") {
          token.id = user.id;
          token.jwt = user.jwt;
          token.refreshToken = user.refreshToken;
        }
        // else, you need to fetch to the backend with the access token
        else {
          const responseData = await authService.signInWithProviders({
            provider: account?.provider,
            access_token: account?.access_token,
          });

          const response = { data: responseData };

          if (response) {
            token.id = response.data.user?.id;
            token.jwt = response.data.jwt;
            token.refreshToken = response.data.refreshToken;
          }
        }
        return Promise.resolve(token);
      }

      // Every subsequent session access: renew the Strapi access token
      // before it lapses so data calls never carry an expired JWT.
      return refreshStrapiToken(token);
    },
  },
  pages: {
    signIn: "/login",
  },
});
