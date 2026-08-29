import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { RequestHandler } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { getWebOrigins } from '../config/app-config';

export type AccountIdentity = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
};

export type AccountSession = {
  user: AccountIdentity;
  session: { id: string; expiresAt: Date };
};

type BetterAuthInstance = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (input: { headers: Headers }) => Promise<AccountSession | null>;
  };
};

function authSecret() {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required in production');
  }
  return 'monsters-local-development-secret-change-before-production';
}

@Injectable()
export class AuthService {
  private authPromise: Promise<BetterAuthInstance> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  get configuration() {
    return {
      google: Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      ),
      magicLink: Boolean(
        process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL,
      ),
    };
  }

  async initialize(): Promise<BetterAuthInstance> {
    this.authPromise ??= this.createAuth();
    return this.authPromise;
  }

  private async createAuth(): Promise<BetterAuthInstance> {
    const [{ betterAuth }, { prismaAdapter }, { magicLink }, { Resend }] =
      await Promise.all([
        import('better-auth'),
        import('@better-auth/prisma-adapter'),
        import('better-auth/plugins'),
        import('resend'),
      ]);

    const resend = process.env.RESEND_API_KEY
      ? new Resend(process.env.RESEND_API_KEY)
      : null;
    const googleEnabled = this.configuration.google;
    const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
    const baseURL =
      process.env.BETTER_AUTH_URL?.trim() ?? 'http://localhost:3101';

    return betterAuth({
      appName: 'Monsters',
      baseURL,
      basePath: '/api/auth',
      secret: authSecret(),
      database: prismaAdapter(this.prisma, {
        provider: 'postgresql',
        transaction: true,
      }),
      trustedOrigins: getWebOrigins(),
      socialProviders: googleEnabled
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID!,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            },
          }
        : undefined,
      user: {
        additionalFields: {
          role: {
            type: 'string',
            required: true,
            defaultValue: 'user',
            input: false,
          },
        },
      },
      advanced: cookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: cookieDomain,
            },
          }
        : undefined,
      plugins: [
        magicLink({
          expiresIn: 15 * 60,
          storeToken: 'hashed',
          async sendMagicLink({ email, url }) {
            const from = process.env.RESEND_FROM_EMAIL;
            if (!resend || !from) {
              throw new ServiceUnavailableException(
                'Magic-link email is not configured yet',
              );
            }
            const result = await resend.emails.send({
              from,
              to: email,
              subject: 'Your Monsters sign-in link',
              text: `Open this secure link to sign in to Monsters: ${url}\n\nIt expires in 15 minutes.`,
              html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#173a2f"><h1 style="font-size:24px">Return to Monster Island</h1><p>Use the button below to sign in. This link expires in 15 minutes.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#164f3e;color:white;text-decoration:none;font-weight:700">Sign in to Monsters</a></p><p style="font-size:12px;color:#56706a">If you did not request this, you can ignore this email.</p></div>`,
            });
            if (result.error) throw new Error(result.error.message);
          },
        }),
      ],
    }) as BetterAuthInstance;
  }

  async nodeHandler(): Promise<RequestHandler> {
    const [auth, { toNodeHandler }] = await Promise.all([
      this.initialize(),
      import('better-auth/node'),
    ]);
    return toNodeHandler(auth) as RequestHandler;
  }

  async getSession(headers: IncomingHttpHeaders) {
    const [auth, { fromNodeHeaders }] = await Promise.all([
      this.initialize(),
      import('better-auth/node'),
    ]);
    return auth.api.getSession({ headers: fromNodeHeaders(headers) });
  }
}
